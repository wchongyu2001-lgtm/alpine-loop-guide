import { assignTrip, computeBalances, routeStats, optimizeOrder, effectivePlans, dayDate, parseEmailStub, thumbAccent,
  wikiSummaryUrl, wikiGeoUrl, pickSummaryThumb, pickGeoThumb, thumbCacheKey,
  gmapsPlaceUrl, amapsPlaceUrl, splitTime, joinTime, matchBooking, pickSummaryExtract, factCacheKey,
  placeProxyUrl, placePhotoUrl, placeCacheKey, fmtRating, priceTier, parsePlace,
  modeProfile, osrmUrl, legFallback, fmtDuration, parseOsrm,
  iataFromFlight, airlineLogoUrl, brandDomain, brandLogoUrl, wlShareValid,
  weatherUrl, weatherCacheKey, pickDaily, wmoIcon, convert, simplifyDebts,
  pickTodayDay, nextBooking, flightRoute, bookingWarnings, orphanBookings,
  legGapMins, legFeasibility, dayLoad,
  overpassUrl, parseOverpass, nearbyCacheKey, budgetVsActual, planProgress, suggestPacking } from '../js/core.js';

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

// budget vs actual per day: dated expenses summed onto each day's estimate
{
  const days = [
    { id: 'd1', iso: '2026-08-01', label: 'Bardolino', estimate: 100 },
    { id: 'd2', iso: '2026-08-02', label: 'Sirmione', estimate: 80 },
  ];
  const exp = [
    { date: '2026-08-01', amount: 120 },
    { date: '2026-08-01', amount: 5 },
    { date: '2026-08-02', amount: 60 },
    { date: null, amount: 999 },     // undated → ignored
  ];
  const bva = budgetVsActual(days, exp);
  eq(bva.rows[0], { id: 'd1', iso: '2026-08-01', label: 'Bardolino', estimate: 100, actual: 125, delta: 25 }, 'budgetVsActual: day1 over by 25');
  eq(bva.rows[1], { id: 'd2', iso: '2026-08-02', label: 'Sirmione', estimate: 80, actual: 60, delta: -20 }, 'budgetVsActual: day2 under by 20');
  eq(bva.totals, { estimate: 180, actual: 185, delta: 5 }, 'budgetVsActual: totals net +5, undated excluded');
  eq(budgetVsActual([], []).totals, { estimate: 0, actual: 0, delta: 0 }, 'budgetVsActual: empty → zero totals');
}

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

// place-first map links — name wins so the place card (reviews) shows
eq(gmapsPlaceUrl('Sirmione', [45.49, 10.61]), 'https://www.google.com/maps/search/?api=1&query=Sirmione',
  'gmapsPlaceUrl: links by name, not coords');
eq(gmapsPlaceUrl('', [45.49, 10.61]), 'https://www.google.com/maps/search/?api=1&query=45.49,10.61',
  'gmapsPlaceUrl: falls back to coords when no name');
eq(amapsPlaceUrl('Grotte di Catullo', [45.49, 10.61]), 'https://maps.apple.com/?q=Grotte%20di%20Catullo&ll=45.49,10.61',
  'amapsPlaceUrl: name query biased by coords');
eq(amapsPlaceUrl('Sirmione', null), 'https://maps.apple.com/?q=Sirmione', 'amapsPlaceUrl: name only when no coords');

eq(splitTime('09:00–11:00'), ['09:00', '11:00'], 'splitTime: en-dash range');
eq(splitTime('09:00-11:00'), ['09:00', '11:00'], 'splitTime: hyphen range');
eq(splitTime('09:00'), ['09:00', ''], 'splitTime: single time');
eq(splitTime(''), ['', ''], 'splitTime: empty');
eq(joinTime('09:00', '11:00'), '09:00–11:00', 'joinTime: both → range');
eq(joinTime('09:00', ''), '09:00', 'joinTime: start only');
eq(joinTime('', ''), '', 'joinTime: empty');

const camp = { id: 'wl-butterfly', type: 'hotel', title: 'Butterfly Camping Village · Peschiera del Garda',
  location: { name: 'Lungolago Garibaldi 11, Peschiera del Garda', lat: 45.4406, lng: 10.6869 } };
