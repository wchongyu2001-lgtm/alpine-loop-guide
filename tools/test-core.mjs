import { assignTrip, computeBalances, routeStats, optimizeOrder, optimizePreview, effectivePlans, dayDate, parseEmailStub, thumbAccent,
  wikiSummaryUrl, wikiGeoUrl, pickSummaryThumb, pickGeoThumb, thumbCacheKey,
  gmapsPlaceUrl, amapsPlaceUrl, splitTime, joinTime, matchBooking, pickSummaryExtract, factCacheKey,
  placeProxyUrl, placePhotoUrl, placeCacheKey, fmtRating, priceTier, parsePlace,
  modeProfile, osrmUrl, legFallback, fmtDuration, parseOsrm,
  iataFromFlight, airlineLogoUrl, brandDomain, brandLogoUrl, wlShareValid,
  weatherUrl, weatherCacheKey, pickDaily, wmoIcon, daylight, convert, simplifyDebts,
  pickTodayDay, nextBooking, flightRoute, bookingWarnings, orphanBookings,
  legGapMins, legFeasibility, dayLoad,
  overpassUrl, parseOverpass, nearbyCacheKey, budgetVsActual, planProgress, suggestPacking,
  buildManualBooking, coverageGaps, accommodationStrip, bookingTimeline, bookingReminders,
  bookingRollup, tripEstimate, fuelEstimate, transportContinuity, bookingIcs, tripIcs,
  nextUpcoming, fmtCountdown, searchRecords, fxConvert, replanNudge, countryEssentials, tripOverview,
  mapTypeChoice, tripTotals, daysToDeparture, dayNote } from '../js/core.js';

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

// B13: optimize-day preview — optimized order + km/time saved vs current order.
{
  const pv = optimizePreview(pts, p => p.ll);
  eq(pv.optimized.map(p => p.ll[1]), [0, 1, 2, 3], 'optimizePreview: returns the optimized order');
  if (!(pv.savedKm > 0)) { fails++; console.error(`FAIL optimizePreview savedKm=${pv.savedKm} expected >0`); }
  else console.log(`ok   optimizePreview saves ~${pv.savedKm}km`);
  if (!(pv.before.km >= pv.after.km)) { fails++; console.error('FAIL optimizePreview after route longer than before'); }
  // Already-optimal order → zero (never negative) savings.
  const opt = [{ ll: [0, 0] }, { ll: [0, 1] }, { ll: [0, 2] }];
  eq(optimizePreview(opt, p => p.ll).savedKm, 0, 'optimizePreview: already-shortest → 0 saved (no negative)');
  // Anchor (day start) is folded into both routes.
  const withAnchor = optimizePreview(pts, p => p.ll, [0, 0]);
  if (withAnchor.before.km < pv.before.km) { fails++; console.error('FAIL optimizePreview anchor not counted'); }
}

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
  'https://api.open-meteo.com/v1/forecast?latitude=45.49&longitude=10.61&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset&timezone=auto&forecast_days=16',
  'weatherUrl');
eq(pickDaily({ daily: { time: ['2026-08-01', '2026-08-02'], weather_code: [1, 61], temperature_2m_max: [28, 22], temperature_2m_min: [18, 15], precipitation_probability_max: [10, 80], sunrise: ['2026-08-01T06:01', '2026-08-02T06:02'], sunset: ['2026-08-01T20:30', '2026-08-02T20:28'] } }, '2026-08-02'),
  { code: 61, tmax: 22, tmin: 15, precip: 80, sunrise: '2026-08-02T06:02', sunset: '2026-08-02T20:28' }, 'pickDaily finds date');
eq(pickDaily({ daily: { time: ['2026-08-01'] } }, '2030-01-01'), null, 'pickDaily out of range → null');
// B32: daylight summary
eq(daylight({ sunrise: '2026-06-15T05:38', sunset: '2026-06-15T21:02' }),
  { rise: '05:38', set: '21:02', length: '15h 24m', golden: '20:02' }, 'daylight computes rise/set/length/golden');
eq(daylight({ sunrise: null, sunset: null }), null, 'daylight no sun fields → null (degrades)');
eq(daylight(null), null, 'daylight no weather → null');
eq(daylight({ sunrise: '2026-12-21T08:05', sunset: '2026-12-21T16:25' }).length, '8h 20m', 'daylight short winter day');
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

