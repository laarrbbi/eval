/*
 * Market benchmarks used by the three valuators.
 * Compiled October 2026. Every figure carries a source key; see RESEARCH.md
 * for the full source list, caveats and the date of each data point.
 *
 * Amounts are in the currency named by their `currency` field (USD unless noted).
 * Multiples are unitless and apply in any currency.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.Benchmarks = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SOURCES = {
    bbsIndustry: {
      name: 'BizBuySell, valuation multiples by industry (closed sales Q3 2021 to Q2 2026)',
      url: 'https://www.bizbuysell.com/learning-center/industry-valuation-multiples/',
    },
    bbsQ2_2026: {
      name: 'BizBuySell Insight Report, Q2 2026',
      url: 'https://www.bizbuysell.com/insight-report/',
    },
    bbsQ2Summary: {
      name: 'Sacramento Business Brokers, summary of BizBuySell Q2 2026',
      url: 'https://www.sacramentobusinessbrokers.com/post/selling-a-business-in-2026-what-the-latest-market-data-tells-owners',
    },
    bbsService: {
      name: 'BizBuySell, service business benchmarks',
      url: 'https://www.bizbuysell.com/learning-center/valuation-benchmarks/service-business/',
    },
    bbsRetail: {
      name: 'BizBuySell, retail business benchmarks',
      url: 'https://www.bizbuysell.com/learning-center/valuation-benchmarks/retail-business/',
    },
    bbsWholesale: {
      name: 'BizBuySell, wholesale and distribution benchmarks',
      url: 'https://www.bizbuysell.com/learning-center/valuation-benchmarks/wholesale-distribution/',
    },
    bbsTransport: {
      name: 'BizBuySell, moving and shipping benchmarks',
      url: 'https://www.bizbuysell.com/learning-center/valuation-benchmarks/moving-shipping/',
    },
    bbs2025Niche: {
      name: 'Hyperresearch, small business multiples by industry (BizBuySell 2025 closed sales)',
      url: 'https://hyperresearch.ai/guides/small-business-valuation-multiples',
    },
    iconic: {
      name: 'Iconic, BizBuySell-based selling statistics 2026',
      url: 'https://www.iconic.co/blog/steps-to-selling-a-small-business/',
    },
    pepperdine2026: {
      name: 'Pepperdine 2026 Private Capital Markets Report (via IAG M&A Advisors and Chinook summaries)',
      url: 'https://iagmerger.com/understanding-ebitda-multiples-by-industry/',
    },
    gfData: {
      name: 'GF Data (via Capitalpad and Iconic summaries)',
      url: 'https://capitalpad.com/lower-middle-market-ebitda-multiples/',
    },
    argos: {
      name: 'Argos Index mid-market, Q2 2026',
      url: 'https://argos.fund/mid-market-argos-index-q2-2026/',
    },
    seg2Q26: {
      name: 'Software Equity Group, 2Q26 SaaS M&A and Public Market Report',
      url: 'https://softwareequity.com/research/quarterly-saas-report',
    },
    saasCapital: {
      name: 'SaaS Capital private SaaS valuations 2025 (via Eqvista)',
      url: 'https://eqvista.com/saas-valuation-multiples/',
    },
    aventis: {
      name: 'Aventis Advisors, SaaS valuation multiples 2015 to 2026',
      url: 'https://aventis-advisors.com/saas-valuation-multiples/',
    },
    saasBands: {
      name: 'Growth-band ARR multiples, private SaaS 2026 (The VC Corner, Livmo, L40)',
      url: 'https://www.thevccorner.com/p/saas-company-valuation-formula-2026',
    },
    feIntl: {
      name: 'FE International, SaaS valuation multiples 2026',
      url: 'https://www.feinternational.com/blog/saas-valuation-multiples',
    },
    aiMultiples: {
      name: 'Value Add VC, AI startup valuation multiples 2026',
      url: 'https://valueaddvc.com/blog/ai-startup-valuation-multiples-2026-why-ai-trades-at-10-50x-vs-saas-at-3-7x',
    },
    cartaSafe: {
      name: 'Carta, SAFE valuation caps Q2 2026',
      url: 'https://carta.com/data/safe-valuation-caps-q2-2026/',
    },
    cartaSeed: {
      name: 'Carta seed data 2025 to 2026 (via Value Add VC and SaaStr)',
      url: 'https://valueaddvc.com/blog/seed-round-statistics-2025-median-check-size-post-money-valuation-and-conversion-to-series-a',
    },
    seriesA: {
      name: 'Series A benchmarks 2026, Carta and PitchBook-NVCA (via WaveUp)',
      url: 'https://waveup.com/blog/series-a-benchmarks/',
    },
    pitchbookEurope: {
      name: 'PitchBook European VC Valuations Q2 2026 (via Causo)',
      url: 'https://hub.causo.ai/guides/european-startup-funding-this-quarter',
    },
    berkus: {
      name: 'Berkus method (Dave Berkus), classic $500K per factor',
      url: 'https://waveup.com/blog/startup-valuation-methods/',
    },
    scorecard: {
      name: 'Scorecard method (Bill Payne) and Risk Factor Summation',
      url: 'https://microventures.com/how-to-determine-the-pre-revenue-value-of-a-startup',
    },
    damodaranVc: {
      name: 'Damodaran, venture capital target rates of return by stage',
      url: 'https://pages.stern.nyu.edu/~adamodar/pdfiles/papers/younggrowth.pdf',
    },
    kroll: {
      name: 'Kroll recommended US equity risk premium (5.0%, reaffirmed March 2026)',
      url: 'https://www.bvresources.com/articles/bvwire/kroll-reaffirms-us-erp-at-50-and-lowers-eurozone',
    },
    fedH15: {
      name: 'Federal Reserve H.15 and PrimeRates.com (October 2026)',
      url: 'https://www.federalreserve.gov/releases/h15/',
    },
    sbaRates: {
      name: 'NerdWallet, SBA 7(a) maximum rates 2026',
      url: 'https://www.nerdwallet.com/article/small-business/sba-loan-rates',
    },
    valueDrivers: {
      name: 'BizBuySell, valuation risk factors; advisor rules of thumb',
      url: 'https://www.bizbuysell.com/learning-center/article/business-valuation-risk-factors/',
    },
    mckinsey: {
      name: 'McKinsey via Fortune, the great small-business wealth transfer (Feb 2026)',
      url: 'https://fortune.com/2026/02/26/great-small-business-wealth-transfer-mckinsey-5-trillion-baby-boomer-businesses-sale/',
    },
    zelle: {
      name: 'Zelle Small Business Pulse survey (March 2026)',
      url: 'https://www.prnewswire.com/news-releases/new-zelle-survey-data-boomers-built-main-street-now-theyre-ready-to-sell--but-gen-z-and-millennials-arent-buying-302753302.html',
    },
  };

  /* ------------------------------------------------------------------ */
  /* Small and medium businesses                                         */
  /* ------------------------------------------------------------------ */

  // Pepperdine 2026: median EBITDA multiples for companies with $1M to $4.99M EBITDA.
  const EBITDA_SECTOR = {
    consumer: { label: 'Consumer goods and services', multiple: 4.5 },
    construction: { label: 'Construction', multiple: 5.0 },
    manufacturing: { label: 'Manufacturing', multiple: 5.2 },
    healthcare: { label: 'Health care', multiple: 6.0 },
    business: { label: 'Business services', multiple: 6.2 },
    it: { label: 'Information technology', multiple: 7.0 },
  };

  // BizBuySell sector averages. sde = sale price / seller's discretionary earnings,
  // rev = sale price / gross revenue, median = median sale price (USD).
  const SME_INDUSTRIES = [
    { key: 'services', label: 'Service business (general)', sde: 2.58, rev: 0.82, median: null, ebitdaSector: 'business', source: 'bbsService' },
    { key: 'restaurants', label: 'Restaurant, café or food business', sde: 2.27, rev: 0.42, median: 200000, ebitdaSector: 'consumer', source: 'bbsIndustry' },
    { key: 'retail', label: 'Retail shop', sde: 2.62, rev: 0.53, median: null, ebitdaSector: 'consumer', source: 'bbsRetail' },
    { key: 'construction', label: 'Building and construction trades', sde: 2.65, rev: 0.59, median: 750500, ebitdaSector: 'construction', source: 'bbsIndustry' },
    { key: 'manufacturing', label: 'Manufacturing', sde: 3.04, rev: 0.73, median: 726914, ebitdaSector: 'manufacturing', source: 'bbsIndustry' },
    { key: 'wholesale', label: 'Wholesale and distribution', sde: 2.89, rev: 0.54, median: null, ebitdaSector: 'manufacturing', source: 'bbsWholesale' },
    { key: 'health', label: 'Health care and fitness', sde: 2.72, rev: 0.75, median: 441162, ebitdaSector: 'healthcare', source: 'bbsIndustry' },
    { key: 'beauty', label: 'Beauty and personal care', sde: 2.12, rev: 0.54, median: 145000, ebitdaSector: 'consumer', source: 'bbsIndustry' },
    { key: 'automotive', label: 'Automotive and boat', sde: 3.10, rev: 0.71, median: 500000, ebitdaSector: 'consumer', source: 'bbsIndustry' },
    { key: 'education', label: 'Education and childcare', sde: 2.89, rev: 0.84, median: 350000, ebitdaSector: 'business', source: 'bbsIndustry' },
    { key: 'pets', label: 'Pet services', sde: 2.59, rev: 0.73, median: 226000, ebitdaSector: 'consumer', source: 'bbsIndustry' },
    { key: 'media', label: 'Communication and media', sde: 2.47, rev: 0.91, median: 365000, ebitdaSector: 'business', source: 'bbsIndustry' },
    { key: 'online', label: 'Online and technology business', sde: 3.28, rev: 1.09, median: 850000, ebitdaSector: 'it', source: 'bbsIndustry' },
    { key: 'itServices', label: 'IT and software services', sde: 2.99, rev: 1.12, median: null, ebitdaSector: 'it', source: 'bbs2025Niche' },
    { key: 'insurance', label: 'Insurance agency', sde: 2.68, rev: 1.53, median: null, ebitdaSector: 'business', source: 'bbs2025Niche' },
    { key: 'transport', label: 'Transportation (general)', sde: 1.95, rev: 0.64, median: null, ebitdaSector: 'construction', source: 'bbsIndustry' },
    { key: 'moving', label: 'Moving and shipping', sde: 2.52, rev: 0.63, median: 157000, ebitdaSector: 'construction', source: 'bbsTransport' },
    { key: 'storage', label: 'Storage and warehousing', sde: 3.41, rev: 1.00, median: 332776, ebitdaSector: 'business', source: 'bbsIndustry' },
    { key: 'carwash', label: 'Car wash', sde: 4.73, rev: null, median: null, ebitdaSector: 'consumer', source: 'bbs2025Niche' },
  ];

  // Size effect on EBITDA multiples, relative to the $1M-$5M bucket.
  // Pepperdine 2026 manufacturing: 5.0x (<$1M), 5.2x ($1M-$5M), 6.5x ($5M-$10M), 7.0x ($10M+).
  // Points sit at bucket midpoints so the curve has no cliffs. x = EBITDA in USD.
  const EBITDA_SIZE_CURVE = [
    [250000, 0.92],
    [1000000, 0.97],
    [3000000, 1.0],
    [7500000, 1.25],
    [15000000, 1.35],
  ];

  const SME_MARKET = {
    q2_2026: {
      medianSalePrice: 349250,
      medianCashFlow: 155921,
      medianRevenue: 692087,
      avgCashFlowMultiple: 2.7,
      avgRevenueMultiple: 0.7,
      dealsClosed: 2117,
      dealsChangeYoY: -0.10,
      source: 'bbsQ2Summary',
    },
    q1_2026: { quartileLow: 1.9, quartileHigh: 3.5, median: 2.7, source: 'bbsQ2_2026' },
    soldToAskingRatio: 0.94, // full-year 2025
    daysOnMarket: { median2025: 170, servicesQ2_2026: 155, manufacturingQ2_2026: 247 },
    gfDataAvg2025: 7.2,
    gfDataQ1_2026: 7.3,
    gfData10to25: 6.4,
    gfData25to50: 6.8,
    argosQ2_2026: { overall: 8.8, funds: 10.2, strategic: 7.9 },
  };

  // Value drivers. Each option changes the industry multiple by `adj` (e.g. -0.15 = 15% lower).
  const SME_DRIVERS = [
    {
      key: 'concentration',
      label: 'Largest customer, share of revenue',
      help: 'Advisors report a 0.5x to 1.0x lower multiple once one customer passes about 20% of revenue.',
      options: [
        { value: 'lt10', label: 'Under 10%', adj: 0 },
        { value: '10to20', label: '10% to 20%', adj: -0.05 },
        { value: '20to35', label: '20% to 35%', adj: -0.15 },
        { value: 'gt35', label: 'Over 35%', adj: -0.25 },
      ],
      default: 'lt10',
    },
    {
      key: 'owner',
      label: 'How much the business depends on you',
      help: 'Buyers discount 10% to 25% when the owner holds key relationships or skills.',
      options: [
        { value: 'runs', label: 'Runs day to day without me', adj: 0.10 },
        { value: 'some', label: 'Team handles most of the work', adj: 0 },
        { value: 'heavy', label: 'I hold the key clients or skills', adj: -0.15 },
        { value: 'is', label: 'I am the business', adj: -0.25 },
      ],
      default: 'some',
    },
    {
      key: 'recurring',
      label: 'Recurring or contracted revenue',
      help: 'More than 50% recurring revenue typically adds 0.5x to 1.5x to the multiple.',
      options: [
        { value: 'high', label: 'Over 50% of revenue', adj: 0.15 },
        { value: 'mid', label: '20% to 50%', adj: 0.05 },
        { value: 'low', label: 'Under 20%', adj: 0 },
      ],
      default: 'low',
    },
    {
      key: 'trend',
      label: 'Revenue trend, last 3 years',
      help: 'Buyers pay for momentum and walk away from decline.',
      options: [
        { value: 'strong', label: 'Growing over 10% a year', adj: 0.10 },
        { value: 'growing', label: 'Growing up to 10% a year', adj: 0 },
        { value: 'flat', label: 'Flat', adj: -0.05 },
        { value: 'declining', label: 'Declining', adj: -0.20 },
      ],
      default: 'growing',
    },
    {
      key: 'records',
      label: 'Quality of your financial records',
      help: 'Add-backs a buyer cannot verify get dropped, and unclear books slow bank financing.',
      options: [
        { value: 'reviewed', label: 'Reviewed or audited accounts', adj: 0.05 },
        { value: 'accountant', label: 'Accountant-prepared, match tax returns', adj: 0 },
        { value: 'basic', label: 'Tax returns only, some gaps', adj: -0.10 },
        { value: 'poor', label: 'Cash-heavy or hard to verify', adj: -0.25 },
      ],
      default: 'accountant',
    },
    {
      key: 'age',
      label: 'Years trading',
      help: 'A short track record makes earnings harder to rely on.',
      options: [
        { value: 'lt3', label: 'Under 3 years', adj: -0.15 },
        { value: '3to10', label: '3 to 10 years', adj: 0 },
        { value: 'gt10', label: 'Over 10 years', adj: 0.05 },
      ],
      default: '3to10',
    },
    {
      key: 'premises',
      label: 'Premises',
      help: 'A buyer needs to know the business can stay where it is.',
      options: [
        { value: 'secure', label: 'Owned, long lease, or location does not matter', adj: 0 },
        { value: 'short', label: 'Short lease or renewal risk', adj: -0.10 },
      ],
      default: 'secure',
    },
  ];

  // Combined driver adjustment is capped so a multiple never moves by more than this.
  const SME_DRIVER_LIMITS = { min: -0.5, max: 0.4 };

  /* ------------------------------------------------------------------ */
  /* Rates                                                               */
  /* ------------------------------------------------------------------ */

  const RATES = {
    prime: 0.07, // after the September 2026 Fed move (PrimeRates.com, Oct 2026)
    treasury10y: 0.0524, // H.15, 8 Oct 2026
    treasury30y: 0.0561, // H.15, 8 Oct 2026
    riskFree: 0.054, // spot 20-year sits between the 10y and 30y; Kroll uses the higher of 3.5% or spot 20y
    equityRiskPremium: 0.05, // Kroll US recommended ERP
    sbaSpreadOver350k: 0.03, // SBA 7(a) maximum spread above prime for loans over $350K
    sbaTermYears: 10,
    dscr: 1.25, // debt service coverage commonly required by lenders
    buyerDownPayment: 0.10,
  };

  // Size premium for very small private companies (judgment, editable), x = EBITDA in USD.
  const SIZE_PREMIUM_CURVE = [
    [250000, 0.06],
    [1000000, 0.05],
    [5000000, 0.035],
    [20000000, 0.02],
  ];

  /* ------------------------------------------------------------------ */
  /* Tech startups                                                       */
  /* ------------------------------------------------------------------ */

  // Base EV / ARR multiple for a private B2B SaaS company by YoY growth (%).
  // Calibrated so 15% growth gives SEG's 2Q26 private median of 4.0x, and the
  // 15-30% / 30-50% / 50-80% / 80%+ growth bands land on the published ranges
  // (3.5-5.5x / 5-7.5x / 7-10x / 9-14x).
  const GROWTH_CURVE = [
    [-20, 1.2],
    [0, 2.5],
    [15, 4.0],
    [30, 5.5],
    [50, 7.5],
    [80, 10.0],
    [120, 13.0],
    [200, 15.0],
  ];

  // Scale effect, x = ARR in USD. 1.0 at about $5M ARR.
  const SCALE_CURVE = [
    [100000, 0.5],
    [1000000, 0.75],
    [3000000, 0.9],
    [5000000, 1.0],
    [10000000, 1.05],
    [25000000, 1.2],
    [50000000, 1.3],
    [100000000, 1.4],
  ];

  // Business models. `factor` scales the SaaS curve; `typicalGM` is the gross margin
  // that model is normally valued at. Factors are calibrated assumptions:
  // e-commerce 0.25 -> ~1.0x revenue (BizBuySell online and technology: 1.09x),
  // tech services 0.3 -> ~1.2x (BizBuySell IT and software services: 1.12x),
  // AI-native 1.5 sits between the SaaS floor and AI funding-round headlines.
  const TECH_MODELS = [
    { key: 'saas', label: 'B2B SaaS', factor: 1.0, typicalGM: 75, recurring: true },
    { key: 'ai', label: 'AI-native software', factor: 1.5, typicalGM: 60, recurring: true },
    { key: 'marketplace', label: 'Marketplace (on net revenue)', factor: 0.75, typicalGM: 70, recurring: false },
    { key: 'fintech', label: 'Fintech or payments (on net revenue)', factor: 0.8, typicalGM: 55, recurring: false },
    { key: 'consumer', label: 'Consumer app (subscriptions or ads)', factor: 0.7, typicalGM: 70, recurring: true },
    { key: 'hardware', label: 'Hardware or IoT', factor: 0.45, typicalGM: 40, recurring: false },
    { key: 'ecommerce', label: 'E-commerce or D2C brand', factor: 0.25, typicalGM: 40, recurring: false },
    { key: 'services', label: 'Tech-enabled services or agency', factor: 0.3, typicalGM: 35, recurring: false },
  ];

  // Small owner-run software businesses (under ~$1M ARR) sell on SDE: 2.5x-4x (FE International).
  const SDE_GROWTH_CURVE = [
    [-10, 2.0],
    [0, 2.5],
    [15, 3.25],
    [30, 4.0],
    [60, 4.5],
  ];

  const TECH_MARKET = {
    segPrivateMedian: 4.0, // EV / TTM revenue, 2Q26
    segPrivateAverage: 6.2,
    saasCapitalBootstrapped: 4.8, // ARR multiple, 2025
    saasCapitalEquityBacked: 5.3,
    aventisQ1_2026: 3.1,
    publicSaasAug2026: 4.6,
    publicNrrAbove120: 11.7,
    publicNrrBelow100: 4.1,
    publicNrrMedian: 5.6,
    aiMedianRevenueMultiple: 24.2,
    // Cap on the exit multiple used by the VC method: the top of the private
    // SaaS range for 80%+ growth (9x-14x).
    exitMultipleCap: 12,
  };

  // Funding-round stages for the venture capital method.
  // targetIrr: Damodaran's VC target returns (start-up 50-70%, first stage 40-60%,
  // second stage 35-50%, bridge 25-35%); midpoints used.
  // dilution: expected dilution from later rounds before exit, assuming about
  // 15-20% per priced round (assumption, editable).
  const VC_STAGES = [
    { key: 'preseed', label: 'Pre-seed', targetIrr: 0.60, dilution: 0.50 },
    { key: 'seed', label: 'Seed', targetIrr: 0.50, dilution: 0.40 },
    { key: 'seriesA', label: 'Series A', targetIrr: 0.425, dilution: 0.25 },
    { key: 'seriesB', label: 'Series B or later', targetIrr: 0.30, dilution: 0.12 },
  ];

  // Median pre-money valuations for reference (USD unless noted).
  const ROUND_MEDIANS = [
    { stage: 'Pre-seed (SAFE cap, rounds under $1M)', value: 10000000, currency: 'USD', source: 'cartaSafe' },
    { stage: 'Pre-seed (SAFE cap, $1M to $2.5M rounds)', value: 15000000, currency: 'USD', source: 'cartaSafe' },
    { stage: 'Seed pre-money (Carta, 2025)', value: 16000000, currency: 'USD', source: 'cartaSeed' },
    { stage: 'Seed post-money (Carta, Q2 2026)', value: 23900000, currency: 'USD', source: 'cartaSeed' },
    { stage: 'Series A pre-money (Carta, 2025)', value: 49300000, currency: 'USD', source: 'seriesA' },
    { stage: 'Series A pre-money (PitchBook-NVCA, Q1 2026)', value: 62000000, currency: 'USD', source: 'seriesA' },
    { stage: 'Europe pre-seed and seed (PitchBook, Q2 2026)', value: 4800000, currency: 'EUR', source: 'pitchbookEurope' },
    { stage: 'UK and Ireland pre-seed and seed (PitchBook, Q2 2026)', value: 4600000, currency: 'EUR', source: 'pitchbookEurope' },
  ];

  /* ------------------------------------------------------------------ */
  /* Early-stage startups                                                */
  /* ------------------------------------------------------------------ */

  // Market baseline = median pre-money of comparable funded startups.
  // Europe and UK publish pre-seed and seed together; pre-seed is scaled by
  // the US pre-seed/seed ratio (10/16).
  const STARTUP_MARKETS = [
    { key: 'usVc', label: 'US, venture-backed', currency: 'USD', preseed: 10000000, seed: 16000000, source: 'cartaSeed' },
    { key: 'euVc', label: 'Europe, venture-backed', currency: 'EUR', preseed: 3000000, seed: 4800000, source: 'pitchbookEurope' },
    { key: 'ukVc', label: 'UK and Ireland, venture-backed', currency: 'EUR', preseed: 2875000, seed: 4600000, source: 'pitchbookEurope' },
    { key: 'angel', label: 'Angel or friends-and-family round', currency: 'USD', preseed: 1500000, seed: 2000000, source: 'scorecard' },
  ];

  const SCORECARD_FACTORS = [
    { key: 'team', label: 'Strength of the founding team', weight: 0.30 },
    { key: 'opportunity', label: 'Size of the opportunity', weight: 0.25 },
    { key: 'product', label: 'Product and technology', weight: 0.15 },
    { key: 'competition', label: 'Competitive environment', weight: 0.10 },
    { key: 'marketing', label: 'Sales channels and partnerships', weight: 0.10 },
    { key: 'funding', label: 'Need for more funding', weight: 0.05 },
    { key: 'other', label: 'Other factors', weight: 0.05 },
  ];
  const SCORECARD_SCALE = [
    { value: 0.5, label: 'Much weaker' },
    { value: 0.75, label: 'Weaker' },
    { value: 1.0, label: 'Typical' },
    { value: 1.25, label: 'Stronger' },
    { value: 1.5, label: 'Much stronger' },
  ];

  const BERKUS_FACTORS = [
    { key: 'idea', label: 'Sound idea', help: 'Basic value and product risk' },
    { key: 'prototype', label: 'Working prototype', help: 'Reduces technology risk' },
    { key: 'team', label: 'Quality management team', help: 'Reduces execution risk' },
    { key: 'relationships', label: 'Strategic relationships', help: 'Reduces market risk' },
    { key: 'rollout', label: 'Product rollout or first sales', help: 'Reduces production risk' },
  ];
  const BERKUS_SCALE = [
    { value: 0, label: 'None' },
    { value: 0.25, label: 'Early' },
    { value: 0.5, label: 'Partly' },
    { value: 0.75, label: 'Strong' },
    { value: 1, label: 'Proven' },
  ];
  // Berkus's classic ceiling was $500K per factor ($2.5M total) against a ~$2M
  // typical angel pre-money. We keep that ratio: each factor is worth up to
  // 25% of the market baseline, so a perfect score is 1.25x the baseline.
  const BERKUS_MAX_SHARE = 0.25;

  const RISK_FACTORS = [
    { key: 'management', label: 'Management' },
    { key: 'stage', label: 'Stage of the business' },
    { key: 'legislation', label: 'Legislation or political' },
    { key: 'manufacturing', label: 'Manufacturing or supply chain' },
    { key: 'sales', label: 'Sales and marketing' },
    { key: 'funding', label: 'Funding and capital raising' },
    { key: 'competition', label: 'Competition' },
    { key: 'technology', label: 'Technology' },
    { key: 'litigation', label: 'Litigation' },
    { key: 'international', label: 'International' },
    { key: 'reputation', label: 'Reputation' },
    { key: 'exit', label: 'Potential for a lucrative exit' },
  ];
  const RISK_SCALE = [
    { value: -2, label: 'Very high risk' },
    { value: -1, label: 'High' },
    { value: 0, label: 'Normal' },
    { value: 1, label: 'Low' },
    { value: 2, label: 'Very low risk' },
  ];
  // Classic RFS moves the value $250K per point against a ~$2M baseline: 12.5%.
  const RISK_STEP_SHARE = 0.125;

  /* ------------------------------------------------------------------ */
  /* Currencies                                                          */
  /* ------------------------------------------------------------------ */

  // Approximate units per USD, used only to place amounts in USD size bands and
  // to convert the startup baselines. Users can edit the rate in the app.
  const CURRENCIES = [
    { code: 'USD', symbol: '$', perUsd: 1 },
    { code: 'EUR', symbol: '€', perUsd: 0.86 },
    { code: 'GBP', symbol: '£', perUsd: 0.75 },
    { code: 'CAD', symbol: 'CA$', perUsd: 1.38 },
    { code: 'AUD', symbol: 'A$', perUsd: 1.52 },
    { code: 'CHF', symbol: 'CHF ', perUsd: 0.80 },
    { code: 'AED', symbol: 'AED ', perUsd: 3.6725 },
    { code: 'MAD', symbol: 'MAD ', perUsd: 9.2 },
  ];

  const WHY_NOW = [
    { stat: 'About 6 million', text: 'US small and medium businesses face an ownership transition by 2035, worth up to $5 trillion.', source: 'mckinsey' },
    { stat: '60%', text: 'of small business owners have no formal succession plan; 41% would close if they cannot find a buyer.', source: 'zelle' },
    { stat: '2,117', text: 'businesses changed hands on BizBuySell in Q2 2026, 10% fewer than a year earlier, at a median $349,250.', source: 'bbsQ2Summary' },
  ];

  return {
    SOURCES,
    EBITDA_SECTOR,
    SME_INDUSTRIES,
    EBITDA_SIZE_CURVE,
    SME_MARKET,
    SME_DRIVERS,
    SME_DRIVER_LIMITS,
    RATES,
    SIZE_PREMIUM_CURVE,
    GROWTH_CURVE,
    SCALE_CURVE,
    TECH_MODELS,
    SDE_GROWTH_CURVE,
    TECH_MARKET,
    VC_STAGES,
    ROUND_MEDIANS,
    STARTUP_MARKETS,
    SCORECARD_FACTORS,
    SCORECARD_SCALE,
    BERKUS_FACTORS,
    BERKUS_SCALE,
    BERKUS_MAX_SHARE,
    RISK_FACTORS,
    RISK_SCALE,
    RISK_STEP_SHARE,
    CURRENCIES,
    WHY_NOW,
  };
});