eq(matchBooking({ n: 'Butterfly Camping Village', ll: [45.6, 10.9] }, camp), true, 'matchBooking: name substring');
eq(matchBooking({ n: 'Peschiera del Garda', ll: null }, camp), true, 'matchBooking: name found in location.name');
eq(matchBooking({ n: 'Somewhere', ll: [45.4407, 10.6870] }, camp), true, 'matchBooking: within 0.6km');
eq(matchBooking({ n: 'Sirmione', ll: [45.49, 10.61] }, camp), false, 'matchBooking: 8km away, different name → no');

eq(pickSummaryExtract({ type: 'standard', extract: 'Sirmione is a town.' }), 'Sirmione is a town.', 'pickSummaryExtract: returns extract');
eq(pickSummaryExtract({ type: 'disambiguation', extract: 'x' }), null, 'pickSummaryExtract: disambiguation → null');
eq(factCacheKey('Sirmione'), 'fact:Sirmione', 'factCacheKey');

// ---- place enrichment ----
eq(placeProxyUrl('https://x/trips-sync', 'Sirmione', [45.49, 10.61]),
  'https://x/trips-sync/place?q=Sirmione&lat=45.49&lng=10.61', 'placeProxyUrl: name+ll');
eq(placeProxyUrl('https://x/trips-sync', 'Lake Como', null),
  'https://x/trips-sync/place?q=Lake%20Como', 'placeProxyUrl: name only');
eq(placePhotoUrl('https://x/trips-sync', 'AbC_ref', 400),
  'https://x/trips-sync/placephoto?ref=AbC_ref&w=400', 'placePhotoUrl');
eq(placeCacheKey('Sirmione', [45.491, 10.606]), 'place:Sirmione@45.491,10.606', 'placeCacheKey rounds 3dp');
eq(fmtRating(4.6, 2134), '★ 4.6 (2,134)', 'fmtRating with reviews');
eq(fmtRating(4.6, 0), '★ 4.6', 'fmtRating no reviews');
eq(fmtRating(null, 0), '', 'fmtRating none → empty');
eq(priceTier(2), '€€', 'priceTier 2'); eq(priceTier(0), '', 'priceTier 0'); eq(priceTier(null), '', 'priceTier null');
eq(parsePlace({ rating: 4.6, user_ratings_total: 2134, photoRef: 'r', types: ['tourist_attraction'],
  price_level: 2, opening_hours: { open_now: true, today: '9 AM–8 PM' }, website: 'https://w', formatted_phone_number: '+39 1', place_id: 'p', gmapsUrl: 'https://g' }),
  { rating: 4.6, reviews: 2134, photoRef: 'r', category: 'attraction', priceLevel: 2,
    openNow: true, hoursToday: '9 AM–8 PM', website: 'https://w', phone: '+39 1', placeId: 'p', gmapsUrl: 'https://g' },
  'parsePlace normalizes proxy json');
eq(parsePlace(null), null, 'parsePlace null → null');

// ---- routing ----
eq(modeProfile('drive'), 'driving', 'modeProfile drive');
eq(osrmUrl([45.5, 10.6], [45.6, 10.7], 'drive'),
  'https://router.project-osrm.org/route/v1/driving/10.6,45.5;10.7,45.6?overview=false', 'osrmUrl lng,lat order');
let lf = legFallback([45.5, 10.6], [46.0, 10.6], 'drive');
if (lf.km < 60 || lf.km > 90) { fails++; console.error('FAIL legFallback drive km ' + lf.km); } else console.log('ok   legFallback drive ~72km');
eq(legFallback([45.5, 10.6], [45.5, 10.6], 'walk'), { km: 0, mins: 0 }, 'legFallback zero distance');
eq(fmtDuration(12), '12 min', 'fmtDuration <60');
eq(fmtDuration(65), '1 h 5 min', 'fmtDuration >60');
eq(parseOsrm({ routes: [{ distance: 8400, duration: 720 }] }), { km: 8.4, mins: 12 }, 'parseOsrm m→km s→min');
eq(parseOsrm({ routes: [] }), null, 'parseOsrm empty → null');

