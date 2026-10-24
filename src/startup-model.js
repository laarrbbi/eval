/*
 * Startup model: fourteen valuation methods in four groups (scoring, market comps,
 * cash flow, investor return) combined with stage weights, plus success probabilities
 * (next round, IPO, acquisition, shutdown) from an outcome model fitted on 6,153
 * Y Combinator startups. Pure functions; works in the browser (window.StartupModel) and in Node.
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

  // Growth assumed for a pre-revenue company's second year when only year 1 is forecast.
  const PRE_REVENUE_GROWTH = 1.0;
  const TAX = 0.25;

  /**
   * Revenue to the exit year. Years 1-3 come from the three-year forecast when given;
   * otherwise growth carries on from the last known year, slowing by `fade` each year.
   * `scale` multiplies every year (used by the sensitivity table).
   */
  function revenuePlan({ arr, growth, rev1, rev2, rev3, fade, years, scale = 1 }) {
    const n = clamp(Math.round(num(years, 7)), 1, 15);
    const f = clamp(num(fade, 20) / 100, 0, 0.9);
    const a = Math.max(0, num(arr));
    const given = [rev1, rev2, rev3].map((x) => num(x, NaN));
    let g = a > 0 ? clamp(num(growth, 100) / 100, -0.9, 5) : PRE_REVENUE_GROWTH;
    let prev = a;
    const rows = [];
    for (let t = 1; t <= n; t++) {
      const forecast = t <= 3 && given[t - 1] > 0;
      let r;
      if (forecast) {
        r = given[t - 1];
        if (prev > 0) g = r / prev - 1;
      } else {
        g *= 1 - f;
        r = prev * (1 + Math.max(-0.9, g));
      }
      rows.push({ year: t, revenue: r, growth: prev > 0 ? r / prev - 1 : null, forecast });
      prev = r;
    }
    if (scale !== 1) for (const row of rows) row.revenue *= scale;
    const last = rows[rows.length - 1];
    return {
      rows,
      years: n,
      exitRevenue: last.revenue,
      exitGrowth: last.growth == null ? g : last.growth,
      ntmRevenue: rows[0].revenue,
      ntmGrowth: a > 0 ? rows[0].revenue / (a * scale) - 1 : null,
    };
  }

  // EBITDA and free cash flow by year: today's burn fades out while the mature margin
  // phases in by the exit year. Losses carry no tax; profits pay 25%.
  function cashFlows(plan, monthlyBurn, matureMargin) {
    const N = plan.years;
    const burn = Math.max(0, num(monthlyBurn)) * 12;
    return plan.rows.map((row) => {
      const w = row.year / N;
      const ebitda = row.revenue * matureMargin * w - burn * (1 - w);
      return { year: row.year, revenue: row.revenue, ebitda, fcf: ebitda > 0 ? ebitda * (1 - TAX) : ebitda };
    });
  }

  /* ------------------------ questionnaire scoring ------------------------ */

  const TRACK_SCORE = { exit: 1, first: 0.6, failed: 0.5 };
  const BACKER_SCORE = { top: 1, vc: 0.7, angels: 0.4, none: 0.1 };
  const TRACTION_SCORE = { none: 0.1, early: 0.35, onTrack: 0.6, strong: 0.85, exceptional: 1 };
  // Product score a typical funded company has at each stage (scorecard compares with peers).
  const EXPECTED_PRODUCT = { preseed: 0.35, seed: 0.55, seriesA: 0.8, seriesB: 1, seriesC: 1 };
  // Scorecard: criterion score a typical funded peer gets; each 0.1 above moves the factor 12.5%.
  const SCORECARD_TYPICAL = { team: 0.75, opportunity: 0.7, product: 0.5, competition: 0.45, relationships: 0.5, funding: 0.5 };
  const SCORECARD_SLOPE = 1.25;
  const SCORECARD_LABELS = {
    team: 'Strength of the team', opportunity: 'Size of the opportunity', product: 'Product and technology',
    competition: 'Competitive environment', relationships: 'Strategic relationships', funding: 'Further funding needed',
  };
  const CHECKLIST_LABELS = {
    team: 'Quality of the team', idea: 'Quality of the idea', product: 'Product roll-out and IP',
    relationships: 'Strategic relationships', operatingStage: 'Operating stage',
  };
  const PROTOTYPE = { idea: 0.1, prototype: 0.6, mvp: 0.8, paying: 1, scaling: 1 };
  const ROLLOUT = { idea: 0, prototype: 0, mvp: 0.3, paying: 0.7, scaling: 1 };
  const STAGE_POINTS = { idea: -2, prototype: -1, mvp: 0, paying: 1, scaling: 2 };

  function answerOf(answers, group, key) {
    const q = D.QUESTIONS[group].find((x) => x.key === key);
    const v = answers && answers[key] != null && answers[key] !== '' ? answers[key] : q.default;
    return q.options.find((o) => o.value === v) || q.options.find((o) => o.value === q.default);
  }

  /** Turns the multiple-choice answers into 0-1 scores and risk points. */
  function scoresFromAnswers(answers, { founder = 'first', investors = 'vc', traction = 'onTrack', arrUsd = 0 } = {}) {
    const a = (g, k) => answerOf(answers, g, k);
    const team = 0.15 * a('team', 'founders').score + 0.15 * a('team', 'fulltime').score + 0.2 * a('team', 'experience').score
      + 0.2 * (TRACK_SCORE[founder] ?? 0.6) + 0.15 * a('team', 'technical').score + 0.15 * a('team', 'roles').score;
    const s = {
      team,
      productStage: a('product', 'stage').value,
      product: a('product', 'stage').score,
      ip: a('product', 'ip').score,
      tam: a('market', 'tam').score,
      competition: a('market', 'competition').score,
      moat: a('market', 'moat').score,
      partners: a('market', 'partners').score,
      gtm: a('market', 'gtm').score,
      funding: a('market', 'funding').score,
      backers: BACKER_SCORE[investors] ?? 0.7,
      traction: TRACTION_SCORE[traction] ?? 0.6,
      revenue: clamp(Math.log10(Math.max(arrUsd, 1e4) / 1e4) / 4, 0, 1), // $10k = 0, $100M = 1
      risks: {},
    };
    for (const group of Object.keys(D.QUESTIONS)) {
      for (const q of D.QUESTIONS[group]) if (q.risk) s.risks[q.risk] = a(group, q.key).point;
    }
    return s;
  }

  /** Equidam's company stage, which sets its method weights and ours. */
  function equidamStage(stage, productStage, arr) {
    if (stage === 'preseed') return productStage === 'idea' || productStage === 'prototype' ? 'idea' : 'development';
    if (stage === 'seed') return arr > 0 ? 'startup' : 'development';
    if (stage === 'seriesA') return 'expansion';
    return 'growth';
  }

  /* ------------------------------- helpers -------------------------------- */

  const METHOD_KEYS = ['scorecard', 'checklist', 'berkus', 'risk', 'devStage', 'trading', 'precedents', 'privateRounds', 'lastRound',
    'dcfLtg', 'dcfMultiple', 'vc', 'vcEquidam', 'scenario'];
  const PILLAR_OF = Object.fromEntries(D.PILLARS.flatMap((p) => Object.keys(p.methods).map((k) => [k, p.key])));

  function method(key, label, value, low, high, detail, extra) {
    return { key, label, pillar: PILLAR_OF[key], value, low: Math.min(low, value), high: Math.max(high, value), weight: 1, detail: detail || [], ...extra };
  }
  function skipped(key, label, reason) {
    return { key, label, pillar: PILLAR_OF[key], value: 0, low: 0, high: 0, weight: 0, skipped: reason, detail: [] };
  }
  const pctText = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
  const xText = (x, d = 1) => `${x.toFixed(d)}x`;

  // Generic survival curve by company age (Equidam-style table), for comparison with ours.
  function genericSurvival(age) {
    const s = D.EQUIDAM.survival;
    if (age <= 0) return 1;
    if (age >= s.length) return s[s.length - 1] * Math.pow(0.98, age - s.length);
    const lo = Math.floor(age);
    const a = lo === 0 ? 1 : s[lo - 1];
    return a + (s[lo] - a) * (age - lo);
  }

  // Marketability discount for the DCFs, smaller for larger and profitable companies
  // (Damodaran-style: base discount less 4 points per log unit of revenue in $M).
  function illiquidityDiscount(revenueUsd, profitable) {
    const I = D.EQUIDAM.illiquidity;
    const base = profitable ? I.profitable : I.lossMaking;
    const [lo, hi] = D.EQUIDAM.illiquidityBounds;
    return clamp(base - I.perLnRevenue * Math.log(Math.max(revenueUsd, 50000) / 1e6), lo, hi);
  }

  /* ---------------------------- the valuation ---------------------------- */

  /**
   * Fourteen methods in four groups (scoring, market comps, cash flow, investor return),
   * combined with stage weights. All money in display currency; fxPerUsd converts to USD
   * for size bands and comps. See README for the input fields.
   */
  function valueStartupModel(input) {
    const fx = num(input.fxPerUsd, 1) > 0 ? num(input.fxPerUsd, 1) : 1;
    const notes = [];
    const stage = findKey(D.STAGES, input.stage, 1).key;
    const vcStage = findKey(B.VC_STAGES, stage === 'seriesC' ? 'seriesB' : stage, 1);
    const bm = findKey(BUSINESS_MODELS, input.model);
    const tm = bm.tech ? findKey(B.TECH_MODELS, bm.tech) : null;
    const aiSegment = D.AI_SEGMENTS.some((s) => s.key === input.aiSegment) ? input.aiSegment : null;
    const profile = { industry: input.industry, model: bm.key, ai: !!aiSegment, us: input.hq === 'us' };
    const baseline = Math.max(0, num(input.baseline));
    const raise = Math.max(0, num(input.raise));
    const arr = Math.max(0, num(input.arr));
    const arrUsd = arr / fx;
    const growth = num(input.growth, 100);
    const age = Math.max(0.25, num(input.ageYears, 1.5));
    const runway = num(input.runwayMonths, NaN);
    const investors = input.investors || 'vc';
    const founder = input.founder || 'first';
    const traction = input.traction || 'onTrack';
    const multScale = Math.max(0.05, num(input.multipleScale, 1));
    const fin = D.MODEL_FINANCE[aiSegment ? 'ai' : bm.key] || D.MODEL_FINANCE.saas;
    const matureMargin = clamp(num(input.targetMargin, 25) / 100, -0.5, 0.8);

    const scores = scoresFromAnswers(input.answers, { founder, investors, traction, arrUsd });
    const eqStage = equidamStage(stage, scores.productStage, arr);

    // Plan and success probabilities
    const plan = revenuePlan({ arr, growth, rev1: input.rev1, rev2: input.rev2, rev3: input.rev3, fade: input.fade, years: input.yearsToExit, scale: num(input.planScale, 1) });
    const N = plan.years;
    const flows = cashFlows(plan, input.monthlyBurn, matureMargin);
    const next = nextRound({ stage, investors, founder, traction, runwayMonths: runway, ai: !!aiSegment });
    const outcomeArgs = { age, profile, investors, founder, stage, runwayMonths: runway, traction };
    const longRun = longRunOutcomes({ ...outcomeArgs, horizon: N });
    const funnelSteps = funnel(stage, next.eventual);
    const dilution = clamp(num(input.dilution, vcStage.dilution * 100) / 100, 0, 0.9);
    const irr = clamp(num(input.targetIrr, vcStage.targetIrr * 100) / 100, 0.05, 2);
    const exitRevUsd = plan.exitRevenue / fx;
    const exitGrowthPct = plan.exitGrowth * 100;

    // Exit multiple of revenue for the VC method: your figure, else AI comps or private M&A multiples at exit size.
    let exitMultiple = num(input.exitMultiple, NaN);
    let exitBasis = 'your input';
    if (!(exitMultiple > 0)) {
      if (aiSegment) {
        exitMultiple = Math.min(aiComps(aiSegment, exitRevUsd, exitGrowthPct).applied, D.AI_COMP_ADJUST.exitCap);
        exitBasis = `AI comps at exit size and growth, capped at ${D.AI_COMP_ADJUST.exitCap}x`;
      } else if (tm) {
        exitMultiple = Math.min(B.TECH_MARKET.exitMultipleCap, V.techMultiple({
          model: tm, arrUsd: exitRevUsd, growth: exitGrowthPct, grossMargin: num(input.grossMargin, tm.typicalGM), nrr: 102,
          ebitdaMargin: matureMargin * 100, largestCustomer: 0, runwayMonths: 0,
        }).multiple);
        exitBasis = `${tm.label} M&A multiples at exit size, capped at ${B.TECH_MARKET.exitMultipleCap}x`;
      } else {
        exitMultiple = 4;
        exitBasis = 'assumption for deep-science companies; enter your own';
      }
    }
    exitMultiple *= multScale;
    const successValue = plan.exitRevenue * exitMultiple;

    const methods = [];
    const seedEquivalent = baseline / stageBaselineRatio(stage);

    /* ---- Scoring methods ---- */
    if (baseline > 0) {
      // Scorecard (Equidam's six criteria): each criterion against a typical funded peer.
      const stageRel = clamp(0.5 + scores.product - EXPECTED_PRODUCT[stage], 0, 1);
      const crit = {
        team: scores.team,
        opportunity: 0.7 * scores.tam + 0.3 * scores.gtm,
        product: 0.6 * stageRel + 0.4 * scores.ip,
        competition: 0.5 * scores.competition + 0.5 * scores.moat,
        relationships: 0.6 * scores.partners + 0.4 * scores.backers,
        funding: scores.funding,
      };
      let factor = 0;
      const scDetail = [];
      for (const [k, w] of Object.entries(D.EQUIDAM.scorecardWeights)) {
        const c = clamp(1 + SCORECARD_SLOPE * (crit[k] - SCORECARD_TYPICAL[k]), 0.5, 1.5);
        factor += w * c;
        scDetail.push({ label: `${SCORECARD_LABELS[k]} (${Math.round(w * 100)}%)`, value: `${Math.round(c * 100)}% of a typical peer` });
      }
      scDetail.push({ label: 'Market baseline', amount: baseline }, { label: 'Weighted factor', value: `× ${factor.toFixed(2)}` });
      const sc = baseline * factor;
      methods.push(method('scorecard', 'Scorecard', sc, sc * 0.85, sc * 1.15, scDetail, { criteria: crit }));

      // Checklist: five criteria, each a share of the regional maximum.
      const ckMax = num(input.checklistMax, NaN) > 0 ? num(input.checklistMax) : seedEquivalent * D.EQUIDAM.checklistMaxRatioToSeed;
      const ck = {
        team: scores.team,
        idea: 0.5 * scores.tam + 0.25 * scores.moat + 0.25 * scores.competition,
        product: 0.6 * scores.product + 0.4 * scores.ip,
        relationships: 0.6 * scores.partners + 0.4 * scores.backers,
        operatingStage: 0.5 * scores.product + 0.5 * scores.revenue,
      };
      let ckSum = 0;
      const ckDetail = [];
      for (const [k, w] of Object.entries(D.EQUIDAM.checklistWeights)) {
        ckSum += w * ck[k];
        ckDetail.push({ label: `${CHECKLIST_LABELS[k]} (${Math.round(w * 100)}%)`, value: `${Math.round(ck[k] * 100)}% achieved` });
      }
      ckDetail.push({ label: 'Maximum value in your market', amount: ckMax });
      const ckv = ckMax * ckSum;
      methods.push(method('checklist', 'Checklist', ckv, ckv * 0.85, ckv * 1.15, ckDetail, { criteria: ck }));

      // Berkus: five risk-reducing milestones, each worth up to 25% of the baseline.
      const per = baseline * B.BERKUS_MAX_SHARE;
      const bk = {
        idea: 0.5 * scores.tam + 0.5 * scores.moat,
        prototype: PROTOTYPE[scores.productStage],
        team: scores.team,
        relationships: 0.6 * scores.partners + 0.4 * scores.backers,
        rollout: 0.6 * ROLLOUT[scores.productStage] + 0.4 * scores.traction,
      };
      const bkv = Object.values(bk).reduce((s, x) => s + x * per, 0);
      methods.push(method('berkus', 'Berkus', bkv, bkv * 0.85, bkv * 1.15,
        B.BERKUS_FACTORS.map((f) => ({ label: f.label, amount: bk[f.key] * per }))));

      // Risk factor summation: twelve risks, each point 12.5% of the baseline.
      const rp = {
        ...scores.risks,
        management: Math.round(4 * scores.team - 2),
        stage: STAGE_POINTS[scores.productStage],
        sales: Math.round(4 * (0.5 * scores.gtm + 0.5 * scores.traction) - 2),
        funding: Math.round(4 * scores.funding - 2),
        competition: Math.round(4 * (0.5 * scores.competition + 0.5 * scores.moat) - 2),
      };
      let points = 0;
      for (const f of B.RISK_FACTORS) points += clamp(rp[f.key] || 0, -2, 2);
      const rfsRaw = baseline * (1 + points * B.RISK_STEP_SHARE);
      const rfs = Math.max(rfsRaw, baseline * 0.1);
      methods.push(method('risk', 'Risk factor summation', rfs, rfs * 0.85, rfs * 1.15, [
        ...B.RISK_FACTORS.map((f) => ({ label: f.label, value: `${rp[f.key] > 0 ? '+' : ''}${rp[f.key] || 0}` })),
        { label: 'Net points × 12.5% of the baseline', value: `${points > 0 ? '+' : ''}${points}` },
      ], { points }));

      // Development stage: milestone ladder tied to the market's round medians.
      const dsKey = { idea: scores.team >= 0.7 ? 2 : 1, prototype: 3, mvp: 3, paying: 4, scaling: 5 }[scores.productStage];
      const ds = D.DEV_STAGES.find((s) => s.key === dsKey);
      const anchor = seedEquivalent * (D.US_STAGE_PREMONEY[ds.anchor] / D.US_STAGE_PREMONEY.seed);
      methods.push(method('devStage', 'Development stage', anchor * (ds.ladder[0] + ds.ladder[1]) / 2, anchor * ds.ladder[0], anchor * ds.ladder[1], [
        { label: ds.label, value: `${ds.ladder[0]}–${ds.ladder[1]}× the ${findKey(D.STAGES, ds.anchor).label} median` },
        { label: `${findKey(D.STAGES, ds.anchor).label} median in your market`, amount: anchor },
      ]));
    } else {
      for (const [k, l] of [['scorecard', 'Scorecard'], ['checklist', 'Checklist'], ['berkus', 'Berkus'], ['risk', 'Risk factor summation'], ['devStage', 'Development stage']]) {
        methods.push(skipped(k, l, 'Needs a market baseline.'));
      }
    }

    /* ---- Market comps ---- */
    const IB = D.IB;
    if (arr > 0 && tm && plan.ntmRevenue > 0) {
      // Public trading comps: EV / next-12-months revenue by growth, less marketability and size discounts.
      const g = plan.ntmGrowth * 100;
      const curve = interp(g, IB.tradingCurve);
      const mult = curve * (aiSegment ? 1 : tm.factor) * multScale;
      const size = interp(plan.ntmRevenue / fx, IB.sizeAdjust);
      const k = (1 - IB.dlom) * size;
      const v = plan.ntmRevenue * mult * k;
      methods.push(method('trading', 'Public trading comps', v, v * 0.7, Math.min(v * 1.4, plan.ntmRevenue * IB.trading.top5 * multScale * k), [
        { label: `Next 12 months revenue (growth ${Math.round(g)}%)`, amount: plan.ntmRevenue },
        { label: `Listed cloud software at that growth (${IB.trading.asOf})`, value: `${curve.toFixed(1)}x NTM revenue` },
        ...(aiSegment || tm.factor === 1 ? [] : [{ label: `Business model: ${tm.label}`, value: `× ${tm.factor.toFixed(2)}` }]),
        { label: 'Discount for lack of marketability', value: `− ${pctText(IB.dlom)}` },
        { label: 'Size adjustment vs listed companies', value: `× ${size.toFixed(2)}` },
        { label: 'Applied multiple', value: `${(mult * k).toFixed(1)}x NTM revenue` },
      ]));
    } else {
      methods.push(skipped('trading', 'Public trading comps', !tm ? 'No listed revenue multiples for deep-science companies.' : 'Needs current revenue.'));
    }

    if (arr > 0) {
      const cp = 1 + IB.controlPremium;
      if (aiSegment) {
        const m = IB.precedents.map((d) => d.ev / d.revenue);
        const q = [0.25, 0.5, 0.75].map((p) => quantile(m, p) * multScale / cp);
        methods.push(method('precedents', 'Precedent acquisitions', arr * q[1], arr * q[0], arr * q[2], [
          { label: `Median of ${m.length} large AI and software deals`, value: `${(quantile(m, 0.5)).toFixed(1)}x run-rate revenue` },
          { label: 'Less the control premium (minority stake)', value: `÷ ${cp.toFixed(3)}` },
          { label: 'Applied to today’s run-rate', value: `${q[1].toFixed(1)}x` },
        ]));
      } else if (tm) {
        const t = V.techMultiple({
          model: tm, arrUsd, growth, grossMargin: num(input.grossMargin, tm.typicalGM), nrr: 102,
          ebitdaMargin: num(input.ebitdaMargin, 0), largestCustomer: 0, runwayMonths: runway > 0 ? runway : 0,
        });
        const mult = (t.multiple * multScale) / cp;
        methods.push(method('precedents', 'Precedent acquisitions', arr * mult, arr * mult * 0.75, arr * mult * 1.3, [
          ...t.factors.slice(0, 3),
          { label: 'Private M&A multiple (control)', value: `${(t.multiple * multScale).toFixed(2)}x revenue` },
          { label: 'Less the control premium (minority stake)', value: `÷ ${cp.toFixed(3)}` },
        ]));
      } else {
        methods.push(skipped('precedents', 'Precedent acquisitions', 'No revenue multiples for deep-science companies.'));
      }
    } else {
      methods.push(skipped('precedents', 'Precedent acquisitions', 'Needs current revenue.'));
    }

    if (aiSegment && arr > 0) {
      const c = aiComps(aiSegment, arrUsd, growth);
      const cap = D.AI_COMP_ADJUST.stageCap[stage] || 50;
      const applied = Math.min(c.applied * multScale, cap);
      methods.push(method('privateRounds', 'Private AI rounds', arr * applied, arr * Math.min(c.low * multScale, cap * 0.7), arr * Math.min(c.high * multScale, cap), [
        { label: `${c.segment.label}: median of ${c.rows.length} companies`, value: `${c.median.toFixed(1)}x revenue` },
        { label: 'Scale discount vs market leaders', value: `× ${c.scale.toFixed(2)}` },
        { label: `Growth ${Math.round(growth)}% vs ~100% for the comps`, value: `× ${c.growthAdj.toFixed(2)}` },
        ...(c.applied * multScale > cap ? [{ label: 'Capped at the top of AI round multiples for this stage', value: `${cap}x` }] : []),
        { label: 'Applied multiple', value: `${applied.toFixed(1)}x revenue` },
      ]));
    } else {
      methods.push(skipped('privateRounds', 'Private AI rounds', aiSegment ? 'Needs current revenue.' : 'Collected for AI companies; the market baseline covers other rounds.'));
    }

    const lastPost = Math.max(0, num(input.lastPost));
    if (lastPost > 0) {
      const step = D.STEP_UPS[stage] || 1.5;
      const months = Math.max(0, num(input.monthsSinceLast, 12));
      const progress = input.progress || 'onPlan';
      let k = { behind: 0.7, flat: 1.0, onPlan: 1 + 0.5 * (step - 1), milestones: step }[progress] || 1;
      if (months > 24 && (progress === 'flat' || progress === 'behind')) k *= 0.8;
      methods.push(method('lastRound', 'Last round, stepped up', lastPost * k, lastPost * k * 0.8, lastPost * k * 1.2, [
        { label: 'Last post-money', amount: lastPost },
        { label: `Median step-up to the next round (${findKey(D.STAGES, stage, 1).label})`, value: `${step.toFixed(2)}x` },
        { label: 'Applied for your progress', value: `× ${k.toFixed(2)}` },
      ]));
    } else {
      methods.push(skipped('lastRound', 'Last round, stepped up', 'Enter your last round’s post-money valuation.'));
    }

    /* ---- Cash-flow methods (Equidam's two DCFs) ---- */
    const ke = D.EQUIDAM.riskFree + fin.beta * D.EQUIDAM.equityRiskPremium;
    const profitable = num(input.ebitdaMargin, -1) > 0;
    const illiq = illiquidityDiscount(arrUsd, profitable);
    // Survival: the lower of our outcome model and a generic table, because companies that
    // closed do not always update their status in the YC directory.
    const survOf = (t) => Math.min(1 - longRunOutcomes({ ...outcomeArgs, horizon: t }).probs.Inactive, genericSurvival(age + t) / genericSurvival(age));
    const surv = flows.map((f) => survOf(f.year));
    flows.forEach((f, i) => { f.survival = surv[i]; });
    const survN = surv[surv.length - 1];
    const modelN = 1 - longRun.probs.Inactive;
    const genericN = genericSurvival(age + N) / genericSurvival(age);
    const ltg = Math.min(clamp(num(input.terminalGrowth, 2.5) / 100, -0.02, 0.1), D.EQUIDAM.longTermGrowthCap);
    const ebitdaN = plan.exitRevenue * matureMargin;
    const pvFlows = (r) => flows.reduce((s, f, i) => s + (surv[i] * f.fcf) / Math.pow(1 + r, f.year), 0);
    const tvLtg = (r) => (ebitdaN * (1 - TAX) * (1 + ltg)) / (r - ltg);
    const exitEbitda = fin.exitEbitda * multScale;
    const dcfOf = (tv) => (r) => (pvFlows(r) + (survN * tv(r)) / Math.pow(1 + r, N)) * (1 - illiq);
    const dcfShared = [
      { label: `Cost of equity: ${pctText(D.EQUIDAM.riskFree, 1)} + beta ${fin.beta.toFixed(2)} × ${pctText(D.EQUIDAM.equityRiskPremium, 1)}`, value: pctText(ke, 1) },
      { label: 'Cash flows to the exit year, survival-weighted', amount: pvFlows(ke) },
      { label: `Chance still operating in year ${N}: lower of our model (${pctText(modelN)}) and a generic table (${pctText(genericN)})`, value: pctText(survN) },
      { label: 'Illiquidity discount', value: `− ${pctText(illiq)}` },
    ];
    if (plan.exitRevenue > 0 && matureMargin > 0) {
      const f1 = dcfOf(tvLtg);
      const v1 = f1(ke);
      if (v1 > 0) {
        methods.push(method('dcfLtg', 'DCF, long-term growth', v1, Math.max(0, f1(ke + 0.02)), f1(Math.max(ltg + 0.02, ke - 0.02)), [
          ...dcfShared,
          { label: `Terminal value in year ${N}: ${pctText(matureMargin)} EBITDA margin, ${pctText(ltg, 1)} growth`, amount: tvLtg(ke) },
          { label: 'Implied exit multiple', value: `${(tvLtg(ke) / ebitdaN).toFixed(1)}x EBITDA` },
        ]));
      } else {
        methods.push(skipped('dcfLtg', 'DCF, long-term growth', 'Losses before the exit year outweigh the terminal value.'));
      }
      const f2 = dcfOf(() => ebitdaN * exitEbitda);
      const v2 = f2(ke);
      if (v2 > 0) {
        methods.push(method('dcfMultiple', 'DCF, exit multiple', v2, Math.max(0, f2(ke + 0.02)), f2(Math.max(0.02, ke - 0.02)), [
          ...dcfShared,
          { label: `Exit value in year ${N}: EBITDA × ${exitEbitda.toFixed(1)} (${fin.basis})`, amount: ebitdaN * exitEbitda },
          { label: 'Implied exit multiple', value: `${((ebitdaN * exitEbitda) / plan.exitRevenue).toFixed(1)}x revenue` },
        ]));
      } else {
        methods.push(skipped('dcfMultiple', 'DCF, exit multiple', 'Losses before the exit year outweigh the exit value.'));
      }
    } else {
      const why = plan.exitRevenue > 0 ? 'Needs a positive margin when mature.' : 'Add a revenue forecast to include it.';
      methods.push(skipped('dcfLtg', 'DCF, long-term growth', why), skipped('dcfMultiple', 'DCF, exit multiple', why));
    }

    /* ---- Investor-return methods ---- */
    if (successValue > 0) {
      const vcPre = (r) => (successValue * (1 - dilution)) / Math.pow(1 + r, N) - raise;
      const mid = vcPre(irr);
      if (mid > 0) {
        methods.push(method('vc', 'Venture capital method', mid, Math.max(0, vcPre(irr + 0.1)), vcPre(Math.max(0.05, irr - 0.1)), [
          { label: `Revenue in year ${N}`, amount: plan.exitRevenue },
          { label: `Exit multiple (${exitBasis})`, value: xText(exitMultiple) },
          { label: 'Exit value', amount: successValue },
          { label: 'Target return', value: `${Math.round(irr * 100)}% a year (${Math.pow(1 + irr, N).toFixed(1)}x)` },
          { label: 'Dilution before exit', value: pctText(dilution) },
        ]));
      } else {
        methods.push(skipped('vc', 'Venture capital method', 'The exit value is too small for this raise at the target return.'));
      }
    } else {
      methods.push(skipped('vc', 'Venture capital method', 'Add a revenue forecast to include it.'));
    }

    // Equidam's VC method: exit on EBITDA, required multiple from the chance of a successful exit.
    const pSuccess = longRun.probs.Acquired + longRun.probs.Public;
    const exitEq = ebitdaN * exitEbitda;
    if (exitEq > 0 && pSuccess > 0) {
      const req = (target) => target / (pSuccess * (1 - dilution));
      const pre = (target) => exitEq / req(target) - raise;
      const mid = pre(D.EQUIDAM.fundTarget);
      if (mid > 0) {
        methods.push(method('vcEquidam', 'VC method, success-adjusted', mid, Math.max(0, pre(D.EQUIDAM.fundTarget * 1.2)), pre(D.EQUIDAM.fundTarget * 0.8), [
          { label: `Exit value: year-${N} EBITDA × ${exitEbitda.toFixed(1)}`, amount: exitEq },
          { label: `Chance of an exit by year ${N} (acquired or IPO)`, value: pctText(pSuccess) },
          { label: 'Share kept after later rounds', value: pctText(1 - dilution) },
          { label: `Required multiple: ${D.EQUIDAM.fundTarget}x fund target ÷ (success × share kept)`, value: xText(req(D.EQUIDAM.fundTarget)) },
          { label: 'Implied return a year', value: pctText(Math.pow(req(D.EQUIDAM.fundTarget), 1 / N) - 1) },
        ]));
      } else {
        methods.push(skipped('vcEquidam', 'VC method, success-adjusted', 'The exit value does not cover this raise at the required multiple.'));
      }
    } else {
      methods.push(skipped('vcEquidam', 'VC method, success-adjusted', 'Needs a revenue forecast and a positive margin when mature.'));
    }

    // Scenario model (probability-weighted expected return, First Chicago style) on banker exit values.
    const S = D.SCENARIO;
    const disc = clamp(num(input.discountRate, S.discountRate[stage] * 100) / 100, 0.02, 1);
    let ipoMult;
    let saleMult;
    if (aiSegment) {
      ipoMult = interp(exitGrowthPct, IB.tradingCurve) * multScale;
      saleMult = Math.min(quantile(IB.precedents.map((d) => d.ev / d.revenue), 0.5), D.AI_COMP_ADJUST.exitCap) * multScale;
    } else if (tm) {
      ipoMult = interp(exitGrowthPct, IB.tradingCurve) * tm.factor * multScale;
      saleMult = Math.min(B.TECH_MARKET.exitMultipleCap * multScale, V.techMultiple({
        model: tm, arrUsd: exitRevUsd, growth: exitGrowthPct, grossMargin: num(input.grossMargin, tm.typicalGM), nrr: 102,
        ebitdaMargin: matureMargin * 100, largestCustomer: 0, runwayMonths: 0,
      }).multiple * multScale);
    } else {
      ipoMult = exitMultiple;
      saleMult = exitMultiple;
    }
    if (num(input.exitMultiple, NaN) > 0) saleMult = exitMultiple;
    const p = longRun.probs;
    const scenarios = [
      { key: 'ipo', label: 'IPO', p: p.Public, multiple: ipoMult, value: plan.exitRevenue * ipoMult, basis: 'listed software at exit growth' },
      { key: 'strategic', label: 'Strategic sale', p: p.Acquired * S.strategicShare, multiple: saleMult, value: plan.exitRevenue * saleMult, basis: aiSegment ? 'median large AI deal' : 'private M&A at exit size' },
      { key: 'small', label: 'Smaller sale or acqui-hire', p: p.Acquired * (1 - S.strategicShare), multiple: saleMult * S.smallSaleShare, value: plan.exitRevenue * saleMult * S.smallSaleShare, basis: `${pctText(S.smallSaleShare)} of a strategic sale` },
      { key: 'private', label: 'Still private', p: p.Active, multiple: saleMult * S.privateShare, value: plan.exitRevenue * saleMult * S.privateShare, basis: `${pctText(S.privateShare)} of a strategic sale` },
      { key: 'shutdown', label: 'Shut down', p: p.Inactive, multiple: 0, value: 0, basis: 'nothing left for shareholders' },
    ];
    const expected = scenarios.reduce((s, x) => s + x.p * x.value, 0);
    const scenPre = (r) => (expected * (1 - dilution)) / Math.pow(1 + r, N) - raise;
    const scenario = { rows: scenarios, expected, discountRate: disc, value: scenPre(disc), years: N, dilution };
    if (expected > 0 && scenPre(disc) > 0) {
      methods.push(method('scenario', 'Scenario model (First Chicago)', scenPre(disc), Math.max(0, scenPre(disc + 0.05)), scenPre(Math.max(0.02, disc - 0.05)), [
        ...scenarios.map((x) => ({ label: `${x.label}: ${pctText(x.p, x.p < 0.1 ? 1 : 0)} × ${xText(x.multiple)}`, amount: x.value })),
        { label: `Expected value in year ${N}`, amount: expected },
        { label: 'Discount rate (failure is already in the probabilities)', value: pctText(disc) },
      ]));
    } else {
      methods.push(skipped('scenario', 'Scenario model (First Chicago)', expected > 0 ? 'Expected exit value does not cover this raise.' : 'Add a revenue forecast to include it.'));
    }

    /* ---- Final: four groups weighted by stage ---- */
    const w = input.weights || {};
    const pw = input.pillarWeights || {};
    const stageW = D.PILLAR_WEIGHTS[eqStage];
    const pillars = D.PILLARS.map((P) => {
      const ms = methods.filter((m) => m.pillar === P.key);
      for (const m of ms) {
        const o = num(w[m.key], NaN);
        m.weight = m.skipped || !(m.value > 0) ? 0 : Number.isFinite(o) ? Math.max(0, o) : P.methods[m.key];
      }
      const total = ms.reduce((s, m) => s + m.weight, 0);
      const avg = (f) => (total ? ms.reduce((s, m) => s + m.weight * m[f], 0) / total : 0);
      const o = num(pw[P.key], NaN);
      return {
        key: P.key, label: P.label, methods: ms.map((m) => m.key), total,
        value: avg('value'), low: avg('low'), high: avg('high'),
        stageWeight: Number.isFinite(o) ? Math.max(0, o) : stageW[P.key],
      };
    });
    const live = pillars.filter((P) => P.total > 0 && P.stageWeight > 0);
    const wSum = live.reduce((s, P) => s + P.stageWeight, 0);
    let low = 0;
    let mid = 0;
    let high = 0;
    for (const P of pillars) {
      P.share = live.includes(P) ? P.stageWeight / wSum : 0;
      low += P.share * P.low;
      mid += P.share * P.value;
      high += P.share * P.high;
    }
    for (const m of methods) {
      const P = pillars.find((x) => x.key === m.pillar);
      m.share = P.share && P.total ? (P.share * m.weight) / P.total : 0;
    }
    methods.sort((a, b) => METHOD_KEYS.indexOf(a.key) - METHOD_KEYS.indexOf(b.key));

    // Reconciliation: Equidam's own weighting, the banker's comps range and the scenario model alone.
    const byKey = (k) => methods.find((m) => m.key === k);
    const eqW = D.EQUIDAM.weights[eqStage];
    const eqUsed = Object.keys(eqW).filter((k) => eqW[k] > 0 && byKey(k) && !byKey(k).skipped && byKey(k).value > 0);
    const eqTotal = eqUsed.reduce((s, k) => s + eqW[k], 0);
    const market = methods.filter((m) => m.pillar === 'market' && m.weight > 0);
    const reconciliation = {
      equidam: eqTotal ? eqUsed.reduce((s, k) => s + eqW[k] * byKey(k).value, 0) / eqTotal : 0,
      equidamMethods: eqUsed,
      comps: market.length ? { low: Math.min(...market.map((m) => m.value)), high: Math.max(...market.map((m) => m.value)), mid: pillars.find((P) => P.key === 'market').value } : null,
      scenario: byKey('scenario').skipped ? 0 : byKey('scenario').value,
      final: mid,
    };

    const floorValue = Math.max(0, num(input.personMonths)) * Math.max(0, num(input.costPerMonth)) + Math.max(0, num(input.ipCost)) + Math.max(0, num(input.otherAssets));
    const floor = floorValue > 0 ? {
      value: floorValue,
      detail: [
        { label: 'Engineering to rebuild', amount: Math.max(0, num(input.personMonths)) * Math.max(0, num(input.costPerMonth)) },
        { label: 'Patents and IP', amount: Math.max(0, num(input.ipCost)) },
        { label: 'Equipment, data and other assets', amount: Math.max(0, num(input.otherAssets)) },
      ],
    } : null;

    const groupValues = live.map((P) => P.value);
    if (groupValues.length > 1 && Math.max(...groupValues) > 3 * Math.min(...groupValues)) {
      notes.push('The method groups disagree by more than three times. That usually means the forecast is far ahead of today’s traction, or the reverse; check the plan and the exit multiple.');
    }
    if (aiSegment && D.OUTCOME_MODEL.oddsRatios.ai) {
      notes.push('AI startups in the YC data stay active longer; part of that is survivors updating their tags to AI, so treat the AI effect on survival as optimistic.');
    }
    if (runway > 0 && runway < 6) notes.push('Under six months of runway: raising now is urgent, and the odds above fall quickly.');
    if (baseline <= 0) notes.push('Enter a market baseline so the scoring methods can run.');
    if (floor && mid > 0 && mid < floor.value) notes.push('The valuation is below the cost to rebuild the product; buyers may still pay at least that for the technology.');

    const post = mid + raise;
    return {
      methods,
      pillars,
      low, mid, high,
      postMoney: post,
      dilutionNow: raise > 0 && post > 0 ? raise / post : 0,
      equidamStage: eqStage,
      scores,
      plan,
      flows,
      exitMultiple,
      exitBasis,
      successValue,
      scenario,
      reconciliation,
      costOfEquity: ke,
      illiquidity: illiq,
      floor,
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

  // Default weights: group weights for the company's Equidam stage, method weights within groups.
  function defaultWeights(eqStage) {
    return {
      pillars: { ...D.PILLAR_WEIGHTS[eqStage] || D.PILLAR_WEIGHTS.startup },
      methods: Object.fromEntries(D.PILLARS.flatMap((P) => Object.entries(P.methods))),
    };
  }

  // Final value when the revenue plan and market multiples move (rows: plan, columns: multiples).
  function sensitivity(input, planSteps = [0.7, 1, 1.3], multipleSteps = [0.75, 1, 1.25]) {
    return {
      planSteps,
      multipleSteps,
      grid: planSteps.map((ps) => multipleSteps.map((ms) => valueStartupModel({ ...input, planScale: ps, multipleScale: ms }).mid)),
    };
  }

  return {
    INDUSTRIES,
    BUSINESS_MODELS,
    METHOD_KEYS,
    PILLAR_OF,
    defaultWeights,
    equidamStage,
    scoresFromAnswers,
    outcomeAt,
    longRunOutcomes,
    nextRound,
    funnel,
    aiComps,
    revenuePlan,
    cashFlows,
    illiquidityDiscount,
    stageBaselineRatio,
    valueStartupModel,
    sensitivity,
  };
});
