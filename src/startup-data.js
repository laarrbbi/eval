/*
 * Data for the startup model: the fitted outcome model, funding-funnel base rates,
 * success-driver odds ratios, AI comparables and round step-ups. Compiled October 2026.
 * Every figure has a source key (SOURCES below); "assumption" marks judgment calls.
 * See RESEARCH.md, sections 7-9.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.StartupData = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SOURCES = {
    ycDirectory: { name: 'Y Combinator company directory via yc-oss/api (6,153 startups, snapshot 24 Oct 2026)', url: 'https://github.com/yc-oss/api' },
    cartaGrad: { name: 'Carta, what is a good seed to Series A graduation rate', url: 'https://carta.com/data/linkedin-seed-to-series-a-graduation-rates/' },
    gradSummary: { name: 'Carta seed cohorts reaching Series A within 24 months (via Venture Capital Careers, 2026)', url: 'https://venturecapitalcareers.com/blog/seed-to-series-a-graduation-rate' },
    incisive: { name: 'Incisive Ventures, update on venture graduation rates (pre-seed to seed)', url: 'https://incisive.vc/2025/06/10/update-on-venture-graduation-rates/' },
    seriesB: { name: 'Startup fundraising statistics 2026: Series A to B graduation (Stealth Agents)', url: 'https://stealthagents.com/research/startup-fundraising-statistics-2026' },
    roundTiming: { name: 'Carta via SaaStr: time between rounds (seed→A 2.2 years, B→C 2.4 years)', url: 'https://www.saastr.com/carta-the-average-time-from-seed-to-series-a-has-hit-2-2-years-and-longer-from-series-a-to-series-b/' },
    cbFunnel: { name: 'CB Insights, venture capital funnel (2008–2010 US seed cohort)', url: 'https://cbinsights.com/blog/venture-capital-funnel-2' },
    pitchbookSeed: { name: 'PitchBook seed-cohort outcomes, consensus vs other deals, data to Sep 2025 (via 2026 shutdown reports)', url: 'https://hub.causo.ai/guides/startup-shutdowns-and-runway-data-2026' },
    gompers: { name: 'Gompers, Kovner, Lerner & Scharfstein, Performance persistence in entrepreneurship (NBER w12592)', url: 'https://www.nber.org/papers/w12592' },
    aiTiming: { name: 'PitchBook-NVCA Q1 2026: median time to Series A, AI 1.3 vs non-AI 1.8 years (via WaveUp)', url: 'https://waveup.com/blog/series-a-benchmarks/' },
    cartaShutdowns: { name: 'Carta, startup shutdowns (966 in 2024, 3 in 4 at pre-seed or seed)', url: 'https://carta.com/data/newsletter-more-startups-shutdown/' },
    cartaExits: { name: 'Carta, startup exit environment H2 2026 (421 M&A exits in H1 2026)', url: 'https://carta.com/data/startup-exit-environment-h2-2026/' },
    ipoVsMa: { name: 'Fast Company on the Yale study: ~100 VC-backed IPOs vs 1,000+ acquisitions in 2019', url: 'https://www.fastcompany.com/90838548/ipo-market-vc-backed-startups-study-yale-innovation-competition' },
    cartaBench: { name: 'Carta, VC fundraising benchmarks Q2 2026 (median post-money by stage)', url: 'https://carta.com/data/linkedin-vc-fundraising-benchmarks-2026/' },
    devStage: { name: 'Development stage (milestone) approach: rule-of-thumb angel ranges; sources differ (Rho, Eqvista)', url: 'https://www.rho.co/blog/early-stage-startup-valuation-methods' },
    anthropic: { name: 'Value Add VC: Anthropic $965B Series H and $47B run-rate', url: 'https://valueaddvc.com/blog/anthropic-valuation-2026-965b-series-h-and-the-ipo-filing-explained' },
    openai: { name: 'Value Add VC: OpenAI $852B round and revenue run-rate', url: 'https://valueaddvc.com/blog/openai-revenue-2026-20b-arr-4b-month-path-to-profitability' },
    aiTracker: { name: 'Generative AI startups by valuation and revenue, 2026 (newmarketpitch, aifundingtracker, radarkit)', url: 'https://newmarketpitch.com/blogs/news/generative-ai-top-startups-valuation' },
    codingAgents: { name: 'Top AI coding agent startups by valuation, 2026 (Founded CEO, Tech Insider)', url: 'https://foundedceo.substack.com/p/the-top-10-ai-coding-agent-startups' },
    aiInfra: { name: 'AI infrastructure funding 2026 (Crescendo, aifundingtracker)', url: 'https://www.crescendo.ai/news/latest-vc-investment-deals-in-ai-startups' },
    verticalAi: { name: 'Vertical and legal AI funding 2026 (aifundingtracker, radarkit)', url: 'https://aifundingtracker.com/top-legal-ai-startups/' },
    multiplesVc: { name: 'Multiples.vc public comps (Palantir, CoreWeave), Oct 2026', url: 'https://multiples.vc/public-comps/palantir-valuation-multiples' },
    foolAi: { name: 'Motley Fool, AI software stocks (SoundHound ~12x sales), Oct 2026', url: 'https://www.fool.com/investing/2026/10/09/where-palantir-ai-software-stock-crwd-soun-app/' },
    pitchbookAi: { name: 'PitchBook Q1 2026 AI public comp sheet', url: 'https://pitchbook.com/news/reports/q1-2026-ai-public-comp-sheet-and-valuation-guide' },
    windsorInfra: { name: 'Windsor Drake, AI infrastructure valuations Q2 2026', url: 'https://windsordrake.com/market-intelligence/reports/ai-infrastructure-valuations-q2-2026' },
    finro: { name: 'Finro, AI valuation multiples Q1 2026', url: 'https://www.finrofca.com/research/ai-multiples-q1-2026' },
    aventisAi: { name: 'Aventis Advisors, AI valuation multiples 2026', url: 'https://aventis-advisors.com/ai-valuation-multiples/' },
    eqvistaAi: { name: 'Eqvista, AI startup fundraising trends 2026 (revenue multiples by stage)', url: 'https://eqvista.com/ai-startup-fundraising-trends/' },
    aiPremium: { name: 'Carta via Causo: AI valuation premium, 42% at seed and 30% at Series A', url: 'https://hub.causo.ai/guides/ai-startup-valuation-2026' },
    abridge: { name: 'Value Add VC: Abridge $5.3B valuation, $100M+ ARR', url: 'https://valueaddvc.com/blog/abridge-valuation-2026-5-3b-100m-arr-and-how-the-ai-scribe-beat-nuance-and-ambience' },
    ambience: { name: 'Ambience Healthcare $1.25B Series C, ~$30M ARR (2025 estimate)', url: 'https://medium.com/@Connected_Dots/ambience-and-harvey-valuations-an-openai-ipo-proxy-strategy-and-did-microsoft-screw-abridge-b056cb7acf20' },
    equidamMethods: { name: 'Equidam, the five startup valuation methods and how to weight them', url: 'https://www.equidam.com/five-startup-valuation-methods/' },
    equidamChecklist: { name: 'Equidam, checklist method (US maximum $17M)', url: 'https://www.equidam.com/checklist-valuation-method/' },
    equidamVc: { name: 'Equidam, required returns of the VC method', url: 'https://www.equidam.com/resources/equidam-vc-method-paper.pdf' },
    equidamDcf: { name: 'Equidam, DCF methods, survival rates and illiquidity', url: 'https://support.equidam.com/en/articles/2064097-dcf-methods' },
    damodaranEbitda: { name: 'Damodaran EV/EBITDA by industry, US, Jan 2026 (via secondary tables)', url: 'https://www.calcmastery.com/benchmarks/ev-ebitda-by-industry/' },
    cloudedJudgement: { name: 'Clouded Judgement 10.16.26: public cloud EV / NTM revenue', url: 'https://cloudedjudgement.substack.com/p/clouded-judgement-101626-the-diffusion' },
    aiExits2026: { name: 'Biggest AI startup exits of 2026 (Tech Startups)', url: 'https://techstartups.com/2026/10/14/the-biggest-ai-startup-exits-of-2026-how-nvidia-meta-google-and-openai-are-buying-the-future-of-ai/' },
    windsorAi: { name: 'Windsor Drake, AI software valuations Q1 2026', url: 'https://windsordrake.com/market-intelligence/reports/ai-software-valuations-q1-2026' },
    dlomStudies: { name: 'Restricted-stock studies on marketability discounts (Sofer Advisors)', url: 'https://soferadvisors.com/insights/blog/dlom-and-restricted-stock-studies-sizing-the-discount/' },
    segPublic: { name: 'Software Equity Group 2Q26: public SaaS index 3.2x', url: 'https://sandhill.com/wp-content/uploads/2026/08/SEG-Research-2Q26-SaaS-MA-and-Public-Market-Report.pdf' },
  };

  /* ------------------------------------------------------------------ */
  /* 1. Outcome model fitted on Y Combinator startups                    */
  /* ------------------------------------------------------------------ */

  // Fitted by scripts/fit_outcome_model.py on the YC directory (see RESEARCH.md, section 7).
  const OUTCOME_MODEL = {
    asOf: '2026-10-24',
    n: 6153,
    statusCounts: {"Active": 4190, "Inactive": 1101, "Acquired": 839, "Public": 23},
    batches: '2005-2026',
    lnAgeMean: 1.457286,
    features: ["const", "ln_age", "ln_age2", "ai", "consumer", "healthcare", "fintech", "industrials", "other_industry", "us", "hardware", "biotech", "saas"],
    coef: {
      Acquired: [-2.22046, 1.76546, 0.04555, -0.35288, -0.21035, -0.84489, -0.33448, -0.70367, -0.51481, 0.62202, -0.7481, -0.84128, 0.07167],
      Public: [-7.23488, 2.31496, 0.65782, -0.80824, -0.26512, 0.47554, 0.02538, 1.04501, -0.27194, 0.77675, -0.79899, 0.54842, -0.66299],
      Inactive: [-1.51054, 1.54173, -0.02853, -0.45677, 0.41963, -0.56827, -0.52283, -0.51432, -0.42637, 0.21027, -0.1248, -0.58271, -0.39911],
    },
    oddsRatios: {
      ln_age: {"Acquired": [5.844, 0.0], "Public": [10.125, 0.0], "Inactive": [4.673, 0.0]},
      ln_age2: {"Acquired": [1.047, 0.568], "Public": [1.931, 0.0505], "Inactive": [0.972, 0.6744]},
      ai: {"Acquired": [0.703, 0.0011], "Public": [0.446, 0.1959], "Inactive": [0.633, 0.0]},
      consumer: {"Acquired": [0.81, 0.0918], "Public": [0.767, 0.6035], "Inactive": [1.521, 0.0001]},
      healthcare: {"Acquired": [0.43, 0.0], "Public": [1.609, 0.3666], "Inactive": [0.567, 0.0]},
      fintech: {"Acquired": [0.716, 0.0176], "Public": [1.026, 0.9673], "Inactive": [0.593, 0.0001]},
      industrials: {"Acquired": [0.495, 0.0011], "Public": [2.843, 0.0661], "Inactive": [0.598, 0.0042]},
      other_industry: {"Acquired": [0.598, 0.0036], "Public": [0.762, 0.6925], "Inactive": [0.653, 0.0085]},
      us: {"Acquired": [1.863, 0.0], "Public": [2.174, 0.1553], "Inactive": [1.234, 0.0161]},
      hardware: {"Acquired": [0.473, 0.0045], "Public": [0.45, 0.2958], "Inactive": [0.883, 0.5064]},
      biotech: {"Acquired": [0.431, 0.0227], "Public": [1.731, 0.4277], "Inactive": [0.558, 0.0398]},
      saas: {"Acquired": [1.074, 0.5023], "Public": [0.515, 0.297], "Inactive": [0.671, 0.0002]},
    },
    holdout: { nTest: 1224, mcfaddenR2: 0.211, auc: {"Active": 0.836, "Acquired": 0.825, "Public": 0.823, "Inactive": 0.752} },
    calibration: [
      {"age_band": "[0, 2)", "n": 1240, "pred_Active": 0.968, "pred_Acquired": 0.012, "pred_Public": 0.0, "pred_Inactive": 0.02, "obs_Active": 0.972, "obs_Acquired": 0.012, "obs_Public": 0.0, "obs_Inactive": 0.016},
      {"age_band": "[2, 5)", "n": 1715, "pred_Active": 0.822, "pred_Acquired": 0.073, "pred_Public": 0.001, "pred_Inactive": 0.105, "obs_Active": 0.815, "obs_Acquired": 0.076, "obs_Public": 0.0, "obs_Inactive": 0.109},
      {"age_band": "[5, 10)", "n": 2050, "pred_Active": 0.606, "pred_Acquired": 0.164, "pred_Public": 0.003, "pred_Inactive": 0.227, "obs_Active": 0.608, "obs_Acquired": 0.162, "obs_Public": 0.002, "obs_Inactive": 0.228},
      {"age_band": "[10, 22)", "n": 1148, "pred_Active": 0.295, "pred_Acquired": 0.316, "pred_Public": 0.014, "pred_Inactive": 0.376, "obs_Active": 0.297, "obs_Acquired": 0.314, "obs_Public": 0.017, "obs_Inactive": 0.372},
    ],
  };

  /* ------------------------------------------------------------------ */
  /* 2. Funding funnel: odds of raising the next round                   */
  /* ------------------------------------------------------------------ */

  // p24 = share raising the next priced round within 24 months (recent cohorts);
  // eventual = share that ever raise it; years = median time to the next round.
  const STAGES = [
    { key: 'preseed', label: 'Pre-seed', next: 'Seed', p24: 0.40, eventual: 0.50, years: 1.5, source: 'incisive',
      basis: 'About 45–55% of pre-seed companies reach a seed round, ~18 months later on average.' },
    { key: 'seed', label: 'Seed', next: 'Series A', p24: 0.16, eventual: 0.30, years: 2.1, source: 'gradSummary',
      basis: '14–17% of recent Carta seed cohorts reach Series A within 24 months (about 30% in 2018–2020); median gap 616–774 days.' },
    { key: 'seriesA', label: 'Series A', next: 'Series B', p24: 0.18, eventual: 0.45, years: 2.3, source: 'seriesB',
      basis: '9% (2022 cohort) to 25% (2018 cohort) reach Series B within two years; 40–50% eventually; median gap ~844 days.' },
    { key: 'seriesB', label: 'Series B', next: 'Series C', p24: 0.22, eventual: 0.55, years: 2.4, source: 'roundTiming',
      basis: 'Median B→C gap 2.4 years (Carta, end 2024); later-stage graduation runs above 50%.' },
    { key: 'seriesC', label: 'Series C or later', next: 'a later round or exit', p24: 0.25, eventual: 0.60, years: 2.4, source: 'cbFunnel',
      basis: 'Assumption: about 6 in 10 late-stage companies raise again or exit.' },
  ];

  // Classic seed-cohort funnel for reference.
  const CB_FUNNEL = { cohort: '1,100+ US seed-funded tech companies, 2008–2010', secondRound: 0.48, fourthRound: 0.15, exited: 0.30, deadOrSelfSustaining: 0.67, unicorn: 0.009 };

  // Odds ratios on the chance of raising the next round.
  const NEXT_ROUND_FACTORS = {
    investors: {
      top: { label: 'Top accelerator or top-tier VC', or: 1.8, basis: 'PitchBook: 53% of consensus seed deals reached Series A vs 28% of others (odds ratio 2.9 vs others, ~1.8 vs the average).' },
      vc: { label: 'Other institutional VC', or: 1.0, basis: 'Reference group (Carta averages).' },
      angels: { label: 'Angels or friends and family', or: 0.6, basis: 'Assumption.' },
      none: { label: 'No outside investors yet', or: 0.45, basis: 'Assumption.' },
    },
    founder: {
      exit: { label: 'Has led a startup to a successful exit', or: 1.5, basis: 'Gompers et al.: 30% vs 18% success for founders with a prior success.' },
      first: { label: 'First-time founders', or: 1.0, basis: 'Reference group.' },
      failed: { label: 'Last startup failed', or: 0.85, basis: 'Gompers & Mukharlyamov: prior failures do worse than first-timers (size assumed).' },
    },
    traction: {
      none: { label: 'Nothing to show yet', or: 0.5 },
      early: { label: 'Early signals (pilots, waitlist, LOIs)', or: 0.8 },
      onTrack: { label: 'On track for the next round', or: 1.0 },
      strong: { label: 'Ahead of the bar for the next round', or: 1.6 },
      exceptional: { label: 'Top-decile growth', or: 2.5 },
    },
    runway: [ { below: 6, or: 0.6 }, { below: 12, or: 0.85 }, { below: 24, or: 1.0 }, { below: Infinity, or: 1.1 } ],
    // AI startups reach Series A faster: 1.3 vs 1.8 years (PitchBook-NVCA Q1 2026). Used as a hazard ratio.
    aiHazardRatio: 1.8 / 1.3,
  };

  // Multipliers on the odds of each long-run outcome (vs still private), relative to the
  // YC-backed baseline the model was fitted on. Mostly assumptions anchored on the sources named.
  const OUTCOME_FACTORS = {
    investors: {
      top: { Acquired: 1, Public: 1, Inactive: 1 },
      vc: { Acquired: 0.85, Public: 0.7, Inactive: 1.5 },       // PitchBook: 39.4% vs 29.5% out of business, others vs consensus
      angels: { Acquired: 0.6, Public: 0.4, Inactive: 1.8 },
      none: { Acquired: 0.5, Public: 0.25, Inactive: 1.6 },
    },
    founder: {
      exit: { Acquired: 1.4, Public: 1.95, Inactive: 0.8 },     // Gompers et al.: odds ratio ~1.95 on IPO-type success
      first: { Acquired: 1, Public: 1, Inactive: 1 },
      failed: { Acquired: 0.9, Public: 0.8, Inactive: 1.15 },
    },
    // Later-stage companies fail less and list more (assumption, consistent with rising graduation rates).
    stage: {
      preseed: { Acquired: 0.9, Public: 0.8, Inactive: 1.2 },
      seed: { Acquired: 1, Public: 1, Inactive: 1 },
      seriesA: { Acquired: 1.2, Public: 1.5, Inactive: 0.8 },
      seriesB: { Acquired: 1.4, Public: 2.5, Inactive: 0.65 },
      seriesC: { Acquired: 1.5, Public: 4.0, Inactive: 0.5 },
    },
    runway: [ { below: 6, Inactive: 1.8 }, { below: 12, Inactive: 1.2 }, { below: 24, Inactive: 1.0 }, { below: Infinity, Inactive: 0.85 } ],
  };

  // Median valuation step-up to the next round, from Carta Q2 2026 medians:
  // seed pre $19.4M / pre-seed cap $10M; Series A pre $61.6M / seed post $23.9M;
  // Series B pre ~$133M (assumes ~20% dilution on $166.2M post) / Series A post $76.3M.
  const STEP_UPS = { preseed: 1.94, seed: 2.58, seriesA: 1.74, seriesB: 1.5, seriesC: 1.3 };

  // Median pre-money (USD) by stage, Carta Q2 2026; Series B derived as above.
  const US_STAGE_PREMONEY = { preseed: 10000000, seed: 19400000, seriesA: 61600000, seriesB: 133000000, seriesC: 200000000 };

  /* ------------------------------------------------------------------ */
  /* 3. Development stage method                                         */
  /* ------------------------------------------------------------------ */

  // Milestone ladder tied to the market's own round medians: each rung is a range of the
  // median pre-money for the round companies at that milestone usually raise
  // (pre-seed for idea to prototype, seed for early customers, Series A for revenue growth).
  // Rule-of-thumb ranges; published versions of this method differ.
  const DEV_STAGES = [
    { key: 1, label: 'Idea or business plan', anchor: 'preseed', ladder: [0.25, 0.5] },
    { key: 2, label: 'Strong team in place to execute', anchor: 'preseed', ladder: [0.5, 0.8] },
    { key: 3, label: 'Final product or working prototype', anchor: 'preseed', ladder: [0.8, 1.2] },
    { key: 4, label: 'Partners or early customers', anchor: 'seed', ladder: [0.8, 1.2] },
    { key: 5, label: 'Revenue growth and a clear path to profit', anchor: 'seriesA', ladder: [0.5, 1.0] },
  ];

  /* ------------------------------------------------------------------ */
  /* 4. AI comparables                                                   */
  /* ------------------------------------------------------------------ */

  const AI_SEGMENTS = [
    { key: 'foundation', label: 'Foundation models and LLM labs' },
    { key: 'infra', label: 'AI infrastructure, compute and data platforms' },
    { key: 'coding', label: 'AI coding and developer tools' },
    { key: 'agents', label: 'AI agents and enterprise AI apps' },
    { key: 'vertical', label: 'Vertical AI (legal, health, finance)' },
    { key: 'consumer', label: 'Consumer, voice and media AI' },
  ];

  // Private AI companies: latest reported valuation and revenue run-rate (USD).
  // confidence: medium = valuation and revenue reported within a few months of each other;
  // low = conflicting reports or dates far apart. Mostly secondary sources; check before citing.
  const AI_COMPS = [
    { company: 'Anthropic', segment: 'foundation', valuation: 965e9, revenue: 47e9, date: 'May 2026', confidence: 'medium', source: 'anthropic' },
    { company: 'OpenAI', segment: 'foundation', valuation: 852e9, revenue: 40e9, date: 'Mar–Aug 2026', confidence: 'medium', source: 'openai' },
    { company: 'Mistral AI', segment: 'foundation', valuation: 24.4e9, revenue: 0.4e9, date: 'early–Sep 2026', confidence: 'low', source: 'aiTracker' },
    { company: 'Databricks', segment: 'infra', valuation: 190e9, revenue: 7e9, date: 'Aug 2026', confidence: 'medium', source: 'aiInfra' },
    { company: 'Modal Labs', segment: 'infra', valuation: 15.75e9, revenue: 1e9, date: '2026', confidence: 'medium', source: 'aiInfra' },
    { company: 'Cursor (Anysphere)', segment: 'coding', valuation: 60e9, revenue: 4e9, date: 'Jun–Aug 2026', confidence: 'low', source: 'codingAgents', note: 'Reported SpaceX deal value' },
    { company: 'Cognition', segment: 'coding', valuation: 26e9, revenue: 0.492e9, date: 'May 2026', confidence: 'medium', source: 'codingAgents' },
    { company: 'Replit', segment: 'coding', valuation: 9e9, revenue: 0.525e9, date: 'Mar–Apr 2026', confidence: 'medium', source: 'codingAgents' },
    { company: 'Lovable', segment: 'coding', valuation: 13.3e9, revenue: 0.5e9, date: '2026', confidence: 'low', source: 'codingAgents' },
    { company: 'Glean', segment: 'agents', valuation: 7.2e9, revenue: 0.3e9, date: 'Feb 2026', confidence: 'medium', source: 'aiTracker' },
    { company: 'Sierra', segment: 'agents', valuation: 15.8e9, revenue: 0.15e9, date: 'Feb–May 2026', confidence: 'low', source: 'verticalAi' },
    { company: 'Harvey', segment: 'vertical', valuation: 11e9, revenue: 0.3e9, date: 'Mar–Jun 2026', confidence: 'medium', source: 'verticalAi' },
    { company: 'OpenEvidence', segment: 'vertical', valuation: 12e9, revenue: 0.1e9, date: 'Jan 2026', confidence: 'low', source: 'verticalAi' },
    { company: 'Abridge', segment: 'vertical', valuation: 5.3e9, revenue: 0.117e9, date: 'Apr 2026 / 2025 ARR', confidence: 'low', source: 'abridge' },
    { company: 'Ambience Healthcare', segment: 'vertical', valuation: 1.25e9, revenue: 0.03e9, date: '2025', confidence: 'low', source: 'ambience' },
    { company: 'ElevenLabs', segment: 'consumer', valuation: 11e9, revenue: 0.5e9, date: 'early 2026', confidence: 'medium', source: 'aiTracker' },
    { company: 'Perplexity', segment: 'consumer', valuation: 32.5e9, revenue: 0.75e9, date: '2026 estimates', confidence: 'low', source: 'aiTracker' },
  ];

  const PUBLIC_AI_COMPS = [
    { company: 'Palantir (PLTR)', multiple: 61.7, basis: 'EV / LTM revenue, late Oct 2026', source: 'multiplesVc' },
    { company: 'SoundHound AI (SOUN)', multiple: 12, basis: 'Price / sales, Oct 2026', source: 'foolAi' },
    { company: 'Snowflake (SNOW)', multiple: 11.3, basis: 'EV / revenue, Q1 2026 (10.3–12.3x)', source: 'pitchbookAi' },
    { company: 'Public data-infrastructure benchmark', multiple: 11, basis: 'EV / revenue, Q2 2026', source: 'windsorInfra' },
    { company: 'CoreWeave (CRWV)', multiple: 7.9, basis: 'EV / LTM revenue, Oct 2026 (EV figure needs checking)', source: 'multiplesVc' },
    { company: 'Public SaaS index median', multiple: 3.2, basis: 'EV / revenue, 2Q26', source: 'segPublic' },
  ];

  const AI_AGGREGATES = [
    { label: 'LLM vendors, median EV / revenue (27 companies, Q1 2026)', value: '39.5x', source: 'finro' },
    { label: 'AI infrastructure, median EV / revenue (116 companies, Q1 2026)', value: '21.2x', source: 'finro' },
    { label: 'AI data intelligence, median EV / revenue (Q1 2026)', value: '14.3x', source: 'finro' },
    { label: 'AI funding rounds, median revenue multiple', value: '25–30x', source: 'aventisAi' },
  ];

  // Comps are market leaders with $100M+ revenue growing ~100%+. A smaller company gets
  // a scale discount and a growth adjustment (assumptions, shown in the method detail).
  const AI_COMP_ADJUST = {
    scale: [[500000, 0.5], [2000000, 0.6], [10000000, 0.75], [50000000, 0.9], [250000000, 1.0]],
    referenceGrowth: 1.0, // 100% a year
    growthBounds: [0.5, 1.4],
    exitCap: 20,
    // Upper end of AI funding-round revenue multiples by stage (Eqvista 2026: seed 10-25x,
    // Series A 15-30x, Series B+ 25-50x). The comps method never goes above these.
    stageCap: { preseed: 25, seed: 25, seriesA: 30, seriesB: 50, seriesC: 50 },
    stageRange: { seed: [10, 25], seriesA: [15, 30], seriesB: [25, 50] },
  };


  /* ------------------------------------------------------------------ */
  /* 5. Questionnaire: multiple-choice answers that drive the scoring    */
  /*    methods (scorecard, checklist, Berkus, risk factor summation)    */
  /* ------------------------------------------------------------------ */

  // Each option carries a score in [0, 1] (higher is better for an investor) or, for
  // risk questions, a risk-factor-summation point in [-2, +2].
  const QUESTIONS = {
    team: [
      { key: 'founders', label: 'How many founders work on the company?', options: [
        { value: 'one', label: 'One founder', score: 0.4 }, { value: 'two', label: 'Two', score: 0.8 }, { value: 'three', label: 'Three or more', score: 1 }] , default: 'two' },
      { key: 'fulltime', label: 'Are the founders full-time?', options: [
        { value: 'all', label: 'All full-time', score: 1 }, { value: 'some', label: 'Some of them', score: 0.6 }, { value: 'none', label: 'Not yet', score: 0.2 }], default: 'all' },
      { key: 'experience', label: 'Founders’ years of experience in this industry', options: [
        { value: 'lt2', label: 'Under 2', score: 0.2 }, { value: '2to5', label: '2 to 5', score: 0.5 }, { value: '5to10', label: '5 to 10', score: 0.8 }, { value: 'gt10', label: 'Over 10', score: 1 }], default: '5to10' },
      { key: 'technical', label: 'Is there a technical co-founder or CTO?', options: [
        { value: 'yes', label: 'Yes, in the founding team', score: 1 }, { value: 'hire', label: 'Hired, not a founder', score: 0.6 }, { value: 'outsourced', label: 'Outsourced', score: 0.25 }, { value: 'no', label: 'No', score: 0.1 }], default: 'yes' },
      { key: 'roles', label: 'Are the key roles filled (product, engineering, sales)?', options: [
        { value: 'all', label: 'All of them', score: 1 }, { value: 'most', label: 'Most', score: 0.7 }, { value: 'few', label: 'Few', score: 0.3 }], default: 'most' },
    ],
    product: [
      { key: 'stage', label: 'Where is the product today?', options: [
        { value: 'idea', label: 'Idea or concept', score: 0.1 }, { value: 'prototype', label: 'Working prototype', score: 0.35 }, { value: 'mvp', label: 'MVP with first users', score: 0.55 },
        { value: 'paying', label: 'Launched, paying customers', score: 0.8 }, { value: 'scaling', label: 'Scaling with repeatable sales', score: 1 }], default: 'paying' },
      { key: 'ip', label: 'How is the technology protected?', options: [
        { value: 'none', label: 'Nothing specific', score: 0.1 }, { value: 'secret', label: 'Proprietary data or trade secrets', score: 0.55 }, { value: 'pending', label: 'Patents filed', score: 0.7 }, { value: 'granted', label: 'Patents granted', score: 1 }], default: 'secret' },
      { key: 'techRisk', label: 'How much technical risk is left?', risk: 'technology', options: [
        { value: 'proven', label: 'Technology proven in use', point: 1 }, { value: 'some', label: 'Some R&D left', point: 0 }, { value: 'heavy', label: 'Heavy R&D ahead', point: -1 }, { value: 'science', label: 'Unproven science', point: -2 }], default: 'some' },
      { key: 'regulation', label: 'How exposed are you to regulation?', risk: 'legislation', options: [
        { value: 'none', label: 'Barely', point: 1 }, { value: 'some', label: 'Some rules apply', point: 0 }, { value: 'licence', label: 'Licences or approvals needed', point: -1 }, { value: 'unclear', label: 'Rules unclear or changing', point: -2 }], default: 'some' },
      { key: 'supply', label: 'How much do you depend on manufacturing or suppliers?', risk: 'manufacturing', options: [
        { value: 'none', label: 'Not at all (software)', point: 1 }, { value: 'some', label: 'Some suppliers matter', point: 0 }, { value: 'heavy', label: 'Heavily', point: -1 }], default: 'none' },
      { key: 'legal', label: 'Any legal disputes or open IP claims?', risk: 'litigation', options: [
        { value: 'clean', label: 'None, IP assigned to the company', point: 1 }, { value: 'minor', label: 'Minor', point: 0 }, { value: 'open', label: 'Open disputes', point: -2 }], default: 'clean' },
    ],
    market: [
      { key: 'tam', label: 'How big is the target market?', options: [
        { value: 's', label: 'Under $100M', score: 0.2 }, { value: 'm', label: '$100M to $1B', score: 0.5 }, { value: 'l', label: '$1B to $10B', score: 0.8 }, { value: 'xl', label: 'Over $10B', score: 1 }], default: 'xl' },
      { key: 'competition', label: 'What does the competition look like?', options: [
        { value: 'few', label: 'Few, small competitors', score: 0.8 }, { value: 'none', label: 'No direct competitor yet', score: 0.65 }, { value: 'incumbents', label: 'Strong incumbents', score: 0.4 }, { value: 'crowded', label: 'Crowded market', score: 0.2 }], default: 'crowded' },
      { key: 'moat', label: 'What sets you apart?', options: [
        { value: 'little', label: 'Not much yet', score: 0.2 }, { value: 'product', label: 'A better product', score: 0.5 }, { value: 'tech', label: 'Technology or data advantage', score: 0.8 }, { value: 'network', label: 'Network effects or strong lock-in', score: 1 }], default: 'tech' },
      { key: 'partners', label: 'Strategic partners?', options: [
        { value: 'none', label: 'None', score: 0 }, { value: 'talks', label: 'In talks', score: 0.25 }, { value: 'pilots', label: 'Pilots or letters of intent', score: 0.5 }, { value: 'signed', label: 'Signed with major players', score: 1 }], default: 'talks' },
      { key: 'gtm', label: 'How do you sell?', options: [
        { value: 'untested', label: 'Channels not tested yet', score: 0.2 }, { value: 'first', label: 'One channel working', score: 0.5 }, { value: 'repeatable', label: 'A repeatable channel', score: 0.8 }, { value: 'several', label: 'Several scalable channels', score: 1 }], default: 'repeatable' },
      { key: 'international', label: 'Where do you operate?', risk: 'international', options: [
        { value: 'home', label: 'One country', point: 1 }, { value: 'some', label: 'A few countries', point: 0 }, { value: 'many', label: 'Many countries already', point: -1 }], default: 'some' },
      { key: 'reputation', label: 'Reputation and references', risk: 'reputation', options: [
        { value: 'strong', label: 'Strong references or press', point: 1 }, { value: 'neutral', label: 'Little known yet', point: 0 }, { value: 'issues', label: 'Some issues', point: -2 }], default: 'neutral' },
      { key: 'exit', label: 'Who could buy the company one day?', risk: 'exit', options: [
        { value: 'many', label: 'Many strategic buyers, IPO possible', point: 2 }, { value: 'several', label: 'Several strategic buyers', point: 1 }, { value: 'few', label: 'Few obvious buyers', point: -1 }], default: 'several' },
      { key: 'funding', label: 'How much more capital do you need to reach profit?', options: [
        { value: 'none', label: 'This round gets us there', score: 1 }, { value: 'one', label: 'One more round', score: 0.6 }, { value: 'several', label: 'Several rounds', score: 0.35 }, { value: 'heavy', label: 'A lot (capital-intensive)', score: 0.1 }], default: 'several' },
    ],
  };

  /* ------------------------------------------------------------------ */
  /* 6. Equidam-style methods                                            */
  /* ------------------------------------------------------------------ */

  const EQUIDAM = {
    // Default method weights by stage (Equidam 2024-26 reports).
    weights: {
      idea: { scorecard: 0.38, checklist: 0.38, vcEquidam: 0.16, dcfLtg: 0.04, dcfMultiple: 0.04 },
      development: { scorecard: 0.30, checklist: 0.30, vcEquidam: 0.16, dcfLtg: 0.12, dcfMultiple: 0.12 },
      startup: { scorecard: 0.15, checklist: 0.15, vcEquidam: 0.16, dcfLtg: 0.27, dcfMultiple: 0.27 },
      expansion: { scorecard: 0.06, checklist: 0.06, vcEquidam: 0.16, dcfLtg: 0.36, dcfMultiple: 0.36 },
      growth: { scorecard: 0, checklist: 0, vcEquidam: 0.20, dcfLtg: 0.40, dcfMultiple: 0.40 },
    },
    stageLabels: { idea: 'Idea', development: 'Development', startup: 'Startup', expansion: 'Expansion', growth: 'Growth' },
    // Scorecard: six criteria (Equidam methodology).
    scorecardWeights: { team: 0.30, opportunity: 0.25, product: 0.15, competition: 0.10, relationships: 0.10, funding: 0.10 },
    // Checklist: five criteria against a regional maximum; US maximum $17M (Equidam, 2026 cycle).
    checklistWeights: { team: 0.30, idea: 0.20, product: 0.15, relationships: 0.15, operatingStage: 0.20 },
    checklistMaxUsd: 17000000,
    checklistMaxRatioToSeed: 17000000 / 19400000,
    // VC method: required multiple = fund target / (success rate x retention).
    fundTarget: 5,
    // Generic survival by company age (years 1-10), shaped on Equidam's sample reports (~80% year 1, ~42% year 10).
    survival: [0.80, 0.70, 0.62, 0.57, 0.53, 0.50, 0.48, 0.46, 0.44, 0.42],
    longTermGrowthCap: 0.025,
    // Illiquidity discount on the DCFs: base less 4 points per log unit of revenue ($M),
    // smaller when profitable (Damodaran's restricted-stock regression, simplified).
    illiquidity: { lossMaking: 0.30, profitable: 0.25, perLnRevenue: 0.04 },
    illiquidityBounds: [0.10, 0.40],
    riskFree: 0.052,          // 10-year Treasury, Oct 2026
    equityRiskPremium: 0.05,  // Kroll
  };

  // Cost-of-equity beta and exit EV/EBITDA by business model (Damodaran, US, Jan 2026 where available).
  const MODEL_FINANCE = {
    saas: { beta: 1.2, exitEbitda: 24.48, basis: 'Damodaran: software (system and application)' },
    marketplace: { beta: 1.2, exitEbitda: 19.73, basis: 'Damodaran: US total market (no industry figure found)' },
    fintech: { beta: 1.2, exitEbitda: 19.73, basis: 'Damodaran: US total market (no industry figure found)' },
    consumer: { beta: 1.15, exitEbitda: 19.73, basis: 'Damodaran: US total market (no industry figure found)' },
    hardware: { beta: 1.3, exitEbitda: 19.99, basis: 'Damodaran: electronics (general)' },
    ecommerce: { beta: 1.1, exitEbitda: 19.73, basis: 'Damodaran: US total market (no industry figure found)' },
    services: { beta: 1.0, exitEbitda: 19.73, basis: 'Damodaran: US total market (no industry figure found)' },
    biotech: { beta: 1.3, exitEbitda: 15.78, basis: 'Damodaran: biotechnology' },
    ai: { beta: 1.3, exitEbitda: 24.48, basis: 'Damodaran: software (system and application)' },
  };

  /* ------------------------------------------------------------------ */
  /* 7. Investment-banking comps                                         */
  /* ------------------------------------------------------------------ */

  const IB = {
    // Public cloud software, EV / next-12-months revenue, Clouded Judgement 16 Oct 2026.
    trading: { overall: 4.5, low: 3.7, mid: 7.3, high: 18.7, top5: 34.5, asOf: '16 Oct 2026' },
    // Growth (next 12 months, %) to multiple: low-growth below ~10%, mid ~20%, high above ~35%.
    tradingCurve: [[10, 3.7], [20, 7.3], [35, 18.7]],
    // Precedent acquisitions, EV / run-rate revenue at announcement (include a control premium).
    precedents: [
      { deal: 'SpaceX – Cursor (Anysphere)', year: 2026, ev: 60e9, revenue: 4e9, note: 'reported; status unclear' },
      { deal: 'Google – Wiz', year: 2025, ev: 32e9, revenue: 1e9, note: 'cloud security' },
      { deal: 'Google – Windsurf (licence and team)', year: 2025, ev: 2.4e9, revenue: 0.082e9, note: 'low-reliability revenue figure' },
      { deal: 'IBM – Confluent', year: 2026, ev: 12.65e9, revenue: 12.65e9 / 9.6, note: 'data infrastructure' },
      { deal: 'Salesforce – Informatica', year: 2025, ev: 8e9, revenue: 1.6e9, note: 'revenue approximate' },
    ],
    precedentBenchmarks: [
      { label: 'LLM and generative AI assets, M&A (Q1 2026)', value: '12–20x revenue' },
      { label: 'Enterprise AI applications, M&A (Q1 2026)', value: '3–6x revenue' },
      { label: 'Private SaaS M&A median (2Q26)', value: '4.0x revenue' },
    ],
    // Private SaaS M&A distribution (SEG 2Q26: median 4.0x, average 6.2x, 62.5% below 4.0x).
    saasMa: { q25: 2.5, q50: 4.0, q75: 6.2 },
    // Listed comps are $1B+ companies; smaller private companies carry more risk (assumption,
    // in the spirit of size premiums), applied on next-12-months revenue in USD.
    sizeAdjust: [[1e6, 0.7], [1e7, 0.8], [1e8, 0.9], [1e9, 1.0]],
    dlom: 0.30,            // restricted-stock studies: 20-35%
    controlPremium: 0.308, // FactSet/BVR US median, Q2 2025 (secondary)
  };

  /* ------------------------------------------------------------------ */
  /* 8. Final valuation: four groups, weighted by stage                  */
  /* ------------------------------------------------------------------ */

  // Equidam's schedule moved into four groups, with a market (comps) group carved out
  // the way a banker would. DCFs of founder plans get less weight than in Equidam,
  // because they price the plan rather than what investors pay today.
  const PILLAR_WEIGHTS = {
    idea: { qualitative: 0.60, market: 0.15, intrinsic: 0.05, investor: 0.20 },
    development: { qualitative: 0.45, market: 0.25, intrinsic: 0.10, investor: 0.20 },
    startup: { qualitative: 0.25, market: 0.30, intrinsic: 0.20, investor: 0.25 },
    expansion: { qualitative: 0.10, market: 0.35, intrinsic: 0.30, investor: 0.25 },
    growth: { qualitative: 0, market: 0.40, intrinsic: 0.35, investor: 0.25 },
  };
  const PILLARS = [
    { key: 'qualitative', label: 'Scoring methods', methods: { scorecard: 1, checklist: 1, berkus: 0.5, risk: 1, devStage: 0.5 } },
    { key: 'market', label: 'Market comps', methods: { trading: 1, precedents: 1, privateRounds: 1, lastRound: 1 } },
    { key: 'intrinsic', label: 'Cash-flow methods', methods: { dcfLtg: 1, dcfMultiple: 1 } },
    { key: 'investor', label: 'Investor-return methods', methods: { vc: 1, vcEquidam: 1, scenario: 1.5 } },
  ];

  // Scenario model (PWERM) defaults. The discount rate is below VC target returns because
  // failure is already in the probabilities; it falls as the company matures.
  const SCENARIO = {
    discountRate: { preseed: 0.30, seed: 0.25, seriesA: 0.22, seriesB: 0.20, seriesC: 0.18 },
    strategicShare: 0.35, smallSaleShare: 0.2, privateShare: 0.2,
  };

  return {
    SOURCES,
    OUTCOME_MODEL,
    STAGES,
    CB_FUNNEL,
    NEXT_ROUND_FACTORS,
    OUTCOME_FACTORS,
    STEP_UPS,
    US_STAGE_PREMONEY,
    DEV_STAGES,
    AI_SEGMENTS,
    AI_COMPS,
    PUBLIC_AI_COMPS,
    AI_AGGREGATES,
    AI_COMP_ADJUST,
    QUESTIONS,
    EQUIDAM,
    MODEL_FINANCE,
    IB,
    PILLAR_WEIGHTS,
    PILLARS,
    SCENARIO,
  };
});
