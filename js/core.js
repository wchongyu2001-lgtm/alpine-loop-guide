/* Pure helpers — no DOM. Tested by tools/test-core.mjs (node). */

export function haversineKm(a, b) {
  const toR = x => x * Math.PI / 180;
  const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(s));
}

// Straight-line distance scaled to road reality (winding alpine roads ≈ ×1.3).
export function routeStats(points, roadFactor = 1.3, avgKmh = 55) {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  km *= roadFactor;
  return { km: Math.round(km), hours: Math.round(km / avgKmh * 10) / 10 };
}

// Nearest-neighbour reorder, keeping the first point fixed.
export function optimizeOrder(items, getLL) {
  if (items.length < 3) return items.slice();
  const rest = items.slice(1), out = [items[0]];
  while (rest.length) {
    const cur = getLL(out[out.length - 1]);
    let best = 0, bestD = Infinity;
    rest.forEach((it, i) => {
      const d = haversineKm(cur, getLL(it));
      if (d < bestD) { bestD = d; best = i; }
    });
    out.push(rest.splice(best, 1)[0]);
  }
  return out;
}

// Preview a nearest-neighbour reorder of a day's stops: the optimized order plus the
// distance/time saved vs the current order. `anchor` (the day start ll) is prepended to
// both routes when given so the saving reflects the real drive. Pure — no DOM/network.
export function optimizePreview(items, getLL, anchor) {
  const optimized = optimizeOrder(items, getLL);
  const route = list => routeStats([anchor, ...list.map(getLL)].filter(Boolean));
  const before = route(items), after = route(optimized);
  return {
    optimized, before, after,
    savedKm: Math.max(0, before.km - after.km),
    savedHours: Math.max(0, Math.round((before.hours - after.hours) * 10) / 10),
  };
}

export const gmapsUrl = (ll, name) => ll
  ? `https://www.google.com/maps/search/?api=1&query=${ll[0]},${ll[1]}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name || '')}`;

export const amapsUrl = (ll, name) => ll
  ? `https://maps.apple.com/?ll=${ll[0]},${ll[1]}&q=${encodeURIComponent(name || 'Pin')}`
  : `https://maps.apple.com/?q=${encodeURIComponent(name)}`;

// Place-first map links: resolve to the actual place card (with reviews), not a bare pin.
// Name wins so Google/Apple show the named place; coords only bias/center the search.
export const gmapsPlaceUrl = (name, ll) => name
  ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name)}`
  : gmapsUrl(ll, name);

export const amapsPlaceUrl = (name, ll) => name
  ? `https://maps.apple.com/?q=${encodeURIComponent(name)}${ll ? `&ll=${ll[0]},${ll[1]}` : ''}`
  : amapsUrl(ll, name);

// Time stored as one string ("09:00–11:00"); split/join for two <input type=time> fields.
export const splitTime = s => {
  const m = String(s || '').split(/[–-]/);
  return [(m[0] || '').trim(), (m[1] || '').trim()];
};
export const joinTime = (a, b) => {
  a = (a || '').trim(); b = (b || '').trim();
  return a && b ? `${a}–${b}` : (a || b || '');
};

// Does a booking belong to this itinerary place? Name substring or close proximity.
export function matchBooking(place, b, maxKm = 0.6) {
  const pn = (place.n || '').toLowerCase();
  const bn = (((b.location && b.location.name) || '') + ' ' + (b.title || '')).toLowerCase();
  if (pn.length >= 4 && bn.includes(pn)) return true;
  if (place.ll && b.location && b.location.lat != null)
    return haversineKm(place.ll, [b.location.lat, b.location.lng]) <= maxKm;
  return false;
}

export const gmapsDirUrl = (points) =>
  `https://www.google.com/maps/dir/${points.map(p => `${p[0]},${p[1]}`).join('/')}`;

export const flightStatusUrl = code =>
  `https://www.google.com/search?q=${encodeURIComponent(code + ' flight status')}`;

// Editorial accent per place tag — drives the thumbnail placeholder wash.
const TAG_ACCENT = {
  view: '#2a5a5a', swim: '#2a5a5a',     // glacier
  hike: '#5a6342', van: '#5a6342',      // pine
  act: '#b9531a', food: '#b9531a',      // terra
  town: '#b8860b',                      // gold
  gem: '#9c5a6a',                       // rose
};
export const thumbAccent = t => TAG_ACCENT[t] || '#5d564a';

// Wikipedia photo lookup for place thumbnails — pure URL builders + response parsers.
export const wikiSummaryUrl = name => name
  ? `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}?redirect=true`
  : null;

export const wikiGeoUrl = ll => ll
  ? `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=320&generator=geosearch&ggscoord=${encodeURIComponent(`${ll[0]}|${ll[1]}`)}&ggsradius=2000&ggslimit=3`
  : null;

export const pickSummaryThumb = j =>
  (j && j.type !== 'disambiguation' && j.thumbnail && j.thumbnail.source) || null;

// Fun-fact text from the same Wikipedia summary response.
export const pickSummaryExtract = j =>
  (j && j.type !== 'disambiguation' && j.extract) || null;
export const factCacheKey = name => 'fact:' + name;

/* ---- Place enrichment (Google Places via the trips-sync proxy) ---- */
export const placeProxyUrl = (base, name, ll) =>
  `${base}/place?q=${encodeURIComponent(name || '')}` + (ll ? `&lat=${ll[0]}&lng=${ll[1]}` : '');
export const placePhotoUrl = (base, ref, w = 400) =>
  `${base}/placephoto?ref=${encodeURIComponent(ref)}&w=${w}`;
export const placeCacheKey = (name, ll) =>
  `place:${name}@${ll ? ll.map(n => n.toFixed(3)).join(',') : ''}`;
export const fmtRating = (rating, reviews = 0) =>
  rating ? `★ ${Number(rating).toFixed(1)}` + (reviews ? ` (${Number(reviews).toLocaleString()})` : '') : '';
