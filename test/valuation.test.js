'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../src/benchmarks.js');
const V = require('../src/valuation.js');

const close = (actual, expected, tol = 1e-6) =>
  assert.ok(Math.abs(actual - expected) <= tol * Math.max(1, Math.abs(expected)), `${actual} != ${expected}`);

test('interp is flat beyond the ends and linear between points', () => {
  const pts = [[0, 1], [10, 3]];
  assert.equal(V.interp(-5, pts), 1);
  assert.equal(V.interp(5, pts), 2);
  assert.equal(V.interp(50, pts), 3);
});

test('parseAmount understands separators and k/m suffixes', () => {
  assert.equal(V.parseAmount('1,250,000'), 1250000);
  assert.equal(V.parseAmount('1.25m'), 1250000);
  assert.equal(V.parseAmount('250k'), 250000);
  assert.equal(V.parseAmount('€ 40 000'), 40000);
  assert.equal(V.parseAmount('-15'), -15);
  assert.ok(Number.isNaN(V.parseAmount('')));
  assert.ok(Number.isNaN(V.parseAmount('abc')));
});

test('blend ignores skipped methods and normalises weights', () => {
  const methods = [
    { value: 100, low: 80, high: 120, weight: 3 },
    { value: 200, low: 160, high: 240, weight: 1 },
    { value: 0, low: 0, high: 0, weight: 0, skipped: 'n/a' },
  ];
  const r = V.blend(methods);
  close(r.mid, 125);
  close(r.low, 100);
  close(r.high, 150);
});

/* ---------------------------- startup ---------------------------- */

test('startup: a typical company scores the market baseline on scorecard and RFS', () => {
  const r = V.valueStartup({ baseline: 2000000 });
  const sc = r.methods.find((m) => m.key === 'scorecard');
  const rfs = r.methods.find((m) => m.key === 'risk');
  close(sc.value, 2000000);
  close(rfs.value, 2000000);
});

test('startup: Berkus caps at 1.25x the baseline', () => {
  const berkus = Object.fromEntries(B.BERKUS_FACTORS.map((f) => [f.key, 1]));
  const r = V.valueStartup({ baseline: 2000000, berkus });
  close(r.methods.find((m) => m.key === 'berkus').value, 2500000); // classic $2.5M ceiling
});

test('startup: risk factor summation moves 12.5% of baseline per point and has a floor', () => {
  const r = V.valueStartup({ baseline: 2000000, risks: { management: 2, technology: 1 } });
  close(r.methods.find((m) => m.key === 'risk').value, 2750000); // +3 x $250K
  const worst = Object.fromEntries(B.RISK_FACTORS.map((f) => [f.key, -2]));
  const low = V.valueStartup({ baseline: 2000000, risks: worst });
  close(low.methods.find((m) => m.key === 'risk').value, 200000);
});

test('startup: venture capital method', () => {
  // Exit $50M x 3 = $150M, keep 60%, 50% IRR over 5 years (7.59x)
  const r = V.valueStartup({
    baseline: 2000000,
    raise: 1000000,
    vc: { exitRevenue: 50000000, exitMultiple: 3, years: 5, targetIrr: 50, dilution: 40 },
  });
  const vc = r.methods.find((m) => m.key === 'vc');
  const post = (150000000 * 0.6) / Math.pow(1.5, 5);
  close(vc.value, post - 1000000);
  assert.ok(vc.low < vc.value && vc.value < vc.high);
});

test('startup: VC method is skipped without exit inputs and the blend still works', () => {
  const r = V.valueStartup({ baseline: 16000000 });
  assert.ok(r.methods.find((m) => m.key === 'vc').skipped);
  assert.ok(r.mid > 0);
});

test('startup: dilution and post-money', () => {
  const r = V.valueStartup({ baseline: 2000000, raise: 500000, weights: { berkus: 0 } });
  close(r.mid, 2000000);
  close(r.postMoney, 2500000);
  close(r.dilution, 0.2);
});

/* ------------------------------ tech ------------------------------ */

test('tech: a median SaaS company lands on the SEG private median of 4.0x', () => {
  const t = V.techMultiple({
    model: B.TECH_MODELS[0], arrUsd: 5000000, growth: 15, grossMargin: 75, nrr: 102,
    ebitdaMargin: 15, largestCustomer: 5, runwayMonths: 0,
  });
  close(t.multiple, 4.0);
});

test('tech: growth bands land on the published ranges', () => {
  const at = (g) => V.interp(g, B.GROWTH_CURVE);
  assert.ok(at(15) >= 3.5 && at(30) <= 5.5);
  assert.ok(at(30) >= 5 && at(50) <= 7.5);
  assert.ok(at(50) >= 7 && at(80) <= 10);
  assert.ok(at(80) >= 9 && at(120) <= 14);
});