// ---- logos ----
eq(iataFromFlight('EK353'), 'EK', 'iata EK'); eq(iataFromFlight('W6 4551'), 'W6', 'iata W6');
eq(iataFromFlight('FI418'), 'FI', 'iata FI'); eq(iataFromFlight(''), null, 'iata empty → null');
eq(airlineLogoUrl('EK'), 'https://pics.avs.io/120/40/EK.png', 'airlineLogoUrl');
eq(brandDomain('Booking.com'), 'booking.com', 'brandDomain booking');
eq(brandDomain('Emirates'), 'emirates.com', 'brandDomain emirates');
eq(brandDomain('Some Tiny Inn'), null, 'brandDomain unknown → null');
eq(brandLogoUrl('booking.com'), 'https://logo.clearbit.com/booking.com', 'brandLogoUrl');
eq(wlShareValid('https://wanderlog.com/view/abc/my-trip'), true, 'wlShareValid: wanderlog url');
eq(wlShareValid('https://www.wanderlog.com/p/xyz'), true, 'wlShareValid: www wanderlog');
eq(wlShareValid('https://example.com/trip'), false, 'wlShareValid: non-wanderlog → false');
eq(wlShareValid(''), false, 'wlShareValid: empty → false');

// ---- weather / fx / settle-up ----
eq(weatherUrl([45.49, 10.61]),
  'https://api.open-meteo.com/v1/forecast?latitude=45.49&longitude=10.61&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16',
  'weatherUrl');
eq(pickDaily({ daily: { time: ['2026-08-01', '2026-08-02'], weather_code: [1, 61], temperature_2m_max: [28, 22], temperature_2m_min: [18, 15], precipitation_probability_max: [10, 80] } }, '2026-08-02'),
  { code: 61, tmax: 22, tmin: 15, precip: 80 }, 'pickDaily finds date');
eq(pickDaily({ daily: { time: ['2026-08-01'] } }, '2030-01-01'), null, 'pickDaily out of range → null');
eq(weatherCacheKey([45.494, 10.606]), 'wx:45.49,10.61', 'weatherCacheKey rounds 2dp');
eq(weatherCacheKey(null), 'wx:', 'weatherCacheKey no coords');
eq(wmoIcon(0), '☀️', 'wmo clear'); eq(wmoIcon(61), '🌧️', 'wmo rain'); eq(wmoIcon(71), '❄️', 'wmo snow');
eq(convert(100, 1.08), 108, 'convert'); eq(convert(null, 1.08), null, 'convert null');
eq(simplifyDebts({ Chongyu: 120, Yuanxin: -120 }), [{ from: 'Yuanxin', to: 'Chongyu', amount: 120 }], 'simplifyDebts 2-party');
eq(simplifyDebts({ A: 0, B: 0 }), [], 'simplifyDebts settled → []');

// ---- B03: mobile Today view (pure day/booking selection) ----
const tdays = [
  { id: 'd1', _date: '2026-08-01', _n: 1 },
  { id: 'd2', _date: '2026-08-02', _n: 2 },
  { id: 'd3', _date: '2026-08-03', _n: 3 },
];
eq(pickTodayDay(tdays, '2026-08-02'), { day: tdays[1], rel: 'today' }, 'pickTodayDay: date in range → today');
eq(pickTodayDay(tdays, '2026-07-20'), { day: tdays[0], rel: 'before' }, 'pickTodayDay: before trip → first day');
eq(pickTodayDay(tdays, '2026-09-01'), { day: tdays[2], rel: 'after' }, 'pickTodayDay: after trip → last day');
eq(pickTodayDay([], '2026-08-02'), { day: null, rel: 'none' }, 'pickTodayDay: no days → none');

const tbk = [
  { id: 'a', start: '2026-08-01T09:00' },
  { id: 'b', start: '2026-08-03T14:00' },
  { id: 'c', start: '2026-08-02T08:00' },
];
eq(nextBooking(tbk, '2026-08-01T12:00').id, 'c', 'nextBooking: earliest start at/after now');
eq(nextBooking(tbk, '2026-08-03T14:00').id, 'b', 'nextBooking: inclusive of exact now');
eq(nextBooking(tbk, '2026-08-04T00:00'), null, 'nextBooking: nothing upcoming → null');
eq(nextBooking([{ id: 'x' }], '2026-08-01'), null, 'nextBooking: skips bookings without start');