export const priceTier = lvl => (lvl ? '€'.repeat(lvl) : '');
const CAT_MAP = [['restaurant', 'restaurant'], ['cafe', 'café'], ['bar', 'bar'], ['lodging', 'lodging'],
  ['museum', 'museum'], ['park', 'park'], ['tourist_attraction', 'attraction'], ['natural_feature', 'nature']];
export function parsePlace(j) {
  if (!j) return null;
  const types = j.types || [];
  const cat = (CAT_MAP.find(([k]) => types.includes(k)) || [])[1]
    || (types[0] || '').replace(/_/g, ' ') || '';
  const oh = j.opening_hours || {};
  return {
    rating: j.rating ?? null, reviews: j.user_ratings_total || 0, photoRef: j.photoRef || null,
    category: cat, priceLevel: j.price_level ?? null,
    openNow: oh.open_now ?? null, hoursToday: oh.today || null,
    website: j.website || null, phone: j.formatted_phone_number || null,
    placeId: j.place_id || null, gmapsUrl: j.gmapsUrl || null,
  };
}

/* ---- Per-leg routing (OSRM driving, haversine fallback) ---- */
const MODE = { drive: { p: 'driving', f: 1.3, kmh: 55 }, walk: { p: 'walking', f: 1.0, kmh: 4.8 }, cycle: { p: 'cycling', f: 1.1, kmh: 15 } };
export const modeProfile = m => (MODE[m] || MODE.drive).p;
export const osrmUrl = (a, b, m) =>
  `https://router.project-osrm.org/route/v1/${modeProfile(m)}/${a[1]},${a[0]};${b[1]},${b[0]}?overview=false`;
export function legFallback(a, b, m) {
  const cfg = MODE[m] || MODE.drive;
  const km = Math.round(haversineKm(a, b) * cfg.f * 10) / 10;
  return { km, mins: Math.round(km / cfg.kmh * 60) };
}
export const fmtDuration = mins => mins < 60 ? `${mins} min` : `${Math.floor(mins / 60)} h ${mins % 60} min`;
export function parseOsrm(j) {
  const r = j && j.routes && j.routes[0]; if (!r) return null;
  return { km: Math.round(r.distance / 100) / 10, mins: Math.round(r.duration / 60) };
}

/* ---- Brand logos (airlines by IATA, providers by domain) ---- */
export const iataFromFlight = s => { const m = String(s || '').toUpperCase().match(/\b([A-Z0-9]{2})\s?\d/); return m ? m[1] : null; };
export const airlineLogoUrl = (iata, w = 120, h = 40) => `https://pics.avs.io/${w}/${h}/${iata}.png`;
const BRANDS = { 'booking.com': 'booking.com', 'emirates': 'emirates.com', 'wizz': 'wizzair.com',
  'icelandair': 'icelandair.com', 'trenitalia': 'trenitalia.com', 'b&b hotel': 'hotelbb.com',
  'una hotel': 'unahotels.it', 'airbnb': 'airbnb.com', 'expedia': 'expedia.com', 'hertz': 'hertz.com' };
export function brandDomain(name) {
  const n = String(name || '').toLowerCase();
  for (const k in BRANDS) if (n.includes(k)) return BRANDS[k];
  return null;
}
export const brandLogoUrl = domain => `https://logo.clearbit.com/${domain}`;

// Validate a Wanderlog public trip share link before importing.
export const wlShareValid = url => /^https?:\/\/(www\.)?wanderlog\.com\/\S+/i.test(String(url || '').trim());

/* ---- Weather (open-meteo), FX, settle-up ---- */
export const weatherUrl = ll =>
  `https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`;
export const weatherCacheKey = ll => `wx:${ll ? ll.map(n => n.toFixed(2)).join(',') : ''}`;
export function pickDaily(j, iso) {
  const t = j && j.daily && j.daily.time; if (!t) return null;
  const i = t.indexOf(iso); if (i < 0) return null;
  return { code: j.daily.weather_code[i], tmax: j.daily.temperature_2m_max[i],
    tmin: j.daily.temperature_2m_min[i], precip: j.daily.precipitation_probability_max[i] };
}
export function wmoIcon(c) {
  if (c === 0) return '☀️'; if (c <= 3) return '⛅'; if (c <= 48) return '🌫️';
  if (c <= 67) return '🌧️'; if (c <= 77) return '❄️'; if (c <= 82) return '🌧️';
  if (c <= 86) return '❄️'; return '⛈️';
}
// B12: suggest a packing list from per-day weather + plan text. Pure → testable.
// dayInfos: [{ weather: {tmax,tmin,precip,code}|null, text: 'plan names + notes' }]
export function suggestPacking(dayInfos) {
  const items = [];
  const add = (...xs) => xs.forEach(x => { if (!items.includes(x)) items.push(x); });
  add('Passport / ID', 'Phone + charger', 'Power bank', 'Toiletries', 'Personal medications', 'Reusable water bottle', 'Comfortable walking shoes');
  if (dayInfos.length >= 5) add('Laundry sheets');
  let rain = false, cool = false, cold = false, hot = false, mild = false, allText = '';
  for (const d of dayInfos) {
    const w = d.weather;
    if (w) {
      if ((w.precip != null && w.precip >= 40) || (w.code != null && w.code >= 51)) rain = true;
      if (w.tmin != null && w.tmin <= 12) cool = true;
      if (w.tmin != null && w.tmin <= 3) cold = true;
      if (w.tmax != null && w.tmax >= 24) hot = true;
      if (w.tmax != null && w.tmax >= 18) mild = true;
    }
    allText += ' ' + (d.text || '');
  }
  if (rain) add('Rain shell / jacket', 'Waterproof shoes');
  if (cool) add('Warm layer (fleece/down)');
  if (cold) add('Hat + gloves', 'Thermal base layer');
  if (hot) add('Sun hat', 'Lightweight clothing');
  if (mild) add('Sunglasses', 'Sunscreen');
  const t = allText.toLowerCase();
  const has = (...kw) => kw.some(k => t.includes(k));
  if (has('hik', 'trail', 'summit', 'trek', 'mountain', 'funicular', 'cable', 'gondola', 'glacier')) add('Hiking boots', 'Daypack');
  if (has('swim', 'lake', 'beach', 'pool', 'spa', 'thermal bath', 'lido')) add('Swimwear', 'Quick-dry towel');
  return items;
}