// ---- B23: bookingTimeline ----
{
  const tl = bookingTimeline([
    { id: 'b', type: 'activity', title: 'Boat', start: '2026-08-05T15:00', end: '2026-08-05T16:00' },
    { id: 'a', type: 'flight', title: 'A (AAA) → B (BBB)', start: '2026-08-05T09:00', end: '2026-08-05T12:00' },
    { id: 'c', type: 'hotel', title: 'Stay', start: '2026-08-04' },
  ], alpineTrip);
  eq(tl.map(g => g.date), ['2026-08-04', '2026-08-05'], 'bookingTimeline: days sorted ascending');
  eq(tl[1].items.map(i => i.booking.id), ['a', 'b'], 'bookingTimeline: within a day, time-sorted');
  eq(tl[1].items.every(i => !i.overlap), true, 'bookingTimeline: non-overlapping day → no flags');

  const ov = bookingTimeline([
    { id: 'f1', type: 'flight', title: 'A (AAA) → B (BBB)', start: '2026-08-05T09:00', end: '2026-08-05T12:00' },
    { id: 'f2', type: 'flight', title: 'B (BBB) → A (AAA)', start: '2026-08-05T11:00', end: '2026-08-05T14:00' },
  ], alpineTrip);
  eq(ov[0].items.every(i => i.overlap), true, 'bookingTimeline: overlapping pair both flagged');
  eq(bookingTimeline([], alpineTrip), [], 'bookingTimeline: no bookings → empty');
  eq(bookingTimeline([{ id: 'x', type: 'hotel', title: 'No date' }], alpineTrip), [],
    'bookingTimeline: undated booking skipped');
}

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

// ---- B14: country essentials (static offline reference) ----
const it = countryEssentials('IT');
eq(it.emergency, '112', 'B14: Italy emergency is 112');
eq(/EUR/.test(it.currency), true, 'B14: Italy currency is EUR');
eq(/C|F/.test(it.plugs), true, 'B14: Italy plug type includes C/F');
eq(it.phrases.length > 0, true, 'B14: Italy has language basics');
eq(countryEssentials('is').name, 'Iceland', 'B14: lookup is case-insensitive');
eq(countryEssentials('ZZ'), null, 'B14: unknown country → null (graceful)');
eq(countryEssentials(null), null, 'B14: missing code → null');
// Every trip in the registry resolves to a known essentials entry.
const reg = JSON.parse(readFileSync(new URL('../data/trips.json', import.meta.url), 'utf8'));
const unresolved = reg.trips.filter(t => !countryEssentials(t.country));
eq(unresolved.map(t => t.id), [], 'B14: every trip has resolvable country essentials');

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

