'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const D = require('../src/startup-data.js');
const S = require('../src/startup-model.js');

const close = (a, b, tol = 1e-6) => assert.ok(Math.abs(a - b) <= tol * Math.max(1, Math.abs(b)), `${a} != ${b}`);
const sum = (o) => Object.values(o).reduce((s, v) => s + v, 0);

const profile = { industry: 'B2B', model: 'saas', ai: false, us: true };

test('outcome model: shares sum to one and companies leave "active" as they age', () => {
  const young = S.outcomeAt(1, profile);
  const old = S.outcomeAt(12, profile);
  close(sum(young), 1);
  close(sum(old), 1);
  assert.ok(old.Active < young.Active);
  assert.ok(old.Acquired > young.Acquired && old.Inactive > young.Inactive);
});

test('outcome model: fitted coefficients reproduce the calibration table it was checked against', () => {
  // The last calibration band (10-22 years) observed 31.4% acquired; a typical old US B2B company should be in that range.
  const p = S.outcomeAt(12, profile);
  assert.ok(p.Acquired > 0.25 && p.Acquired < 0.5, `acquired ${p.Acquired}`);
  assert.ok(D.OUTCOME_MODEL.holdout.auc.Acquired > 0.75);
});

test('long-run outcomes: conditional probabilities sum to one and respond to drivers', () => {
  const base = { age: 2, horizon: 7, profile, stage: 'seed', traction: 'onTrack' };
  const top = S.longRunOutcomes({ ...base, investors: 'top' });
  const angels = S.longRunOutcomes({ ...base, investors: 'angels' });
  close(sum(top.probs), 1);
  close(sum(angels.probs), 1);
  assert.ok(angels.probs.Inactive > top.probs.Inactive);
  assert.ok(angels.probs.Public < top.probs.Public);
  const longer = S.longRunOutcomes({ ...base, investors: 'top', horizon: 12 });
  assert.ok(longer.probs.Acquired > top.probs.Acquired);
});

test('next round: reference profile returns the stage base rates', () => {
  const r = S.nextRound({ stage: 'seed', investors: 'vc', founder: 'first', traction: 'onTrack' });
  close(r.p24, 0.16);
  close(r.eventual, 0.30);
  assert.equal(r.next, 'Series A');
});

test('next round: AI speeds up rounds and top investors raise the odds', () => {
  const plain = S.nextRound({ stage: 'seed' });
  const ai = S.nextRound({ stage: 'seed', ai: true });
  const top = S.nextRound({ stage: 'seed', investors: 'top' });
  assert.ok(ai.p24 > plain.p24);
  close(ai.years, plain.years / D.NEXT_ROUND_FACTORS.aiHazardRatio);
  assert.ok(top.p24 > plain.p24);
  const short = S.nextRound({ stage: 'seed', runwayMonths: 4 });
  assert.ok(short.p24 < plain.p24);
});

test('funnel chains the first step with later base rates', () => {
  const f = S.funnel('seed', 0.3);
  assert.deepEqual(f.map((s) => s.label), ['Series A', 'Series B', 'Series C']);
  close(f[1].p, 0.3 * 0.45);
  close(f[2].p, 0.3 * 0.45 * 0.55);
});

test('AI comps: segment median, scale discount and growth adjustment', () => {
  const c = S.aiComps('coding', 2000000, 100);
  const mults = D.AI_COMPS.filter((x) => x.segment === 'coding').map((x) => x.valuation / x.revenue).sort((a, b) => a - b);
  close(c.median, (mults[1] + mults[2]) / 2);
  close(c.scale, 0.6);
  close(c.growthAdj, 1);
  close(c.applied, c.median * 0.6);
});

test('revenue plan uses the three-year forecast, then fades growth', () => {
  const p = S.revenuePlan({ arr: 1000000, growth: 100, rev1: 2000000, rev2: 3000000, fade: 20, years: 4 });
  close(p.rows[0].revenue, 2000000);
  close(p.rows[1].revenue, 3000000);
  close(p.rows[2].revenue, 3000000 * (1 + 0.5 * 0.8));
  close(p.rows[3].revenue, p.rows[2].revenue * (1 + 0.5 * 0.8 * 0.8));
  close(p.ntmGrowth, 1);
  const noForecast = S.revenuePlan({ arr: 1000000, growth: 100, fade: 20, years: 2 });
  close(noForecast.rows[0].revenue, 1000000 * 1.8);
  assert.equal(S.revenuePlan({ arr: 0, years: 5 }).exitRevenue, 0);
});