export const convert = (amt, rate) => amt == null ? null : Math.round(amt * rate * 100) / 100;
export function simplifyDebts(net) {
  const cred = [], deb = [];
  for (const k in net) { const v = Math.round(net[k] * 100) / 100; if (v > 0) cred.push([k, v]); else if (v < 0) deb.push([k, -v]); }
  cred.sort((a, b) => b[1] - a[1]); deb.sort((a, b) => b[1] - a[1]);
  const out = []; let i = 0, j = 0;
  while (i < deb.length && j < cred.length) {
    const amt = Math.round(Math.min(deb[i][1], cred[j][1]) * 100) / 100;
    if (amt > 0) out.push({ from: deb[i][0], to: cred[j][0], amount: amt });
    deb[i][1] -= amt; cred[j][1] -= amt;
    if (deb[i][1] <= 0.001) i++; if (cred[j][1] <= 0.001) j++;
  }
  return out;
}

export const pickGeoThumb = j => {
  const pages = j && j.query && j.query.pages;
  if (!pages) return null;
  for (const p of Object.values(pages)) if (p.thumbnail && p.thumbnail.source) return p.thumbnail.source;
  return null;
};

export const thumbCacheKey = name => 'thumb:' + name;

// Assign a booking to the smallest-date-range trip containing its start date.
export function assignTrip(trips, startISO) {
  if (!startISO) return 'unassigned';
  const d = startISO.slice(0, 10);
  const hits = trips.filter(t => t.start <= d && d <= t.end);
  if (!hits.length) return 'unassigned';
  hits.sort((a, b) => (new Date(a.end) - new Date(a.start)) - (new Date(b.end) - new Date(b.start)));
  return hits[0].id;
}

// ---- B21: manual quick-add booking (pure) ----
// Build a booking object from raw manual-form fields. Trims/normalises everything,
// auto-files to a trip by its start date, and drops empty optionals to null so the
// card renderer (which is truthiness-gated) stays clean. pax is comma-separated.
export function buildManualBooking(f, trips, defaultCurrency, id) {
  const trim = v => String(v == null ? '' : v).trim();
  const start = trim(f.start), end = trim(f.end);
  const pax = trim(f.pax).split(',').map(s => s.trim()).filter(Boolean);
  const amount = trim(f.amount) === '' ? null : Number(f.amount);
  const loc = trim(f.location);
  return {
    id,
    trip: assignTrip(trips, start),
    type: trim(f.type) || 'other',
    title: trim(f.title),
    start,
    end: end || null,
    provider: trim(f.provider) || null,
    confirmation: trim(f.conf) || null,
    price: amount != null && !isNaN(amount) ? { amount, currency: trim(f.currency) || defaultCurrency } : null,
    pax: pax.length ? pax : null,
    location: loc ? { name: loc } : null,
    source: 'manual',
  };
}

// Bookings that belong to no known trip — empty/null trip, the literal
// 'unassigned' tag, or a stale trip id no longer in the registry. These would
// otherwise be invisible (in no trip's list and not the inbox), so they need a
// triage affordance. Pass bookings with their effective trip already resolved
// (e.g. allBookings()), plus the registry's trips. Returns the orphan subset.
export function orphanBookings(bookings, trips) {
  const known = new Set((trips || []).map(t => t.id));
  return (bookings || []).filter(b => !known.has(b.trip));
}

// Pick the trip day for the mobile "Today" view. Returns { day, rel } where rel
// is 'today' (a day's date is today), 'before' (trip not started yet — previews
// the first day), 'after' (trip is over — previews the last day), or 'none'.
export function pickTodayDay(days, todayIso) {
  if (!days || !days.length) return { day: null, rel: 'none' };
  const hit = days.find(d => d._date === todayIso);
  if (hit) return { day: hit, rel: 'today' };
  const dated = days.filter(d => d._date);
  if (!dated.length) return { day: days[0], rel: 'before' };
  if (todayIso < dated[0]._date) return { day: dated[0], rel: 'before' };
  return { day: dated[dated.length - 1], rel: 'after' };
}

// The next booking at or after `nowIso` (ISO datetime), from a trip's bookings. null if none.
export function nextBooking(bookings, nowIso) {
  return (bookings || [])
    .filter(b => b.start && String(b.start) >= nowIso)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)))[0] || null;
}

// ---- B04: booking gap / conflict detection (pure) ----
// Parse a flight title's route, e.g. "EK 353 · Singapore (SIN) → Dubai (DXB)"
// → { from: 'SIN', to: 'DXB' }. Uses the (IATA) codes; null if not two-ended.
export function flightRoute(title) {
  const parts = String(title || '').split(/→|->/);
  if (parts.length < 2) return null;
  const code = seg => { const m = seg.match(/\(([A-Z]{3})\)/); return m ? m[1] : null; };
  const from = code(parts[0]), to = code(parts[1]);
  return from && to ? { from, to } : null;
}

// Surface booking problems for one trip: bookings outside the trip's date range,
// time-overlapping point-bookings, and broken flight chains (arrive somewhere but
// the next flight departs elsewhere — a missing connecting/return leg). Returns
// [{ kind, id, title, detail, otherId? }]. Conservative: container bookings
// (hotel/car) never count as time overlaps, and only adjacent flights are chained,
// so clean multi-city itineraries raise nothing.
export function bookingWarnings(bookings, trip) {
  const out = [];
  const start = trip && trip.start, end = trip && trip.end;

  for (const b of bookings) {
    const d = String(b.start || '').slice(0, 10);
    if (!d) continue;
    if ((start && d < start) || (end && d > end))
      out.push({ kind: 'range', id: b.id, title: b.title,
        detail: `Dated ${d}, outside the trip (${start} → ${end}).` });
  }

  const POINT = new Set(['flight', 'train', 'bus', 'activity']);
  const timed = bookings.filter(b => POINT.has(b.type)
    && /T\d/.test(String(b.start)) && /T\d/.test(String(b.end)));
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], c = timed[j];
      if (String(a.start) < String(c.end) && String(c.start) < String(a.end))
        out.push({ kind: 'overlap', id: a.id, title: a.title, otherId: c.id,
          detail: `Overlaps in time with “${c.title}”.` });
    }

  const flights = bookings.filter(b => b.type === 'flight' && flightRoute(b.title))
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
  for (let i = 0; i + 1 < flights.length; i++) {
    const a = flightRoute(flights[i].title), n = flightRoute(flights[i + 1].title);
    if (a.to !== n.from)
      out.push({ kind: 'leg', id: flights[i + 1].id, title: flights[i + 1].title,
        detail: `Arrive ${a.to} on ${flights[i].title.split('·')[0].trim() || 'the prior flight'}, but the next flight departs ${n.from} — missing connecting leg?` });
  }

  return out;
}