// ---- B04: booking gap / conflict detector ----
eq(flightRoute('EK 353 · Singapore (SIN) → Dubai (DXB)'), { from: 'SIN', to: 'DXB' }, 'flightRoute: parses IATA codes');
eq(flightRoute('Trenitalia · Milan → Genova'), null, 'flightRoute: no codes → null');
eq(flightRoute('Hotel night'), null, 'flightRoute: no arrow → null');

const alpineTrip = { start: '2026-08-01', end: '2026-08-17' };
// clean alpine-shaped data raises nothing
const cleanAlpine = [
  { id: 'camp', type: 'hotel', title: 'Butterfly Camping', start: '2026-08-01' },
  { id: 'van', type: 'car', title: 'Indie Campers (Venice ↔ Venice)', start: '2026-08-01T14:30', end: '2026-08-17T11:00' },
  { id: 'rialto', type: 'hotel', title: 'Rialto Venice', start: '2026-08-17' },
];
eq(bookingWarnings(cleanAlpine, alpineTrip), [], 'bookingWarnings: clean alpine → no warnings');

// clean iceland open-jaw: chained flights (KEF==KEF) raise nothing
const iceTrip = { start: '2026-08-20', end: '2026-08-29' };
const cleanIce = [
  { id: 'w6', type: 'flight', title: 'Wizz Air · Milan (MXP) → Reykjavik (KEF)', start: '2026-08-20T09:00', end: '2026-08-20T11:25' },
  { id: 'fi', type: 'flight', title: 'FI 418 · Reykjavik (KEF) → Dublin (DUB)', start: '2026-08-29T09:40', end: '2026-08-29T13:15' },
];
eq(bookingWarnings(cleanIce, iceTrip), [], 'bookingWarnings: iceland open-jaw chains → no warnings');

// out-of-range fires
let w = bookingWarnings([{ id: 'x', type: 'hotel', title: 'Stray', start: '2026-09-01' }], alpineTrip);
eq(w.map(x => x.kind), ['range'], 'bookingWarnings: out-of-range booking flagged');

// time overlap fires (two flights overlapping the same window)
w = bookingWarnings([
  { id: 'f1', type: 'flight', title: 'A (AAA) → B (BBB)', start: '2026-08-05T09:00', end: '2026-08-05T12:00' },
  { id: 'f2', type: 'flight', title: 'B (BBB) → A (AAA)', start: '2026-08-05T11:00', end: '2026-08-05T14:00' },
], alpineTrip);
eq(w.some(x => x.kind === 'overlap'), true, 'bookingWarnings: overlapping flights flagged');

// missing connecting leg fires (arrive LHR, next departs CDG)
w = bookingWarnings([
  { id: 'g1', type: 'flight', title: 'X · New York (JFK) → London (LHR)', start: '2026-08-03T08:00', end: '2026-08-03T20:00' },
  { id: 'g2', type: 'flight', title: 'Y · Paris (CDG) → Rome (FCO)', start: '2026-08-10T08:00', end: '2026-08-10T10:00' },
], alpineTrip);
eq(w.filter(x => x.kind === 'leg').length, 1, 'bookingWarnings: broken flight chain flagged');
// a real return chain (LHR==LHR) raises no leg warning
w = bookingWarnings([
  { id: 'h1', type: 'flight', title: 'X · New York (JFK) → London (LHR)', start: '2026-08-03T08:00', end: '2026-08-03T20:00' },
  { id: 'h2', type: 'flight', title: 'Y · London (LHR) → New York (JFK)', start: '2026-08-10T08:00', end: '2026-08-10T18:00' },
], alpineTrip);
eq(w.filter(x => x.kind === 'leg').length, 0, 'bookingWarnings: connected chain → no leg warning');

