import { assignTrip, computeBalances, routeStats, optimizeOrder, effectivePlans, dayDate, parseEmailStub, thumbAccent,
  wikiSummaryUrl, wikiGeoUrl, pickSummaryThumb, pickGeoThumb, thumbCacheKey } from '../js/core.js';

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

let s = parseEmailStub('Fwd: Your Wizz Air booking confirmation NP7QJQ',
  'Flight W6 4551 departs 20 Aug 2026 at 09:00.');
eq(s, { type: 'flight', title: 'Your Wizz Air booking confirmation NP7QJQ', confirmation: 'NP7QJQ', start: '2026-08-20' },
  'parseEmailStub: flight w/ PNR + body date');

s = parseEmailStub('Reservation confirmed - Hotel Internazionale Bologna',
  'Check-in: 30 July 2026. Booking number: 308663-2026. We look forward to your stay.');
eq(s, { type: 'hotel', title: 'Reservation confirmed - Hotel Internazionale Bologna', confirmation: '308663-2026', start: '2026-07-30' },
  'parseEmailStub: hotel w/ dashed conf + long month');

s = parseEmailStub('Your Trenitalia train ticket', 'Departure 2026-08-03 from Milano Centrale.');
eq(s, { type: 'train', title: 'Your Trenitalia train ticket', confirmation: null, start: '2026-08-03' },
  'parseEmailStub: train w/ ISO date, ticket does not mean activity');

s = parseEmailStub('Fwd: Re: hello', 'nothing useful here');
eq(s, { type: 'other', title: 'hello', confirmation: null, start: null },
  'parseEmailStub: strips Fwd:/Re:, nulls when nothing found');

s = parseEmailStub('GetYourGuide ticket: Vatican tour', 'Reference: ABC123XY. Date: 5 Aug 2026.');
eq(s, { type: 'activity', title: 'GetYourGuide ticket: Vatican tour', confirmation: 'ABC123XY', start: '2026-08-05' },
  'parseEmailStub: activity w/ labelled reference');

eq(thumbAccent('hike'), '#5a6342', 'thumbAccent: hike → pine');
eq(thumbAccent('food'), '#b9531a', 'thumbAccent: food → terra');
eq(thumbAccent('gem'), '#9c5a6a', 'thumbAccent: gem → rose');
eq(thumbAccent('???'), '#5d564a', 'thumbAccent: unknown → ink-soft');
eq(thumbAccent(undefined), '#5d564a', 'thumbAccent: missing → ink-soft');

eq(wikiSummaryUrl('Sirmione'), 'https://en.wikipedia.org/api/rest_v1/page/summary/Sirmione?redirect=true',
  'wikiSummaryUrl: encodes name');
eq(wikiSummaryUrl("All'Antico Vinaio"), "https://en.wikipedia.org/api/rest_v1/page/summary/All'Antico%20Vinaio?redirect=true",
  'wikiSummaryUrl: spaces + apostrophe encoded');
eq(wikiSummaryUrl(''), null, 'wikiSummaryUrl: empty → null');

eq(wikiGeoUrl([45.49, 10.6]),
  'https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=320&generator=geosearch&ggscoord=45.49%7C10.6&ggsradius=2000&ggslimit=3',
  'wikiGeoUrl: builds geosearch URL');
eq(wikiGeoUrl(null), null, 'wikiGeoUrl: no coords → null');

eq(pickSummaryThumb({ type: 'standard', thumbnail: { source: 'https://x/a.jpg' } }), 'https://x/a.jpg',
  'pickSummaryThumb: returns source');
eq(pickSummaryThumb({ type: 'disambiguation', thumbnail: { source: 'https://x/a.jpg' } }), null,
  'pickSummaryThumb: disambiguation → null');
eq(pickSummaryThumb({ type: 'standard' }), null, 'pickSummaryThumb: no thumbnail → null');

eq(pickGeoThumb({ query: { pages: { '99': { thumbnail: { source: 'https://x/g.jpg' } } } } }), 'https://x/g.jpg',
  'pickGeoThumb: first page thumbnail');
eq(pickGeoThumb({ query: { pages: { '1': {}, '2': { thumbnail: { source: 'https://x/h.jpg' } } } } }), 'https://x/h.jpg',
  'pickGeoThumb: skips pages without thumbnail');
eq(pickGeoThumb({ query: { pages: {} } }), null, 'pickGeoThumb: no pages → null');
eq(pickGeoThumb({}), null, 'pickGeoThumb: empty → null');

eq(thumbCacheKey('Sirmione'), 'thumb:Sirmione', 'thumbCacheKey');

process.exit(fails ? 1 : 0);