// ---- B23: chronological booking timeline (pure) ----
// Group a trip's bookings into day buckets, time-sorted within each day, marking
// which entries overlap another in time (reusing bookingWarnings' overlap pass).
// Returns [{ date, items: [{ booking, overlap }] }] ordered by date then start.
export function bookingTimeline(bookings, trip) {
  const overlap = new Set();
  for (const w of bookingWarnings(bookings || [], trip))
    if (w.kind === 'overlap') { overlap.add(w.id); overlap.add(w.otherId); }

  const byDate = {};
  for (const b of bookings || []) {
    const d = String(b.start || '').slice(0, 10);
    if (!d) continue;
    (byDate[d] = byDate[d] || []).push(b);
  }
  return Object.keys(byDate).sort().map(date => ({
    date,
    items: byDate[date]
      .slice()
      .sort((a, b) => String(a.start).localeCompare(String(b.start)))
      .map(b => ({ booking: b, overlap: overlap.has(b.id) })),
  }));
}

// ---- B27: transport continuity check (pure) ----
// Parse each transit booking's origin→destination from its title and verify the
// chain makes sense. Returns [{ kind, id, title, detail, otherId? }]:
//   • jump:     two timed legs overlap in time but depart different places — you
//               can't be in two places at once.
//   • break:    a same-day onward connection where you land at A but the next leg
//               departs B≠A — a broken tight connection (far-apart legs are left
//               alone; an unbooked local transfer is normal).
//   • noreturn: a one-way vehicle rental (pickup A, drop-off B≠A, no "↔") — the
//               outbound has no matching return to where you picked it up.
// Conservative: only flight/train/bus/ferry legs chain; round-trip "↔" notation is
// treated as self-returning; place keys compare on the leading city word so a
// "Milan Rogoredo → Genova" style mismatch in station detail isn't flagged.
const transitRoute = b => {
  const t = String(b.title || '');
  if (b.type === 'flight') {
    const r = flightRoute(t);
    if (r) return { from: r.from.toLowerCase(), to: r.to.toLowerCase(), fromLabel: r.from, toLabel: r.to, round: false };
  }
  const seg = t.split('·').pop();
  const parts = seg.split(/↔|→|->|–|—/);
  if (parts.length < 2) return null;
  const clean = s => s.replace(/\([A-Za-z0-9]{2,4}\)/g, '').replace(/[()'"]/g, '').trim();
  const key = s => clean(s).toLowerCase().split(/[\s,]+/)[0];
  const fromLabel = clean(parts[0]), toLabel = clean(parts[1]);
  const from = key(parts[0]), to = key(parts[1]);
  return from && to ? { from, to, fromLabel, toLabel, round: /↔/.test(seg) } : null;
};

export function transportContinuity(bookings) {
  const TRANSIT = new Set(['flight', 'train', 'bus', 'ferry']);
  const legs = (bookings || []).map(b => { const r = transitRoute(b); return r ? { ...r, b } : null; }).filter(Boolean);
  const out = [];

  const timed = legs.filter(l => TRANSIT.has(l.b.type)
    && /T\d/.test(String(l.b.start)) && /T\d/.test(String(l.b.end)));
  for (let i = 0; i < timed.length; i++)
    for (let j = i + 1; j < timed.length; j++) {
      const a = timed[i], c = timed[j];
      if (String(a.b.start) < String(c.b.end) && String(c.b.start) < String(a.b.end) && a.from !== c.from)
        out.push({ kind: 'jump', id: c.b.id, title: c.b.title, otherId: a.b.id,
          detail: `Departs ${c.fromLabel} while “${a.b.title}” is still under way — you can't be in two places at once.` });
    }

  const seq = timed.slice().sort((a, b) => String(a.b.start).localeCompare(String(b.b.start)));
  for (let i = 0; i + 1 < seq.length; i++) {
    const a = seq[i], n = seq[i + 1];
    if (dOnly(a.b.end || a.b.start) !== dOnly(n.b.start)) continue;   // only flag tight same-day connections
    if (a.to !== n.from)
      out.push({ kind: 'break', id: n.b.id, title: n.b.title, otherId: a.b.id,
        detail: `Land in ${a.toLabel} but the next leg departs ${n.fromLabel} the same day — broken connection?` });
  }

  for (const l of legs)
    if (l.b.type === 'car' && !l.round && l.from !== l.to)
      out.push({ kind: 'noreturn', id: l.b.id, title: l.b.title,
        detail: `Picked up in ${l.fromLabel} but dropped in ${l.toLabel} — one-way, no return to ${l.fromLabel}.` });

  return out;
}

// ---- B22: "still to book" coverage gaps (pure) ----
// From a trip's dated days + its bookings, surface what isn't booked yet:
//   • lodging: a night with no accommodation covering it
//   • transport: an overnight base change (your `sleep` differs) with no transport
//     covering the move.
// A campervan / motorhome counts as the bed while you hold it, and ANY vehicle you
// hold (it spans the dates) covers the driving legs — so a road trip on one van
// booking raises nothing. Hotels cover nights start..end (checkout exclusive); a
// relocation is covered by a flight/train/bus/ferry dated on the arrival day. The
// final day is a departure day, so it needs no night. Pure: date-only ISO compares.
const dOnly = s => String(s || '').slice(0, 10);
const isCamperBed = b => b.type === 'car' && /camper|campervan|motorhome|caravan|\brv\b/i.test(String(b.title || ''));

export function coverageGaps(days, bookings) {
  const dated = (days || []).filter(d => d._date).sort((a, b) => a._date.localeCompare(b._date));
  const bks = bookings || [];
  const lodging = bks.filter(b => b.type === 'hotel' || isCamperBed(b));
  const vehicles = bks.filter(b => b.type === 'car');
  const transit = bks.filter(b => ['flight', 'train', 'bus', 'ferry'].includes(b.type));

  const nightCovered = date =>
    lodging.some(b => dOnly(b.start) <= date && date < dOnly(b.end || b.start));
  const legCovered = (from, to) =>
    transit.some(b => dOnly(b.start) === to) ||
    vehicles.some(b => dOnly(b.start) <= from && to <= dOnly(b.end || b.start));

  const gaps = [];
  for (let i = 0; i + 1 < dated.length; i++) {              // nights: all but the last (departure) day
    const date = dated[i]._date;
    if (!nightCovered(date))
      gaps.push({ kind: 'lodging', date, detail: `No accommodation booked for the night of ${date}.` });
  }
  const base = d => String(d.sleep || '').trim().toLowerCase();
  for (let i = 0; i + 1 < dated.length; i++) {              // relocations: overnight base changes
    const a = dated[i], c = dated[i + 1];
    if (!base(a) || !base(c) || base(a) === base(c)) continue;
    if (!legCovered(a._date, c._date))
      gaps.push({ kind: 'transport', date: c._date, from: a.sleep, to: c.sleep,
        detail: `No transport booked from ${a.sleep} to ${c.sleep}.` });
  }
  return gaps.sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind));
}