test('questionnaire: scores stay in [0, 1] and better answers score higher', () => {
  const base = S.scoresFromAnswers({});
  for (const k of ['team', 'product', 'ip', 'tam', 'competition', 'moat', 'partners', 'gtm', 'funding']) {
    assert.ok(base[k] >= 0 && base[k] <= 1, k);
  }
  const strong = S.scoresFromAnswers({ founders: 'three', experience: 'gt10', roles: 'all' }, { founder: 'exit' });
  assert.ok(strong.team > base.team);
  assert.equal(base.risks.technology, 0);
  assert.equal(S.scoresFromAnswers({ techRisk: 'science' }).risks.technology, -2);
});

test('Equidam stage follows the round, the product and revenue', () => {
  assert.equal(S.equidamStage('preseed', 'idea', 0), 'idea');
  assert.equal(S.equidamStage('preseed', 'mvp', 0), 'development');
  assert.equal(S.equidamStage('seed', 'paying', 0), 'development');
  assert.equal(S.equidamStage('seed', 'paying', 100000), 'startup');
  assert.equal(S.equidamStage('seriesA', 'scaling', 1e6), 'expansion');
  assert.equal(S.equidamStage('seriesC', 'scaling', 1e7), 'growth');
});

test('illiquidity discount falls with revenue and stays within bounds', () => {
  const [lo, hi] = D.EQUIDAM.illiquidityBounds;
  const small = S.illiquidityDiscount(0, false);
  const mid = S.illiquidityDiscount(5e6, false);
  const big = S.illiquidityDiscount(5e9, true);
  assert.ok(small > mid && mid > big);
  assert.ok(small <= hi && big >= lo);
});

const seedInput = {
  stage: 'seed', ageYears: 1.5, industry: 'B2B', model: 'saas', aiSegment: 'coding', hq: 'us',
  baseline: 19400000, raise: 4000000, arr: 1200000, growth: 250, grossMargin: 65, ebitdaMargin: -120,
  investors: 'top', founder: 'first', traction: 'strong', runwayMonths: 18, monthlyBurn: 250000,
  rev1: 3000000, rev2: 6500000, rev3: 12000000, fade: 25, targetMargin: 25, yearsToExit: 7,
  personMonths: 60, costPerMonth: 18000, otherAssets: 20000,
  lastPost: 12000000, monthsSinceLast: 14, progress: 'milestones', answers: {},
};
const byKey = (r, k) => r.methods.find((m) => m.key === k);

test('startup model: fourteen methods in four groups, shares sum to one', () => {
  const r = S.valueStartupModel(seedInput);
  assert.deepEqual(r.methods.map((m) => m.key), S.METHOD_KEYS);
  const used = r.methods.filter((m) => m.share > 0);
  assert.equal(used.length, 14);
  close(used.reduce((s, m) => s + m.share, 0), 1);
  close(r.pillars.reduce((s, P) => s + P.share * P.value, 0), r.mid);
  const vals = used.map((m) => m.value);
  assert.ok(r.mid >= Math.min(...vals) && r.mid <= Math.max(...vals));
  assert.ok(r.low < r.mid && r.mid < r.high);
});

test('startup model: group weights follow the Equidam stage', () => {
  const r = S.valueStartupModel(seedInput);
  assert.equal(r.equidamStage, 'startup');
  for (const P of r.pillars) close(P.share, D.PILLAR_WEIGHTS.startup[P.key]);
  const pre = S.valueStartupModel({ ...seedInput, stage: 'preseed', arr: 0, lastPost: 0, answers: { stage: 'idea' } });
  assert.equal(pre.equidamStage, 'idea');
  assert.equal(pre.pillars.find((P) => P.key === 'market').share, 0);
  close(pre.pillars.reduce((s, P) => s + P.share, 0), 1);
});

