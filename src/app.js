/*
 * UI for the three valuators: builds the forms from config, recalculates on every
 * input, renders the valuation sheet (headline, KPIs, football-field chart, method
 * breakdown) and the market-data tab.
 */
(function () {
  'use strict';

  const B = window.Benchmarks;
  const V = window.Valuation;
  const SD = window.StartupData;
  const SM = window.StartupModel;
  const METHOD_LABELS = {
    scorecard: 'Scorecard', berkus: 'Berkus', risk: 'Risk factor summation', devStage: 'Development stage',
    duplicate: 'Cost to duplicate', comps: 'Comparable companies', vc: 'Venture capital method',
    firstChicago: 'First Chicago', dcf: 'Risk-adjusted DCF', lastRound: 'Last round, stepped up',
  };
  const STORE_KEY = 'startup-sme-valuator.v1';
  const TABS = ['startup', 'tech', 'sme', 'data'];

  const state = {
    currency: 'USD',
    fx: 1,
    tab: 'startup',
    dirty: { startup: false, tech: false, sme: false },
    open: { startup: new Set(), tech: new Set(), sme: new Set() },
    results: {},
    summaries: {},
  };

  /* ------------------------------ helpers ------------------------------ */

  function h(tag, props, ...kids) {
    const node = document.createElement(tag);
    if (props) {
      for (const [k, v] of Object.entries(props)) {
        if (v == null || v === false) continue;
        if (k === 'class') node.className = v;
        else if (k === 'text') node.textContent = v;
        else if (k.startsWith('on') && typeof v === 'function') node.addEventListener(k.slice(2), v);
        else node.setAttribute(k, v === true ? '' : String(v));
      }
    }
    for (const kid of kids.flat(Infinity)) {
      if (kid == null || kid === false) continue;
      node.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
    }
    return node;
  }

  const $ = (sel, root = document) => root.querySelector(sel);
  const clamp = (x, lo, hi) => Math.min(hi, Math.max(lo, x));

  function cur() {
    return B.CURRENCIES.find((c) => c.code === state.currency) || B.CURRENCIES[0];
  }
  function rateOf(code) {
    if (code === state.currency) return state.fx;
    const c = B.CURRENCIES.find((x) => x.code === code);
    return c ? c.perUsd : 1;
  }
  function convert(amount, fromCode) {
    return (amount / rateOf(fromCode)) * state.fx;
  }

  function roundSig(a, sig = 3) {
    if (!a) return 0;
    const p = Math.pow(10, Math.floor(Math.log10(Math.abs(a))) - (sig - 1));
    return p >= 1 ? Math.round(a / p) * p : Math.round(a);
  }
  function trim(x, d) {
    return x.toFixed(d).replace(/\.0+$|(\.\d*[1-9])0+$/, '$1');
  }
  function moneyWith(symbol, v, exact) {
    if (!Number.isFinite(v)) return '–';
    const sign = v < 0 ? '−' : '';
    const a = Math.abs(v);
    if (!exact && a >= 1e9) return `${sign}${symbol}${trim(a / 1e9, 2)}bn`;
    if (!exact && a >= 1e6) return `${sign}${symbol}${trim(a / 1e6, a >= 1e8 ? 0 : a >= 1e7 ? 1 : 2)}M`;
    return sign + symbol + (exact ? Math.round(a) : roundSig(a)).toLocaleString('en-US');
  }
  function money(v, exact) {
    return moneyWith(cur().symbol, v, exact);
  }
  function moneyIn(code, v, exact) {
    const c = B.CURRENCIES.find((x) => x.code === code);
    return moneyWith(c ? c.symbol : code + ' ', v, exact);
  }
  function short(v) {
    const sym = cur().symbol;
    const a = Math.abs(v);
    if (a >= 1e9) return `${sym}${trim(a / 1e9, 1)}bn`;
    if (a >= 1e6) return `${sym}${trim(a / 1e6, 1)}M`;
    if (a >= 1e3) return `${sym}${trim(a / 1e3, 0)}k`;
    return `${sym}${Math.round(a)}`;
  }
  const pct = (x, d = 0) => `${(x * 100).toFixed(d)}%`;
  const times = (x, d = 2) => `${trim(x, d)}x`;

  function niceStep(x) {
    const p = Math.pow(10, Math.floor(Math.log10(x)));
    const f = x / p;
    return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
  }

  function startupSource(key) {
    const s = SD.SOURCES[key];
    return s ? h('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.name }) : null;
  }

  function sourceLink(key) {
    const s = B.SOURCES[key];
    return s ? h('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.name }) : null;
  }

  /* ----------------------------- form config ---------------------------- */

  const stageOf = (key) => B.VC_STAGES.find((s) => s.key === key);

  const FORMS = {
    startup: [
      {
        id: 'st-company', title: 'The company', roomy: true,
        fields: [
          { id: 'st-stage', kind: 'select', label: 'Last round raised (or raising now)', options: SD.STAGES.map((x) => ({ value: x.key, label: x.label })), default: 'seed' },
          { id: 'st-age', kind: 'number', label: 'Years since founding', suffix: 'years', default: 1.5 },
          { id: 'st-industry', kind: 'select', label: 'Industry', options: SM.INDUSTRIES.map((x) => ({ value: x.key, label: x.label })), default: 'B2B' },
          { id: 'st-model', kind: 'select', label: 'Business model', options: SM.BUSINESS_MODELS.map((x) => ({ value: x.key, label: x.label })), default: 'saas' },
          {
            id: 'st-ai', kind: 'select', label: 'AI segment', help: 'Picks the AI comparables and the faster AI funding pace.',
            options: [{ value: '', label: 'Not an AI company' }, ...SD.AI_SEGMENTS.map((x) => ({ value: x.key, label: x.label }))], default: 'coding',
          },
          { id: 'st-hq', kind: 'select', label: 'Headquarters', options: [{ value: 'us', label: 'United States' }, { value: 'europe', label: 'Europe' }, { value: 'uk', label: 'United Kingdom' }, { value: 'other', label: 'Elsewhere' }], default: 'us' },
        ],
      },
      {
        id: 'st-round', title: 'Market baseline and this round',
        fields: [
          {
            id: 'st-market', kind: 'select', label: 'Compare with',
            options: [...B.STARTUP_MARKETS.map((m) => ({ value: m.key, label: m.label })), { value: 'custom', label: 'My own baseline' }],
            default: 'usVc',
          },
          { id: 'st-baseline', kind: 'amount', label: 'Market baseline (median pre-money for your stage)', help: 'Filled from the market and stage you pick. Type your own figure if you know local deal prices.', default: null },
          { id: 'st-raise', kind: 'amount', label: 'Amount you are raising now', default: 4000000 },
        ],
      },
      {
        id: 'st-team', title: 'Founders and investors', roomy: true,
        fields: [
          { id: 'st-founder', kind: 'select', label: 'Founder track record', options: Object.entries(SD.NEXT_ROUND_FACTORS.founder).map(([k, x]) => ({ value: k, label: x.label })), default: 'first' },
          { id: 'st-investors', kind: 'select', label: 'Who backs you', options: Object.entries(SD.NEXT_ROUND_FACTORS.investors).map(([k, x]) => ({ value: k, label: x.label })), default: 'top' },
          { id: 'st-last-post', kind: 'amount', label: 'Last round post-money', help: 'Leave empty if this is your first round.', default: 12000000 },
          { id: 'st-last-months', kind: 'number', label: 'Months since that round', suffix: 'months', default: 14 },
          {
            id: 'st-progress', kind: 'select', label: 'Progress since that round',
            options: [{ value: 'behind', label: 'Behind plan' }, { value: 'flat', label: 'Flat' }, { value: 'onPlan', label: 'On plan' }, { value: 'milestones', label: 'Hit the milestones for the next round' }],
            default: 'onPlan',
          },
        ],
      },
      {
        id: 'st-traction', title: 'Traction and cash', roomy: true,
        fields: [
          { id: 'st-arr', kind: 'amount', label: 'Annual revenue run-rate', help: 'This month’s revenue × 12. Leave empty if pre-revenue.', default: 1200000 },
          { id: 'st-growth', kind: 'percent', label: 'Revenue growth, last 12 months', default: 250 },
          { id: 'st-gm', kind: 'percent', label: 'Gross margin', default: 65 },
          { id: 'st-ebitda', kind: 'percent', label: 'EBITDA margin now', help: 'Negative while you burn cash.', default: -120 },
          { id: 'st-traction-level', kind: 'select', label: 'Traction against the bar for your next round', options: Object.entries(SD.NEXT_ROUND_FACTORS.traction).map(([k, x]) => ({ value: k, label: x.label })), default: 'strong' },
          { id: 'st-burn', kind: 'amount', label: 'Monthly net burn', default: 250000 },
          { id: 'st-runway', kind: 'number', label: 'Cash runway', suffix: 'months', default: 18 },
        ],
      },
      {
        id: 'st-plan', title: 'Plan and exit', collapsible: true, open: true,
        hint: 'Used by the venture capital method, First Chicago and the DCF. Leave the exit multiple empty to use AI comparables or sector multiples.',
        fields: [
          { id: 'st-rev1', kind: 'amount', label: 'Revenue in the next 12 months', default: 3000000 },
          { id: 'st-growth2', kind: 'percent', label: 'Growth in year 2', default: 150 },
          { id: 'st-fade', kind: 'percent', label: 'Growth slowdown per year', help: '25% turns 100% growth into 75%, then 56%…', default: 25 },
          { id: 'st-target', kind: 'percent', label: 'Free cash flow margin at exit', default: 20 },
          { id: 'st-years', kind: 'number', label: 'Years to exit', suffix: 'years', default: 7 },
          { id: 'st-exit-mult', kind: 'number', label: 'Exit multiple', suffix: 'x revenue', placeholder: 'auto', default: '' },
          { id: 'st-irr', kind: 'percent', label: 'Investor target return', help: 'Per year. Damodaran: 50–70% start-up, 40–60% first stage.', default: 50 },
          { id: 'st-dilution', kind: 'percent', label: 'Dilution from later rounds', default: 40 },
          { id: 'st-discount', kind: 'percent', label: 'Discount rate, First Chicago and DCF', help: 'Lower than the VC target: failure is already in the probabilities.', default: 20 },
          { id: 'st-mature', kind: 'percent', label: 'Long-run cost of capital', help: 'For the DCF terminal value.', default: 12 },
          { id: 'st-tgrowth', kind: 'percent', label: 'Long-run growth', default: 3 },
          { id: 'st-acq', kind: 'percent', label: 'Typical acquisition, share of the success value', default: 30 },
          { id: 'st-private', kind: 'percent', label: 'Still private at exit, share of the success value', help: 'Mostly companies that missed the plan.', default: 20 },
        ],
      },
      {
        id: 'st-duplicate', title: 'Cost to duplicate', collapsible: true, open: false,
        hint: 'What a competitor would spend to rebuild what you have. Usually a floor, not a price.',
        fields: [
          { id: 'st-pm', kind: 'number', label: 'Engineering effort to rebuild', suffix: 'person-months', default: 60 },
          { id: 'st-pm-cost', kind: 'amount', label: 'Loaded cost per person-month', default: 18000 },
          { id: 'st-ip', kind: 'amount', label: 'Patents and IP', default: 0 },
          { id: 'st-assets', kind: 'amount', label: 'Equipment, data and other assets', default: 20000 },
        ],
      },
      {
        id: 'st-dev', title: 'Development stage',
        fields: [
          { id: 'st-devstage', kind: 'select', label: 'Furthest milestone reached', wide: true, options: SD.DEV_STAGES.map((x) => ({ value: String(x.key), label: x.label })), default: '4' },
        ],
      },
      {
        id: 'st-scorecard', title: 'Scorecard method', collapsible: true, open: false, layout: 'scales',
        hint: 'Compare your startup with a typical funded startup at the same stage and in the same region.',
        fields: B.SCORECARD_FACTORS.map((f) => ({
          id: `st-sc-${f.key}`, kind: 'scale', label: f.label, weight: `${Math.round(f.weight * 100)}%`,
          options: B.SCORECARD_SCALE, default: { team: 1.25, opportunity: 1.25, competition: 0.75 }[f.key] || 1,
        })),
      },
      {
        id: 'st-berkus', title: 'Berkus method', collapsible: true, open: false, layout: 'scales',
        hint: 'Five milestones that remove risk. Each is worth up to a quarter of the market baseline.',
        fields: B.BERKUS_FACTORS.map((f) => ({
          id: `st-bk-${f.key}`, kind: 'scale', label: f.label, help: f.help,
          options: B.BERKUS_SCALE, default: { idea: 0.75, prototype: 0.75, team: 0.75 }[f.key] || 0.25,
        })),
      },
      {
        id: 'st-risk', title: 'Risk factor summation', collapsible: true, open: false, layout: 'scales',
        hint: 'Each step away from normal moves the value by 12.5% of the market baseline.',
        fields: B.RISK_FACTORS.map((f) => ({
          id: `st-rf-${f.key}`, kind: 'scale', label: f.label,
          options: B.RISK_SCALE, default: { management: 1, manufacturing: 1, technology: 1, exit: 1, sales: -1, competition: -1 }[f.key] || 0,
        })),
      },
      {
        id: 'st-weights', title: 'Method weights', collapsible: true, open: false,
        hint: 'Leave a weight empty to use the default for your stage (shown in grey). Set 0 to drop a method.',
        fields: SM.METHOD_KEYS.map((k) => ({ id: `st-w-${k}`, kind: 'number', label: METHOD_LABELS[k], placeholder: '', default: '' })),
      },
    ],

    tech: [
      {
        id: 'tc-goal', title: 'What the valuation is for',
        fields: [
          {
            id: 'tc-purpose', kind: 'purpose', label: 'Purpose', wide: true, default: 'sale',
            options: [
              { value: 'sale', label: 'Selling the company', help: 'Price a buyer pays, on 2026 private M&A multiples.' },
              { value: 'raise', label: 'Raising a round', help: 'Pre-money valuation, adding the venture capital method.' },
            ],
          },
        ],
      },
      {
        id: 'tc-business', title: 'The business',
        fields: [
          { id: 'tc-model', kind: 'select', label: 'Business model', options: B.TECH_MODELS.map((m) => ({ value: m.key, label: m.label })), default: 'saas' },
          { id: 'tc-arr', kind: 'amount', label: 'Annual recurring revenue', help: 'Or run-rate revenue: this month × 12.', default: 2400000 },
          { id: 'tc-growth', kind: 'percent', label: 'Revenue growth, last 12 months', default: 35 },
          { id: 'tc-gm', kind: 'percent', label: 'Gross margin', default: 78 },
          { id: 'tc-nrr', kind: 'percent', label: 'Net revenue retention', help: 'Revenue kept from last year’s customers, after churn and upsells.', default: 106 },
          { id: 'tc-ebitda', kind: 'percent', label: 'EBITDA margin', help: 'Negative if you are burning cash.', default: 8 },
          { id: 'tc-customer', kind: 'percent', label: 'Largest customer, share of revenue', default: 8 },
          { id: 'tc-runway', kind: 'number', label: 'Cash runway', suffix: 'months', help: 'Only used if you are loss-making.', default: 24 },
          { id: 'tc-addback', kind: 'amount', label: 'Your pay, if you run it yourself', help: 'Added to profit to get owner earnings. Under about $1.5M ARR, buyers price on those.', default: 0 },
        ],
      },
      {
        id: 'tc-round', title: 'The round',
        fields: [
          { id: 'tc-stage', kind: 'select', label: 'Stage', options: B.VC_STAGES.map((s) => ({ value: s.key, label: s.label })), default: 'seriesA' },
          { id: 'tc-raise', kind: 'amount', label: 'Amount you are raising', default: 8000000 },
          { id: 'tc-years', kind: 'number', label: 'Years to exit', suffix: 'years', default: 5 },
          { id: 'tc-fade', kind: 'percent', label: 'Growth slowdown per year', help: '20% turns 100% growth into 80%, then 64%…', default: 20 },
          { id: 'tc-irr', kind: 'percent', label: 'Investor target return', help: 'Per year, set by stage.', default: stageOf('seriesA').targetIrr * 100 },
          { id: 'tc-dilution', kind: 'percent', label: 'Dilution from later rounds', default: stageOf('seriesA').dilution * 100 },
        ],
      },
    ],

    sme: [
      {
        id: 'sm-business', title: 'The business',
        fields: [
          {
            id: 'sm-industry', kind: 'select', label: 'Industry', wide: true,
            options: B.SME_INDUSTRIES.map((i) => ({ value: i.key, label: `${i.label} · ${i.sde.toFixed(2)}x SDE` })),
            default: 'services',
          },
          {
            id: 'sm-market', kind: 'select', label: 'Where the business is',
            options: B.SME_MARKETS.map((m) => ({ value: m.key, label: m.label })), default: 'us',
            help: 'United Kingdom and France add local adviser ranges on adjusted EBITDA.',
          },
        ],
      },
      {
        id: 'sm-earnings', title: 'Earnings',
        hint: 'Use the last 12 months, or the average of the last three years if profit swings. Add back costs a new owner would not carry.',
        fields: [
          { id: 'sm-revenue', kind: 'amount', label: 'Revenue', default: 850000 },
          { id: 'sm-profit', kind: 'amount', label: 'Pre-tax profit', default: 95000 },
          { id: 'sm-owner', kind: 'amount', label: 'Your salary and benefits', default: 70000 },
          { id: 'sm-interest', kind: 'amount', label: 'Interest on business loans', default: 6000 },
          { id: 'sm-da', kind: 'amount', label: 'Depreciation and amortisation', default: 12000 },
          { id: 'sm-oneoff', kind: 'amount', label: 'One-off costs', help: 'A lawsuit, a move, a one-time repair.', default: 4000 },
          { id: 'sm-personal', kind: 'amount', label: 'Personal costs paid by the business', default: 3000 },
          { id: 'sm-manager', kind: 'amount', label: 'Salary to hire a manager in your place', help: 'Used for EBITDA, cash flow and bank financing.', default: 65000 },
          { id: 'sm-capex', kind: 'amount', label: 'Yearly spending to keep equipment running', default: 12000 },
        ],
      },
      {
        id: 'sm-assets', title: 'Assets included in the sale',
        fields: [
          { id: 'sm-ffe', kind: 'amount', label: 'Equipment, fixtures and vehicles', help: 'At market value. Leave out property.', default: 60000 },
          { id: 'sm-inventory', kind: 'amount', label: 'Inventory at cost', default: 15000 },
          { id: 'sm-addinv', kind: 'check', label: 'Add inventory on top of the price (usual in retail and wholesale)', wide: true, default: true },
        ],
      },
      {
        id: 'sm-drivers', title: 'What buyers look at', collapsible: true, open: true, roomy: true,
        fields: B.SME_DRIVERS.map((d) => ({
          id: `sm-d-${d.key}`, kind: 'select', label: d.label, help: d.help,
          options: d.options.map((o) => ({ value: o.value, label: `${o.label}${o.adj ? ` (${o.adj > 0 ? '+' : '−'}${Math.round(Math.abs(o.adj) * 100)}%)` : ''}` })),
          default: d.default,
        })),
      },
      {
        id: 'sm-assumptions', title: 'Rates and financing', collapsible: true, open: false,
        hint: 'US defaults for October 2026: 20-year Treasury about 5.4%, Kroll equity risk premium 5.0%, prime 7.00% plus the SBA spread. Outside the US, enter your local long-term government bond yield and your lender’s rate.',
        fields: [
          { id: 'sm-rf', kind: 'percent', label: 'Risk-free rate', default: B.RATES.riskFree * 100 },
          { id: 'sm-erp', kind: 'percent', label: 'Equity risk premium', default: B.RATES.equityRiskPremium * 100 },
          { id: 'sm-g', kind: 'percent', label: 'Long-term growth', default: 2.5 },
          { id: 'sm-tax', kind: 'percent', label: 'Tax rate', default: 25 },
          { id: 'sm-sba', kind: 'percent', label: 'Buyer’s loan rate', help: 'SBA 7(a) maximum: prime + 3%.', default: Math.round((B.RATES.prime + B.RATES.sbaSpreadOver350k) * 10000) / 100 },
          { id: 'sm-term', kind: 'number', label: 'Loan term', suffix: 'years', default: B.RATES.sbaTermYears },
          { id: 'sm-dscr', kind: 'number', label: 'Debt service cover required', suffix: 'x', default: B.RATES.dscr },
          { id: 'sm-down', kind: 'percent', label: 'Buyer’s down payment', default: B.RATES.buyerDownPayment * 100 },
        ],
      },
    ],
  };

  const allFields = (tab) => FORMS[tab].flatMap((g) => g.fields);

  /* ----------------------------- form building ---------------------------- */

  function helpNode(f) {
    return f.help ? h('span', { class: 'help', id: `${f.id}-help`, text: f.help }) : null;
  }

  function buildInput(f) {
    const suffix = f.kind === 'percent' ? '%' : f.suffix;
    return h('div', { class: 'field', 'data-field': f.id },
      h('label', { for: f.id, text: f.label }),
      h('div', { class: 'control' },
        f.kind === 'amount' ? h('span', { class: 'affix prefix', 'aria-hidden': 'true', text: cur().symbol.trim() }) : null,
        h('input', {
          id: f.id, name: f.id, type: 'text', autocomplete: 'off', spellcheck: 'false', placeholder: f.placeholder || null,
          inputmode: 'decimal', 'data-kind': f.kind, 'aria-describedby': f.help ? `${f.id}-help` : null,
        }),
        suffix ? h('span', { class: 'affix', 'aria-hidden': 'true', text: suffix }) : null),
      helpNode(f));
  }

  function buildSelect(f) {
    return h('div', { class: `field${f.wide ? ' is-wide' : ''}`, 'data-field': f.id },
      h('label', { for: f.id, text: f.label }),
      h('div', { class: 'control' },
        h('select', { id: f.id, name: f.id, 'aria-describedby': f.help ? `${f.id}-help` : null },
          f.options.map((o) => h('option', { value: o.value, text: o.label })))),
      helpNode(f));
  }

  function buildCheck(f) {
    return h('label', { class: `check${f.wide ? ' is-wide' : ''}`, 'data-field': f.id },
      h('input', { type: 'checkbox', id: f.id, name: f.id }),
      h('span', { text: f.label }));
  }

  function buildScale(f) {
    return h('div', { class: 'scale-row', role: 'radiogroup', id: f.id, 'aria-labelledby': `${f.id}-label` },
      h('div', { class: 'scale-label', id: `${f.id}-label` },
        f.label,
        f.weight ? h('span', { class: 'weight', text: ` · ${f.weight}` }) : null,
        f.help ? h('span', { class: 'help', text: f.help }) : null),
      h('div', { class: 'segments', style: `--n:${f.options.length}` },
        f.options.map((o, i) => h('label', null,
          h('input', { type: 'radio', name: f.id, id: `${f.id}-${i}`, value: String(o.value) }),
          o.label))));
  }

  function buildPurpose(f) {
    return h('div', { class: 'purpose is-wide', role: 'radiogroup', id: f.id, 'aria-label': f.label },
      f.options.map((o, i) => h('label', null,
        h('input', { type: 'radio', name: f.id, id: `${f.id}-${i}`, value: o.value }),
        h('strong', { text: o.label }),
        h('span', { text: o.help }))));
  }

  function buildField(f) {
    if (f.kind === 'select') return buildSelect(f);
    if (f.kind === 'check') return buildCheck(f);
    if (f.kind === 'scale') return buildScale(f);
    if (f.kind === 'purpose') return buildPurpose(f);
    return buildInput(f);
  }

  function buildGroup(g) {
    const fields = g.layout === 'scales'
      ? h('div', { class: 'scale-list' }, g.fields.map(buildField))
      : h('div', { class: `fields${g.roomy ? ' is-roomy' : ''}` }, g.fields.map(buildField));
    const body = h('div', { class: 'group-body' }, g.hint ? h('p', { class: 'hint', text: g.hint }) : null, fields);
    const head = [h('h3', { text: g.title }), h('span', { class: 'group-meta', id: `${g.id}-meta` })];
    if (g.collapsible) {
      return h('details', { class: 'group', id: g.id, open: g.open || null }, h('summary', null, head), body);
    }
    return h('section', { class: 'group', id: g.id }, h('div', { class: 'group-head' }, head), body);
  }

  function buildForm(tab) {
    const form = $(`#form-${tab}`);
    form.replaceChildren(
      ...FORMS[tab].map(buildGroup),
      h('div', { class: 'form-actions' },
        h('button', { type: 'button', class: 'btn', id: `${tab}-reset`, onclick: () => resetForm(tab) }, 'Reset to example'),
        h('span', { text: 'Your figures stay in this browser.' })));
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('input', (e) => onInput(tab, e));
    form.addEventListener('change', (e) => onInput(tab, e));
    form.addEventListener('focusout', (e) => {
      const t = e.target;
      if (t.dataset && t.dataset.kind === 'amount') t.value = formatInput('amount', t.value);
    });
  }

  /* ------------------------------ form values ----------------------------- */

  function formatInput(kind, v) {
    if (v === '' || v == null) return '';
    const n = typeof v === 'number' ? v : V.parseAmount(v);
    if (!Number.isFinite(n)) return String(v);
    if (kind === 'amount') return Math.round(n).toLocaleString('en-US');
    return String(Math.round(n * 1000) / 1000);
  }

  function setValue(f, v) {
    if (f.kind === 'scale' || f.kind === 'purpose') {
      document.querySelectorAll(`input[name="${f.id}"]`).forEach((r) => { r.checked = r.value === String(v); });
      return;
    }
    const node = document.getElementById(f.id);
    if (!node) return;
    if (f.kind === 'check') node.checked = !!v;
    else if (f.kind === 'select') node.value = v;
    else node.value = formatInput(f.kind, v);
  }

  function rawValue(f) {
    if (f.kind === 'scale' || f.kind === 'purpose') {
      const c = document.querySelector(`input[name="${f.id}"]:checked`);
      return c ? c.value : String(f.default);
    }
    const node = document.getElementById(f.id);
    if (f.kind === 'check') return node.checked;
    return node.value;
  }

  function readForm(tab) {
    const out = {};
    for (const f of allFields(tab)) {
      const raw = rawValue(f);
      if (f.kind === 'scale') out[f.id] = Number(raw);
      else if (f.kind === 'amount' || f.kind === 'percent' || f.kind === 'number') out[f.id] = V.parseAmount(raw);
      else out[f.id] = raw;
    }
    return out;
  }

  function applyDefaults(tab) {
    for (const f of allFields(tab)) setValue(f, f.default);
    if (tab === 'startup') refreshBaseline();
  }

  function resetForm(tab) {
    applyDefaults(tab);
    state.dirty[tab] = false;
    compute(tab);
    save();
  }

  /* ------------------------------ interactions ---------------------------- */

  // Market baseline for the chosen stage. Pre-seed and seed come from the market presets;
  // later stages scale the market's seed median by Carta's US stage ratios.
  function refreshBaseline() {
    const market = $('#st-market').value;
    if (market === 'custom') return;
    const preset = B.STARTUP_MARKETS.find((m) => m.key === market);
    const stage = $('#st-stage').value;
    const local = stage === 'preseed' || stage === 'seed' ? preset[stage] : preset.seed * SM.stageBaselineRatio(stage);
    $('#st-baseline').value = formatInput('amount', roundSig(convert(local, preset.currency)));
  }

  const vcStageFor = (stage) => stageOf(stage === 'seriesC' ? 'seriesB' : stage) || stageOf('seed');

  function onInput(tab, e) {
    const id = e.target.name || e.target.id;
    if (e.isTrusted) state.dirty[tab] = true;

    if (tab === 'startup') {
      if (id === 'st-baseline' && e.type === 'input') $('#st-market').value = 'custom';
      if (id === 'st-hq' && e.type === 'change') {
        const m = { us: 'usVc', europe: 'euVc', uk: 'ukVc' }[$('#st-hq').value];
        if (m) setValue({ id: 'st-market', kind: 'select' }, m);
      }
      if ((id === 'st-market' || id === 'st-stage' || id === 'st-hq') && e.type === 'change') refreshBaseline();
      if (id === 'st-stage' && e.type === 'change') {
        const s = vcStageFor($('#st-stage').value);
        setValue({ id: 'st-irr', kind: 'percent' }, s.targetIrr * 100);
        setValue({ id: 'st-dilution', kind: 'percent' }, s.dilution * 100);
      }
    }
    if (tab === 'tech' && id === 'tc-stage' && e.type === 'change') {
      const s = stageOf($('#tc-stage').value);
      setValue({ id: 'tc-irr', kind: 'percent' }, s.targetIrr * 100);
      setValue({ id: 'tc-dilution', kind: 'percent' }, s.dilution * 100);
    }
    compute(tab);
    save();
  }

  function selectTab(tab, focus) {
    if (!TABS.includes(tab)) tab = 'startup';
    state.tab = tab;
    for (const t of TABS) {
      const on = t === tab;
      const btn = $(`#tab-${t}`);
      btn.setAttribute('aria-selected', String(on));
      btn.tabIndex = on ? 0 : -1;
      $(`#panel-${t}`).hidden = !on;
    }
    if (focus) $(`#tab-${tab}`).focus();
    try { history.replaceState(null, '', `#${tab}`); } catch (err) { /* sandboxed frames may refuse */ }
    updateMobileTotal();
    save();
  }

  function wireTabs() {
    for (const t of TABS) $(`#tab-${t}`).addEventListener('click', () => selectTab(t));
    $('.tabs').addEventListener('keydown', (e) => {
      const i = TABS.indexOf(state.tab);
      let next = null;
      if (e.key === 'ArrowRight') next = TABS[(i + 1) % TABS.length];
      else if (e.key === 'ArrowLeft') next = TABS[(i - 1 + TABS.length) % TABS.length];
      else if (e.key === 'Home') next = TABS[0];
      else if (e.key === 'End') next = TABS[TABS.length - 1];
      if (next) { e.preventDefault(); selectTab(next, true); }
    });
  }

  function wireCurrency() {
    const sel = $('#currency');
    sel.replaceChildren(...B.CURRENCIES.map((c) => h('option', { value: c.code, text: c.code })));
    sel.value = state.currency;
    $('#fx').value = String(state.fx);
    sel.addEventListener('change', () => {
      state.currency = sel.value;
      state.fx = cur().perUsd;
      $('#fx').value = String(state.fx);
      // Pounds usually means a UK business, dollars a US one.
      if (state.currency === 'GBP') setValue({ id: 'sm-market', kind: 'select' }, 'uk');
      if (state.currency === 'USD') setValue({ id: 'sm-market', kind: 'select' }, 'us');
      onCurrencyChange();
    });
    $('#fx').addEventListener('input', () => {
      const v = V.parseAmount($('#fx').value);
      if (v > 0) { state.fx = v; onCurrencyChange(); }
    });
  }

  function onCurrencyChange() {
    document.querySelectorAll('.affix.prefix').forEach((n) => { n.textContent = cur().symbol.trim(); });
    $('#fx').disabled = state.currency === 'USD';
    refreshBaseline();
    computeAll();
    save();
  }

  /* -------------------------------- storage ------------------------------- */

  function save() {
    try {
      const values = {};
      for (const tab of ['startup', 'tech', 'sme']) for (const f of allFields(tab)) values[f.id] = rawValue(f);
      localStorage.setItem(STORE_KEY, JSON.stringify({
        currency: state.currency, fx: state.fx, tab: state.tab, dirty: state.dirty, values,
      }));
    } catch (err) { /* storage unavailable: the page still works */ }
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (err) {
      return null;
    }
  }

  /* --------------------------------- compute ------------------------------ */

  const LABELS = { startup: 'Pre-money', tech: 'Value', sme: 'Sale price' };

  function compute(tab) {
    if (tab === 'startup') computeStartup();
    else if (tab === 'tech') computeTech();
    else if (tab === 'sme') computeSme();
  }
  function computeAll() {
    computeStartup();
    computeTech();
    computeSme();
  }

  function setMeta(id, text) {
    const n = document.getElementById(`${id}-meta`);
    if (n) n.textContent = text;
  }

  function computeStartup() {
    const v = readForm('startup');
    const pick = (prefix, list) => Object.fromEntries(list.map((f) => [f.key, v[`${prefix}${f.key}`]]));
    const stage = v['st-stage'];
    const r = SM.valueStartupModel({
      stage,
      ageYears: v['st-age'],
      industry: v['st-industry'],
      model: v['st-model'],
      aiSegment: v['st-ai'],
      hq: v['st-hq'],
      baseline: v['st-baseline'],
      raise: v['st-raise'],
      founder: v['st-founder'],
      investors: v['st-investors'],
      lastPost: v['st-last-post'],
      monthsSinceLast: v['st-last-months'],
      progress: v['st-progress'],
      arr: v['st-arr'],
      growth: v['st-growth'],
      grossMargin: v['st-gm'],
      ebitdaMargin: v['st-ebitda'],
      traction: v['st-traction-level'],
      monthlyBurn: v['st-burn'],
      runwayMonths: v['st-runway'],
      rev1: v['st-rev1'],
      growth2: v['st-growth2'],
      fade: v['st-fade'],
      targetMargin: v['st-target'],
      yearsToExit: v['st-years'],
      exitMultiple: v['st-exit-mult'],
      targetIrr: v['st-irr'],
      dilution: v['st-dilution'],
      discountRate: v['st-discount'],
      matureRate: v['st-mature'],
      terminalGrowth: v['st-tgrowth'],
      acqShare: v['st-acq'],
      privateShare: v['st-private'],
      personMonths: v['st-pm'],
      costPerMonth: v['st-pm-cost'],
      ipCost: v['st-ip'],
      otherAssets: v['st-assets'],
      devStage: v['st-devstage'],
      scorecard: pick('st-sc-', B.SCORECARD_FACTORS),
      berkus: pick('st-bk-', B.BERKUS_FACTORS),
      risks: pick('st-rf-', B.RISK_FACTORS),
      weights: Object.fromEntries(SM.METHOD_KEYS.map((k) => [k, v[`st-w-${k}`]])),
      fxPerUsd: state.fx,
    });
    state.results.startup = r;

    // Default weights for this stage, shown as placeholders
    const dw = SM.defaultWeights(stage, (v['st-arr'] || 0) > 0);
    for (const k of SM.METHOD_KEYS) {
      const el = document.getElementById(`st-w-${k}`);
      if (el) el.placeholder = String(dw[k]);
    }

    const byKey = (k) => r.methods.find((m) => m.key === k);
    const base = v['st-baseline'];
    setMeta('st-scorecard', base > 0 && !byKey('scorecard').skipped ? `${times(byKey('scorecard').value / base, 3)} baseline` : '');
    setMeta('st-berkus', money(byKey('berkus').value));
    const pts = B.RISK_FACTORS.reduce((s, f) => s + v[`st-rf-${f.key}`], 0);
    setMeta('st-risk', `${pts > 0 ? '+' : ''}${pts} points`);
    setMeta('st-plan', `exit year ${r.plan.years}: ${money(r.plan.exitRevenue)} revenue × ${trim(r.exitMultiple, 1)}`);
    setMeta('st-duplicate', byKey('duplicate').skipped ? 'not used' : money(byKey('duplicate').value));
    setMeta('st-dev', byKey('devStage').skipped ? '' : money(byKey('devStage').value));
    setMeta('st-weights', `${r.methods.filter((m) => !m.skipped && m.share > 0).length} of 10 methods in use`);

    const nr = r.nextRound;
    const lr = r.longRun.probs;
    renderSheet('startup', {
      label: 'Estimated pre-money valuation',
      result: r,
      empty: 'Enter a market baseline to see a valuation.',
      kpis: r.mid > 0 ? [
        { label: 'Post-money', value: money(r.postMoney), note: `with ${money(num(v['st-raise']))} raised` },
        { label: `${nr.next} within 24 months`, value: pct(nr.p24), note: `${pct(nr.eventual)} eventually` },
        { label: `Shut down within ${r.longRun.horizon} years`, value: pct(lr.Inactive), note: `exit ${pct(lr.Acquired + lr.Public)}`, warn: lr.Inactive > 0.4 },
      ] : [],
      refs: base > 0 ? [{ label: 'Market baseline', value: base }] : [],
      extraTop: oddsPanel(r),
      extraBottom: r.comps ? compsPanel(r.comps, stage) : null,
      facts: [
        ['Stage', $('#st-stage').selectedOptions[0].textContent],
        ['Industry', $('#st-industry').selectedOptions[0].textContent],
        ['Business model', $('#st-model').selectedOptions[0].textContent],
        ['AI segment', $('#st-ai').selectedOptions[0].textContent],
        ['Revenue run-rate', money(num(v['st-arr']))],
        ['Market baseline', money(base)],
      ],
      summaryExtra: [
        `Next round (${nr.next}): ${pct(nr.p24)} within 24 months, ${pct(nr.eventual)} eventually, typical wait ${trim(nr.years, 1)} years`,
        `Within ${r.longRun.horizon} years: IPO ${pct(lr.Public, 1)}, acquired ${pct(lr.Acquired)}, still private ${pct(lr.Active)}, shut down ${pct(lr.Inactive)}`,
        `Funnel: ${r.funnel.map((f) => `${f.label} ${pct(f.p)}`).join(' → ')}`,
      ],
      foot: 'Ten methods, weighted by stage. Success odds come from an outcome model fitted on 6,153 Y Combinator startups plus 2025–26 funding-funnel data; see the Market data tab.',
    });
  }

  const num = (x) => (Number.isFinite(x) ? x : 0);

  function oddsPanel(r) {
    const nr = r.nextRound;
    const p = r.longRun.probs;
    const segs = [
      { key: 'ipo', label: 'IPO', v: p.Public },
      { key: 'acq', label: 'Acquired', v: p.Acquired },
      { key: 'priv', label: 'Still private', v: p.Active },
      { key: 'fail', label: 'Shut down', v: p.Inactive },
    ];
    const factorRows = [
      ...nr.factors.map((f) => h('li', null, f.label, h('span', { class: 'num', text: f.or ? ` × ${trim(f.or, 2)} odds` : ` × ${trim(f.pace, 2)} pace` }))),
    ];
    const m = SD.OUTCOME_MODEL;
    return h('section', { class: 'odds', 'aria-label': 'Success odds' },
      h('h3', { text: 'Success odds' }),
      h('div', { class: 'odds-next' },
        h('span', { class: 'odds-big', text: pct(nr.p24) }),
        h('span', null, `chance of raising a ${nr.next} within 24 months`,
          h('small', { text: `${pct(nr.eventual)} eventually · typical wait ${trim(nr.years, 1)} years · base rate ${pct(nr.baseP24)} for a ${nr.stage.label} company` }))),
      h('div', { class: 'odds-bar', role: 'img', 'aria-label': segs.map((x) => `${x.label} ${pct(x.v)}`).join(', ') },
        segs.map((x) => h('span', { class: `seg seg-${x.key}`, style: `width:${Math.max(0, x.v * 100)}%` }))),
      h('ul', { class: 'odds-legend' }, segs.map((x) => h('li', null, h('i', { class: `seg-${x.key}` }), `${x.label} `, h('strong', { class: 'num', text: x.key === 'ipo' ? pct(x.v, 1) : pct(x.v) })))),
      h('p', { class: 'odds-caption', text: `Where the company is likely to be ${r.longRun.horizon} years from now (your years to exit).` }),
      h('p', { class: 'odds-funnel' }, 'Chance of reaching ', r.funnel.map((f, i) => [i ? ' → ' : '', h('strong', { text: `${f.label} ${pct(f.p)}` })])),
      h('details', { class: 'odds-why' },
        h('summary', { text: 'What drives these odds' }),
        h('ul', null, factorRows),
        h('p', { text: `Long-run outcomes: multinomial logistic model on ${m.n.toLocaleString('en-US')} YC startups (batches ${m.batches}), out-of-sample AUC ${m.holdout.auc.Acquired} for acquisition and ${m.holdout.auc.Inactive} for shutdown. Next-round odds: Carta and PitchBook graduation rates adjusted by the factors above.` })));
  }

  function compsPanel(c, stage) {
    const range = SD.AI_COMP_ADJUST.stageRange[stage === 'seriesC' ? 'seriesB' : stage === 'preseed' ? 'seed' : stage];
    return h('section', { class: 'comps', 'aria-label': 'AI comparables' },
      h('h3', { text: `AI comparables · ${c.segment.label}` }),
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, ['Company', 'Valuation', 'Revenue', 'Multiple'].map((t, i) => h('th', { class: i ? 'num' : null, text: t })))),
        h('tbody', null, c.rows.map((x) => h('tr', null,
          h('td', null, x.company, h('small', { class: `conf conf-${x.confidence}`, text: ` ${x.date}${x.confidence === 'low' ? ' · low confidence' : ''}` })),
          h('td', { class: 'num', text: moneyIn('USD', x.valuation) }),
          h('td', { class: 'num', text: moneyIn('USD', x.revenue) }),
          h('td', { class: 'num', text: `${trim(x.multiple, 1)}x` })))))),
      h('p', { class: 'comps-note', text: `Median ${trim(c.median, 1)}x revenue. For your size and growth: × ${trim(c.scale, 2)} scale, × ${trim(c.growthAdj, 2)} growth = ${trim(c.applied, 1)}x${range ? `. AI rounds at this stage price at ${range[0]}–${range[1]}x (Eqvista 2026).` : '.'}` }));
  }

  function computeTech() {
    const v = readForm('tech');
    const purpose = v['tc-purpose'];
    $('#tc-round').hidden = purpose !== 'raise';
    const r = V.valueTech({
      purpose,
      model: v['tc-model'],
      arr: v['tc-arr'],
      growth: v['tc-growth'],
      grossMargin: v['tc-gm'],
      nrr: v['tc-nrr'],
      ebitdaMargin: v['tc-ebitda'],
      ownerAddBack: v['tc-addback'],
      largestCustomer: v['tc-customer'],
      runwayMonths: v['tc-runway'],
      fxPerUsd: state.fx,
      vc: {
        stage: v['tc-stage'], raise: v['tc-raise'], years: v['tc-years'], growthFade: v['tc-fade'],
        targetIrr: v['tc-irr'], dilution: v['tc-dilution'],
      },
    });
    state.results.tech = r;

    const model = B.TECH_MODELS.find((m) => m.key === v['tc-model']);
    setMeta('tc-business', r.arr > 0 ? `Rule of 40: ${Math.round(r.ruleOf40)}` : '');

    const kpis = [];
    const refs = [];
    if (r.mid > 0) {
      if (purpose === 'raise') {
        const raise = Math.max(0, v['tc-raise'] || 0);
        const post = r.mid + raise;
        kpis.push(
          { label: 'Post-money', value: money(post), note: `with ${money(raise)} raised` },
          { label: 'Investors get', value: pct(raise / post, 1), note: 'of the company' },
          { label: 'Implied multiple', value: `${trim(r.impliedMultiple, 1)}x`, note: 'pre-money / ARR' },
        );
        const median = B.STAGE_PREMONEY[v['tc-stage']];
        if (median) refs.push({ label: median.label, value: convert(median.value, 'USD') });
      } else {
        kpis.push(
          { label: 'Implied multiple', value: `${trim(r.impliedMultiple, 1)}x`, note: 'value / revenue' },
          { label: 'Rule of 40', value: String(Math.round(r.ruleOf40)), note: r.ruleOf40 >= 40 ? 'meets the bar' : 'growth + margin below 40', warn: r.ruleOf40 < 20 },
        );
        if (model.recurring) {
          kpis.push({ label: 'At the market median', value: money(r.marketMedianValue), note: '4.0x revenue, SEG 2Q26' });
          refs.push({ label: 'Private SaaS median, 4.0x', value: r.marketMedianValue });
        } else {
          kpis.push({ label: 'Owner earnings', value: money(r.sde), note: 'profit + your pay' });
        }
      }
    }

    renderSheet('tech', {
      label: purpose === 'raise' ? 'Estimated pre-money valuation' : 'Estimated enterprise value',
      result: r,
      empty: 'Enter annual revenue to see a valuation.',
      kpis,
      refs,
      facts: [
        ['Business model', model.label],
        ['Annual recurring revenue', money(r.arr)],
        ['Growth', `${trim(v['tc-growth'] || 0, 1)}%`],
        ['Net revenue retention', `${trim(v['tc-nrr'] || 0, 1)}%`],
        ['Purpose', purpose === 'raise' ? 'Raising a round' : 'Selling the company'],
      ],
      foot: purpose === 'raise'
        ? 'Pre-money equity value, assuming no debt. Rounds in hot sectors, AI especially, can price well above this; check the stage medians on the Market data tab.'
        : 'Enterprise value is cash-free and debt-free. Add your cash and subtract debt to get the price for the shares.',
    });
  }

  function computeSme() {
    const v = readForm('sme');
    const drivers = Object.fromEntries(B.SME_DRIVERS.map((d) => [d.key, v[`sm-d-${d.key}`]]));
    const marketDef = B.SME_MARKETS.find((m) => m.key === v['sm-market']) || B.SME_MARKETS[0];
    const r = V.valueSme({
      industry: v['sm-industry'],
      revenue: v['sm-revenue'],
      pretaxProfit: v['sm-profit'],
      ownerComp: v['sm-owner'],
      interest: v['sm-interest'],
      depreciation: v['sm-da'],
      oneOffs: v['sm-oneoff'],
      personal: v['sm-personal'],
      managerSalary: v['sm-manager'],
      capex: v['sm-capex'],
      ffe: v['sm-ffe'],
      inventory: v['sm-inventory'],
      includeInventory: v['sm-addinv'],
      drivers,
      riskFree: v['sm-rf'],
      erp: v['sm-erp'],
      growthRate: v['sm-g'],
      taxRate: v['sm-tax'],
      sbaRate: v['sm-sba'],
      sbaYears: v['sm-term'],
      dscr: v['sm-dscr'],
      downPayment: v['sm-down'],
      market: v['sm-market'],
      fxPerUsd: state.fx,
      localPerUsd: marketDef.currency ? rateOf(marketDef.currency) : undefined,
    });
    state.results.sme = r;

    const local = r.methods.find((m) => m.key === 'local');
    setMeta('sm-business', !marketDef.currency ? '' : local && !local.skipped ? `${marketDef.label}: ${local.detail[0].label}` : `no ${marketDef.country} sector range`);
    setMeta('sm-earnings', `SDE ${money(r.sde)} · EBITDA ${money(r.ebitda)}`);
    setMeta('sm-drivers', `${r.driverAdj >= 0 ? '+' : '−'}${Math.round(Math.abs(r.driverAdj) * 100)}% on the multiple`);

    const kpis = [];
    const refs = [];
    if (r.mid > 0) {
      const onSde = r.ebitda / state.fx < 1250000;
      kpis.push({ label: 'Suggested asking price', value: money(r.askingPrice), note: 'sales closed at 94% of asking in 2025' });
      if (r.financeable > 0) {
        const overLoan = r.mid > r.financeable * 1.05;
        kpis.push({
          label: 'Bank-financeable price', value: money(r.financeable),
          note: overLoan
            ? 'below your estimate: expect a seller note'
            : r.market !== 'us' ? 'set your lender’s terms under Rates and financing' : `${trim(v['sm-sba'] || 10, 2)}% loan, ${trim(v['sm-down'] || 10, 1)}% down`,
          warn: overLoan,
        });
        refs.push({ label: 'Bank-financeable price', value: r.financeable });
      }
      if (onSde && r.impliedSdeMultiple) {
        kpis.push({ label: 'Implied multiple', value: `${trim(r.impliedSdeMultiple, 2)}x SDE`, note: `industry average ${r.industry.sde.toFixed(2)}x` });
      } else if (r.impliedEbitdaMultiple) {
        kpis.push({ label: 'Implied multiple', value: `${trim(r.impliedEbitdaMultiple, 2)}x EBITDA`, note: `${r.sector.label.toLowerCase()}: ${r.sector.multiple}x` });
      }
      if (r.assetFloor > 0) refs.push({ label: 'Tangible assets', value: r.assetFloor });
    }

    renderSheet('sme', {
      label: 'Estimated sale price',
      result: r,
      empty: 'Enter profit and your add-backs to see a valuation.',
      kpis,
      refs,
      foot: 'Price for the business as a going concern: equipment, goodwill and, if ticked, inventory. Excludes property, cash and receivables. Typical time to sell: about 5 to 8 months (BizBuySell median 170 days in 2025).',
      facts: [
        ['Industry', r.industry.label],
        ['Market', marketDef.label],
        ['Revenue', money(v['sm-revenue'])],
        ['Owner earnings (SDE)', money(r.sde)],
        ['EBITDA after a market salary', money(r.ebitda)],
        ['Value drivers', `${r.driverAdj >= 0 ? '+' : '−'}${Math.round(Math.abs(r.driverAdj) * 100)}% on the multiple`],
      ],
    });
  }

  /* --------------------------------- render ------------------------------- */

  function renderSheet(tab, cfg) {
    const r = cfg.result;
    const has = r.mid > 0;
    const parts = [
      h('div', { class: 'sheet-head' },
        state.dirty[tab] ? null : h('span', { class: 'badge', text: 'Example figures · replace with yours' }),
        h('span', { class: 'sheet-label', text: cfg.label }),
        h('span', { class: 'sheet-value', text: has ? money(r.mid) : '–' }),
        has
          ? h('span', { class: 'sheet-range' }, 'Likely range ', h('span', { class: 'num', text: money(r.low) }), ' to ', h('span', { class: 'num', text: money(r.high) }))
          : h('span', { class: 'sheet-range', text: cfg.empty })),
      cfg.kpis.length
        ? h('dl', { class: 'kpis', style: `--k:${cfg.kpis.length}` }, cfg.kpis.map((k) => h('div', { class: `kpi${k.warn ? ' is-warn' : ''}` },
          h('dt', { text: k.label }),
          h('dd', null, k.value, k.note ? h('small', { text: k.note }) : null))))
        : null,
      has && cfg.extraTop ? cfg.extraTop : null,
      has ? footballField(r, cfg.refs) : null,
      r.methods.length ? methodsList(tab, r) : null,
      has && cfg.extraBottom ? cfg.extraBottom : null,
      r.notes.length ? h('ul', { class: 'notes' }, r.notes.map((n) => h('li', { text: n }))) : null,
      cfg.foot ? h('p', { class: 'sheet-foot', text: cfg.foot }) : null,
      has ? copyControls(tab) : null,
    ];
    state.summaries[tab] = has ? summaryText(tab, cfg) : '';
    $(`#sheet-${tab}`).replaceChildren(...parts.filter(Boolean));
    updateMobileTotal();
  }

  const TITLES = { startup: 'Startup valuation and success odds', tech: 'Tech startup valuation', sme: 'Business sale valuation' };

  function summaryText(tab, cfg) {
    const r = cfg.result;
    const lines = [
      `${TITLES[tab]} — Startup & SME Valuator, market data to October 2026`,
      '',
      ...(cfg.facts || []).map(([k, v]) => `${k}: ${v}`),
      '',
      `${cfg.label}: ${money(r.mid)}`,
      `Likely range: ${money(r.low)} to ${money(r.high)}`,
      ...cfg.kpis.map((k) => `${k.label}: ${k.value}${k.note ? ` (${k.note})` : ''}`),
      ...(cfg.summaryExtra || []),
      '',
      'Methods:',
      ...r.methods.filter((m) => !m.skipped && m.share > 0)
        .map((m) => `- ${m.label}: ${money(m.value)} (${pct(m.share)} weight, range ${money(m.low)} to ${money(m.high)})`),
    ];
    if (r.notes.length) lines.push('', 'Notes:', ...r.notes.map((n) => `- ${n}`));
    lines.push('', 'Estimate for planning only, not a formal appraisal or financial advice.');
    return lines.join('\n');
  }

  function copyControls(tab) {
    const status = h('span', { class: 'copy-status', role: 'status' });
    const showText = () => {
      const area = h('textarea', { id: `${tab}-summary`, class: 'summary-text', readonly: true, rows: 12, 'aria-label': 'Valuation summary' });
      area.value = state.summaries[tab];
      const old = document.getElementById(`${tab}-summary`);
      if (old) old.remove();
      status.after(area);
      area.focus();
      area.select();
      status.textContent = 'Select the text below and copy it.';
    };
    const btn = h('button', {
      type: 'button', class: 'btn', id: `${tab}-copy`,
      onclick: () => {
        const text = state.summaries[tab];
        try {
          navigator.clipboard.writeText(text).then(
            () => { status.textContent = 'Copied. Paste it into an email or a note.'; },
            showText,
          );
        } catch (err) {
          showText();
        }
      },
    }, 'Copy summary');
    return h('div', { class: 'sheet-actions' }, btn, status);
  }

  function footballField(r, refs) {
    const used = r.methods.filter((m) => !m.skipped && m.share > 0);
    const maxV = Math.max(r.high, ...used.map((m) => m.high), ...refs.map((x) => x.value).filter(Number.isFinite));
    if (!(maxV > 0)) return null;
    const step = niceStep(maxV / 4);
    const axisMax = Math.ceil((maxV * 1.02) / step) * step;
    const at = (x) => clamp((x / axisMax) * 100, 0, 100);

    const ff = h('div', { class: 'ff', role: 'img', 'aria-label': `Valuation range by method, from ${money(r.low)} to ${money(r.high)}` },
      h('div', { class: 'ff-band', style: `left:${at(r.low)}%;width:${at(r.high) - at(r.low)}%` }),
      refs.map((ref) => h('div', { class: 'ff-ref', style: `left:${at(ref.value)}%` })),
      used.map((m) => {
        return h('div', { class: 'ff-row' },
          h('div', { class: 'ff-name' }, h('span', { text: m.label }), h('span', { text: `${money(m.low)}–${money(m.high)}` })),
          h('div', { class: 'ff-track' },
            h('div', { class: 'ff-bar', style: `left:${at(m.low)}%;width:${Math.max(0.6, at(m.high) - at(m.low))}%` }),
            h('div', { class: 'ff-mid', style: `left:${at(m.value)}%` })));
      }),
      h('div', { class: 'ff-axis', 'aria-hidden': 'true' },
        Array.from({ length: Math.round(axisMax / step) + 1 }, (_, i) => {
          const t = i * step;
          const last = i === Math.round(axisMax / step);
          return h('span', { class: 'ff-tick', style: `left:${at(t)}%${last ? ';transform:translateX(-100%)' : ''}`, text: short(t) });
        })));

    return h('div', { class: 'field-chart' },
      h('h3', { text: 'Football field' }),
      ff,
      h('div', { class: 'ff-legend' },
        h('span', null, h('i', { class: 'k-range' }), 'Blended range'),
        h('span', null, h('i', { class: 'k-bar' }), 'Method range, tick = estimate'),
        refs.map((ref) => h('span', null, h('i', { class: 'k-ref' }), `${ref.label}: ${money(ref.value)}`))));
  }

  function methodsList(tab, r) {
    const openSet = state.open[tab];
    return h('div', { class: 'methods' }, r.methods.map((m) => {
      const d = h('details', { open: openSet.has(m.key) || null },
        h('summary', null,
          h('span', { class: 'm-name', text: m.label }),
          h('span', { class: 'm-share', text: m.skipped || !(m.share > 0) ? 'not used' : `${pct(m.share)} weight` }),
          h('span', { class: 'm-value', text: m.skipped || !(m.share > 0) ? '–' : money(m.value) })),
        m.skipped
          ? h('p', { class: 'm-skip', text: m.skipped })
          : h('dl', { class: 'm-detail' }, m.detail.flatMap((row) => [
            h('dt', { text: row.label }),
            h('dd', { text: row.amount != null ? money(row.amount) : row.value }),
          ])));
      d.addEventListener('toggle', () => { if (d.open) openSet.add(m.key); else openSet.delete(m.key); });
      return d;
    }));
  }

  function updateMobileTotal() {
    const bar = $('#mobile-total');
    const r = state.results[state.tab];
    if (!r || state.tab === 'data' || !(r.mid > 0)) { bar.hidden = true; return; }
    bar.hidden = false;
    bar.replaceChildren(
      h('span', null, `${LABELS[state.tab]} `, h('strong', { text: money(r.mid) })),
      h('a', { href: `#sheet-${state.tab}`, text: 'See breakdown' }));
  }

  /* ------------------------------- market data ---------------------------- */

  function table(head, rows, numericCols = []) {
    return h('div', { class: 'table-wrap' },
      h('table', null,
        h('thead', null, h('tr', null, head.map((c, i) => h('th', { scope: 'col', class: numericCols.includes(i) ? 'num' : null, text: c })))),
        h('tbody', null, rows.map((row) => h('tr', null, row.map((cell, i) => {
          const cls = i === row.length - 1 && head[i] === 'Source' ? 'src' : numericCols.includes(i) ? 'num' : null;
          return h('td', { class: cls }, cell);
        }))))));
  }

  function section(title, intro, ...content) {
    return h('section', { class: 'data-section' }, h('h2', { text: title }), intro ? h('p', { text: intro }) : null, content);
  }

  function renderData() {
    const M = B.SME_MARKET;
    const T = B.TECH_MARKET;
    const R = B.RATES;
    const usd = (v) => moneyIn('USD', v, true);

    const why = h('div', { class: 'why-now' }, B.WHY_NOW.map((w) => h('figure', null,
      h('span', { class: 'stat', text: w.stat }),
      h('figcaption', null, w.text, ' ', sourceLink(w.source)))));

    const sme = section('Small business multiples by industry',
      `Closed sales reported to BizBuySell. All industries, Q2 2026: ${M.q2_2026.avgCashFlowMultiple}x cash flow (SDE) and ${M.q2_2026.avgRevenueMultiple}x revenue on average, median sale price ${usd(M.q2_2026.medianSalePrice)}. In Q1 2026 the middle half of deals closed between ${M.q1_2026.quartileLow}x and ${M.q1_2026.quartileHigh}x.`,
      table(['Industry', 'SDE multiple', 'Revenue multiple', 'Median sale price', 'Source'],
        B.SME_INDUSTRIES.map((i) => [
          i.label, `${i.sde.toFixed(2)}x`, i.rev ? `${i.rev.toFixed(2)}x` : '–', i.median ? usd(i.median) : '–', sourceLink(i.source),
        ]), [1, 2, 3]));

    const ebitda = section('EBITDA multiples for larger private companies',
      'Once EBITDA passes about $1M, buyers price on EBITDA. Multiples rise with size: Pepperdine’s manufacturing data runs 5.0x under $1M, 5.2x at $1M–$5M, 6.5x at $5M–$10M and 7.0x above $10M.',
      table(['Segment', 'Multiple', 'Source'], [
        ...Object.values(B.EBITDA_SECTOR).map((s) => [`${s.label}, $1M–$5M EBITDA`, `${s.multiple.toFixed(1)}x`, sourceLink('pepperdine2026')]),
        ['US lower middle market, $10M–$25M deal value', `${M.gfData10to25}x`, sourceLink('gfData')],
        ['US lower middle market, $25M–$50M deal value', `${M.gfData25to50}x`, sourceLink('gfData')],
        ['US private equity buyouts, 2025 average', `${M.gfDataAvg2025}x`, sourceLink('gfData')],
        ['US private equity buyouts, Q1 2026 average', `${M.gfDataQ1_2026}x`, sourceLink('gfData')],
        ['Eurozone mid-market, Q2 2026 (funds 10.2x, strategic buyers 7.9x)', `${M.argosQ2_2026.overall}x`, sourceLink('argos')],
      ], [1]));

    const tech = section('Software and tech multiples',
      'Most 2026 software sales closed under 5x revenue, and in 2Q26 private deals (4.0x) priced above the public SaaS index (3.2x). Private prices usually follow public ones six to twelve months later, so sellers may face softer multiples into 2027.',
      table(['Benchmark', 'Multiple', 'Source'], [
        ['Private SaaS M&A, median EV / revenue (2Q26; 4.2x in 1Q26)', `${T.segPrivateMedian.toFixed(1)}x`, sourceLink('seg2Q26')],
        ['Private SaaS M&A, average (2Q26)', `${T.segPrivateAverage}x`, sourceLink('seg2Q26')],
        ['Public SaaS index, median EV / revenue (2Q26; 5.7x a year earlier)', `${T.publicSeg2Q26.toFixed(1)}x`, sourceLink('seg2Q26')],
        ['Private SaaS, bootstrapped (2025)', `${T.saasCapitalBootstrapped}x ARR`, sourceLink('saasCapital')],
        ['Private SaaS, equity-backed (2025)', `${T.saasCapitalEquityBacked}x ARR`, sourceLink('saasCapital')],
        ['Smaller SaaS deals, median (Q1 2026)', `${T.aventisQ1_2026}x`, sourceLink('aventis')],
        ['Public SaaS, late August 2026 (secondary source)', `${T.publicSaasAug2026}x`, sourceLink('saasCapital')],
        ['Public SaaS with net retention above 120%', `${T.publicNrrAbove120}x`, sourceLink('seg2Q26')],
        ['Public SaaS with net retention below 100%', `${T.publicNrrBelow100}x`, sourceLink('seg2Q26')],
        ['Growth 15–30% / 30–50% / 50–80% / 80%+', '3.5–5.5x / 5–7.5x / 7–10x / 9–14x', sourceLink('saasBands')],
        ['SaaS under $1M ARR, on owner earnings', '2.5–4x SDE', sourceLink('feIntl')],
        ['AI companies, median revenue multiple (funding rounds)', `${T.aiMedianRevenueMultiple}x`, sourceLink('aiMultiples')],
      ], [1]));

    const ukBands = new Map();
    for (const [key, b] of Object.entries(B.UK_SME_BANDS)) {
      const ind = B.SME_INDUSTRIES.find((i) => i.key === key);
      const row = ukBands.get(b.sector) || { sector: b.sector, small: b.small, large: b.large, ours: [] };
      row.ours.push(ind ? ind.label : key);
      ukBands.set(b.sector, row);
    }
    const uk = section('UK small business ranges',
      'Indicative ranges on adjusted EBITDA (profit with owner pay reset to a market salary) from a UK valuation adviser, H2 2026. They are professional judgement rather than deal data. In the valuator, your value-driver answers set where you sit inside the range.',
      table(['UK sector', 'Under £1m EBITDA', '£1m and over', 'Used for', 'Source'],
        [...ukBands.values()].map((b) => [
          b.sector, `${b.small[0]}–${b.small[1]}x`, `${b.large[0]}–${b.large[1]}x`, b.ours.join(', '), sourceLink('ukSme'),
        ]), [1, 2]));

    const frRows = Object.entries(B.FR_SME_BANDS).map(([key, b]) => {
      const ind = B.SME_INDUSTRIES.find((i) => i.key === key);
      return [b.sector, `${b.band[0]}–${b.band[1]}x`, ind ? ind.label : key, sourceLink(b.source)];
    });
    const sizeNames = ['TPE, EBE under €500K', 'Petite PME, €500K–€1.5M', 'Moyenne PME, €1.5M–€5M'];
    B.FR_SIZE_BANDS.forEach(([, lo, hi], i) => frRows.push([sizeNames[i], `${lo}–${hi}x`, 'All other industries, by size', sourceLink('frSize')]));
    const fr = section('France small business ranges',
      `Indicative ranges on normalised EBE (the French EBITDA) from French M&A advisers, 2026. Advisers reported an average of ${B.FR_MARKET.adviserAverageH2_2025}x in H2 2025, and most 2026 guides put a typical deal near ${B.FR_MARKET.typical2026}x. Software publishers trade at 8–15x and belong in the tech valuator.`,
      table(['Segment', 'Range', 'Used for', 'Source'], frRows, [1]));

    const m = SD.OUTCOME_MODEL;
    const pct1 = (x) => `${(x * 100).toFixed(1)}%`;
    const orCell = (pair) => `${pair[0].toFixed(2)}${pair[1] < 0.01 ? '***' : pair[1] < 0.05 ? '**' : pair[1] < 0.1 ? '*' : ''}`;
    const FEATURE_LABELS = {
      ln_age: 'Age (log years)', ln_age2: 'Age squared', ai: 'AI company', consumer: 'Consumer', healthcare: 'Healthcare',
      fintech: 'Fintech', industrials: 'Industrials', other_industry: 'Education, real estate, government', us: 'Based in the US',
      hardware: 'Hardware or robotics', biotech: 'Biotech', saas: 'SaaS',
    };
    const outcomes = section('Startup outcomes model',
      `Multinomial logistic regression on ${m.n.toLocaleString('en-US')} Y Combinator startups (batches ${m.batches}; ${m.statusCounts.Active.toLocaleString('en-US')} active, ${m.statusCounts.Acquired} acquired, ${m.statusCounts.Public} public, ${m.statusCounts.Inactive.toLocaleString('en-US')} shut down), snapshot ${m.asOf}. Odds ratios against staying active; *** p<0.01, ** p<0.05, * p<0.1. On a 20% hold-out sample: AUC ${m.holdout.auc.Acquired} acquired, ${m.holdout.auc.Public} public, ${m.holdout.auc.Inactive} shut down; McFadden R² ${m.holdout.mcfaddenR2}.`,
      table(['Factor', 'Acquired', 'Public', 'Shut down'],
        Object.entries(m.oddsRatios).map(([k, v]) => [FEATURE_LABELS[k] || k, orCell(v.Acquired), orCell(v.Public), orCell(v.Inactive)]), [1, 2, 3]),
      table(['Years since start', 'Companies', 'Acquired (model / actual)', 'Public', 'Shut down'],
        m.calibration.map((c) => [c.age_band.replace('[', '').replace(')', '').replace(', ', '–'), String(c.n),
          `${pct1(c.pred_Acquired)} / ${pct1(c.obs_Acquired)}`, `${pct1(c.pred_Public)} / ${pct1(c.obs_Public)}`, `${pct1(c.pred_Inactive)} / ${pct1(c.obs_Inactive)}`]), [1, 2, 3, 4]),
      h('p', { text: 'Caveats: YC startups are a selected group; the directory updates status with a lag; and survivors are more likely to have added an AI tag, which flatters the AI effect. Driver adjustments for investors, founders, stage, runway and traction are applied on top as odds multipliers.' }));

    const funnelSection = section('Funding funnel',
      `Chance of raising the next round. Classic reference (CB Insights, ${SD.CB_FUNNEL.cohort}): ${pct(SD.CB_FUNNEL.secondRound)} raised a second round, ${pct(SD.CB_FUNNEL.fourthRound)} a fourth, ${pct(SD.CB_FUNNEL.exited)} exited, ${pct(SD.CB_FUNNEL.deadOrSelfSustaining)} died or became self-sustaining, ${pct1(SD.CB_FUNNEL.unicorn)} became unicorns.`,
      table(['From', 'To', 'Within 24 months', 'Eventually', 'Typical wait', 'Basis'],
        SD.STAGES.map((x) => [x.label, x.next, pct(x.p24), pct(x.eventual), `${x.years} years`, h('span', null, `${x.basis} `, startupSource(x.source))]), [2, 3, 4]),
      table(['Driver', 'Odds multiplier on the next round', 'Basis'], [
        ...Object.values(SD.NEXT_ROUND_FACTORS.investors).map((x) => [x.label, `× ${x.or}`, x.basis]),
        ...Object.values(SD.NEXT_ROUND_FACTORS.founder).map((x) => [x.label, `× ${x.or}`, x.basis]),
        ['AI company', `× ${trim(SD.NEXT_ROUND_FACTORS.aiHazardRatio, 2)} pace`, h('span', null, 'Median time to Series A 1.3 vs 1.8 years. ', startupSource('aiTiming'))],
      ], [1]));

    const aiRows = SD.AI_COMPS.map((c) => [
      c.company, (SD.AI_SEGMENTS.find((x) => x.key === c.segment) || {}).label, moneyIn('USD', c.valuation), moneyIn('USD', c.revenue),
      `${trim(c.valuation / c.revenue, 1)}x`, `${c.date}${c.confidence === 'low' ? ' · low confidence' : ''}`, startupSource(c.source),
    ]);
    const aiSection = section('AI comparables',
      'Latest reported valuations and revenue run-rates for leading private AI companies. Most figures come from trackers and press summaries, and valuation and revenue dates do not always match; low-confidence rows have conflicting reports. In the startup model, the segment median is scaled down for size and adjusted for growth, then capped at the top of AI round multiples for your stage (Eqvista 2026: seed 10–25x, Series A 15–30x, Series B+ 25–50x).',
      table(['Company', 'Segment', 'Valuation', 'Revenue run-rate', 'Multiple', 'Date', 'Source'], aiRows, [2, 3, 4]),
      table(['Public comparable', 'Multiple', 'Basis', 'Source'], SD.PUBLIC_AI_COMPS.map((c) => [c.company, `${c.multiple}x`, c.basis, startupSource(c.source)]), [1]),
      table(['Aggregate', 'Value', 'Source'], SD.AI_AGGREGATES.map((a) => [a.label, a.value, startupSource(a.source)]), [1]));

    const rounds = section('Startup funding rounds',
      'Medians for venture-backed companies. Angel and friends-and-family rounds price far lower, and AI companies far higher.',
      table(['Round', 'Valuation', 'Source'], B.ROUND_MEDIANS.map((m) => [m.stage, moneyIn(m.currency, m.value), sourceLink(m.source)]), [1]));

    const rates = section('Rates and deal terms used',
      null,
      table(['Item', 'Value', 'Source'], [
        ['US prime rate', pct(R.prime, 2), sourceLink('fedH15')],
        ['10-year / 30-year Treasury (8 Oct 2026)', `${pct(R.treasury10y, 2)} / ${pct(R.treasury30y, 2)}`, sourceLink('fedH15')],
        ['Risk-free rate used (20-year Treasury estimate)', pct(R.riskFree, 1), sourceLink('kroll')],
        ['Equity risk premium', pct(R.equityRiskPremium, 1), sourceLink('kroll')],
        ['SBA 7(a) maximum rate, loans over $350K', `prime + ${pct(R.sbaSpreadOver350k, 0)}`, sourceLink('sbaRates')],
        ['Debt service cover lenders look for', `${R.dscr}x`, null],
        ['Sale price as share of asking price (2025)', pct(M.soldToAskingRatio, 0), sourceLink('iconic')],
        ['Median days on market: all (2025), services and manufacturing (Q2 2026)', `${M.daysOnMarket.median2025} / ${M.daysOnMarket.servicesQ2_2026} / ${M.daysOnMarket.manufacturingQ2_2026}`, sourceLink('iconic')],
      ], [1]));

    const methods = section('How each valuator works', null,
      h('div', { class: 'table-wrap' }, h('table', null,
        h('thead', null, h('tr', null, h('th', { text: 'Valuator' }), h('th', { text: 'Methods and weights' }))),
        h('tbody', null,
          h('tr', null, h('td', { text: 'Startup model' }), h('td', { text: 'Ten methods: scorecard (Payne), Berkus, risk factor summation, development stage, cost to duplicate, comparable companies (AI comps or sector multiples), venture capital method, First Chicago scenarios, risk-adjusted DCF and last round stepped up. Weights depend on stage. Success odds come from an outcome model fitted on 6,153 YC startups and from 2025–26 funding-funnel data; they also drive the First Chicago and DCF methods.' })),
          h('tr', null, h('td', { text: 'Tech startup' }), h('td', { text: 'Revenue multiple from a growth curve fitted to 2026 private SaaS deals, adjusted for business model, scale, retention, gross margin, Rule of 40, concentration and runway. Under $1.5M ARR it blends in an owner-earnings multiple. For a funding round, the venture capital method carries 70% of the weight.' })),
          h('tr', null, h('td', { text: 'Small & medium business' }), h('td', { text: 'Industry SDE multiple (60%), capitalised earnings with a build-up discount rate (25%) and an industry revenue multiple (15%). Above $0.5M EBITDA it shifts to size-adjusted EBITDA multiples. Seven value drivers move the multiple by up to −50% or +40%. For a UK or French business, that market’s adviser range on adjusted EBITDA is added with the same weight as the US multiple. Tangible assets set a floor; a bank-financing check shows what a buyer can borrow.' }))))));

    const sources = section('Sources', 'Several figures come from broker and advisor summaries of the original reports. Check the primary report before relying on any one number.',
      h('ol', { class: 'sources' }, [...Object.values(B.SOURCES), ...Object.values(SD.SOURCES)].map((s) => h('li', null, h('a', { href: s.url, target: '_blank', rel: 'noopener', text: s.name })))));

    $('#data-root').replaceChildren(
      section('Why owners are selling now', null, why),
      sme, ebitda, uk, fr, tech, outcomes, funnelSection, aiSection, rounds, rates, methods, sources);
  }

  /* ---------------------------------- boot -------------------------------- */

  function boot() {
    const saved = load();
    if (saved && B.CURRENCIES.some((c) => c.code === saved.currency)) {
      state.currency = saved.currency;
      state.fx = saved.fx > 0 ? saved.fx : cur().perUsd;
    }
    if (saved && saved.dirty) Object.assign(state.dirty, saved.dirty);

    wireCurrency();
    $('#fx').disabled = state.currency === 'USD';
    for (const tab of ['startup', 'tech', 'sme']) {
      buildForm(tab);
      applyDefaults(tab);
    }
    if (saved && saved.values) {
      for (const tab of ['startup', 'tech', 'sme']) {
        for (const f of allFields(tab)) {
          if (Object.prototype.hasOwnProperty.call(saved.values, f.id)) setValue(f, saved.values[f.id]);
        }
      }
    }
    renderData();
    wireTabs();
    computeAll();

    const fromHash = (location.hash || '').replace('#', '');
    selectTab(TABS.includes(fromHash) ? fromHash : (saved && saved.tab) || 'startup');
  }

  boot();
})();