// ---- B24: accommodation coverage strip (pure) ----
// One cell per night — every dated day except the last (a departure day needs no
// bed). { date, sleep, covered, name }: covered ⇔ some hotel/campervan booking
// spans that night (start ≤ date < end, checkout exclusive); name is its title.
// Same lodging rule as coverageGaps so the strip and "still to book" agree.
export function accommodationStrip(days, bookings) {
  const dated = (days || []).filter(d => d._date).sort((a, b) => a._date.localeCompare(b._date));
  const lodging = (bookings || []).filter(b => b.type === 'hotel' || isCamperBed(b));
  const cover = date => lodging.find(b => dOnly(b.start) <= date && date < dOnly(b.end || b.start));
  return dated.slice(0, -1).map(d => {
    const b = cover(d._date);
    return { date: d._date, sleep: d.sleep || '', covered: !!b, name: b ? b.title : '' };
  });
}

// ---- B25: time-sensitive booking action reminders (pure) ----
// Surface actions you must take before a deadline, sorted by urgency (soonest due
// first). Each kind is emitted ONLY when its inputs exist, so a booking missing the
// relevant field raises nothing (no spurious noise):
//   • checkin — a flight's online check-in window, derived from departure (b.start):
//               opens OPEN_H before, closes CLOSE_H before. Listed only while still
//               actionable (now < closes) AND relevant now (already open, or opening
//               within HORIZON_H). Open windows are always urgent.
//   • cancel  — a booking's free-cancellation deadline (b.free_cancellation_until),
//               while it's still in the future.
//   • hotel-in / hotel-out — a hotel's check-in (b.checkin_time on its start day) and
//               check-out (b.checkout_time on its end day), while still in the future.
// `due` is an epoch-ms timestamp (parse nowIso the same naive-local way the bookings'
// times are written). urgent ⇔ due is within URGENT_H. Returns [] on a bad nowIso.
export function bookingReminders(bookings, nowIso, opts = {}) {
  const now = Date.parse(nowIso);
  if (isNaN(now)) return [];
  const HOUR = 3600e3;
  const OPEN_H = opts.checkinOpenH ?? 48;    // online check-in opens this long before departure
  const CLOSE_H = opts.checkinCloseH ?? 1.5; // …and closes this long before departure
  const HORIZON_H = opts.horizonH ?? 72;     // don't surface a not-yet-open check-in further out than this
  const URGENT_H = opts.urgentH ?? 24;       // flag anything due within this as urgent
  const hasT = s => /T\d/.test(String(s || ''));
  const rel = ms => { const h = Math.round(ms / HOUR); if (h < 1) return 'within the hour';
    if (h < 24) return `in ${h}h`; const d = Math.round(h / 24); return `in ${d} day${d > 1 ? 's' : ''}`; };

  const out = [];
  for (const b of bookings || []) {
    if (b.free_cancellation_until && hasT(b.free_cancellation_until)) {
      const due = Date.parse(b.free_cancellation_until);
      if (!isNaN(due) && due > now)
        out.push({ kind: 'cancel', id: b.id, title: b.title, due,
          detail: `Free cancellation ends ${rel(due - now)}.`, urgent: due - now <= URGENT_H * HOUR });
    }
    if (b.type === 'flight' && hasT(b.start)) {
      const dep = Date.parse(b.start);
      if (!isNaN(dep)) {
        const opens = dep - OPEN_H * HOUR, closes = dep - CLOSE_H * HOUR;
        if (now < closes) {
          if (now >= opens)
            out.push({ kind: 'checkin', id: b.id, title: b.title, due: closes,
              detail: `Online check-in is open — closes ${rel(closes - now)}.`, urgent: true });
          else if (opens - now <= HORIZON_H * HOUR)
            out.push({ kind: 'checkin', id: b.id, title: b.title, due: opens,
              detail: `Online check-in opens ${rel(opens - now)}.`, urgent: opens - now <= URGENT_H * HOUR });
        }
      }
    }
    if (b.type === 'hotel') {
      const inDay = dOnly(b.start), outDay = dOnly(b.end);
      if (b.checkin_time && inDay) {
        const due = Date.parse(`${inDay}T${b.checkin_time}`);
        if (!isNaN(due) && due > now)
          out.push({ kind: 'hotel-in', id: b.id, title: b.title, due,
            detail: `Check-in from ${b.checkin_time}, ${rel(due - now)}.`, urgent: due - now <= URGENT_H * HOUR });
      }
      if (b.checkout_time && outDay) {
        const due = Date.parse(`${outDay}T${b.checkout_time}`);
        if (!isNaN(due) && due > now)
          out.push({ kind: 'hotel-out', id: b.id, title: b.title, due,
            detail: `Check-out by ${b.checkout_time}, ${rel(due - now)}.`, urgent: due - now <= URGENT_H * HOUR });
      }
    }
  }
  return out.sort((a, b) => a.due - b.due);
}