test('tech: e-commerce and services models land near BizBuySell revenue multiples', () => {
  const base = { arrUsd: 5000000, growth: 15, nrr: 100, ebitdaMargin: 15, largestCustomer: 0, runwayMonths: 0 };
  const ecom = B.TECH_MODELS.find((m) => m.key === 'ecommerce');
  const svc = B.TECH_MODELS.find((m) => m.key === 'services');
  close(V.techMultiple({ ...base, model: ecom, grossMargin: 40 }).multiple, 1.0);
  close(V.techMultiple({ ...base, model: svc, grossMargin: 35 }).multiple, 1.2);
});

test('tech: small software businesses blend in an SDE multiple of 2.5x to 4x', () => {
  const r = V.valueTech({
    purpose: 'sale', model: 'saas', arr: 400000, growth: 10, grossMargin: 80, nrr: 100,
    ebitdaMargin: 40, ownerAddBack: 80000, largestCustomer: 5,
  });
  const sde = r.methods.find((m) => m.key === 'sde');
  assert.ok(sde.weight > 0);
  close(r.sde, 240000);
  const impliedSde = r.mid / r.sde;
  assert.ok(impliedSde > 2.5 && impliedSde < 4.5, `implied SDE multiple ${impliedSde}`);
});

test('tech: larger companies sell on revenue only', () => {
  const r = V.valueTech({ purpose: 'sale', model: 'saas', arr: 8000000, growth: 25, ebitdaMargin: 10, ownerAddBack: 0 });
  assert.ok(r.methods.find((m) => m.key === 'sde').skipped);
  close(r.mid, r.methods.find((m) => m.key === 'revenue').value);
});

test('tech: a funding round blends the VC method', () => {
  const r = V.valueTech({
    purpose: 'raise', model: 'saas', arr: 2000000, growth: 100, grossMargin: 78, nrr: 110,
    ebitdaMargin: -40, runwayMonths: 18, vc: { stage: 'seriesA', raise: 8000000 },
  });
  const vc = r.methods.find((m) => m.key === 'vc');
  assert.ok(!vc.skipped);
  assert.ok(vc.share > 0.6);
  assert.ok(r.mid > 10000000 && r.mid < 80000000, `mid ${r.mid}`);
});

test('tech: short runway and concentration lower the multiple', () => {
  const base = { purpose: 'sale', model: 'saas', arr: 5000000, growth: 30, ebitdaMargin: -20, largestCustomer: 0, runwayMonths: 24 };
  const healthy = V.valueTech(base).mid;
  assert.ok(V.valueTech({ ...base, runwayMonths: 4 }).mid < healthy);
  assert.ok(V.valueTech({ ...base, largestCustomer: 40 }).mid < healthy);
});

test('tech: no revenue returns an empty result instead of throwing', () => {
  const r = V.valueTech({ arr: '' });
  assert.equal(r.mid, 0);
  assert.equal(r.methods.length, 0);
});

/* ------------------------------- SME ------------------------------ */

const mainStreet = {
  industry: 'services',
  revenue: 700000,
  pretaxProfit: 80000,
  ownerComp: 60000,
  interest: 5000,
  depreciation: 10000,
  oneOffs: 3000,
  personal: 2000,
  managerSalary: 60000,
  capex: 10000,
};

test('SME: SDE adds back owner pay and non-cash or one-off costs', () => {
  const r = V.valueSme(mainStreet);
  close(r.sde, 160000);
  close(r.ebitda, 100000);
});

test('SME: SDE method applies the BizBuySell industry multiple', () => {
  const r = V.valueSme(mainStreet);
  const m = r.methods.find((x) => x.key === 'sde');
  close(m.value, 160000 * 2.58);
  assert.ok(r.methods.find((x) => x.key === 'ebitda').skipped);
});

test('SME: estimate stays near the market multiple for a typical business', () => {
  const r = V.valueSme(mainStreet);
  const implied = r.mid / r.sde;
  assert.ok(implied > 2.2 && implied < 3.0, `implied SDE multiple ${implied}`);
});

test('SME: value drivers move the multiple and are capped', () => {
  const good = V.valueSme({ ...mainStreet, drivers: { owner: 'runs', recurring: 'high', trend: 'strong' } });
  const bad = V.valueSme({ ...mainStreet, drivers: { concentration: 'gt35', owner: 'is', records: 'poor', age: 'lt3', premises: 'short', trend: 'declining' } });
  close(good.driverAdj, 0.35 + 0); // +10% +15% +10%
  close(bad.driverAdj, -0.5); // capped
  assert.ok(good.mid > V.valueSme(mainStreet).mid);
  assert.ok(bad.mid < V.valueSme(mainStreet).mid);
});

