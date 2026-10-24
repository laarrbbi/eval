/*
 * Valuation engine for the three valuators. Pure functions, no DOM access.
 * Works in the browser (window.Valuation) and in Node (require).
 *
 * Every valuator returns the same shape:
 *   { methods: [{ key, label, value, low, high, weight, detail }],
 *     low, mid, high, notes: [string], ...extras }
 * Methods that cannot be computed are returned with weight 0 and a `skipped` reason.
 */
(function (root, factory) {
  const isNode = typeof module === 'object' && module.exports;
  const api = factory(isNode ? require('./benchmarks.js') : root.Benchmarks);
  if (isNode) module.exports = api;
  else root.Valuation = api;
})(typeof self !== 'undefined' ? self : this, function (B) {
  'use strict';

  /* ---------------------------- helpers ---------------------------- */

  function clamp(x, lo, hi) {
    return Math.min(hi, Math.max(lo, x));
  }

  // Piecewise-linear interpolation over sorted [[x, y], ...]; flat beyond the ends.
  function interp(x, points) {
    if (x <= points[0][0]) return points[0][1];
    for (let i = 1; i < points.length; i++) {
      const [x1, y1] = points[i];
      if (x <= x1) {
        const [x0, y0] = points[i - 1];
        return y0 + ((y1 - y0) * (x - x0)) / (x1 - x0);
      }
    }
    return points[points.length - 1][1];
  }

  function num(v, fallback = 0) {
    const n = typeof v === 'string' ? parseAmount(v) : Number(v);
    return Number.isFinite(n) ? n : fallback;
  }

  // Accepts "1,250,000", "1.25m", "250k", "€ 40 000", "-15". Returns NaN when empty or invalid.
  function parseAmount(text) {
    if (typeof text === 'number') return text;
    if (text == null) return NaN;
    let s = String(text).trim().toLowerCase().replace(/[\s,_]/g, '').replace(/[^0-9.\-km%bn]/g, '');
    if (!s) return NaN;
    let mult = 1;
    if (s.endsWith('bn')) { mult = 1e9; s = s.slice(0, -2); }
    else if (s.endsWith('b')) { mult = 1e9; s = s.slice(0, -1); }
    else if (s.endsWith('m')) { mult = 1e6; s = s.slice(0, -1); }
    else if (s.endsWith('k')) { mult = 1e3; s = s.slice(0, -1); }
    s = s.replace(/%$/, '');
    if (!/^-?\d*\.?\d+$/.test(s)) return NaN;
    return parseFloat(s) * mult;
  }

  function findBy(list, key, fallbackIndex = 0) {
    return list.find((x) => x.key === key) || list[fallbackIndex];
  }

  // Weighted blend over methods with a positive value and positive weight.
  function blend(methods) {
    const usable = methods.filter((m) => m.weight > 0 && m.value > 0 && Number.isFinite(m.value));
    const total = usable.reduce((s, m) => s + m.weight, 0);
    if (!total) return { low: 0, mid: 0, high: 0 };
    let low = 0, mid = 0, high = 0;
    for (const m of methods) {
      if (!usable.includes(m)) { m.share = 0; continue; }
      m.share = m.weight / total;
      low += m.share * m.low;
      mid += m.share * m.value;
      high += m.share * m.high;
    }
    return { low, mid, high };
  }

  function method(key, label, value, spread, weight, detail) {
    const v = Number.isFinite(value) ? value : 0;
    return { key, label, value: v, low: v * (1 - spread), high: v * (1 + spread), weight, detail: detail || [] };
  }

  function skipped(key, label, reason) {
    return { key, label, value: 0, low: 0, high: 0, weight: 0, skipped: reason, detail: [] };
  }

  // Venture capital method: what an investor can pay today for a target return.
  function vcMethod({ exitValue, years, targetIrr, dilution, raise }) {
    const required = Math.pow(1 + targetIrr, years);
    const post = (exitValue * (1 - dilution)) / required;
    return { post, pre: post - raise, required };
  }

  /* ----------------------- early-stage startup ---------------------- */

  /**
   * @param {object} input
   *   baseline   median pre-money for comparable funded startups (display currency)
   *   scorecard  { team, opportunity, ... } comparison factors (0.5 to 1.5)
   *   berkus     { idea, prototype, ... } achievement (0 to 1)
   *   risks      { management, stage, ... } scores (-2 to +2, positive = lower risk)
   *   vc         { exitRevenue, exitMultiple, years, targetIrr %, dilution % } (optional)
   *   raise      amount being raised now
   */
  function valueStartup(input) {
    const baseline = Math.max(0, num(input.baseline));
    const raise = Math.max(0, num(input.raise));
    const notes = [];
    const methods = [];

    // Scorecard (Payne)
    let sum = 0;
    const scDetail = [];
    for (const f of B.SCORECARD_FACTORS) {
      const c = clamp(num(input.scorecard && input.scorecard[f.key], 1), 0, 3);
      sum += f.weight * c;
      scDetail.push({ label: f.label, value: `${Math.round(f.weight * 100)}% × ${Math.round(c * 100)}%` });
    }
    scDetail.push({ label: 'Total factor', value: sum.toFixed(3) });
    methods.push(method('scorecard', 'Scorecard', baseline * sum, 0.15, 1, scDetail));

    // Berkus
    const perFactor = baseline * B.BERKUS_MAX_SHARE;
    let berkus = 0;
    const bkDetail = [];
    for (const f of B.BERKUS_FACTORS) {
      const s = clamp(num(input.berkus && input.berkus[f.key], 0), 0, 1);
      berkus += s * perFactor;
      bkDetail.push({ label: f.label, amount: s * perFactor });
    }
    methods.push(method('berkus', 'Berkus', berkus, 0.15, 1, bkDetail));

    // Risk factor summation
    const step = baseline * B.RISK_STEP_SHARE;
    let points = 0;
    for (const f of B.RISK_FACTORS) points += clamp(Math.round(num(input.risks && input.risks[f.key], 0)), -2, 2);
    const rfsRaw = baseline + points * step;
    const rfs = Math.max(rfsRaw, baseline * 0.1);
    if (rfsRaw < baseline * 0.1) notes.push('Risk factor summation hit its floor of 10% of the market baseline.');
    methods.push(method('risk', 'Risk factor summation', rfs, 0.15, 1, [
      { label: 'Net risk points', value: (points > 0 ? '+' : '') + points },
      { label: 'Value per point', amount: step },
    ]));

    // Venture capital method (optional)
    const vc = input.vc || {};
    const exitRevenue = num(vc.exitRevenue);
    const exitMultiple = num(vc.exitMultiple);
    if (exitRevenue > 0 && exitMultiple > 0) {
      const years = clamp(num(vc.years, 5), 1, 15);
      const irr = clamp(num(vc.targetIrr, 50) / 100, 0.05, 2);
      const dil = clamp(num(vc.dilution, 40) / 100, 0, 0.9);
      const exitValue = exitRevenue * exitMultiple;
      const mid = vcMethod({ exitValue, years, targetIrr: irr, dilution: dil, raise });
      const lo = vcMethod({ exitValue, years, targetIrr: irr + 0.1, dilution: dil, raise });
      const hi = vcMethod({ exitValue, years, targetIrr: Math.max(0.05, irr - 0.1), dilution: dil, raise });
      if (mid.pre <= 0) {
        methods.push(skipped('vc', 'Venture capital method', 'The exit value is too small to support this raise at the target return.'));
      } else {
        methods.push({
          key: 'vc', label: 'Venture capital method',
          value: mid.pre, low: Math.max(0, lo.pre), high: hi.pre, weight: 1,
          detail: [
            { label: 'Exit value', amount: exitValue },
            { label: 'Required return', value: `${mid.required.toFixed(1)}x over ${years} years` },
            { label: 'Post-money today', amount: mid.post },
          ],
        });
      }
    } else {
      methods.push(skipped('vc', 'Venture capital method', 'Add exit-year revenue and an exit multiple to include it.'));
    }

    const w = input.weights || {};
    for (const m of methods) if (w[m.key] != null && !m.skipped) m.weight = Math.max(0, num(w[m.key]));

    const range = blend(methods);
    const post = range.mid + raise;
    return {
      methods,
      ...range,
      baseline,
      raise,
      postMoney: post,
      dilution: raise > 0 && post > 0 ? raise / post : 0,
      notes,
    };
  }

  /* --------------------------- tech startup ------------------------- */

  function concentrationFactor(pct) {
    if (pct > 30) return 0.75;
    if (pct > 20) return 0.85;
    if (pct > 10) return 0.95;
    return 1;
  }

  // EV / ARR multiple and the factors behind it.
  function techMultiple({ model, arrUsd, growth, grossMargin, nrr, ebitdaMargin, largestCustomer, runwayMonths }) {
    const base = interp(growth, B.GROWTH_CURVE);
    const scale = interp(arrUsd, B.SCALE_CURVE);
    const nrrF = model.recurring && nrr > 0 ? clamp(1 + 0.015 * (nrr - 102), 0.7, 1.35) : 1;
    const gmF = grossMargin > 0 ? clamp(grossMargin / model.typicalGM, 0.5, 1.2) : 1;
    const r40 = growth + ebitdaMargin;
    const r40F = clamp(1 + 0.004 * (r40 - 30), 0.85, 1.2);
    const concF = concentrationFactor(largestCustomer);
    let runwayF = 1;
    if (ebitdaMargin < 0 && runwayMonths > 0) runwayF = runwayMonths < 6 ? 0.7 : runwayMonths < 12 ? 0.85 : 1;
    const multiple = base * model.factor * scale * nrrF * gmF * r40F * concF * runwayF;
    return {
      multiple,
      r40,
      factors: [
        { label: `Growth of ${fmtPct(growth)} (SaaS curve)`, value: `${base.toFixed(2)}x` },
        { label: `Business model: ${model.label}`, value: `× ${model.factor.toFixed(2)}` },
        { label: 'Scale (ARR)', value: `× ${scale.toFixed(2)}` },
        { label: model.recurring ? `Net revenue retention ${fmtPct(nrr)}` : 'Net revenue retention (n/a for this model)', value: `× ${nrrF.toFixed(2)}` },
        { label: `Gross margin ${fmtPct(grossMargin)} vs ${model.typicalGM}% typical`, value: `× ${gmF.toFixed(2)}` },
        { label: `Rule of 40 score ${Math.round(r40)}`, value: `× ${r40F.toFixed(2)}` },
        { label: 'Customer concentration', value: `× ${concF.toFixed(2)}` },
        { label: 'Cash runway', value: `× ${runwayF.toFixed(2)}` },
      ],
    };
  }

  function fmtPct(x) {
    return `${Math.round(x * 10) / 10}%`;
  }

  /**
   * @param {object} input
   *   purpose        'sale' | 'raise'
   *   model          key from TECH_MODELS
   *   arr            annual recurring revenue or annualised run-rate (display currency)
   *   growth         YoY revenue growth, %
   *   grossMargin    %
   *   nrr            net revenue retention, %
   *   ebitdaMargin   %, negative when burning cash
   *   ownerAddBack   owner salary and perks added back to get SDE (small businesses)
   *   largestCustomer % of revenue
   *   runwayMonths   months of cash left (only used when loss-making)
   *   fxPerUsd       display-currency units per USD
   *   vc             { stage, years, growthFade %, targetIrr %, dilution %, raise }
   */
  function valueTech(input) {
    const fx = num(input.fxPerUsd, 1) > 0 ? num(input.fxPerUsd, 1) : 1;
    const model = findBy(B.TECH_MODELS, input.model);
    const arr = Math.max(0, num(input.arr));
    const arrUsd = arr / fx;
    const growth = num(input.growth, 0);
    const grossMargin = num(input.grossMargin, model.typicalGM);
    const nrr = num(input.nrr, 100);
    const ebitdaMargin = num(input.ebitdaMargin, 0);
    const largestCustomer = num(input.largestCustomer, 0);
    const runwayMonths = num(input.runwayMonths, 0);
    const purpose = input.purpose === 'raise' ? 'raise' : 'sale';
    const notes = [];
    const methods = [];

    if (arr <= 0) {
      return { methods: [], low: 0, mid: 0, high: 0, notes: ['Enter annual revenue to see a valuation.'], purpose };
    }

    // 1. Revenue multiple (private M&A comparables)
    const tm = techMultiple({ model, arrUsd, growth, grossMargin, nrr, ebitdaMargin, largestCustomer, runwayMonths });
    const revWeight = purpose === 'raise' ? 0.3 : 1;
    methods.push(method('revenue', 'Revenue multiple', arr * tm.multiple, 0.2, revWeight, [
      ...tm.factors,
      { label: 'EV / revenue multiple', value: `${tm.multiple.toFixed(2)}x` },
    ]));

    // 2. SDE multiple, for small owner-run software businesses (sale only)
    const ebitda = (arr * ebitdaMargin) / 100;
    const sde = ebitda + Math.max(0, num(input.ownerAddBack));
    const sdeWeight = purpose === 'sale' ? interp(arrUsd, [[500000, 1.5], [1500000, 0]]) : 0;
    if (purpose !== 'sale') {
      methods.push(skipped('sde', 'Owner earnings (SDE) multiple', 'Used for company sales, not funding rounds.'));
    } else if (sdeWeight <= 0) {
      methods.push(skipped('sde', 'Owner earnings (SDE) multiple', 'Above about $1.5M ARR buyers price software on revenue.'));
    } else if (sde <= 0) {
      methods.push(skipped('sde', 'Owner earnings (SDE) multiple', 'Needs positive owner earnings.'));
    } else {
      const sdeMult = interp(growth, B.SDE_GROWTH_CURVE) * concentrationFactor(largestCustomer);
      methods.push(method('sde', 'Owner earnings (SDE) multiple', sde * sdeMult, 0.2, sdeWeight, [
        { label: 'Owner earnings (SDE)', amount: sde },
        { label: 'SDE multiple', value: `${sdeMult.toFixed(2)}x` },
      ]));
    }

    // 3. Venture capital method (raise only)
    const stage = findBy(B.VC_STAGES, input.vc && input.vc.stage, 2);
    if (purpose === 'raise') {
      const vc = input.vc || {};
      const years = clamp(Math.round(num(vc.years, 5)), 1, 12);
      const fade = clamp(num(vc.growthFade, 20) / 100, 0, 0.9);
      const irr = clamp(num(vc.targetIrr, stage.targetIrr * 100) / 100, 0.05, 2);
      const dil = clamp(num(vc.dilution, stage.dilution * 100) / 100, 0, 0.9);
      const raise = Math.max(0, num(vc.raise));
      let rev = arr;
      let g = growth;
      for (let t = 0; t < years; t++) {
        rev *= 1 + Math.max(-90, g) / 100;
        g *= 1 - fade;
      }
      // Exit multiple for the business as it will look at exit, assumed profitable by then,
      // capped at the top of private software M&A ranges.
      const exitMult = Math.min(B.TECH_MARKET.exitMultipleCap, techMultiple({
        model, arrUsd: rev / fx, growth: g, grossMargin, nrr, ebitdaMargin: Math.max(ebitdaMargin, 15),
        largestCustomer, runwayMonths: 0,
      }).multiple);
      const exitValue = rev * exitMult;
      const mid = vcMethod({ exitValue, years, targetIrr: irr, dilution: dil, raise });
      const lo = vcMethod({ exitValue, years, targetIrr: irr + 0.1, dilution: dil, raise });
      const hi = vcMethod({ exitValue, years, targetIrr: Math.max(0.05, irr - 0.1), dilution: dil, raise });
      if (mid.pre <= 0) {
        methods.push(skipped('vc', 'Venture capital method', 'Projected exit value is too small for this raise at the target return.'));
      } else {
        methods.push({
          key: 'vc', label: 'Venture capital method', value: mid.pre, low: Math.max(0, lo.pre), high: hi.pre, weight: 0.7,
          detail: [
            { label: `Revenue in year ${years}`, amount: rev },
            { label: 'Exit multiple', value: `${exitMult.toFixed(2)}x` },
            { label: 'Exit value', amount: exitValue },
            { label: 'Target return', value: `${Math.round(irr * 100)}% a year (${mid.required.toFixed(1)}x)` },
            { label: 'Dilution before exit', value: `${Math.round(dil * 100)}%` },
          ],
        });
      }
    } else {
      methods.push(skipped('vc', 'Venture capital method', 'Used for funding rounds.'));
    }

    if (ebitdaMargin < 0 && runwayMonths > 0 && runwayMonths < 12) {
      notes.push('Less than 12 months of runway weakens your negotiating position; the revenue multiple is discounted.');
    }
    if (largestCustomer > 20) notes.push('One customer above 20% of revenue lowers what buyers will pay.');
    if (model.recurring && nrr < 100) notes.push('Net revenue retention below 100% means the customer base shrinks without new sales.');

    const range = blend(methods);
    const marketMedianValue = arr * B.TECH_MARKET.segPrivateMedian;
    return {
      methods,
      ...range,
      purpose,
      arr,
      sde,
      ruleOf40: tm.r40,
      impliedMultiple: range.mid / arr,
      marketMedianValue,
      stage: stage.key,
      notes,
    };
  }

  /* ----------------------- small and medium business ---------------- */

  // Multiple range for a local market: { lo, hi, label, size } or null when none applies.
  function localBand(market, industryKey, ebitdaLocal) {
    if (market === 'uk') {
      const b = B.UK_SME_BANDS[industryKey];
      if (!b) return null;
      const t = interp(ebitdaLocal, [[B.UK_BAND_SPLIT[0], 0], [B.UK_BAND_SPLIT[1], 1]]);
      return {
        lo: b.small[0] + (b.large[0] - b.small[0]) * t,
        hi: b.small[1] + (b.large[1] - b.small[1]) * t,
        label: b.sector,
        size: t <= 0 ? 'under £1m EBITDA' : t >= 1 ? '£1m+ EBITDA' : 'around £1m EBITDA',
      };
    }
    if (market === 'fr') {
      const b = B.FR_SME_BANDS[industryKey];
      if (b) return { lo: b.band[0], hi: b.band[1], label: b.sector, size: 'all sizes' };
      const tiers = B.FR_SIZE_BANDS;
      return {
        lo: interp(ebitdaLocal, tiers.map(([x, l]) => [x, l])),
        hi: interp(ebitdaLocal, tiers.map(([x, , h]) => [x, h])),
        label: 'PME françaises, par taille',
        size: ebitdaLocal < 500000 ? 'TPE, EBE under €500K' : ebitdaLocal < 1500000 ? 'petite PME, €500K–€1.5M' : 'moyenne PME, €1.5M+',
      };
    }
    return null;
  }

  /**
   * @param {object} input
   *   industry        key from SME_INDUSTRIES
   *   revenue, pretaxProfit, ownerComp, interest, depreciation, oneOffs, personal
   *   managerSalary   market salary to replace the owner
   *   capex           maintenance capital spending per year
   *   ffe, inventory  tangible assets included in the sale
   *   includeInventory add inventory at cost on top of the price
   *   drivers         { concentration: 'lt10', ... }
   *   riskFree, erp, growthRate, taxRate (all in %, optional)
   *   sbaRate %, sbaYears, dscr, downPayment % (optional)
   *   market          'us' (default), 'uk' or 'fr' (adds that market's range)
   *   fxPerUsd        display-currency units per USD
   *   localPerUsd     local-market currency units per USD, for its size bands (optional)
   */
  function valueSme(input) {
    const fx = num(input.fxPerUsd, 1) > 0 ? num(input.fxPerUsd, 1) : 1;
    const ind = findBy(B.SME_INDUSTRIES, input.industry);
    const sector = B.EBITDA_SECTOR[ind.ebitdaSector];
    const notes = [];

    const revenue = Math.max(0, num(input.revenue));
    const profit = num(input.pretaxProfit);
    const addBacks = {
      ownerComp: Math.max(0, num(input.ownerComp)),
      interest: Math.max(0, num(input.interest)),
      depreciation: Math.max(0, num(input.depreciation)),
      oneOffs: Math.max(0, num(input.oneOffs)),
      personal: Math.max(0, num(input.personal)),
    };
    const sde = profit + Object.values(addBacks).reduce((a, b) => a + b, 0);
    const managerSalary = Math.max(0, num(input.managerSalary));
    const ebitda = sde - managerSalary;
    const capex = Math.max(0, num(input.capex, addBacks.depreciation));
    const ebitdaUsd = ebitda / fx;

    // Value drivers
    const drivers = input.drivers || {};
    let adj = 0;
    const driverDetail = [];
    for (const d of B.SME_DRIVERS) {
      const opt = d.options.find((o) => o.value === drivers[d.key]) || d.options.find((o) => o.value === d.default);
      adj += opt.adj;
      driverDetail.push({ key: d.key, label: d.label, choice: opt.label, adj: opt.adj });
    }
    const driverAdj = clamp(adj, B.SME_DRIVER_LIMITS.min, B.SME_DRIVER_LIMITS.max);
    if (driverAdj !== adj) notes.push('Value-driver adjustments were capped at their combined limit.');

    // Main Street businesses sell on SDE; larger ones on EBITDA. Blend between $0.5M and $2M EBITDA.
    const sdeShare = interp(ebitdaUsd, [[500000, 1], [2000000, 0]]);
    const methods = [];

    if (sde <= 0) {
      methods.push(skipped('sde', 'SDE multiple', 'Owner earnings are zero or negative.'));
    } else if (sdeShare <= 0) {
      methods.push(skipped('sde', 'SDE multiple', 'Businesses this size sell on EBITDA.'));
    } else {
      const mult = ind.sde * (1 + driverAdj);
      methods.push(method('sde', 'SDE multiple', sde * mult, 0.2, 0.6 * sdeShare, [
        { label: `${ind.label} average`, value: `${ind.sde.toFixed(2)}x` },
        { label: 'Value drivers', value: `${driverAdj >= 0 ? '+' : ''}${Math.round(driverAdj * 100)}%` },
        { label: 'Applied multiple', value: `${mult.toFixed(2)}x SDE` },
      ]));
    }

    if (ebitda <= 0) {
      methods.push(skipped('ebitda', 'EBITDA multiple', 'EBITDA after a market salary is zero or negative.'));
    } else if (sdeShare >= 1) {
      methods.push(skipped('ebitda', 'EBITDA multiple', 'Businesses under about $0.5M EBITDA sell on SDE.'));
    } else {
      const sizeF = interp(ebitdaUsd, B.EBITDA_SIZE_CURVE);
      const mult = sector.multiple * sizeF * (1 + driverAdj);
      methods.push(method('ebitda', 'EBITDA multiple', ebitda * mult, 0.2, 0.6 * (1 - sdeShare), [
        { label: `${sector.label}, $1M–$5M EBITDA`, value: `${sector.multiple.toFixed(1)}x` },
        { label: 'Size adjustment', value: `× ${sizeF.toFixed(2)}` },
        { label: 'Value drivers', value: `${driverAdj >= 0 ? '+' : ''}${Math.round(driverAdj * 100)}%` },
        { label: 'Applied multiple', value: `${mult.toFixed(2)}x EBITDA` },
      ]));
    }

    // Capitalised earnings (build-up discount rate)
    const rf = num(input.riskFree, B.RATES.riskFree * 100) / 100;
    const erp = num(input.erp, B.RATES.equityRiskPremium * 100) / 100;
    const g = clamp(num(input.growthRate, 2.5) / 100, -0.05, 0.06);
    const tax = clamp(num(input.taxRate, 25) / 100, 0, 0.6);
    const sizePremium = interp(ebitdaUsd, B.SIZE_PREMIUM_CURVE);
    const csrp = clamp(0.04 - driverAdj * 0.15, 0, 0.15);
    const r = rf + erp + sizePremium + csrp;
    const ncf = (ebitda - capex) * (1 - tax);
    if (ncf <= 0) {
      methods.push(skipped('capitalised', 'Capitalised earnings', 'Cash flow after a market salary, capex and tax is zero or negative.'));
    } else {
      const capValue = (rr) => (ncf * (1 + g)) / Math.max(0.02, rr - g);
      methods.push({
        key: 'capitalised', label: 'Capitalised earnings',
        value: capValue(r), low: capValue(r + 0.02), high: capValue(r - 0.02), weight: 0.25,
        detail: [
          { label: 'Free cash flow after tax', amount: ncf },
          { label: 'Discount rate', value: `${(r * 100).toFixed(1)}%` },
          { label: '  risk-free + equity premium', value: `${((rf + erp) * 100).toFixed(1)}%` },
          { label: '  size premium', value: `${(sizePremium * 100).toFixed(1)}%` },
          { label: '  company-specific risk', value: `${(csrp * 100).toFixed(1)}%` },
          { label: 'Long-term growth', value: `${(g * 100).toFixed(1)}%` },
        ],
      });
    }

    // Revenue multiple (cross-check, Main Street only)
    if (!ind.rev) {
      methods.push(skipped('revenue', 'Revenue multiple', 'No reliable revenue multiple for this industry.'));
    } else if (revenue <= 0) {
      methods.push(skipped('revenue', 'Revenue multiple', 'Enter revenue to include it.'));
    } else if (sde <= 0) {
      methods.push(skipped('revenue', 'Revenue multiple', 'Revenue multiples assume the business makes a normal profit.'));
    } else if (sdeShare <= 0) {
      methods.push(skipped('revenue', 'Revenue multiple', 'Not meaningful for businesses this size.'));
    } else {
      const mult = ind.rev * (1 + driverAdj);
      methods.push(method('revenue', 'Revenue multiple', revenue * mult, 0.2, 0.15 * sdeShare, [
        { label: `${ind.label} average`, value: `${ind.rev.toFixed(2)}x revenue` },
        { label: 'Applied multiple', value: `${mult.toFixed(2)}x revenue` },
      ]));
    }

    // Local market range (UK, France) on adjusted EBITDA; value drivers set the position inside it.
    const marketDef = B.SME_MARKETS.find((m) => m.key === input.market && m.currency);
    const market = marketDef ? marketDef.key : 'us';
    if (!marketDef) {
      methods.push(skipped('local', 'Local market range', 'Used for UK and French businesses.'));
    } else {
      const cur = B.CURRENCIES.find((c) => c.code === marketDef.currency);
      const localPerUsd = num(input.localPerUsd, cur ? cur.perUsd : 1);
      const band = localBand(market, ind.key, ebitdaUsd * localPerUsd);
      if (!band) {
        methods.push(skipped('local', marketDef.methodLabel, `No ${marketDef.country} sector range published for this industry.`));
        notes.push(`No ${marketDef.country} sector range covers this industry, so the estimate rests on US deal multiples only.`);
      } else if (ebitda <= 0) {
        methods.push(skipped('local', marketDef.methodLabel, 'Needs positive adjusted EBITDA.'));
      } else {
        const pos = clamp(0.5 + driverAdj, 0, 1);
        const mult = band.lo + (band.hi - band.lo) * pos;
        methods.push({
          key: 'local', label: marketDef.methodLabel, value: ebitda * mult, low: ebitda * band.lo, high: ebitda * band.hi, weight: 0.6,
          detail: [
            { label: band.label, value: `${band.lo.toFixed(1)}x–${band.hi.toFixed(1)}x` },
            { label: 'Band', value: band.size },
            { label: 'Position from value drivers', value: `${Math.round(pos * 100)}% of the band` },
            { label: 'Applied multiple', value: `${mult.toFixed(2)}x adjusted EBITDA` },
          ],
        });
      }
    }

    let range = blend(methods);

    // Tangible assets
    const ffe = Math.max(0, num(input.ffe));
    const inventory = Math.max(0, num(input.inventory));
    const includeInventory = input.includeInventory !== false && inventory > 0;
    if (includeInventory) {
      range = { low: range.low + inventory, mid: range.mid + inventory, high: range.high + inventory };
      notes.push('Inventory is added at cost on top of the price, which is common practice for small business sales.');
    }
    const assetFloor = ffe + inventory;
    let floorApplied = false;
    if (assetFloor > 0 && range.mid < assetFloor) {
      floorApplied = true;
      notes.push('Earnings do not support more than the tangible assets, so the asset value sets the floor.');
      range = { low: Math.max(range.low, assetFloor * 0.7), mid: assetFloor, high: Math.max(range.high, assetFloor) };
    }

    // Bank-financeable price (US SBA 7(a) style)
    const sbaRate = num(input.sbaRate, (B.RATES.prime + B.RATES.sbaSpreadOver350k) * 100) / 100;
    const sbaYears = num(input.sbaYears, B.RATES.sbaTermYears);
    const dscr = num(input.dscr, B.RATES.dscr);
    const down = clamp(num(input.downPayment, B.RATES.buyerDownPayment * 100) / 100, 0, 0.9);
    const cads = ebitda - capex;
    let financeable = 0;
    if (cads > 0 && sbaRate > 0 && sbaYears > 0 && dscr > 0) {
      const i = sbaRate / 12;
      const n = sbaYears * 12;
      const maxLoan = (cads / dscr / 12) * ((1 - Math.pow(1 + i, -n)) / i);
      financeable = maxLoan / (1 - down);
    }
    if (financeable > 0 && range.mid > financeable * 1.05) {
      notes.push('The estimate is above what a bank would typically lend against these earnings; expect seller financing or an earn-out to bridge the gap.');
    }

    const mid = range.mid;
    return {
      methods,
      ...range,
      industry: ind,
      sector,
      market,
      sde,
      ebitda,
      addBacks,
      driverAdj,
      driverDetail,
      assetFloor,
      floorApplied,
      inventoryAdded: includeInventory ? inventory : 0,
      financeable,
      askingPrice: mid / B.SME_MARKET.soldToAskingRatio,
      impliedSdeMultiple: sde > 0 ? (mid - (includeInventory ? inventory : 0)) / sde : null,
      impliedEbitdaMultiple: ebitda > 0 ? (mid - (includeInventory ? inventory : 0)) / ebitda : null,
      notes,
    };
  }

  return {
    clamp,
    interp,
    parseAmount,
    blend,
    vcMethod,
    techMultiple,
    localBand,
    valueStartup,
    valueTech,
    valueSme,
  };
});