// ---- B06: "Can I make it?" timing feasibility (pure) ----
const hhmm = s => { const m = /^(\d{1,2}):(\d{2})$/.exec(String(s || '').trim()); return m ? +m[1] * 60 + +m[2] : null; };

// Minutes available to travel from place A to place B: from A's end time (or its
// start if open-ended) to B's start time. null when either side has no usable time.
export function legGapMins(fromTime, toTime) {
  const [fa, fb] = splitTime(fromTime), [ta] = splitTime(toTime);
  const dep = hhmm(fb) ?? hhmm(fa), arr = hhmm(ta);
  return dep == null || arr == null ? null : arr - dep;
}

// Is the scheduled hop A→B too tight for the computed travel time? Returns null
// when it can't be judged (missing times or travel), else { tight, gapMins,
// shortBy }. tight ⇔ travel time exceeds the scheduled gap between the stops.
export function legFeasibility(fromTime, toTime, travelMins) {
  if (travelMins == null) return null;
  const gap = legGapMins(fromTime, toTime);
  if (gap == null) return null;
  return { tight: travelMins > gap, gapMins: gap, shortBy: travelMins - gap };
}

// Rough day load: committed minutes = dwell at each timed stop + straight-line
// travel estimates between consecutive stops. overpacked ⇔ it exceeds the waking
// budget. Pure — uses the haversine fallback, never the network.
export function dayLoad(places, mode = 'drive', wakingHours = 14) {
  let dwell = 0, travel = 0;
  for (const p of places || []) {
    const [a, b] = splitTime(p.time), s = hhmm(a), e = hhmm(b);
    if (s != null && e != null && e > s) dwell += e - s;
  }
  for (let i = 1; i < (places || []).length; i++)
    if (places[i - 1].ll && places[i].ll) travel += legFallback(places[i - 1].ll, places[i].ll, mode).mins;
  const totalMins = dwell + travel;
  return { dwellMins: dwell, travelMins: travel, totalMins, overpacked: totalMins > wakingHours * 60 };
}

// ---- B07: nearby discovery (OpenStreetMap Overpass — free, keyless) ----
// Build an Overpass query URL for eat/do POIs within `radius` m of ll.
export const overpassUrl = (ll, radius = 700) => {
  const at = `(around:${radius},${ll[0]},${ll[1]})`;
  const q = `[out:json][timeout:12];(`
    + `node${at}["amenity"~"^(restaurant|cafe|bar|fast_food|pub|ice_cream)$"];`
    + `node${at}["tourism"~"^(attraction|museum|viewpoint|artwork|gallery|zoo|theme_park)$"];`
    + `);out body 40;`;
  return `https://overpass-api.de/api/interpreter?data=${encodeURIComponent(q)}`;
};
export const nearbyCacheKey = ll => `nearby:${ll ? ll.map(n => n.toFixed(3)).join(',') : ''}`;

// Map an OSM amenity/tourism tag to the app's place-tag vocabulary.
const OSM_TAG = { restaurant: 'food', cafe: 'food', bar: 'food', fast_food: 'food', pub: 'food',
  ice_cream: 'food', viewpoint: 'view', museum: 'act', attraction: 'act', artwork: 'act',
  gallery: 'act', zoo: 'act', theme_park: 'act' };

// Parse an Overpass response into ranked nearby suggestions: named POIs only,
// deduped by name, sorted nearest-first. Returns [{ n, t, ll, cat, km }].
export function parseOverpass(j, origin) {
  const els = (j && j.elements) || [];
  const seen = new Set(), out = [];
  for (const e of els) {
    const name = e.tags && e.tags.name;
    if (!name || e.lat == null || e.lon == null) continue;
    const key = name.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    const kind = e.tags.amenity || e.tags.tourism || '';
    const ll = [e.lat, e.lon];
    out.push({ n: name, t: OSM_TAG[kind] || 'act', ll, cat: kind.replace(/_/g, ' '),
      km: origin ? Math.round(haversineKm(origin, ll) * 100) / 100 : null });
  }
  out.sort((a, b) => (a.km ?? 0) - (b.km ?? 0));
  return out;
}

// Overlay day-plans replace base plans per day; base kept where overlay silent.
export function effectivePlans(days, overlayPlans) {
  const out = {};
  for (const d of days) out[d.id] = (overlayPlans && overlayPlans[d.id]) || d.plan || [];
  return out;
}

// Expense splitting between two travellers (extensible to N via shares).
// split: {type:'equal'} | {type:'solo'} (payer only) | {type:'shares', shares:{name:fraction}}
export function computeBalances(expenses, travellers) {
  const paid = {}, owes = {};
  travellers.forEach(t => { paid[t] = 0; owes[t] = 0; });
  for (const e of expenses) {
    const amt = Number(e.amount) || 0;
    if (!amt || !e.paidBy || !(e.paidBy in paid)) continue;
    paid[e.paidBy] += amt;
    const split = e.split || { type: 'equal' };
    if (split.type === 'solo') owes[e.paidBy] += amt;
    else if (split.type === 'shares' && split.shares) {
      travellers.forEach(t => { owes[t] += amt * (split.shares[t] || 0); });
    } else travellers.forEach(t => { owes[t] += amt / travellers.length; });
  }
  const net = {};
  travellers.forEach(t => { net[t] = Math.round((paid[t] - owes[t]) * 100) / 100; });
  return { paid, owes, net };
}

