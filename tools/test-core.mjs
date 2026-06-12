import { assignTrip, computeBalances, routeStats, optimizeOrder, effectivePlans, dayDate } from '../js/core.js';

let fails = 0;
const eq = (got, want, msg) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (!ok) { fails++; console.error(`FAIL ${msg}\n  got  ${JSON.stringify(got)}\n  want ${JSON.stringify(want)}`); }
  else console.log(`ok   ${msg}`);
};

const trips = [
  { id: 'preexchange', start: '2026-07-24', end: '2026-08-20' },
  { id: 'alpine', start: '2026-08-01', end: '2026-08-17' },
  { id: 'iceland', start: '2026-08-20', end: '2026-08-29' },
];
eq(assignTrip(trips, '2026-07-24T00:50'), 'preexchange', 'flight Jul24 → preexchange');
eq(assignTrip(trips, '2026-08-05'), 'alpine', 'Aug5 → alpine (smallest range wins over preexchange)');
eq(assignTrip(trips, '2026-08-20T09:00'), 'iceland', 'Aug20 → iceland (10d < 28d)');
eq(assignTrip(trips, '2026-09-15'), 'unassigned', 'outside all → unassigned');
eq(assignTrip(trips, null), 'unassigned', 'no date → unassigned');

const T = ['Chongyu', 'Yuanxin'];
let b = computeBalances([{ amount: 100, paidBy: 'Chongyu', split: { type: 'equal' } }], T);
eq(b.net, { Chongyu: 50, Yuanxin: -50 }, 'equal split: payer is owed half');
b = computeBalances([{ amount: 80, paidBy: 'Yuanxin', split: { type: 'solo' } }], T);
eq(b.net, { Chongyu: 0, Yuanxin: 0 }, 'solo split: no debt');
b = computeBalances([
  { amount: 100, paidBy: 'Chongyu', split: { type: 'equal' } },
  { amount: 60, paidBy: 'Yuanxin', split: { type: 'equal' } },
], T);
eq(b.net, { Chongyu: 20, Yuanxin: -20 }, 'two expenses net out');
b = computeBalances([{ amount: 90, paidBy: 'Chongyu', split: { type: 'shares', shares: { Chongyu: 2 / 3, Yuanxin: 1 / 3 } } }], T);
eq(b.net, { Chongyu: 30, Yuanxin: -30 }, 'custom shares');

const r = routeStats([[45.5, 10.6], [46.0, 10.6]]);
if (r.km < 60 || r.km > 90) { fails++; console.error(`FAIL routeStats km=${r.km} expected ~72`); }
else console.log(`ok   routeStats ~${r.km}km ${r.hours}h`);

const pts = [{ ll: [0, 0] }, { ll: [0, 3] }, { ll: [0, 1] }, { ll: [0, 2] }];
eq(optimizeOrder(pts, p => p.ll).map(p => p.ll[1]), [0, 1, 2, 3], 'nearest-neighbour orders line');

const days = [{ id: 'a', plan: [{ id: 'p1' }] }, { id: 'b', plan: [] }];
eq(effectivePlans(days, { b: [{ id: 'p2' }] }), { a: [{ id: 'p1' }], b: [{ id: 'p2' }] }, 'overlay replaces per-day');
eq(effectivePlans(days, null), { a: [{ id: 'p1' }], b: [] }, 'no overlay → base');

eq(dayDate([2026, 7, 1], 0).label, 'SAT 1 AUG', 'alpine day 1 date');
eq(dayDate([2026, 7, 1], 16).iso.slice(5), '08-17', 'alpine day 17 iso');

process.exit(fails ? 1 : 0);
