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

test('revenue plan grows from current ARR and fades growth', () => {
  const p = S.revenuePlan({ arr: 1000000, growth: 100, growth2: 50, fade: 20, years: 3 });
  close(p.rows[0].revenue, 2000000);
  close(p.rows[1].revenue, 3000000);
  close(p.rows[2].revenue, 3000000 * 1.4);
});

const seedInput = {
  stage: 'seed', ageYears: 1.5, industry: 'B2B', model: 'saas', aiSegment: 'coding', hq: 'us',
  baseline: 19400000, raise: 4000000, arr: 1200000, growth: 250, grossMargin: 65, ebitdaMargin: -120,
  investors: 'top', founder: 'first', traction: 'strong', runwayMonths: 18, monthlyBurn: 250000,
  rev1: 3000000, growth2: 150, fade: 25, targetMargin: 20, yearsToExit: 7, discountRate: 20,
  personMonths: 60, costPerMonth: 18000, otherAssets: 20000, devStage: 4,
  lastPost: 12000000, monthsSinceLast: 14, progress: 'milestones',
  scorecard: {}, berkus: { idea: 1 }, risks: {},
};

test('startup model: all ten methods run and the blend sits inside the method range', () => {
  const r = S.valueStartupModel(seedInput);
  assert.deepEqual(r.methods.map((m) => m.key), S.METHOD_KEYS);
  const used = r.methods.filter((m) => !m.skipped && m.share > 0);
  assert.equal(used.length, 10);
  close(used.reduce((s, m) => s + m.share, 0), 1);
  const vals = used.map((m) => m.value);
  assert.ok(r.mid >= Math.min(...vals) && r.mid <= Math.max(...vals));
});

test('startup model: development stage ladder and last-round step-up', () => {
  const r = S.valueStartupModel(seedInput);
  close(r.methods.find((m) => m.key === 'devStage').value, 19400000); // early customers = 0.8-1.2x the seed median
  close(r.methods.find((m) => m.key === 'lastRound').value, 12000000 * D.STEP_UPS.seed);
});

test('startup model: AI comps never exceed the stage cap', () => {
  const r = S.valueStartupModel({ ...seedInput, aiSegment: 'vertical', arr: 50000000, growth: 300 });
  const comps = r.methods.find((m) => m.key === 'comps');
  assert.ok(comps.value <= 50000000 * D.AI_COMP_ADJUST.stageCap.seed + 1);
});

test('startup model: DCF terminal value is a perpetuity on target cash flow', () => {
  const r = S.valueStartupModel({ ...seedInput, matureRate: 12, terminalGrowth: 3 });
  const dcf = r.methods.find((m) => m.key === 'dcf');
  const tv = dcf.detail.find((d) => d.label.startsWith('Terminal value')).amount;
  close(tv, (r.plan.exitRevenue * 0.2 * 1.03) / 0.09);
});

test('startup model: pre-revenue company skips revenue-based methods cleanly', () => {
  const r = S.valueStartupModel({ ...seedInput, arr: 0, rev1: 0, aiSegment: '', lastPost: 0 });
  assert.ok(r.methods.find((m) => m.key === 'comps').skipped);
  assert.ok(r.methods.find((m) => m.key === 'lastRound').skipped);
  assert.ok(r.mid > 0);
});