// Budget vs actual per day. days: [{id, iso, label, estimate}], expenses: [{date, amount}].
// Sums dated expenses onto their matching day iso; returns per-day rows with delta + totals.
export function budgetVsActual(days, expenses) {
  const byDate = {};
  for (const e of expenses || []) {
    if (!e || !e.date) continue;
    byDate[e.date] = (byDate[e.date] || 0) + (Number(e.amount) || 0);
  }
  const rows = (days || []).map(d => {
    const estimate = Math.round((Number(d.estimate) || 0) * 100) / 100;
    const actual = Math.round((byDate[d.iso] || 0) * 100) / 100;
    return { id: d.id, iso: d.iso, label: d.label, estimate, actual, delta: Math.round((actual - estimate) * 100) / 100 };
  });
  const totals = rows.reduce((s, r) => ({
    estimate: s.estimate + r.estimate, actual: s.actual + r.actual,
  }), { estimate: 0, actual: 0 });
  totals.delta = Math.round((totals.actual - totals.estimate) * 100) / 100;
  return { rows, totals };
}

// ---- Guide estimate per day + total (pure) — shared by Budget and the B26 rollup ----
// One source of truth for the "trip budget" figure: per day, camp + food + the chosen
// activity tier (bu|sp) + extras + fuel (drive hours × fuelPerH). Returns { rows:[{d,total}], total }.
export function tripEstimate(days, budget, meta, mode = 'bu') {
  const rows = (days || []).map(d => {
    const b = (budget || {})[d.id] || {};
    const act = typeof b.act === 'object' ? (b.act[mode === 'sp' ? 'sp' : 'bu'] || 0) : (b.act || 0);
    const fuel = (d.drive || 0) * ((meta || {}).fuelPerH || 0);
    return { d, total: (b.camp || 0) + (b.food || 0) + act + (b.x || 0) + fuel };
  });
  return { rows, total: rows.reduce((s, e) => s + e.total, 0) };
}

// ---- B26: committed booking spend rolled up by type, for "vs budget" (pure) ----
// Sum every priced booking into the trip base currency via toBase(amount, currency)
// — pass the same FX-aware converter the Budget view uses; default is identity.
// Booking types collapse into four headline buckets (+ other); returns only the
// buckets with spend (fixed order), the grand total, and the count of priced
// bookings. Bookings with no price are ignored, so an empty trip → total 0.
const ROLLUP_GROUP = { flight: 'flights', hotel: 'stays', train: 'transport', bus: 'transport', car: 'transport', ferry: 'transport', activity: 'activities' };
const ROLLUP_ORDER = ['flights', 'stays', 'transport', 'activities', 'other'];
const ROLLUP_LABEL = { flights: 'Flights', stays: 'Stays', transport: 'Transport', activities: 'Activities', other: 'Other' };
export function bookingRollup(bookings, toBase = a => a) {
  const sums = {};
  let total = 0, count = 0;
  (bookings || []).forEach(b => {
    if (!b || !b.price || !b.price.amount) return;
    const amt = Number(toBase(b.price.amount, b.price.currency)) || 0;
    const g = ROLLUP_GROUP[b.type] || 'other';
    sums[g] = (sums[g] || 0) + amt;
    total += amt; count++;
  });
  const round = n => Math.round(n * 100) / 100;
  const byType = ROLLUP_ORDER.filter(g => g in sums).map(g => ({ key: g, label: ROLLUP_LABEL[g], total: round(sums[g]) }));
  return { byType, total: round(total), count };
}

