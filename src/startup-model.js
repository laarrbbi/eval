/*
 * Startup model: ten valuation methods plus success probabilities (next round, IPO,
 * acquisition, shutdown) from an outcome model fitted on 6,153 Y Combinator startups.
 * Pure functions; works in the browser (window.StartupModel) and in Node.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = isNode
    ? factory(require('./benchmarks.js'), require('./startup-data.js'), require('./valuation.js'))
    : factory(root.Benchmarks, root.StartupData, root.Valuation);
  if (isNode) module.exports = api;
  else root.StartupModel = api;
})(typeof self !== 'undefined' ? self : this, function (B, D, V) {
  'use strict';

  const { clamp, interp } = V;
  const OUTCOMES = ['Acquired', 'Public', 'Inactive'];

  function num(v, fallback = 0) {
    const n = typeof v === 'string' ? V.parseAmount(v) : Number(v);
    return Number.isFinite(n) ? n : fallback;
  }
  const odds = (p) => p / (1 - p);
  const prob = (o) => o / (1 + o);

  function quantile(values, q) {
    const s = [...values].sort((a, b) => a - b);
    if (!s.length) return NaN;
    const pos = (s.length - 1) * q;
    const lo = Math.floor(pos);
    const hi = Math.ceil(pos);
    return s[lo] + (s[hi] - s[lo]) * (pos - lo);
  }

  /* --------------------------- profile mapping -------------------------- */

  // YC industry groups used by the outcome model (B2B is the reference group).
  const INDUSTRIES = [
    { key: 'B2B', label: 'B2B (business software and services)', features: {} },
    { key: 'Consumer', label: 'Consumer', features: { consumer: 1 } },
    { key: 'Healthcare', label: 'Healthcare', features: { healthcare: 1 } },
    { key: 'Fintech', label: 'Fintech', features: { fintech: 1 } },
    { key: 'Industrials', label: 'Industrials, energy, manufacturing', features: { industrials: 1 } },
    { key: 'Education', label: 'Education', features: { other_industry: 1 } },
    { key: 'RealEstate', label: 'Real estate and construction', features: { other_industry: 1 } },
    { key: 'Government', label: 'Government and public sector', features: { other_industry: 1 } },
  ];

  // Business models; `tech` points at TECH_MODELS for non-AI comparables.
  const BUSINESS_MODELS = [
    { key: 'saas', label: 'B2B software (SaaS)', tech: 'saas', features: { saas: 1 } },
    { key: 'marketplace', label: 'Marketplace', tech: 'marketplace', features: {} },
    { key: 'fintech', label: 'Fintech or payments', tech: 'fintech', features: {} },
    { key: 'consumer', label: 'Consumer app', tech: 'consumer', features: {} },
    { key: 'hardware', label: 'Hardware or robotics', tech: 'hardware', features: { hardware: 1 } },
    { key: 'ecommerce', label: 'E-commerce or D2C brand', tech: 'ecommerce', features: {} },
    { key: 'services', label: 'Tech-enabled services', tech: 'services', features: {} },
    { key: 'biotech', label: 'Biotech or deep science', tech: null, features: { biotech: 1 } },
  ];

  const findKey = (list, key, i = 0) => list.find((x) => x.key === key) || list[i];

  /* ----------------------------- outcome model --------------------------- */

  function featureVector(age, profile) {
    const m = D.OUTCOME_MODEL;
    const la = Math.log(Math.max(age, 0.25)) - m.lnAgeMean;
    const f = {
      const: 1, ln_age: la, ln_age2: la * la,
      ai: profile.ai ? 1 : 0, us: profile.us ? 1 : 0,
      ...findKey(INDUSTRIES, profile.industry).features,
      ...findKey(BUSINESS_MODELS, profile.model).features,
    };
    return m.features.map((k) => f[k] || 0);
  }

  // Share of companies in each state at a given age (years since founding).
  function outcomeAt(age, profile) {
    const x = featureVector(age, profile);
    const ex = {};
    let denom = 1;
    for (const c of OUTCOMES) {
      ex[c] = Math.exp(D.OUTCOME_MODEL.coef[c].reduce((s, b, i) => s + b * x[i], 0));
      denom += ex[c];
    }
    return { Active: 1 / denom, Acquired: ex.Acquired / denom, Public: ex.Public / denom, Inactive: ex.Inactive / denom };
  }

  /**
   * Outcomes between now and `horizon` years from now for a company still operating today.
   * Acquired, public and shut down are treated as absorbing states, so the chance of reaching
   * each is the model's increase in that share between today's age and the horizon age,
   * divided by today's active share. Then driver odds ratios are applied.
   */
  function longRunOutcomes({ age, horizon, profile, investors = 'top', founder = 'first', stage = 'seed', runwayMonths, traction = 'onTrack' }) {
    const a0 = Math.max(0.25, num(age, 1));
    const h = Math.max(0.5, num(horizon, 7));
    const p0 = outcomeAt(a0, profile);
    const p1 = outcomeAt(a0 + h, profile);
    const base = {};
    let absorbed = 0;
    for (const c of OUTCOMES) {
      base[c] = Math.max(0, p1[c] - p0[c]) / p0.Active;
      absorbed += base[c];
    }
    if (absorbed > 0.98) for (const c of OUTCOMES) base[c] *= 0.98 / absorbed;
    base.Active = 1 - Math.min(absorbed, 0.98);

    const F = D.OUTCOME_FACTORS;
    const mult = { Acquired: 1, Public: 1, Inactive: 1 };
    const factors = [];
    const apply = (label, m) => {
      if (!m) return;
      for (const c of OUTCOMES) if (m[c] != null) mult[c] *= m[c];
      factors.push({ label, m });
    };
    apply(D.NEXT_ROUND_FACTORS.investors[investors] ? D.NEXT_ROUND_FACTORS.investors[investors].label : 'Investors', F.investors[investors]);
    apply(D.NEXT_ROUND_FACTORS.founder[founder] ? D.NEXT_ROUND_FACTORS.founder[founder].label : 'Founders', F.founder[founder]);
    apply(`Stage: ${findKey(D.STAGES, stage, 1).label}`, F.stage[stage]);
    const rm = num(runwayMonths, NaN);
    if (rm > 0) {
      const r = F.runway.find((x) => rm < x.below);
      apply(`Runway ${Math.round(rm)} months`, { Inactive: r.Inactive });
    }
    const t = D.NEXT_ROUND_FACTORS.traction[traction];
    if (t) apply(`Traction: ${t.label}`, { Acquired: Math.pow(t.or, 0.3), Public: Math.pow(t.or, 0.5), Inactive: Math.pow(t.or, -0.5) });

    const active = Math.max(base.Active, 0.02);
    let s = 0;
    const o = {};
    for (const c of OUTCOMES) {
      o[c] = (base[c] / active) * mult[c];
      s += o[c];
    }
    const probs = { Active: 1 / (1 + s) };
    for (const c of OUTCOMES) probs[c] = o[c] / (1 + s);
    return { age: a0, horizon: h, base, probs, multipliers: mult, factors };
  }

  /* ------------------------------ next round ----------------------------- */

  function nextRound({ stage = 'seed', investors = 'vc', founder = 'first', traction = 'onTrack', runwayMonths, ai = false }) {
    const st = findKey(D.STAGES, stage, 1);
    const F = D.NEXT_ROUND_FACTORS;
    const factors = [];
    let mult = 1;
    const add = (label, or) => { mult *= or; factors.push({ label, or }); };
    const inv = F.investors[investors] || F.investors.vc;
    add(inv.label, inv.or);
    const fo = F.founder[founder] || F.founder.first;
    add(fo.label, fo.or);
    const tr = F.traction[traction] || F.traction.onTrack;
    add(`Traction: ${tr.label}`, tr.or);
    const rm = num(runwayMonths, NaN);
    if (rm > 0) add(`Runway ${Math.round(rm)} months`, F.runway.find((x) => rm < x.below).or);

    let p24 = prob(odds(st.p24) * mult);
    let eventual = prob(odds(st.eventual) * mult);
    let years = st.years;
    if (ai) {
      p24 = 1 - Math.pow(1 - p24, F.aiHazardRatio);
      years /= F.aiHazardRatio;
      factors.push({ label: 'AI company: rounds come ~1.4x faster', pace: F.aiHazardRatio });
    }
    eventual = Math.max(eventual, p24);
    return { stage: st, next: st.next, p24, eventual, years, baseP24: st.p24, baseEventual: st.eventual, factors };
  }

  // Chance of reaching each later stage, chaining the adjusted first step with base rates after it.
  function funnel(stage, firstStepEventual) {
    const i = D.STAGES.findIndex((s) => s.key === stage);
    const out = [];
    let p = 1;
    for (let k = Math.max(0, i); k < D.STAGES.length - 1; k++) {
      p *= k === i ? firstStepEventual : D.STAGES[k].eventual;
      out.push({ label: D.STAGES[k].next, p });
    }
    return out;
  }

  /* ------------------------------ AI comps ------------------------------- */

  function aiComps(segment, revenueUsd, growthPct) {
    const rows = D.AI_COMPS.filter((c) => c.segment === segment).map((c) => ({ ...c, multiple: c.valuation / c.revenue }));
    if (!rows.length) return null;
    const mults = rows.map((r) => r.multiple);
    const A = D.AI_COMP_ADJUST;
    const scale = interp(Math.max(revenueUsd, 1), A.scale);
    const g = Math.max(-0.5, num(growthPct, 100) / 100);
    const growthAdj = clamp(Math.sqrt((1 + g) / (1 + A.referenceGrowth)), A.growthBounds[0], A.growthBounds[1]);
    const adj = scale * growthAdj;
    return {
      segment: findKey(D.AI_SEGMENTS, segment),
      rows,
      median: quantile(mults, 0.5),
      q25: quantile(mults, 0.25),
      q75: quantile(mults, 0.75),
      scale,
      growthAdj,
      applied: quantile(mults, 0.5) * adj,
      low: quantile(mults, 0.25) * adj,
      high: quantile(mults, 0.75) * adj,
    };
  }

  /* --------------------------- revenue plan ------------------------------ */

  function revenuePlan({ arr, growth, rev1, growth2, fade, years }) {
    const n = clamp(Math.round(num(years, 7)), 1, 15);
    const f = clamp(num(fade, 20) / 100, 0, 0.9);
    const a = Math.max(0, num(arr));
    let r = num(rev1, NaN);
    if (!(r > 0)) r = a > 0 ? a * (1 + Math.max(-0.9, num(growth, 50) / 100)) : 0;
    let g = num(growth2, 80) / 100;
    const rows = [{ year: 1, revenue: r, growth: a > 0 ? r / a - 1 : null }];
    for (let t = 2; t <= n; t++) {
      r *= 1 + Math.max(-0.9, g);
      rows.push({ year: t, revenue: r, growth: g });
      g *= 1 - f;
    }
    const last = rows[rows.length - 1];
    return { rows, years: n, exitRevenue: last.revenue, exitGrowth: last.growth == null ? g : last.growth };
  }

  /* ---------------------------- the valuation ---------------------------- */

  const METHOD_KEYS = ['scorecard', 'berkus', 'risk', 'devStage', 'duplicate', 'comps', 'vc', 'firstChicago', 'dcf', 'lastRound'];

  function method(key, label, value, low, high, weight, detail) {
    return { key, label, value, low, high, weight, detail: detail || [] };
  }
  function skipped(key, label, reason) {
    return { key, label, value: 0, low: 0, high: 0, weight: 0, skipped: reason, detail: [] };
  }

  /**
   * @param {object} input  see README / app.js computeStartup for the full list of fields.
   *   All money in display currency; fxPerUsd converts to USD for size bands and comps.
   */
  function valueStartupModel(input) {
    const fx = num(input.fxPerUsd, 1) > 0 ? num(input.fxPerUsd, 1) : 1;
    const notes = [];
    const stage = findKey(D.STAGES, input.stage, 1).key;
    const bm = findKey(BUSINESS_MODELS, input.model);
    const aiSegment = D.AI_SEGMENTS.some((s) => s.key === input.aiSegment) ? input.aiSegment : null;
    const profile = { industry: input.industry, model: bm.key, ai: !!aiSegment, us: input.hq === 'us' };
    const baseline = Math.max(0, num(input.baseline));
    const raise = Math.max(0, num(input.raise));
    const arr = Math.max(0, num(input.arr));
    const growth = num(input.growth, 100);
    const age = Math.max(0.25, num(input.ageYears, 1.5));
    const runway = num(input.runwayMonths, NaN);
    const investors = input.investors || 'vc';
    const founder = input.founder || 'first';
    const traction = input.traction || 'onTrack';

    // Success probabilities
    const plan = revenuePlan({ arr, growth, rev1: input.rev1, growth2: input.growth2, fade: input.fade, years: input.yearsToExit });
    const N = plan.years;
    const next = nextRound({ stage, investors, founder, traction, runwayMonths: runway, ai: !!aiSegment });
    const outcomeArgs = { age, profile, investors, founder, stage, runwayMonths: runway, traction };
    const longRun = longRunOutcomes({ ...outcomeArgs, horizon: N });
    const funnelSteps = funnel(stage, next.eventual);

    // Exit multiple: user value, else AI comps or sector multiples at exit size and growth.
    const exitRevUsd = plan.exitRevenue / fx;
    let exitMultiple = num(input.exitMultiple, NaN);
    let exitBasis = 'your input';
    if (!(exitMultiple > 0)) {
      if (aiSegment) {
        const c = aiComps(aiSegment, exitRevUsd, plan.exitGrowth * 100);
        exitMultiple = Math.min(c.applied, D.AI_COMP_ADJUST.exitCap);
        exitBasis = `AI comps (${c.segment.label}) at exit size, capped at ${D.AI_COMP_ADJUST.exitCap}x`;
      } else if (bm.tech) {
        exitMultiple = Math.min(B.TECH_MARKET.exitMultipleCap, V.techMultiple({
          model: findKey(B.TECH_MODELS, bm.tech), arrUsd: exitRevUsd, growth: plan.exitGrowth * 100,
          grossMargin: num(input.grossMargin, findKey(B.TECH_MODELS, bm.tech).typicalGM), nrr: 102,
          ebitdaMargin: num(input.targetMargin, 20), largestCustomer: 0, runwayMonths: 0,
        }).multiple);
        exitBasis = `${findKey(B.TECH_MODELS, bm.tech).label} M&A multiples at exit size, capped at ${B.TECH_MARKET.exitMultipleCap}x`;
      } else {
        exitMultiple = 4;
        exitBasis = 'assumption for deep-science companies; enter your own';
      }
    }
    const successValue = plan.exitRevenue * exitMultiple;
    const irr = clamp(num(input.targetIrr, findKey(B.VC_STAGES, stage === 'seriesC' ? 'seriesB' : stage, 1).targetIrr * 100) / 100, 0.05, 2);
    const dilution = clamp(num(input.dilution, findKey(B.VC_STAGES, stage === 'seriesC' ? 'seriesB' : stage, 1).dilution * 100) / 100, 0, 0.9);
    const disc = clamp(num(input.discountRate, 20) / 100, 0.02, 1);

    // 1-3: scorecard, Berkus, risk factor summation (shared with the quick valuator)
    const q = V.valueStartup({ baseline, raise, scorecard: input.scorecard, berkus: input.berkus, risks: input.risks });
    const methods = q.methods.filter((m) => m.key !== 'vc').map((m) => ({ ...m }));

    // 4. Development stage: milestone ladder tied to the market's round medians
    const ds = D.DEV_STAGES.find((s) => s.key === num(input.devStage, 0));
    if (ds && baseline > 0) {
      const seedEquivalent = baseline / stageBaselineRatio(stage);
      const anchor = seedEquivalent * (D.US_STAGE_PREMONEY[ds.anchor] / D.US_STAGE_PREMONEY.seed);
      const lo = anchor * ds.ladder[0];
      const hi = anchor * ds.ladder[1];
      methods.push(method('devStage', 'Development stage', (lo + hi) / 2, lo, hi, 1, [
        { label: ds.label, value: `${ds.ladder[0]}–${ds.ladder[1]}× the ${findKey(D.STAGES, ds.anchor).label} median` },
        { label: `${findKey(D.STAGES, ds.anchor).label} median in your market`, amount: anchor },
      ]));
    } else {
      methods.push(skipped('devStage', 'Development stage', 'Pick the stage of development and a market baseline.'));
    }

    // 5. Cost to duplicate
    const dup = Math.max(0, num(input.personMonths)) * Math.max(0, num(input.costPerMonth)) + Math.max(0, num(input.ipCost)) + Math.max(0, num(input.otherAssets));
    if (dup > 0) {
      methods.push(method('duplicate', 'Cost to duplicate', dup, dup * 0.8, dup * 1.2, 0.5, [
        { label: 'Engineering to rebuild', amount: Math.max(0, num(input.personMonths)) * Math.max(0, num(input.costPerMonth)) },
        { label: 'Patents and IP', amount: Math.max(0, num(input.ipCost)) },
        { label: 'Equipment, data and other assets', amount: Math.max(0, num(input.otherAssets)) },
      ]));
    } else {
      methods.push(skipped('duplicate', 'Cost to duplicate', 'Enter what it would cost to rebuild the product.'));
    }

    // 6. Comparables
    if (arr <= 0) {
      methods.push(skipped('comps', 'Comparable companies', 'Needs revenue; pre-revenue companies have no multiple to apply.'));
    } else if (aiSegment) {
      const c = aiComps(aiSegment, arr / fx, growth);
      const cap = D.AI_COMP_ADJUST.stageCap[stage] || 50;
      const applied = Math.min(c.applied, cap);
      methods.push(method('comps', 'Comparable companies (AI)', arr * applied, arr * Math.min(c.low, cap * 0.7), arr * Math.min(c.high, cap), 1, [
        { label: `${c.segment.label}: median of ${c.rows.length} comps`, value: `${c.median.toFixed(1)}x revenue` },
        { label: 'Scale discount vs market leaders', value: `× ${c.scale.toFixed(2)}` },
        { label: `Growth ${Math.round(growth)}% vs ~100% for comps`, value: `× ${c.growthAdj.toFixed(2)}` },
        ...(c.applied > cap ? [{ label: `Capped at the top of AI round multiples for this stage`, value: `${cap}x` }] : []),
        { label: 'Applied multiple', value: `${applied.toFixed(1)}x revenue` },
      ]));
    } else if (bm.tech) {
      const t = V.techMultiple({
        model: findKey(B.TECH_MODELS, bm.tech), arrUsd: arr / fx, growth, grossMargin: num(input.grossMargin, findKey(B.TECH_MODELS, bm.tech).typicalGM),
        nrr: 102, ebitdaMargin: num(input.ebitdaMargin, 0), largestCustomer: 0, runwayMonths: runway > 0 ? runway : 0,
      });
      methods.push(method('comps', 'Comparable companies', arr * t.multiple, arr * t.multiple * 0.8, arr * t.multiple * 1.2, 1, [
        ...t.factors.slice(0, 3),
        { label: 'Applied multiple (private M&A comps)', value: `${t.multiple.toFixed(2)}x revenue` },
      ]));
    } else {
      methods.push(skipped('comps', 'Comparable companies', 'No revenue multiples for deep-science companies; use the VC method or DCF.'));
    }

    // 7. Venture capital method
    if (successValue > 0) {
      const vcPre = (r) => (successValue * (1 - dilution)) / Math.pow(1 + r, N) - raise;
      const mid = vcPre(irr);
      if (mid > 0) {
        methods.push(method('vc', 'Venture capital method', mid, Math.max(0, vcPre(irr + 0.1)), vcPre(Math.max(0.05, irr - 0.1)), 1, [
          { label: `Revenue in year ${N}`, amount: plan.exitRevenue },
          { label: `Exit multiple (${exitBasis})`, value: `${exitMultiple.toFixed(1)}x` },
          { label: 'Exit value', amount: successValue },
          { label: 'Target return', value: `${Math.round(irr * 100)}% a year (${Math.pow(1 + irr, N).toFixed(1)}x)` },
          { label: 'Dilution before exit', value: `${Math.round(dilution * 100)}%` },
        ]));
      } else {
        methods.push(skipped('vc', 'Venture capital method', 'The exit value is too small for this raise at the target return.'));
      }
    } else {
      methods.push(skipped('vc', 'Venture capital method', 'Add a revenue plan to include it.'));
    }

    // 8. First Chicago: scenario values weighted by the model's outcome probabilities
    const acqShare = clamp(num(input.acqShare, 30) / 100, 0, 2);
    const privShare = clamp(num(input.privateShare, 20) / 100, 0, 2);
    if (successValue > 0) {
      const p = longRun.probs;
      const scen = [
        { label: 'IPO or breakout', p: p.Public, v: successValue },
        { label: 'Acquired', p: p.Acquired, v: successValue * acqShare },
        { label: 'Still private', p: p.Active, v: successValue * privShare },
        { label: 'Shut down', p: p.Inactive, v: 0 },
      ];
      const ev = scen.reduce((s, x) => s + x.p * x.v, 0);
      const pre = (r) => (ev * (1 - dilution)) / Math.pow(1 + r, N) - raise;
      if (pre(disc) > 0) {
        methods.push(method('firstChicago', 'First Chicago (scenarios)', pre(disc), Math.max(0, pre(disc + 0.05)), pre(Math.max(0.02, disc - 0.05)), 1, [
          ...scen.map((x) => ({ label: `${x.label}: ${(x.p * 100).toFixed(1)}%`, amount: x.v })),
          { label: `Expected value in year ${N}`, amount: ev },
          { label: 'Discount rate (risk of failure is in the scenarios)', value: `${Math.round(disc * 100)}%` },
        ]));
      } else {
        methods.push(skipped('firstChicago', 'First Chicago (scenarios)', 'Expected exit value does not cover this raise.'));
      }
    } else {
      methods.push(skipped('firstChicago', 'First Chicago (scenarios)', 'Add a revenue plan to include it.'));
    }

    // 9. Risk-adjusted DCF: intrinsic value from cash flows, not market multiples.
    // Burn fades out and the target free-cash-flow margin phases in by the exit year; the
    // terminal value is a steady-state perpetuity; each year is weighted by the model's
    // chance the company is still operating.
    const burn = Math.max(0, num(input.monthlyBurn)) * 12;
    const target = num(input.targetMargin, 20) / 100;
    const gTerm = clamp(num(input.terminalGrowth, 3) / 100, -0.02, 0.06);
    const rTerm = clamp(num(input.matureRate, 12) / 100, gTerm + 0.02, 0.4);
    if (plan.exitRevenue > 0) {
      const rows = [];
      for (const row of plan.rows) {
        const t = row.year;
        const fcf = row.revenue * target * (t / N) - burn * (1 - t / N);
        const surv = 1 - longRunOutcomes({ ...outcomeArgs, horizon: t }).probs.Inactive;
        rows.push({ t, fcf, surv });
      }
      const survN = rows[rows.length - 1].surv;
      const tvN = (plan.exitRevenue * target * (1 + gTerm)) / (rTerm - gTerm);
      const at = (r) => rows.reduce((s, x) => s + (x.surv * x.fcf) / Math.pow(1 + r, x.t), 0) + (tvN * survN) / Math.pow(1 + r, N);
      const value = at(disc);
      if (value > 0) {
        methods.push(method('dcf', 'Risk-adjusted DCF', value, Math.max(0, at(disc + 0.05)), at(Math.max(0.02, disc - 0.05)), 1, [
          { label: 'Cash flows to the exit year, survival-weighted', amount: value - (tvN * survN) / Math.pow(1 + disc, N) },
          { label: `Terminal value in year ${N} (${(target * 100).toFixed(0)}% margin, ${(gTerm * 100).toFixed(1)}% growth, ${(rTerm * 100).toFixed(0)}% cost of capital)`, amount: tvN },
          { label: `Chance still operating in year ${N}`, value: `${Math.round(survN * 100)}%` },
          { label: 'Discount rate to the exit year', value: `${Math.round(disc * 100)}%` },
          { label: 'Implied exit multiple of revenue', value: `${(tvN / plan.exitRevenue).toFixed(1)}x` },
        ]));
      } else {
        methods.push(skipped('dcf', 'Risk-adjusted DCF', 'Burn outweighs the plan’s cash flows at this discount rate.'));
      }
    } else {
      methods.push(skipped('dcf', 'Risk-adjusted DCF', 'Add a revenue plan to include it.'));
    }

    // 10. Last round, stepped up for progress since
    const lastPost = Math.max(0, num(input.lastPost));
    if (lastPost > 0) {
      const step = D.STEP_UPS[stage] || 1.5;
      const months = Math.max(0, num(input.monthsSinceLast, 12));
      const progress = input.progress || 'onPlan';
      let k = { behind: 0.7, flat: 1.0, onPlan: 1 + 0.5 * (step - 1), milestones: step }[progress] || 1;
      if (months > 24 && (progress === 'flat' || progress === 'behind')) k *= 0.8;
      methods.push(method('lastRound', 'Last round, stepped up', lastPost * k, lastPost * k * 0.8, lastPost * k * 1.2, 1, [
        { label: 'Last post-money', amount: lastPost },
        { label: `Median step-up to the next round (${findKey(D.STAGES, stage, 1).label})`, value: `${step.toFixed(2)}x` },
        { label: 'Applied for your progress', value: `× ${k.toFixed(2)}` },
      ]));
    } else {
      methods.push(skipped('lastRound', 'Last round, stepped up', 'Enter your last round’s post-money valuation.'));
    }

    // Weights
    const w = input.weights || {};
    const early = stage === 'preseed' || stage === 'seed';
    const defaults = early
      ? { scorecard: 1, berkus: arr > 0 ? 0.5 : 1, risk: 1, devStage: 1, duplicate: 0.5, comps: 1, vc: 1, firstChicago: 1, dcf: 1, lastRound: 1 }
      : { scorecard: 0.5, berkus: 0, risk: 0.5, devStage: 0.25, duplicate: 0.25, comps: 1.5, vc: 1, firstChicago: 1, dcf: 1, lastRound: 1 };
    for (const m of methods) {
      if (m.skipped) continue;
      const v = num(w[m.key], NaN);
      m.weight = Number.isFinite(v) ? Math.max(0, v) : defaults[m.key];
    }
    methods.sort((a, b) => METHOD_KEYS.indexOf(a.key) - METHOD_KEYS.indexOf(b.key));

    const range = V.blend(methods);
    if (aiSegment && D.OUTCOME_MODEL.oddsRatios.ai) {
      notes.push('AI startups in the YC data stay active longer; part of that is survivors updating their tags to AI, so treat the AI effect on survival as optimistic.');
    }
    if (runway > 0 && runway < 6) notes.push('Under six months of runway: raising now is urgent, and the odds above fall quickly.');
    if (baseline <= 0) notes.push('Enter a market baseline so the scorecard, Berkus and risk methods can run.');

    const post = range.mid + raise;
    return {
      methods,
      ...range,
      postMoney: post,
      dilutionNow: raise > 0 && post > 0 ? raise / post : 0,
      plan,
      exitMultiple,
      exitBasis,
      successValue,
      nextRound: next,
      longRun,
      funnel: funnelSteps,
      comps: aiSegment ? aiComps(aiSegment, Math.max(arr, 1) / fx, growth) : null,
      notes,
    };
  }

  // Market baseline ratio for later stages, relative to seed (Carta US medians).
  function stageBaselineRatio(stage) {
    const k = findKey(D.STAGES, stage, 1).key;
    return D.US_STAGE_PREMONEY[k] / D.US_STAGE_PREMONEY.seed;
  }

  return {
    INDUSTRIES,
    BUSINESS_MODELS,
    METHOD_KEYS,
    defaultWeights: (stage, hasRevenue) => (stage === 'preseed' || stage === 'seed')
      ? { scorecard: 1, berkus: hasRevenue ? 0.5 : 1, risk: 1, devStage: 1, duplicate: 0.5, comps: 1, vc: 1, firstChicago: 1, dcf: 1, lastRound: 1 }
      : { scorecard: 0.5, berkus: 0, risk: 0.5, devStage: 0.25, duplicate: 0.25, comps: 1.5, vc: 1, firstChicago: 1, dcf: 1, lastRound: 1 },
    outcomeAt,
    longRunOutcomes,
    nextRound,
    funnel,
    aiComps,
    revenuePlan,
    stageBaselineRatio,
    valueStartupModel,
  };
});