// ---- offline PWA shell: sw.js must precache every js/ module the app loads ----
import { readdirSync, readFileSync } from 'fs';
const sw = readFileSync(new URL('../sw.js', import.meta.url), 'utf8');
const jsFiles = readdirSync(new URL('../js/', import.meta.url)).filter(f => f.endsWith('.js')).sort();
const missing = jsFiles.filter(f => !sw.includes(`js/${f}`));
eq(missing, [], 'sw.js precaches every js/ module');
eq(/data\/alpine\.json/.test(sw), true, 'sw.js precaches the Alpine trip data');
// ---- B02: offline map tiles ----
eq(/tc-tiles/.test(sw), true, 'sw.js keeps a dedicated map-tile cache');
eq(/openstreetmap/.test(sw), true, 'sw.js recognises OSM tile requests');
eq(/k !== CACHE && k !== TILES/.test(sw), true, 'sw.js preserves the tile cache across shell-cache bumps');

// ---- B05: unassigned/orphan booking triage (pure) ----
const ob = orphanBookings([
  { id: 'a', trip: 'alpine' },
  { id: 'u', trip: 'unassigned' },
  { id: 'n', trip: null },
  { id: 'g', trip: 'ghost-trip' },   // stale id no longer in registry
], trips);
eq(ob.map(b => b.id), ['u', 'n', 'g'], 'orphanBookings: flags unassigned, no-trip, and unknown-trip; not real trips');
eq(orphanBookings([{ id: 'a', trip: 'alpine' }], trips), [], 'orphanBookings: clean booking → no orphans');

// ---- B06: "Can I make it?" timing warnings (pure) ----
eq(legGapMins('09:00–11:00', '11:00–12:30'), 0, 'legGapMins: back-to-back → 0 buffer');
eq(legGapMins('15:00–16:30', '19:30–21:00'), 180, 'legGapMins: leave 16:30, arrive 19:30 → 180 min');
eq(legGapMins('09:00', '10:00'), 60, 'legGapMins: open-ended A uses its start');
eq(legGapMins('09:00–11:00', ''), null, 'legGapMins: missing arrival time → null');
// a deliberately tight Alpine leg (0 buffer, a real drive) warns
eq(legFeasibility('09:00–11:00', '11:00–12:30', 5), { tight: true, gapMins: 0, shortBy: 5 },
  'legFeasibility: 5-min hop with 0 buffer → tight');
// a comfortable leg does not
eq(legFeasibility('15:00–16:30', '19:30–21:00', 30), { tight: false, gapMins: 180, shortBy: -150 },
  'legFeasibility: 30-min hop with 180-min gap → fine');
eq(legFeasibility('09:00–11:00', '11:00', null), null, 'legFeasibility: no travel time → null');
eq(legFeasibility('09:00', '', 10), null, 'legFeasibility: missing time → null');

// overpacked day: lots of dwell + a long inter-city drive blows the 14h budget
const packed = [
  { time: '07:00–12:00', ll: [45.49, 10.61] },   // 5h
  { time: '13:00–19:00', ll: [46.62, 8.04] },    // 6h, ~140km drive between
];
eq(dayLoad(packed).overpacked, true, 'dayLoad: 11h dwell + long alpine drive → overpacked');
// a relaxed day stays under budget
const relaxed = [
  { time: '09:00–11:00', ll: [45.49, 10.61] },
  { time: '15:00–16:30', ll: [45.47, 10.74] },
];
eq(dayLoad(relaxed).overpacked, false, 'dayLoad: light day → not overpacked');
eq(dayLoad([]).totalMins, 0, 'dayLoad: empty day → 0 minutes');