test('startup model: weight overrides drop a method or a whole group', () => {
  const r = S.valueStartupModel({ ...seedInput, weights: { dcfMultiple: 0 }, pillarWeights: { qualitative: 0 } });
  assert.equal(byKey(r, 'dcfMultiple').share, 0);
  assert.equal(r.pillars.find((P) => P.key === 'qualitative').share, 0);
  close(r.methods.reduce((s, m) => s + m.share, 0), 1);
});

test('startup model: reconciliation applies Equidam weights to its five methods', () => {
  const r = S.valueStartupModel(seedInput);
  const w = D.EQUIDAM.weights.startup;
  const keys = Object.keys(w);
  const expected = keys.reduce((s, k) => s + w[k] * byKey(r, k).value, 0) / keys.reduce((s, k) => s + w[k], 0);
  close(r.reconciliation.equidam, expected);
  close(r.reconciliation.scenario, byKey(r, 'scenario').value);
});

test('startup model: checklist maximum is $17M in the US and the value stays below it', () => {
  const r = S.valueStartupModel(seedInput);
  const ck = byKey(r, 'checklist');
  close(ck.detail.find((d) => d.label.startsWith('Maximum')).amount, 17000000);
  assert.ok(ck.value < 17000000);
});

test('startup model: success-adjusted VC method divides the fund target by success and retention', () => {
  const r = S.valueStartupModel(seedInput);
  const p = r.longRun.probs.Acquired + r.longRun.probs.Public;
  const dil = 0.4; // seed default
  const exit = r.plan.exitRevenue * 0.25 * D.MODEL_FINANCE.ai.exitEbitda;
  close(byKey(r, 'vcEquidam').value, (exit * p * (1 - dil)) / D.EQUIDAM.fundTarget - seedInput.raise);
});

test('startup model: long-term-growth DCF caps growth at 2.5%', () => {
  const r = S.valueStartupModel({ ...seedInput, terminalGrowth: 6 });
  const tv = byKey(r, 'dcfLtg').detail.find((d) => d.label.startsWith('Terminal value')).amount;
  const ebitda = r.plan.exitRevenue * 0.25;
  close(tv, (ebitda * 0.75 * 1.025) / (r.costOfEquity - 0.025));
});

test('startup model: scenario probabilities sum to one and price the expected exit', () => {
  const r = S.valueStartupModel(seedInput);
  const sc = r.scenario;
  close(sc.rows.reduce((s, x) => s + x.p, 0), 1);
  close(sc.value, (sc.expected * (1 - sc.dilution)) / Math.pow(1 + sc.discountRate, sc.years) - seedInput.raise);
  close(sc.discountRate, D.SCENARIO.discountRate.seed);
});

test('startup model: last-round step-up and AI round cap', () => {
  const r = S.valueStartupModel(seedInput);
  close(byKey(r, 'lastRound').value, 12000000 * D.STEP_UPS.seed);
  const big = S.valueStartupModel({ ...seedInput, aiSegment: 'vertical', arr: 50000000, growth: 300 });
  assert.ok(byKey(big, 'privateRounds').value <= 50000000 * D.AI_COMP_ADJUST.stageCap.seed + 1);
});

test('startup model: pre-revenue company skips revenue-based methods cleanly', () => {
  const r = S.valueStartupModel({ ...seedInput, arr: 0, rev1: 0, rev2: 0, rev3: 0, aiSegment: '', lastPost: 0 });
  for (const k of ['trading', 'precedents', 'privateRounds', 'lastRound', 'dcfLtg', 'vc', 'scenario']) assert.ok(byKey(r, k).skipped, k);
  assert.ok(r.mid > 0);
});

test('sensitivity: value rises with the plan and with market multiples', () => {
  const s = S.sensitivity(seedInput);
  close(s.grid[1][1], S.valueStartupModel(seedInput).mid);
  assert.ok(s.grid[0][1] < s.grid[1][1] && s.grid[1][1] < s.grid[2][1]);
  assert.ok(s.grid[1][0] < s.grid[1][1] && s.grid[1][1] < s.grid[1][2]);
});