// ---- B28: single-booking iCalendar (.ics) for add-to-calendar (pure) ----
// Floating local times, matching how booking times are stored (naive, no zone).
// A date-only start becomes an all-day event; a timed start with no end gets a
// 1-hour default. `dtstamp` is the required UTC stamp (YYYYMMDDTHHMMSSZ); pass
// one for determinism, else "now" is used.
function icsDateParts(s) {
  const t = String(s || '');
  const ymd = t.slice(0, 10).replace(/-/g, '');
  if (t.length <= 10 || t.indexOf('T') < 0) return { date: true, val: ymd };
  const hm = t.slice(11, 16).replace(/:/g, '').padEnd(4, '0');
  return { date: false, val: ymd + 'T' + hm + '00' };
}
function icsNowStamp() {
  const d = new Date(), p = n => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}${p(d.getUTCMonth() + 1)}${p(d.getUTCDate())}T${p(d.getUTCHours())}${p(d.getUTCMinutes())}${p(d.getUTCSeconds())}Z`;
}
export function bookingIcs(b, dtstamp) {
  const e = s => String(s == null ? '' : s).replace(/\\/g, '\\\\').replace(/([,;])/g, '\\$1').replace(/\r?\n/g, '\\n');
  const start = icsDateParts(b.start);
  const lines = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Travel Companion//Bookings//EN',
    'BEGIN:VEVENT',
    `UID:${e(b.id || 'booking')}@travel-companion`,
    `DTSTAMP:${dtstamp || icsNowStamp()}`,
    start.date ? `DTSTART;VALUE=DATE:${start.val}` : `DTSTART:${start.val}`,
  ];
  if (b.end) {
    const end = icsDateParts(b.end);
    lines.push(end.date ? `DTEND;VALUE=DATE:${end.val}` : `DTEND:${end.val}`);
  } else if (!start.date) {
    lines.push('DURATION:PT1H');
  }
  lines.push(`SUMMARY:${e(b.title)}`);
  const desc = [];
  if (b.provider) desc.push('Provider: ' + b.provider);
  if (b.confirmation) desc.push('Confirmation: ' + b.confirmation);
  if (b.pax && b.pax.length) desc.push('Travellers: ' + b.pax.join(', '));
  if (b.price && b.price.amount) desc.push('Price: ' + b.price.amount + ' ' + (b.price.currency || ''));
  if (desc.length) lines.push('DESCRIPTION:' + e(desc.join('\n')));
  if (b.location && b.location.name) lines.push('LOCATION:' + e(b.location.name));
  lines.push('END:VEVENT', 'END:VCALENDAR');
  return lines.join('\r\n');
}

// ---- B11: "where am I in the day?" — now/next progress on the Today plan (pure) ----
// Given a day's ordered plan and the current "HH:MM", label each stop: 'now' while
// its time window contains now, 'next' for the first not-yet-started timed stop,
// 'past' once it has finished, '' for untimed stops (or when now can't be parsed).
// A stop's effective end is its own end, else the next timed stop's start, else +60m.
export function planProgress(plan, nowHHMM) {
  const arr = Array.isArray(plan) ? plan : [];
  const now = hhmm(nowHHMM);
  const starts = arr.map(p => hhmm(splitTime(p && p.time)[0]));
  const ends = arr.map((p, i) => {
    const e = hhmm(splitTime(p && p.time)[1]);
    if (e != null) return e;
    if (starts[i] == null) return null;
    for (let j = i + 1; j < arr.length; j++) if (starts[j] != null) return starts[j];
    return starts[i] + 60;
  });
  if (now == null) return arr.map(() => '');
  let nextIdx = -1;
  for (let i = 0; i < arr.length; i++) if (starts[i] != null && starts[i] > now) { nextIdx = i; break; }
  return arr.map((p, i) => {
    if (starts[i] == null) return '';
    if (starts[i] <= now && now < ends[i]) return 'now';
    if (i === nextIdx) return 'next';
    if (ends[i] <= now) return 'past';
    return 'upcoming';
  });
}

// ---- B16: live "next up" countdown on the Today view (pure) ----
// Minutes for a "YYYY-MM-DDTHH:MM" local datetime via fixed UTC arithmetic
// (deterministic, timezone-free). null if it can't be parsed.
const isoMinutes = iso => {
  const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{1,2}):(\d{2})/.exec(String(iso || '').trim());
  return m ? Date.UTC(+m[1], +m[2] - 1, +m[3], +m[4], +m[5]) / 60000 : null;
};

// The soonest still-upcoming timed stop in today's plan, plus the next upcoming
// booking — each with whole-minutes-until `mins` (> 0). Either may be null when
// nothing remains. `nowIso` is "YYYY-MM-DDTHH:MM"; its date scopes the stops.
export function nextUpcoming(plan, bookings, nowIso) {
  const now = isoMinutes(nowIso);
  const date = String(nowIso || '').slice(0, 10);
  let stop = null;
  if (now != null) for (const p of (plan || [])) {
    const t0 = splitTime(p && p.time)[0];
    if (hhmm(t0) == null) continue;
    const mins = isoMinutes(`${date}T${t0}`) - now;
    if (mins > 0 && (!stop || mins < stop.mins)) stop = { name: p.n, mins };
  }
  const nb = nextBooking(bookings, nowIso);
  let booking = null;
  if (nb && now != null) {
    const mins = isoMinutes(String(nb.start).slice(0, 16)) - now;
    if (mins > 0) booking = { name: nb.title, type: nb.type, mins };
  }
  return { stop, booking };
}

// Human "1h 20m" / "45m" / "now" from whole minutes-until.
export function fmtCountdown(mins) {
  if (mins == null || mins <= 0) return 'now';
  const h = Math.floor(mins / 60), m = mins % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

export function fmtMoney(n, cur = '€') {
  if (n == null || isNaN(n)) return '—';
  const v = Math.round(Number(n));
  return cur.length > 1 ? `${cur}${v.toLocaleString()}` : `${cur}${v.toLocaleString()}`;
}

// Date for the i-th kept day. meta.start = [y, monthIndex, day].
export function dayDate(start, i) {
  const d = new Date(start[0], start[1], start[2] + i);
  const W = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { label: `${W[d.getDay()]} ${d.getDate()} ${M[d.getMonth()]}`, iso };
}

// Heuristic stub from a confirmation email; user reviews before it becomes a booking.
const TYPE_RULES = [
  ['flight', /flight|airline|airways|boarding pass|e-?ticket .*air|wizz|ryanair|easyjet|emirates|icelandair/i],
  ['train', /train|trenitalia|rail|öbb|sbb/i],
  ['bus', /\bbus\b|flixbus/i],
  ['car', /car rental|rental car|hertz|sixt|europcar|campervan|camper/i],
  ['hotel', /hotel|hostel|apartment|booking\.com|airbnb|your stay|check-in.*(?:room|night)|room|night/i],
  ['activity', /tour|admission|getyourguide|tiqets|museum|ticket/i],
];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseEmailStub(subject, body) {
  const title = String(subject || '').replace(/^(\s*(fwd|fw|re)\s*:)+\s*/i, '').trim();
  const all = title + '\n' + String(body || '');

  let type = 'other';
  for (const [t, re] of TYPE_RULES) if (re.test(all)) { type = t; break; }

  // Labelled code: case-insensitive label, then an UPPERCASE/digit token nearby.
  let confirmation = null;
  const labRe = /(?:confirmation|booking|reservation|reference|pnr|conf)(?:\s+(?:number|code|id))?[:#\s-]{0,4}(.{0,24})/gi;
  for (let m; !confirmation && (m = labRe.exec(all));) {
    const tok = m[1].match(/\b([A-Z0-9][A-Z0-9-]{4,13})\b/);
    if (tok) confirmation = tok[1];
  }

  let start = null;
  const iso = all.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const txt = all.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i);
  if (iso && (!txt || iso.index < txt.index)) start = iso[0];
  else if (txt) start = `${txt[3]}-${String(MONTHS[txt[2].toLowerCase().slice(0, 3)]).padStart(2, '0')}-${String(+txt[1]).padStart(2, '0')}`;

  return { type, title, confirmation, start };
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// B18 · Offline trip search — pure, network-free filter over already-loaded records.
// Each record carries a `text` haystack; every whitespace token of the query must
// appear (case-insensitive substring) for the record to match. Empty query → [].
export function searchRecords(records, query) {
  const tokens = String(query || '').toLowerCase().split(/\s+/).filter(Boolean);
  if (!tokens.length) return [];
  return (records || []).filter(r => {
    const hay = String(r && r.text || '').toLowerCase();
    return tokens.every(t => hay.includes(t));
  });
}