// ---- B07: nearby discovery (Overpass POI parse) ----
{
  const sirmione = [45.4936, 10.6058];
  const u = overpassUrl(sirmione, 700);
  eq(/overpass-api\.de\/api\/interpreter\?data=/.test(u), true, 'overpassUrl: hits the Overpass endpoint');
  eq(decodeURIComponent(u).includes('around:700,45.4936,10.6058'), true, 'overpassUrl: encodes radius + coords');
  eq(nearbyCacheKey(sirmione), 'nearby:45.494,10.606', 'nearbyCacheKey: rounds to 3 dp');
  const resp = { elements: [
    { type: 'node', lat: 45.4940, lon: 10.6060, tags: { name: 'Trattoria Vittoria', amenity: 'restaurant' } },
    { type: 'node', lat: 45.4937, lon: 10.6059, tags: { name: 'Gelateria', amenity: 'ice_cream' } },
    { type: 'node', lat: 45.5100, lon: 10.6300, tags: { name: 'Castello Scaligero', tourism: 'attraction' } },
    { type: 'node', lat: 45.4941, lon: 10.6061, tags: { name: 'Trattoria Vittoria', amenity: 'restaurant' } }, // dup name
    { type: 'node', lat: 45.4939, lon: 10.6058, tags: { amenity: 'bar' } },                                    // no name → skip
  ] };
  const got = parseOverpass(resp, sirmione);
  eq(got.map(g => g.n), ['Gelateria', 'Trattoria Vittoria', 'Castello Scaligero'],
    'parseOverpass: named only, deduped, nearest-first');
  eq([got[0].t, got[2].t], ['food', 'act'], 'parseOverpass: maps amenity→food, tourism→act');
  eq(got[0].cat, 'ice cream', 'parseOverpass: humanizes the OSM kind');
  eq(parseOverpass({}, sirmione), [], 'parseOverpass: empty response → []');
}

// ---- B11: planProgress (now/next/past on the Today plan) ----
{
  const plan = [
    { n: 'Breakfast', time: '08:00–09:00' },
    { n: 'Lake Como walk', time: '09:30–12:00' },
    { n: 'Lunch', time: '13:00' },          // open-ended → ends at next start (15:00)
    { n: 'Bellagio', time: '15:00–17:30' },
    { n: 'Free time', time: '' },           // untimed → neutral
  ];
  eq(planProgress(plan, '10:30'), ['past', 'now', 'next', 'upcoming', ''],
    'planProgress: mid-morning → walk is now, lunch is the next stop, later upcoming, untimed neutral');
  eq(planProgress(plan, '13:30'), ['past', 'past', 'now', 'next', ''],
    'planProgress: open-ended lunch is now (runs until 15:00), Bellagio is next');
  eq(planProgress(plan, '07:00'), ['next', 'upcoming', 'upcoming', 'upcoming', ''],
    'planProgress: before the day → first timed stop is next');
  eq(planProgress(plan, '18:00'), ['past', 'past', 'past', 'past', ''],
    'planProgress: after the day → all timed stops past');
  eq(planProgress(plan, ''), ['', '', '', '', ''], 'planProgress: unparseable now → all neutral');
  eq(planProgress([], '10:00'), [], 'planProgress: empty plan → []');
  eq(planProgress(null, '10:00'), [], 'planProgress: null plan → []');
}

// ---- B12: packing list suggestion (pure) ----
{
  const wet = [
    { weather: { tmax: 14, tmin: 8, precip: 80, code: 61 }, text: 'Funicular up the mountain; lakeside walk' },
    { weather: { tmax: 22, tmin: 14, precip: 10, code: 1 }, text: 'Swim in the lake' },
  ];
  const got = suggestPacking(wet);
  eq(got.includes('Rain shell / jacket'), true, 'suggestPacking: rain forecast → rain shell');
  eq(got.includes('Warm layer (fleece/down)'), true, 'suggestPacking: alpine lows → warm layer');
  eq(got.includes('Hiking boots'), true, 'suggestPacking: funicular/mountain plan → hiking boots');
  eq(got.includes('Swimwear'), true, 'suggestPacking: lake swim → swimwear');
  eq(got.includes('Passport / ID'), true, 'suggestPacking: always includes base essentials');
  eq(new Set(got).size, got.length, 'suggestPacking: no duplicate items');

  const dry = [{ weather: { tmax: 30, tmin: 20, precip: 5, code: 0 }, text: 'Museum visit' }];
  const g2 = suggestPacking(dry);
  eq(g2.includes('Rain shell / jacket'), false, 'suggestPacking: dry day → no rain shell');
  eq(g2.includes('Sun hat'), true, 'suggestPacking: hot day → sun hat');
  eq(g2.includes('Hiking boots'), false, 'suggestPacking: no outdoor activity → no boots');
  eq(suggestPacking([{ weather: null, text: '' }]).includes('Reusable water bottle'), true,
    'suggestPacking: no weather → still base essentials');
}

process.exit(fails ? 1 : 0);