// ---- B16: next-up countdown (pure) ----
{
  const plan = [
    { n: 'Breakfast', time: '08:00' },
    { n: 'Funicular', time: '10:30–11:00' },
    { n: 'Lakeside walk', time: '14:00' },
    { n: 'Free time' },
  ];
  const bk = [
    { id: 'h', type: 'hotel', title: 'Hotel Bellagio', start: '2026-06-15T15:00' },
    { id: 't', type: 'train', title: 'Train to Milan', start: '2026-06-16T09:00' },
  ];
  const a = nextUpcoming(plan, bk, '2026-06-15T09:10');
  eq(a.stop.name, 'Funicular', 'nextUpcoming: soonest future timed stop');
  eq(a.stop.mins, 80, 'nextUpcoming: minutes until that stop');
  eq(a.booking.name, 'Hotel Bellagio', 'nextUpcoming: next upcoming booking');
  eq(a.booking.mins, 350, 'nextUpcoming: minutes until that booking');

  const b = nextUpcoming(plan, bk, '2026-06-15T16:00');
  eq(b.stop, null, 'nextUpcoming: no timed stops left today → null stop');
  eq(b.booking.name, 'Train to Milan', 'nextUpcoming: rolls to next-day booking');

  const c = nextUpcoming(plan, [], '2026-06-15T23:00');
  eq(c.stop, null, 'nextUpcoming: nothing left → null stop');
  eq(c.booking, null, 'nextUpcoming: no bookings → null booking');

  eq(fmtCountdown(80), '1h 20m', 'fmtCountdown: hours and minutes');
  eq(fmtCountdown(45), '45m', 'fmtCountdown: minutes only');
  eq(fmtCountdown(120), '2h', 'fmtCountdown: whole hours drop minutes');
  eq(fmtCountdown(0), 'now', 'fmtCountdown: zero → now');
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

// ---- B19: weather-aware re-plan nudge (pure) ----
{
  const outdoorDay = [{ t: 'view' }, { t: 'hike' }, { t: 'lake' }, { t: 'food' }]; // 3/4 outdoor
  const rainy = { code: 61, tmax: 16, tmin: 10, precip: 80 };
  const clear = { code: 0, tmax: 26, tmin: 14, precip: 5 };
  const r = replanNudge(outdoorDay, rainy);
  eq(!!r, true, 'replanNudge: rainy + mostly-outdoor day → nudge');
  eq(r.outdoor, 3, 'replanNudge: counts 3 outdoor stops');
  eq(r.suggest.includes('museums'), true, 'replanNudge: suggests indoor categories');
  eq(replanNudge(outdoorDay, clear), null, 'replanNudge: clear day → no nudge (no false positive)');
  eq(replanNudge([{ t: 'food' }, { t: 'food' }, { t: 'view' }], rainy), null,
    'replanNudge: mostly-indoor day → no nudge even in rain');
  eq(replanNudge([{ t: 'view' }], rainy), null, 'replanNudge: single stop → no nudge');
  eq(replanNudge(outdoorDay, null), null, 'replanNudge: no weather → no nudge');
  eq(replanNudge([{ t: 'view' }, { t: 'view' }], { code: 45, precip: 10 }), null,
    'replanNudge: fog/no-rain code → no nudge');
}

// ---- B21: manual quick-add booking (pure) ----
{
  const trips = [{ id: 'alpine', start: '2026-08-01', end: '2026-08-17' }];
  const full = buildManualBooking({
    type: 'hotel', title: '  B&B Hotel Milano  ', provider: ' Booking.com ',
    start: '2026-08-05T14:00', end: '2026-08-06T11:00', location: ' Milan ',
    conf: ' ABC123 ', amount: '120', currency: ' EUR ', pax: ' Chongyu , Yuanxin ,',
  }, trips, '€', 'manual-1');
  eq(full, {
    id: 'manual-1', trip: 'alpine', type: 'hotel', title: 'B&B Hotel Milano',
    start: '2026-08-05T14:00', end: '2026-08-06T11:00', provider: 'Booking.com',
    confirmation: 'ABC123', price: { amount: 120, currency: 'EUR' },
    pax: ['Chongyu', 'Yuanxin'], location: { name: 'Milan' }, source: 'manual',
  }, 'buildManualBooking: full hotel → trimmed, filed to alpine, pax split, price set');

  const min = buildManualBooking({ title: 'Mystery', start: '2026-09-01T09:00' }, trips, '€', 'manual-2');
  eq(min, {
    id: 'manual-2', trip: 'unassigned', type: 'other', title: 'Mystery',
    start: '2026-09-01T09:00', end: null, provider: null, confirmation: null,
    price: null, pax: null, location: null, source: 'manual',
  }, 'buildManualBooking: bare fields → empty optionals null, default type, unassigned outside trips');

  eq(buildManualBooking({ title: 'x', start: '2026-08-05', amount: '' }, trips, '€', 'm3').price, null,
    'buildManualBooking: blank amount → no price');
  eq(buildManualBooking({ title: 'x', start: '2026-08-05', amount: '50' }, trips, '£', 'm4').price,
    { amount: 50, currency: '£' }, 'buildManualBooking: amount without currency → trip default currency');
}

// ---- B22: coverageGaps ----
{
  // A 3-night stretch: hotel covers nights 1-2, relocation on night 3 has a train; clean.
  const days = [
    { _date: '2026-07-24', sleep: 'Hotel Milano' },
    { _date: '2026-07-25', sleep: 'Hotel Milano' },
    { _date: '2026-07-26', sleep: 'Hotel Genova' },
    { _date: '2026-07-27', sleep: 'Hotel Genova' },  // departure day — no night needed
  ];
  const clean = [
    { id: 'h1', type: 'hotel', title: 'Milano', start: '2026-07-24', end: '2026-07-26' },
    { id: 'h2', type: 'hotel', title: 'Genova', start: '2026-07-26', end: '2026-07-27' },
    { id: 't1', type: 'train', title: 'Milano→Genova', start: '2026-07-26T08:00' },
  ];
  eq(coverageGaps(days, clean), [], 'coverageGaps: fully-covered stretch → nothing');

  // Drop the Genova hotel + the train: night 2026-07-26 uncovered, move flagged.
  const gaps = coverageGaps(days, [clean[0]]);
  eq(gaps.map(g => [g.kind, g.date]),
    [['lodging', '2026-07-26'], ['transport', '2026-07-26']],
    'coverageGaps: missing hotel + transport both flagged, sorted by date');
  eq(gaps[1].from + '→' + gaps[1].to, 'Hotel Milano→Hotel Genova',
    'coverageGaps: transport gap carries the from/to bases');

  // A trip-spanning campervan: it is the bed AND covers every driving leg → no gaps.
  const vanDays = [
    { _date: '2026-08-01', sleep: 'Garda' },
    { _date: '2026-08-02', sleep: 'Lucerne' },
    { _date: '2026-08-03', sleep: 'Zermatt' },
  ];
  const van = [{ id: 'v', type: 'car', title: "Indie Campers · 'Active Long' campervan",
    start: '2026-08-01T14:30', end: '2026-08-03T11:00' }];
  eq(coverageGaps(vanDays, van), [], 'coverageGaps: campervan is bed + covers legs → no false positives');

  // A plain rental car covers the legs (you drive) but is NOT a bed → nights still flag.
  const carGaps = coverageGaps(vanDays, [{ id: 'c', type: 'car', title: 'Hertz · Golf',
    start: '2026-08-01', end: '2026-08-03' }]);
  eq(carGaps.map(g => g.kind), ['lodging', 'lodging'],
    'coverageGaps: ordinary car covers transport but not lodging');

  eq(coverageGaps([], clean), [], 'coverageGaps: no days → nothing');

  // ---- B24: accommodationStrip ----
  const strip = accommodationStrip(days, clean);
  eq(strip.map(n => n.date), ['2026-07-24', '2026-07-25', '2026-07-26'],
    'accommodationStrip: one cell per night, departure day excluded');
  eq(strip.map(n => n.covered), [true, true, true], 'accommodationStrip: all nights covered → true');
  eq(strip[0].name, 'Milano', 'accommodationStrip: covered night carries booking title');
  eq(strip[2].name, 'Genova', 'accommodationStrip: checkout-exclusive — night 26 is the Genova stay');

  const partial = accommodationStrip(days, [clean[0]]);  // only Milano hotel (covers 24,25)
  eq(partial.map(n => n.covered), [true, true, false], 'accommodationStrip: uncovered night → false');
  eq(partial[2].sleep, 'Hotel Genova', 'accommodationStrip: uncovered cell carries the day base for context');

  const vanStrip = accommodationStrip(vanDays, van);
  eq(vanStrip.map(n => n.covered), [true, true], 'accommodationStrip: campervan counts as the bed');
  eq(accommodationStrip([], clean), [], 'accommodationStrip: no days → empty');
  eq(accommodationStrip([{ _date: '2026-07-24' }], clean), [],
    'accommodationStrip: single day (departure only) → no nights');
}

// ---- B25: bookingReminders ----
{
  const now = '2026-08-16T10:00';
  const bks = [
    { id: 'f1', type: 'flight', title: 'AZ 100 dep tomorrow', start: '2026-08-17T08:00' },   // check-in opens within 48h
    { id: 'f2', type: 'flight', title: 'AZ 200 dep next week', start: '2026-08-24T08:00' },   // opens far out → skipped
    { id: 'f3', type: 'flight', title: 'AZ 300 open now', start: '2026-08-16T20:00' },        // window already open
    { id: 'h1', type: 'hotel', title: 'Hotel A', start: '2026-08-18', end: '2026-08-20',
      checkin_time: '15:00', checkout_time: '11:00', free_cancellation_until: '2026-08-17T23:59' },
    { id: 'h2', type: 'hotel', title: 'Hotel B (no times)', start: '2026-08-18', end: '2026-08-20' }, // no fields → nothing
  ];
  const r = bookingReminders(bks, now);
  eq(r.map(x => x.kind), ['checkin', 'checkin', 'cancel', 'hotel-in', 'hotel-out'],
    'bookingReminders: derives flight check-in / cancel / hotel in+out, sorted by due, no spurious');
  eq(r[0].id === 'f3' && r[0].urgent, true, 'bookingReminders: an open check-in window is first and urgent');
  eq(r.every((x, i) => i === 0 || r[i - 1].due <= x.due), true, 'bookingReminders: sorted ascending by due');
  eq(r.some(x => x.id === 'f2'), false, 'bookingReminders: check-in beyond the horizon is not surfaced');
  eq(r.some(x => x.id === 'h2'), false, 'bookingReminders: a hotel with no check-in/cancel fields raises nothing');
  eq(bookingReminders(bks, 'not-a-date'), [], 'bookingReminders: bad now → empty');
  eq(bookingReminders([], now), [], 'bookingReminders: no bookings → empty');
}

// ---- B26: bookingRollup + tripEstimate ----
{
  const bks = [
    { id: 'f1', type: 'flight', title: 'AZ 100', price: { amount: 200, currency: 'EUR' } },
    { id: 'f2', type: 'flight', title: 'AZ 200', price: { amount: 100, currency: 'EUR' } },
    { id: 'h1', type: 'hotel', title: 'Hotel A', price: { amount: 300, currency: 'EUR' } },
    { id: 't1', type: 'train', title: 'Trenitalia', price: { amount: 50, currency: 'EUR' } },
    { id: 'c1', type: 'car', title: 'Hertz', price: { amount: 150, currency: 'EUR' } },
    { id: 'a1', type: 'activity', title: 'Funicular', price: { amount: 40, currency: 'EUR' } },
    { id: 'o1', type: 'other', title: 'Misc', price: { amount: 10, currency: 'EUR' } },
    { id: 'np', type: 'hotel', title: 'No price', price: null },           // ignored
    { id: 'z', type: 'flight', title: 'Zero', price: { amount: 0 } },      // ignored
  ];
  const r = bookingRollup(bks);
  eq(r.total, 850, 'bookingRollup: grand total sums only priced bookings');
  eq(r.count, 7, 'bookingRollup: counts only priced bookings');
  eq(r.byType.map(t => [t.key, t.total]),
    [['flights', 300], ['stays', 300], ['transport', 200], ['activities', 40], ['other', 10]],
    'bookingRollup: grouped by headline type in fixed order, train+car → transport');
  eq(bookingRollup([]), { byType: [], total: 0, count: 0 }, 'bookingRollup: no bookings → empty');

  // FX: a USD booking converted to EUR via toBase (USD rate = 1.1 units per EUR → /1.1)
  const fxRates = { EUR: 1, USD: 1.1 };
  const toBase = (amt, c) => (!c || c === 'EUR') ? amt : convert(amt, 1 / fxRates[c]);
  const fxRoll = bookingRollup([{ type: 'hotel', price: { amount: 110, currency: 'USD' } }], toBase);
  eq(fxRoll.total, 100, 'bookingRollup: FX-converts foreign currency into base via toBase');

  const days = [{ id: 'd1', drive: 2 }, { id: 'd2', drive: 0 }];
  const budget = { d1: { camp: 30, food: 20, act: { bu: 10, sp: 50 }, x: 5 }, d2: { camp: 25, food: 15 } };
  const meta = { fuelPerH: 8 };
  eq(tripEstimate(days, budget, meta, 'bu').total, 30 + 20 + 10 + 5 + 16 + 25 + 15,
    'tripEstimate: bu mode sums camp+food+act.bu+x+fuel across days');
  eq(tripEstimate(days, budget, meta, 'sp').rows[0].total, 30 + 20 + 50 + 5 + 16,
    'tripEstimate: sp mode uses the splurge activity tier');
  eq(tripEstimate([], budget, meta).total, 0, 'tripEstimate: no days → 0');
}

// ---- B30: fuelEstimate ----
{
  const days = [{ id: 'd1', short: 'A', ll: [45, 10] }, { id: 'd2', short: 'B', ll: [46, 10] }, { id: 'd3', short: 'C', ll: [46, 10] }];
  const f = fuelEstimate(days, { fuelPerH: 10 }, 2);
  eq(f.legs.length, 1, 'fuelEstimate: one driving leg (the zero-distance same-base leg is dropped)');
  eq(f.legs[0], { from: 'A', to: 'B', km: 145, litres: 14.5, cost: 29 },
    'fuelEstimate: road-scaled km, litres = km/100×L/100km, cost = litres×price');
  eq([f.totalKm, f.totalLitres, f.totalCost], [145, 14.5, 29], 'fuelEstimate: totals sum the legs');
  eq(fuelEstimate(days, { fuelPerH: 10 }, 0).totalCost, 0, 'fuelEstimate: price 0 → no cost');
  eq(fuelEstimate(days, { fuelPerH: 0 }, 2).totalLitres, 0, 'fuelEstimate: no consumption figure → 0 litres');
  eq(fuelEstimate([], { fuelPerH: 10 }, 2), { legs: [], totalKm: 0, totalLitres: 0, totalCost: 0 }, 'fuelEstimate: no days → empty');
}

// ---- B27: transportContinuity ----
{
  // A clean multi-leg chain (arrive = next depart) raises nothing.
  const clean = [
    { id: 'f1', type: 'flight', title: 'EK 1 · Singapore (SIN) → Dubai (DXB)', start: '2026-07-24T00:50', end: '2026-07-24T04:05' },
    { id: 'f2', type: 'flight', title: 'EK 2 · Dubai (DXB) → Milan (MXP)', start: '2026-07-24T09:35', end: '2026-07-24T14:10' },
    { id: 'c1', type: 'car', title: 'Indie Campers (Venice ↔ Venice)', start: '2026-08-01', end: '2026-08-17' },
  ];
  eq(transportContinuity(clean), [], 'transportContinuity: clean chain + round-trip van → no issues');

  // Broken same-day connection: land DXB but next leg departs DOH the same day.
  const broke = [
    { id: 'f1', type: 'flight', title: 'EK 1 · Singapore (SIN) → Dubai (DXB)', start: '2026-07-24T00:50', end: '2026-07-24T04:05' },
    { id: 'f2', type: 'flight', title: 'QR 9 · Doha (DOH) → Milan (MXP)', start: '2026-07-24T09:35', end: '2026-07-24T14:10' },
  ];
  eq(transportContinuity(broke).map(c => [c.kind, c.id]), [['break', 'f2']],
    'transportContinuity: same-day arrive≠depart → break flag');

  // Same-time jump: two timed legs overlap from different origins.
  const jump = [
    { id: 'a', type: 'train', title: 'A · Rome → Naples', start: '2026-07-24T09:00', end: '2026-07-24T11:00' },
    { id: 'b', type: 'train', title: 'B · Florence → Bologna', start: '2026-07-24T10:00', end: '2026-07-24T12:00' },
  ];
  eq(transportContinuity(jump).filter(c => c.kind === 'jump').map(c => c.id), ['b'],
    'transportContinuity: overlapping legs from different places → jump flag');

  // One-way vehicle rental: pickup ≠ drop-off, no "↔".
  const oneway = [{ id: 'c', type: 'car', title: 'Hertz · Milan → Rome', start: '2026-08-01', end: '2026-08-05' }];
  eq(transportContinuity(oneway).map(c => c.kind), ['noreturn'],
    'transportContinuity: one-way car drop-off → noreturn flag');

  // Far-apart legs with different places are NOT flagged (normal unbooked transfer).
  const farapart = [
    { id: 'f1', type: 'flight', title: 'X · A (AAA) → B (BBB)', start: '2026-07-24T09:00', end: '2026-07-24T11:00' },
    { id: 't1', type: 'train', title: 'Y · Cville → Dtown', start: '2026-07-27T09:00', end: '2026-07-27T11:00' },
  ];
  eq(transportContinuity(farapart), [], 'transportContinuity: legs days apart → no false break');
}

// ---- B28: bookingIcs single-booking calendar export ----
{
  const STAMP = '20260614T120000Z';
  const hotel = {
    id: 'manual-1', type: 'hotel', title: 'B&B Hotel, Milano', provider: 'Booking.com',
    start: '2026-08-05T15:00', end: '2026-08-06T11:00', confirmation: 'ABC-123',
    price: { amount: 240, currency: 'EUR' }, pax: ['Chongyu', 'Yuanxin'],
    location: { name: 'Via Roma 1, Milano' },
  };
  const ics = bookingIcs(hotel, STAMP).split('\r\n');
  eq(ics[0], 'BEGIN:VCALENDAR', 'bookingIcs: starts a VCALENDAR');
  eq(ics[ics.length - 1], 'END:VCALENDAR', 'bookingIcs: ends the VCALENDAR');
  eq(ics.includes('BEGIN:VEVENT') && ics.includes('END:VEVENT'), true, 'bookingIcs: wraps one VEVENT');
  eq(ics.includes('DTSTART:20260805T150000'), true, 'bookingIcs: timed DTSTART floating-local');
  eq(ics.includes('DTEND:20260806T110000'), true, 'bookingIcs: timed DTEND from end');
  eq(ics.includes('UID:manual-1@travel-companion'), true, 'bookingIcs: UID from booking id');
  eq(ics.includes('DTSTAMP:20260614T120000Z'), true, 'bookingIcs: DTSTAMP passed through');
  eq(ics.includes('SUMMARY:B&B Hotel\\, Milano'), true, 'bookingIcs: escapes comma in SUMMARY');
  eq(ics.includes('LOCATION:Via Roma 1\\, Milano'), true, 'bookingIcs: LOCATION present + escaped');
  eq(ics.some(l => l.startsWith('DESCRIPTION:') && l.includes('Confirmation: ABC-123')), true, 'bookingIcs: conf in DESCRIPTION');

  // Date-only start, no end → all-day VALUE=DATE, no DTEND/DURATION.
  const allday = bookingIcs({ id: 'x', type: 'activity', title: 'Funicular', start: '2026-08-07' }, STAMP).split('\r\n');
  eq(allday.includes('DTSTART;VALUE=DATE:20260807'), true, 'bookingIcs: date-only → all-day DTSTART');
  eq(allday.some(l => l.startsWith('DTEND') || l.startsWith('DURATION')), false, 'bookingIcs: all-day with no end → no DTEND/DURATION');

  // Timed start, no end → 1-hour default duration.
  const noend = bookingIcs({ id: 'y', type: 'train', title: 'Train', start: '2026-08-08T09:30' }, STAMP).split('\r\n');
  eq(noend.includes('DURATION:PT1H'), true, 'bookingIcs: timed + no end → PT1H default');
}

// ---- B17: tripIcs whole-trip calendar export (bookings + timed stops) ----
{
  const STAMP = '20260614T120000Z';
  const bookings = [
    { id: 'b1', type: 'hotel', title: 'Hotel, Bormio', start: '2026-08-05T15:00', end: '2026-08-06T11:00' },
    { id: 'b2', type: 'train', title: 'Train', start: '2026-08-07T09:30' },
  ];
  const days = [
    { id: 'd1', _date: '2026-08-05' },
    { id: 'd2', _date: '2026-08-06' },
    { id: 'd3', _date: null }, // undated day → skipped entirely
  ];
  const plans = {
    d1: [{ n: 'Funicular', time: '9:00–10:30', note: 'Bring a jacket' }, { n: 'Lunch spot' /* untimed */ }],
    d2: [{ n: 'Spa', time: '14:00' }],
    d3: [{ n: 'Ghost', time: '08:00' }],
  };
  const cal = tripIcs(bookings, days, plans, STAMP, 'Alpine, 2026').split('\r\n');
  eq(cal[0], 'BEGIN:VCALENDAR', 'tripIcs: starts a VCALENDAR');
  eq(cal[cal.length - 1], 'END:VCALENDAR', 'tripIcs: ends the VCALENDAR');
  eq(cal.includes('PRODID:-//Travel Companion//Trip//EN'), true, 'tripIcs: trip PRODID');
  eq(cal.includes('X-WR-CALNAME:Alpine\\, 2026'), true, 'tripIcs: calendar name escaped');
  // One VEVENT per booking (2) + per timed stop (Funicular, Spa = 2); untimed + undated skipped.
  eq(cal.filter(l => l === 'BEGIN:VEVENT').length, 4, 'tripIcs: one VEVENT per booking + timed stop');
  eq(cal.includes('SUMMARY:Funicular'), true, 'tripIcs: timed stop event present');
  eq(cal.includes('DTSTART:20260805T090000'), true, 'tripIcs: stop time padded to HH:MM:SS');
  eq(cal.includes('DTEND:20260805T103000'), true, 'tripIcs: stop end from time range');
  eq(cal.includes('UID:stop-d1-0@travel-companion'), true, 'tripIcs: stop UID from day+index');
  eq(cal.includes('DURATION:PT1H'), true, 'tripIcs: timed stop with no end → PT1H');
  eq(cal.includes('SUMMARY:Lunch spot'), false, 'tripIcs: untimed stop skipped');
  eq(cal.includes('SUMMARY:Ghost'), false, 'tripIcs: undated day skipped');
  eq(cal.includes('SUMMARY:Hotel\\, Bormio'), true, 'tripIcs: booking events included + escaped');
}

// ---- B18: offline trip search (pure token filter) ----
{
  const recs = [
    { kind: 'place', title: 'Sirmione', text: 'Sirmione lakefront town Scaliger castle SAT 1 AUG' },
    { kind: 'note', title: 'Day 1', text: 'Big cheap supermarket shop here Swiss prices later' },
    { kind: 'booking', title: 'Butterfly Camping', text: 'Butterfly Camping Booking.com NP7QJQ Peschiera hotel' },
  ];
  eq(searchRecords(recs, 'castle').map(r => r.title), ['Sirmione'], 'searchRecords: matches a place by description');
  eq(searchRecords(recs, 'SUPERMARKET').map(r => r.kind), ['note'], 'searchRecords: case-insensitive');
  eq(searchRecords(recs, 'np7qjq').map(r => r.title), ['Butterfly Camping'], 'searchRecords: finds a booking confirmation #');
  eq(searchRecords(recs, 'camping peschiera').map(r => r.title), ['Butterfly Camping'],
    'searchRecords: multi-token AND across fields');
  eq(searchRecords(recs, 'castle supermarket'), [], 'searchRecords: tokens in different records → no match (AND)');
  eq(searchRecords(recs, ''), [], 'searchRecords: empty query → no rows (caller restores full view)');
  eq(searchRecords(recs, '   '), [], 'searchRecords: whitespace-only query → no rows');
  eq(searchRecords(null, 'x'), [], 'searchRecords: null records → []');
  eq(searchRecords(recs, 'zzz').length, 0, 'searchRecords: no match → empty');
}

// ---- B15: quick currency converter (two-way, rate = home units per 1 base) ----
{
  // EUR base, USD home, rate 1.08
  eq(fxConvert(100, 1.08, 'toHome'), 108, 'fxConvert: base→home multiplies');
  eq(fxConvert(108, 1.08, 'toBase'), 100, 'fxConvert: home→base divides (round-trips)');
  eq(fxConvert(0, 1.08, 'toHome'), 0, 'fxConvert: zero amount → 0');
  eq(fxConvert(10, 1.2345, 'toHome'), 12.35, 'fxConvert: rounds to 2dp');
  eq(fxConvert(null, 1.08, 'toHome'), null, 'fxConvert: null amount → null');
  eq(fxConvert(NaN, 1.08, 'toHome'), null, 'fxConvert: NaN amount → null');
  eq(fxConvert(100, 0, 'toBase'), null, 'fxConvert: zero rate → null (avoids div-by-0)');
  eq(fxConvert(50, 1, 'toHome'), 50, 'fxConvert: rate 1 is identity');
}

// ---- B20: trip overview rows (date · headline · first stop · booking markers) ----
{
  const days = [
    { id: 'd1', _n: 1, _date: '2026-08-01', _label: 'Sat 1 Aug', short: 'Arrive Peschiera', plan: [{ n: 'Sirmione' }, { n: 'Lake walk' }] },
    { id: 'd2', _n: 2, _date: '2026-08-02', _label: 'Sun 2 Aug', short: '', plan: [{ n: 'Verona' }] },
    { id: 'd3', _n: 3, _date: '2026-08-03', _label: 'Mon 3 Aug', short: 'Travel north', plan: [] },
  ];
  const bookings = [
    { type: 'hotel', title: 'Butterfly Camping', start: '2026-08-01T15:00' },
    { type: 'train', title: 'Verona → Bolzano', start: '2026-08-03T09:10' },
    { type: 'activity', title: 'Other trip', start: '2026-08-01T10:00', trip: 'x' },
  ];
  const ov = tripOverview(days, { d1: days[0].plan, d2: days[1].plan, d3: days[2].plan }, bookings);
  eq(ov.length, 3, 'tripOverview: one row per day');
  eq(ov[0], { id: 'd1', n: 1, date: 'Sat 1 Aug', headline: 'Arrive Peschiera', firstStop: 'Sirmione',
    bookings: [{ type: 'hotel', title: 'Butterfly Camping' }, { type: 'activity', title: 'Other trip' }] },
    'tripOverview: headline + first stop + that day\'s bookings (matched by date)');
  eq(ov[1].headline, 'Verona', 'tripOverview: falls back to first stop when no short headline');
  eq(ov[1].bookings, [], 'tripOverview: a day with no bookings → empty markers');
  eq(ov[2].firstStop, '', 'tripOverview: empty plan → no first stop');
  eq(ov[2].bookings.map(b => b.title), ['Verona → Bolzano'], 'tripOverview: booking lands on its date');
  eq(tripOverview(null), [], 'tripOverview: null days → []');
  eq(tripOverview(days)[0].bookings, [], 'tripOverview: no bookings arg → empty markers');
}

// ---- B29: map layer choice (normalise stored Google Maps type, default satellite) ----
{
  eq(mapTypeChoice('satellite'), 'satellite', 'mapTypeChoice: keeps satellite');
  eq(mapTypeChoice('roadmap'), 'roadmap', 'mapTypeChoice: keeps roadmap');
  eq(mapTypeChoice('terrain'), 'terrain', 'mapTypeChoice: keeps terrain');
  eq(mapTypeChoice('hybrid'), 'hybrid', 'mapTypeChoice: keeps hybrid');
  eq(mapTypeChoice('SATELLITE'), 'satellite', 'mapTypeChoice: case-insensitive');
  eq(mapTypeChoice(null), 'satellite', 'mapTypeChoice: null → satellite default');
  eq(mapTypeChoice(''), 'satellite', 'mapTypeChoice: empty → satellite default');
  eq(mapTypeChoice('bogus'), 'satellite', 'mapTypeChoice: unknown value → satellite default');
}

// ---- B31: trip totals + departure countdown ----
{
  const days = [
    { id: 'd1', drive: 2, sleep: 'Camping Garda', ll: [45.55, 10.62], plan: [{ n: 'a' }, { n: 'b' }] },
    { id: 'd2', drive: 4, sleep: 'Aire Bolzano', ll: [46.50, 11.35], plan: [{ n: 'c' }] },
    { id: 'd3', drive: 0, sleep: '', ll: [46.62, 11.16], plan: [] },
  ];
  const bookings = [{ id: 'b1' }, { id: 'b2' }];
  const t = tripTotals(days, bookings);
  eq(t.days, 3, 'tripTotals: day count');
  eq(t.driveHours, 6, 'tripTotals: sums authored drive hours');
  eq(t.nights, 2, 'tripTotals: counts only days with a sleep base');
  eq(t.stops, 3, 'tripTotals: sums planned stops across days');
  eq(t.bookings, 2, 'tripTotals: booking count');
  eq(t.km, routeStats(days.map(d => d.ll)).km, 'tripTotals: km = road-scaled route over bases');
  eq(t.km > 0, true, 'tripTotals: positive distance for a real route');

  const ov = tripTotals(days, bookings, { plans: { d3: [{ n: 'x' }, { n: 'y' }] } });
  eq(ov.stops, 5, 'tripTotals: overlay plans override base plan in stop count');

  const empty = tripTotals([], []);
  eq(empty, { days: 0, km: 0, driveHours: 0, nights: 0, stops: 0, bookings: 0 }, 'tripTotals: empty trip → zeros');
  eq(tripTotals(null), { days: 0, km: 0, driveHours: 0, nights: 0, stops: 0, bookings: 0 }, 'tripTotals: null days → zeros');

  eq(daysToDeparture('2026-08-01', '2026-07-25'), 7, 'daysToDeparture: 7 days out');
  eq(daysToDeparture('2026-08-01', '2026-08-01'), 0, 'daysToDeparture: leaves today → 0');
  eq(daysToDeparture('2026-08-01', '2026-08-03'), -2, 'daysToDeparture: under way → negative');
  eq(daysToDeparture(null, '2026-08-01'), null, 'daysToDeparture: missing start → null');
  eq(daysToDeparture('2026-08-01', 'nope'), null, 'daysToDeparture: bad today → null');
}

// ---- B33: free-form day notes (pure overlay read) ----
eq(dayNote({ dayNotes: { d1: '  fill water  ' } }, 'd1'), 'fill water', 'dayNote: returns trimmed note for the day');
eq(dayNote({ dayNotes: { d1: 'x' } }, 'd2'), '', 'dayNote: missing day → empty string');
eq(dayNote({}, 'd1'), '', 'dayNote: no dayNotes map → empty string');
eq(dayNote(null, 'd1'), '', 'dayNote: null overlay → empty string');
eq(dayNote({ dayNotes: { d1: '   ' } }, 'd1'), '', 'dayNote: blank note → empty string');

process.exit(fails ? 1 : 0);