test('SME: larger businesses switch to EBITDA multiples', () => {
  const r = V.valueSme({
    industry: 'manufacturing', revenue: 20000000, pretaxProfit: 2800000, ownerComp: 250000,
    depreciation: 300000, interest: 100000, managerSalary: 250000, capex: 300000,
  });
  close(r.ebitda, 3200000);
  assert.ok(r.methods.find((x) => x.key === 'sde').skipped);
  const e = r.methods.find((x) => x.key === 'ebitda');
  assert.ok(!e.skipped);
  const implied = r.impliedEbitdaMultiple;
  assert.ok(implied > 4 && implied < 6.5, `implied EBITDA multiple ${implied}`);
});

test('SME: inventory is added on top and the asset floor applies', () => {
  const withInv = V.valueSme({ ...mainStreet, inventory: 50000 });
  const without = V.valueSme(mainStreet);
  close(withInv.mid - without.mid, 50000);

  const loss = V.valueSme({ ...mainStreet, pretaxProfit: -150000, ffe: 120000 });
  assert.ok(loss.floorApplied);
  close(loss.mid, 120000);
});

test('SME: bank-financeable price follows the SBA debt service maths', () => {
  const r = V.valueSme({ ...mainStreet, sbaRate: 10, sbaYears: 10, dscr: 1.25, downPayment: 10 });
  const cads = 100000 - 10000;
  const i = 0.10 / 12;
  const loan = (cads / 1.25 / 12) * ((1 - Math.pow(1 + i, -120)) / i);
  close(r.financeable, loan / 0.9);
});

test('SME: asking price reflects the 94% sold-to-asking ratio', () => {
  const r = V.valueSme(mainStreet);
  close(r.askingPrice, r.mid / 0.94);
});

test('SME: currency only affects size bands', () => {
  const usd = V.valueSme(mainStreet);
  const gbp = V.valueSme({ ...mainStreet, fxPerUsd: 0.75 });
  // Same SDE multiple in both; the size premium differs slightly because £100K EBITDA is ~$133K.
  close(usd.methods[0].value, gbp.methods[0].value);
});

test('every SME industry produces a positive estimate', () => {
  for (const ind of B.SME_INDUSTRIES) {
    const r = V.valueSme({ ...mainStreet, industry: ind.key });
    assert.ok(r.mid > 0, ind.key);
  }
});

/* ------------------------------- UK ------------------------------- */

test('UK: sector range is added for UK businesses and sits inside the band', () => {
  const us = V.valueSme({ ...mainStreet, fxPerUsd: 0.75, gbpPerUsd: 0.75 });
  const uk = V.valueSme({ ...mainStreet, market: 'uk', fxPerUsd: 0.75, gbpPerUsd: 0.75 });
  assert.ok(us.methods.find((m) => m.key === 'uk').skipped);
  const m = uk.methods.find((x) => x.key === 'uk');
  assert.ok(!m.skipped && m.share > 0.3);
  // Services maps to facilities management and cleaning: 3.0x-5.0x under £1m; typical drivers sit mid-band.
  close(m.value, 100000 * 4.0);
  close(m.low, 100000 * 3.0);
  close(m.high, 100000 * 5.0);
});

test('UK: bands re-rate above £1m adjusted EBITDA', () => {
  const base = { industry: 'manufacturing', pretaxProfit: 2000000, ownerComp: 0, managerSalary: 0, market: 'uk', fxPerUsd: 0.75, gbpPerUsd: 0.75 };
  const m = V.valueSme(base).methods.find((x) => x.key === 'uk');
  close(m.low, 2000000 * 4.5);
  close(m.high, 2000000 * 6.5);
});

test('UK: value drivers move the position inside the band', () => {
  const good = V.valueSme({ ...mainStreet, market: 'uk', drivers: { owner: 'runs', recurring: 'high' } });
  const bad = V.valueSme({ ...mainStreet, market: 'uk', drivers: { owner: 'is', records: 'basic' } });
  const val = (r) => r.methods.find((x) => x.key === 'uk').value;
  assert.ok(val(good) > val(bad));
});

test('UK: industries without a UK range fall back to US multiples with a note', () => {
  const r = V.valueSme({ ...mainStreet, industry: 'restaurants', market: 'uk' });
  assert.ok(r.methods.find((x) => x.key === 'uk').skipped);
  assert.ok(r.notes.some((n) => n.includes('No UK sector range')));
  assert.ok(r.mid > 0);
});

test('benchmarks: every UK band maps to a known industry and the US baseline matches the stage reference', () => {
  for (const key of Object.keys(B.UK_SME_BANDS)) assert.ok(B.SME_INDUSTRIES.some((i) => i.key === key), key);
  const us = B.STARTUP_MARKETS.find((m) => m.key === 'usVc');
  assert.equal(us.seed, B.STAGE_PREMONEY.seed.value);
});
