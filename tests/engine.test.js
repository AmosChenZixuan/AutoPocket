// Behavior lock for the prototype engine. Any port (TypeScript package, etc.)
// must reproduce these numbers for config/example-settings.json within $1.
// Run: npm test   (or: node --test)
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const ENG = require(path.join(__dirname, '..', 'prototype', 'engine.js'));
const S = require(path.join(__dirname, '..', 'config', 'example-settings.json'));

const start = {
  month: '2026-11',
  balances: { checking: 1800, brokerageCash: 7000, hysa: 0, loan: 9000, foreign: 0 },
};
const R = ENG.simulate(S, start);
const near = (actual, expected, label, tol = 1) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${label}: expected ${expected}, got ${actual.toFixed(2)}`);
const row = (k) => R.rows.find((r) => r.key === k);

test('milestones', () => {
  assert.deepEqual(R.ms, { car: '2027-01', b1: '2027-07', b2: '2027-08', move: '2027-09', invest: '2027-08' });
});

test('bucket targets', () => {
  near(R.target1, 11010, 'target1');
  near(R.target2, 22020, 'target2');
  near(R.floor1, 3670, 'floor');
});

test('single paychecks', () => {
  const cases = [
    ['2026-11', { net: 2162.43, k: 369.23, hsa: 183.33, fedWH: 413.66, caWH: 172.21, fica: 261.93, sdi: 44.51, prem: 85, match: 0 }],
    ['2027-01', { net: 2165.23, k: 553.85, hsa: 162.96, fedWH: 296.29, caWH: 120.70, fica: 263.49, sdi: 44.78, prem: 85, match: 0 }],
    ['2027-07', { net: 2165.23, k: 553.85, hsa: 162.96, fedWH: 296.29, caWH: 120.70, fica: 263.49, sdi: 44.78, prem: 85, match: 110.77 }],
  ];
  for (const [month, exp] of cases) {
    const c = R.payroll.months[month].checks[0];
    for (const [f, v] of Object.entries(exp)) near(c[f], v, `${month} ${f}`, 0.01);
  }
});

test('variable payout and refund', () => {
  near(R.payroll.months['2027-03'].bonus.net, 1459.63, 'bonus net', 0.01);
  const rf = R.payroll.refunds['2027-03'];
  near(rf.fed, 1655, 'fed refund');
  near(rf.ca, 689, 'ca refund');
});

test('first ten months', () => {
  // [month, stage, income, expenses, car (min+extra), car from savings, net to emergency cash, roth ira, brokerage, cash balance, loan balance]
  const expected = [
    ['2026-11', 'debt', 4325, 2570, 2555, 4023, 0, 0, 0, 3000, 2471],
    ['2026-12', 'debt', 4325, 2570, 1755, 10, 0, 0, 0, 3000, 719],
    ['2027-01', 'b1', 6496, 2870, 713, 10, 670, 2243, 0, 3670, 0],
    ['2027-02', 'b1', 4330, 2870, 0, 0, 0, 1460, 0, 3682, 0],
    ['2027-03', 'b1', 8134, 2870, 0, 0, 1467, 3797, 0, 5161, 0],
    ['2027-04', 'b1', 4330, 2870, 0, 0, 1460, 0, 0, 6639, 0],
    ['2027-05', 'b1', 4330, 2870, 0, 0, 1460, 0, 0, 8122, 0],
    ['2027-06', 'b1', 5790, 3220, 0, 0, 2570, 0, 0, 10719, 0],
    ['2027-07', 'b2', 6496, 2870, 0, 0, 256, 3370, 0, 11010, 0],
    ['2027-08', 'invest', 4330, 2870, 0, 0, 103, 1357, 0, 11150, 0],
  ];
  for (const [k, stage, inc, exp, car, carSav, toCash, roth, brk, cash, loan] of expected) {
    const r = row(k), f = r.flows, b = r.bal;
    assert.equal(r.stage, stage, `${k} stage`);
    near(f.pay + f.bonus + f.refund, inc, `${k} income`);
    near(f.exp, exp, `${k} expenses`);
    near(f.carMin + f.carExtra, car, `${k} car`);
    near(f.carFromSavings, carSav, `${k} car from savings`);
    near(f.toCash - f.fromCash, toCash, `${k} to cash`);
    near(f.rothPrior + f.rothCur, roth, `${k} roth`);
    near(f.brokerage, brk, `${k} brokerage`);
    near(b.cash, cash, `${k} cash balance`);
    near(b.loan, loan, `${k} loan balance`);
  }
});

test('end state 2029-12', () => {
  const L = R.rows.at(-1);
  assert.equal(L.key, '2029-12');
  const exp = { checking: 1000, cash: 12239, rothInv: 33557, brokerage: 26445, k401: 64139, hsa: 15256, loan: 0 };
  for (const [f, v] of Object.entries(exp)) near(L.bal[f], v, `end ${f}`);
  near(L.net, 152637, 'end net worth');
});
