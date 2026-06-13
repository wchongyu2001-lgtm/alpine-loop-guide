# Wanderlog-grade Travel Companion — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the Travel Companion dashboard to Wanderlog-grade: enriched photo-left place cards (Google Places via Apps Script proxy), per-leg travel times, brand logos, weather, multi-currency + settle-up — all fallback-first so the app works with no API key.

**Architecture:** Vanilla ES modules, static GitHub Pages, no build. New client modules (`places`, `routing`, `logos`, `weather`) fetch + cache in localStorage and degrade gracefully to free sources. Pure helpers live in `js/core.js`, unit-tested in `tools/test-core.mjs`. The Apps Script Web App gains a Places proxy so the API key never enters the public repo.

**Tech Stack:** vanilla JS, Leaflet, Google Apps Script (proxy), Google Places API (New), OSRM public router, open-meteo, Frankfurter FX, airhex/avs.io + Clearbit logo CDNs.

**Spec:** `docs/superpowers/specs/2026-06-13-travel-companion-wanderlog-grade-design.md`

**Conventions:** every view module exports `render(root, ctx)`; `ctx = {state, save(kind,payload), rerender()}`. Pure logic → `core.js` + a test. Verify each phase: `node tools/test-core.mjs` (exit 0), `for f in js/*.js; do node --check "$f"; done`, `cd /tmp/trips-smoke && node smoke.mjs` (ALL RENDERS OK), then push + live check.

---

## Phase 1 — Place enrichment + hybrid card

### Task 1: Pure place helpers in core.js

**Files:** Modify `js/core.js`; Test `tools/test-core.mjs`

- [ ] **Step 1 — failing tests** (append to test-core.mjs, import the new names):

```js
// place enrichment helpers
eq(placeProxyUrl('https://x/exec', 'Sirmione', [45.49, 10.61]),
  'https://x/exec?fn=place&q=Sirmione&lat=45.49&lng=10.61', 'placeProxyUrl: name+ll');
eq(placeProxyUrl('https://x/exec', 'Lake Como', null),
  'https://x/exec?fn=place&q=Lake%20Como', 'placeProxyUrl: name only');
eq(placePhotoUrl('https://x/exec', 'AbC_ref', 400),
  'https://x/exec?fn=placephoto&ref=AbC_ref&w=400', 'placePhotoUrl');
eq(placeCacheKey('Sirmione', [45.491, 10.606]), 'place:Sirmione@45.491,10.606', 'placeCacheKey rounds 3dp');
eq(fmtRating(4.6, 2134), '★ 4.6 (2,134)', 'fmtRating with reviews');
eq(fmtRating(4.6, 0), '★ 4.6', 'fmtRating no reviews');
eq(fmtRating(null, 0), '', 'fmtRating: none → empty');
eq(priceTier(2), '€€', 'priceTier 2'); eq(priceTier(0), '', 'priceTier 0 → free/empty'); eq(priceTier(null), '', 'priceTier null');
eq(parsePlace({ rating: 4.6, user_ratings_total: 2134, photoRef: 'r', types: ['tourist_attraction'],
  price_level: 2, opening_hours: { open_now: true, today: '9 AM–8 PM' }, website: 'https://w', formatted_phone_number: '+39 1', place_id: 'p', gmapsUrl: 'https://g' }),
  { rating: 4.6, reviews: 2134, photoRef: 'r', category: 'attraction', priceLevel: 2,
    openNow: true, hoursToday: '9 AM–8 PM', website: 'https://w', phone: '+39 1', placeId: 'p', gmapsUrl: 'https://g' },
  'parsePlace normalizes proxy json');
eq(parsePlace(null), null, 'parsePlace null → null');
```

- [ ] **Step 2 — run, expect FAIL** (`node tools/test-core.mjs` → "X is not defined").

- [ ] **Step 3 — implement in core.js:**

```js
export const placeProxyUrl = (base, name, ll) =>
  `${base}?fn=place&q=${encodeURIComponent(name || '')}` + (ll ? `&lat=${ll[0]}&lng=${ll[1]}` : '');
export const placePhotoUrl = (base, ref, w = 400) =>
  `${base}?fn=placephoto&ref=${encodeURIComponent(ref)}&w=${w}`;
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
```

- [ ] **Step 4 — run, expect PASS.**
- [ ] **Step 5 — commit:** `feat(core): place enrichment pure helpers`

### Task 2: Apps Script Places proxy

**Files:** Modify `apps-script/Code.gs`

- [ ] **Step 1** — add to `doGet(e)` routing: when `e.parameter.fn === 'place'` → `return placeLookup(e)`, when `=== 'placephoto'` → `return placePhoto(e)`.

- [ ] **Step 2 — implement** (key from Script Properties, CacheService 6h, return JSON via ContentService):

```javascript
function placeLookup(e) {
  var key = PropertiesService.getScriptProperties().getProperty('PLACES_KEY');
  if (!key) return json_({ ok: false, reason: 'no-key' });
  var q = e.parameter.q, lat = e.parameter.lat, lng = e.parameter.lng;
  var cacheId = 'place:' + q + '@' + (lat || '') + ',' + (lng || '');
  var cache = CacheService.getScriptCache(), hit = cache.get(cacheId);
  if (hit) return json_(JSON.parse(hit));
  // Find Place From Text (bias by location if given)
  var url = 'https://maps.googleapis.com/maps/api/place/findplacefromtext/json'
    + '?input=' + encodeURIComponent(q) + '&inputtype=textquery'
    + '&fields=place_id&key=' + key
    + (lat && lng ? '&locationbias=point:' + lat + ',' + lng : '');
  var find = JSON.parse(UrlFetchApp.fetch(url, { muteHttpExceptions: true }).getContentText());
  var pid = find.candidates && find.candidates[0] && find.candidates[0].place_id;
  if (!pid) return json_({ ok: false, reason: 'not-found' });
  var durl = 'https://maps.googleapis.com/maps/api/place/details/json?place_id=' + pid
    + '&fields=rating,user_ratings_total,photos,types,price_level,opening_hours,website,formatted_phone_number,url&key=' + key;
  var d = JSON.parse(UrlFetchApp.fetch(durl, { muteHttpExceptions: true }).getContentText()).result || {};
  var out = {
    ok: true, place_id: pid, rating: d.rating, user_ratings_total: d.user_ratings_total,
    photoRef: d.photos && d.photos[0] && d.photos[0].photo_reference,
    types: d.types, price_level: d.price_level,
    opening_hours: d.opening_hours ? {
      open_now: d.opening_hours.open_now,
      today: (d.opening_hours.weekday_text || [])[(new Date().getDay() + 6) % 7]
    } : null,
    website: d.website, formatted_phone_number: d.formatted_phone_number, gmapsUrl: d.url
  };
  cache.put(cacheId, JSON.stringify(out), 21600);
  return json_(out);
}
function placePhoto(e) {
  var key = PropertiesService.getScriptProperties().getProperty('PLACES_KEY');
  var ref = e.parameter.ref, w = e.parameter.w || 400;
  var url = 'https://maps.googleapis.com/maps/api/place/photo?maxwidth=' + w
    + '&photo_reference=' + ref + '&key=' + key;
  var resp = UrlFetchApp.fetch(url, { followRedirects: true, muteHttpExceptions: true });
  var b = resp.getBlob();
  // Apps Script can't stream binary cleanly → return a data URI string the client sets as <img src>.
  return json_({ ok: true, dataUri: 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes()) });
}
function json_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
```

- [ ] **Step 3 — commit:** `feat(apps-script): Google Places proxy (key server-side)`. (User action documented in pipeline/README: enable Places API, add `PLACES_KEY` script property, redeploy.)

### Task 3: js/places.js enrichment + fallback

**Files:** Create `js/places.js`; reference `SAVE_URL` from `js/sync.js`.

- [ ] **Step 1 — implement** (cache 30d; proxy → parsePlace; fallback to existing Wikipedia thumb + OSM is handled by the existing thumb hydration, so places.js only adds rating/category/hours/photoRef and returns null on failure):

```js
import { SAVE_URL } from './sync.js';
import { placeProxyUrl, placeCacheKey, parsePlace } from './core.js';

const TTL = 30 * 864e5;
export async function enrich(name, ll) {
  if (!name) return null;
  const key = placeCacheKey(name, ll);
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const o = JSON.parse(raw); if (Date.now() - o._t < TTL) return o.v; }
  } catch {}
  let v = null;
  try {
    const r = await fetch(placeProxyUrl(SAVE_URL, name, ll));
    if (r.ok) { const j = await r.json(); if (j && j.ok) v = parsePlace(j); }
  } catch {}
  try { localStorage.setItem(key, JSON.stringify({ _t: Date.now(), v })); } catch {}
  return v;
}
```

- [ ] **Step 2** — confirm `js/sync.js` exports `SAVE_URL` (it holds the `/exec` URL). If it's a non-exported const, add `export`.
- [ ] **Step 3 — `node --check js/places.js`**, commit: `feat(places): client enrichment with 30d cache + graceful fallback`.

### Task 4: Hybrid place card in itinerary.js

**Files:** Modify `js/itinerary.js`, `css/app.css`

- [ ] **Step 1** — in `placeRow`, restructure to photo-left and add an enrichment meta line placeholder hydrated after render. The row keeps the existing drawer/drag/delete. Add a `.pmeta` line and an empty `.pleg` connector slot (filled in Phase 2). Photo tile keeps the existing `data-thumb` hydration; add `data-enrich="<name>"` and `data-ll` on the row so a new `hydrateEnrich(root, ctx)` can fill `.pmeta` (rating · category · price · hours) and swap the photo to a Places photo when `photoRef` present.

```js
// inside render(), after hydrateThumbs(root):
hydrateEnrich(root);
```

```js
import { enrich } from './places.js';
import { fmtRating, priceTier, placePhotoUrl } from './core.js';
import { SAVE_URL } from './sync.js';

async function hydrateEnrich(root) {
  root.querySelectorAll('.pbody[data-enrich]').forEach(async el => {
    const name = el.dataset.enrich;
    const ll = el.dataset.ll ? el.dataset.ll.split(',').map(Number) : null;
    const v = await enrich(name, ll);
    if (!v) return;
    const meta = el.querySelector('.pmeta'); if (meta) {
      const bits = [fmtRating(v.rating, v.reviews), v.category, priceTier(v.priceLevel),
        v.openNow == null ? '' : (v.openNow ? (v.hoursToday ? 'open · ' + v.hoursToday : 'open now') : 'closed')]
        .filter(Boolean);
      meta.textContent = bits.join(' · ');
    }
    if (v.photoRef) {
      const ph = el.closest('li').querySelector('.pthumb.ph');
      if (ph) { const r = await fetch(placePhotoUrl(SAVE_URL, v.photoRef, 160)); if (r.ok) { const j = await r.json(); if (j.dataUri) { ph.style.backgroundImage = `url("${j.dataUri}")`; ph.classList.add('has-photo'); ph.textContent = ''; } } }
    }
  });
}
```

- [ ] **Step 2 — CSS** (hybrid: photo-left, paper palette retained). Add `.pmeta{font-size:.78em;color:var(--ink-soft);margin-top:1px}` and `.pleg{font-family:'JetBrains Mono',monospace;font-size:.72em;color:var(--glacier);margin:4px 0 0 34px}` and ensure `.prow` keeps the thumb on the left (move `.pthumb` order before `.pbody` or use `order:` — keep current right-thumb but acceptable; for photo-left set `.prow{...}` and place thumb first in markup). Keep it minimal: render the thumbnail as the first child of `.prow`.
- [ ] **Step 3** — render smoke must still pass (mocked fetch returns `{ok:false}` → enrich returns null → no meta text, card still renders). Run smoke, expect ALL RENDERS OK.
- [ ] **Step 4 — commit:** `feat(itinerary): hybrid photo-left card with live rating/category/hours`.

---

## Phase 2 — Per-leg travel times + routes

### Task 5: Routing pure helpers in core.js

**Files:** Modify `js/core.js`, `tools/test-core.mjs`

- [ ] **Step 1 — failing tests:**

```js
eq(modeProfile('drive'), 'driving', 'modeProfile drive');
eq(osrmUrl([45.5, 10.6], [45.6, 10.7], 'drive'),
  'https://router.project-osrm.org/route/v1/driving/10.6,45.5;10.7,45.6?overview=false', 'osrmUrl lng,lat order');
let lf = legFallback([45.5, 10.6], [46.0, 10.6], 'drive');
if (lf.km < 60 || lf.km > 90) { fails++; console.error('FAIL legFallback drive km ' + lf.km); } else console.log('ok   legFallback drive ~72km');
eq(legFallback([45.5, 10.6], [45.5, 10.6], 'walk'), { km: 0, mins: 0 }, 'legFallback zero distance');
eq(fmtDuration(12), '12 min', 'fmtDuration <60');
eq(fmtDuration(65), '1 h 5 min', 'fmtDuration >60');
eq(parseOsrm({ routes: [{ distance: 8400, duration: 720 }] }), { km: 8.4, mins: 12 }, 'parseOsrm m→km, s→min');
eq(parseOsrm({ routes: [] }), null, 'parseOsrm empty → null');
```

- [ ] **Step 2 — run, expect FAIL.**
- [ ] **Step 3 — implement:**

```js
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
```

> NOTE: OSRM public demo only serves the **driving** profile reliably. `routing.leg` uses OSRM for `drive` and `legFallback` for `walk`/`cycle`.

- [ ] **Step 4 — PASS.** **Step 5 — commit:** `feat(core): per-leg routing helpers`.

### Task 6: js/routing.js

**Files:** Create `js/routing.js`

- [ ] **Step 1 — implement** (OSRM for drive, cached; fallback otherwise):

```js
import { osrmUrl, parseOsrm, legFallback } from './core.js';
export async function leg(a, b, mode = 'drive') {
  if (!a || !b) return null;
  if (mode !== 'drive') return legFallback(a, b, mode);
  const key = `leg:${mode}:${a}:${b}`;
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c); } catch {}
  let v = null;
  try { const r = await fetch(osrmUrl(a, b, mode)); if (r.ok) v = parseOsrm(await r.json()); } catch {}
  if (!v) v = legFallback(a, b, mode);
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  return v;
}
```

- [ ] **Step 2 — `node --check`, commit:** `feat(routing): OSRM leg times with haversine fallback`.

### Task 7: Connectors + mode toggle in itinerary.js

**Files:** Modify `js/itinerary.js`, `css/app.css`

- [ ] **Step 1** — add a per-day mode toggle in the day header (`drive/walk/cycle`), stored in the itinerary overlay as `dayModes[dayId]` (default 'drive') via `setMode(ctx, dayId, mode)` mirroring `setPlan`.
- [ ] **Step 2** — after each place `li` (except the last), render `<div class="pleg" data-from="lat,lng" data-to="lat,lng" data-mode="drive">…</div>`; hydrate with `routing.leg` → `⌄ ${fmtDuration(mins)} · ${km} km`.
- [ ] **Step 3** — hydrate function:

```js
import { leg } from './routing.js';
import { fmtDuration } from './core.js';
async function hydrateLegs(root) {
  root.querySelectorAll('.pleg[data-from]').forEach(async el => {
    const a = el.dataset.from.split(',').map(Number), b = el.dataset.to.split(',').map(Number);
    const v = await leg(a, b, el.dataset.mode); if (v) el.textContent = `⌄ ${fmtDuration(v.mins)} · ${v.km} km`;
  });
}
```

- [ ] **Step 4** — smoke must pass (fetch mocked → legFallback runs, deterministic). Commit: `feat(itinerary): inline per-leg travel times + drive/walk/cycle toggle`.

---

## Phase 3 — Brand logos

### Task 8: Logo pure helpers in core.js

**Files:** Modify `js/core.js`, `tools/test-core.mjs`

- [ ] **Step 1 — failing tests:**

```js
eq(iataFromFlight('EK353'), 'EK', 'iata EK'); eq(iataFromFlight('W6 4551'), 'W6', 'iata W6');
eq(iataFromFlight('FI418'), 'FI', 'iata FI'); eq(iataFromFlight(''), null, 'iata empty → null');
eq(airlineLogoUrl('EK'), 'https://pics.avs.io/120/40/EK.png', 'airlineLogoUrl');
eq(brandDomain('Booking.com'), 'booking.com', 'brandDomain booking');
eq(brandDomain('Emirates'), 'emirates.com', 'brandDomain emirates');
eq(brandDomain('Some Tiny B&B'), null, 'brandDomain unknown → null');
eq(brandLogoUrl('booking.com'), 'https://logo.clearbit.com/booking.com', 'brandLogoUrl');
```

- [ ] **Step 2 — FAIL. Step 3 — implement:**

```js
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
```

- [ ] **Step 4 — PASS. Step 5 — commit:** `feat(core): airline/brand logo helpers`.

### Task 9: js/logos.js + booking cards

**Files:** Create `js/logos.js`; Modify `js/bookings.js`, `css/app.css`

- [ ] **Step 1 — logos.js** returns an `<img>` html string with an `onerror` that hides itself so the existing type icon (already in the card) remains:

```js
import { esc, iataFromFlight, airlineLogoUrl, brandDomain, brandLogoUrl } from './core.js';
export function logoImg(booking) {
  let src = null;
  if (booking.type === 'flight') { const ia = iataFromFlight(booking.flight || booking.title); if (ia) src = airlineLogoUrl(ia); }
  if (!src) { const d = brandDomain(booking.provider || booking.title); if (d) src = brandLogoUrl(d); }
  return src ? `<img class="brandlogo" alt="" src="${esc(src)}" onerror="this.remove()">` : '';
}
```

- [ ] **Step 2** — in `js/bookings.js` booking card, render `logoImg(b)` next to the type icon. Add `.brandlogo{height:18px;width:auto;border-radius:3px;vertical-align:middle;margin-left:6px}`.
- [ ] **Step 3** — smoke passes (img is inert in jsdom). Commit: `feat(bookings): airline + provider brand logos with icon fallback`.

---

## Phase 4 — Weather + budget polish

### Task 10: Weather/FX/debt pure helpers in core.js

**Files:** Modify `js/core.js`, `tools/test-core.mjs`

- [ ] **Step 1 — failing tests:**

```js
eq(weatherUrl([45.49, 10.61]),
  'https://api.open-meteo.com/v1/forecast?latitude=45.49&longitude=10.61&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16',
  'weatherUrl');
eq(pickDaily({ daily: { time: ['2026-08-01', '2026-08-02'], weather_code: [1, 61], temperature_2m_max: [28, 22], temperature_2m_min: [18, 15], precipitation_probability_max: [10, 80] } }, '2026-08-02'),
  { code: 61, tmax: 22, tmin: 15, precip: 80 }, 'pickDaily finds date');
eq(pickDaily({ daily: { time: ['2026-08-01'] } }, '2030-01-01'), null, 'pickDaily out of range → null');
eq(wmoIcon(0), '☀️', 'wmo clear'); eq(wmoIcon(61), '🌧️', 'wmo rain'); eq(wmoIcon(71), '❄️', 'wmo snow');
eq(convert(100, 1.08), 108, 'convert'); eq(convert(null, 1.08), null, 'convert null');
eq(simplifyDebts({ Chongyu: 120, Yuanxin: -120 }), [{ from: 'Yuanxin', to: 'Chongyu', amount: 120 }], 'simplifyDebts 2-party');
eq(simplifyDebts({ A: 0, B: 0 }), [], 'simplifyDebts settled → []');
```

- [ ] **Step 2 — FAIL. Step 3 — implement:**

```js
export const weatherUrl = ll =>
  `https://api.open-meteo.com/v1/forecast?latitude=${ll[0]}&longitude=${ll[1]}&daily=weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max&timezone=auto&forecast_days=16`;
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
```

- [ ] **Step 4 — PASS. Step 5 — commit:** `feat(core): weather + FX + settle-up helpers`.

### Task 11: js/weather.js + day weather chip

**Files:** Create `js/weather.js`; Modify `js/itinerary.js`, `css/app.css`

- [ ] **Step 1 — weather.js** (cache by ll+date; one forecast fetch per trip-center reused):

```js
import { weatherUrl, pickDaily } from './core.js';
const mem = {};
export async function dayWeather(ll, iso) {
  if (!ll || !iso) return null;
  const ck = ll.join(',');
  if (!mem[ck]) mem[ck] = fetch(weatherUrl(ll)).then(r => r.ok ? r.json() : null).catch(() => null);
  const j = await mem[ck]; return j ? pickDaily(j, iso) : null;
}
```

- [ ] **Step 2** — in the day header render an empty `<span class="wx" data-ll data-date>` and hydrate: `wmoIcon(code) + ` ${Math.round(tmax)}°/${Math.round(tmin)}° · ${precip}%``. Only add the span when the day has `ll` and `_date`. CSS `.wx{font-size:.72em;color:var(--ink-soft);margin-left:8px}`.
- [ ] **Step 3** — smoke passes (fetch mocked → null → no chip). Commit: `feat(itinerary): per-day weather chip (open-meteo)`.

### Task 12: Multi-currency + settle-up in budget.js

**Files:** Modify `js/budget.js`; Create `js/fx.js`

- [ ] **Step 1 — fx.js** (Frankfurter, cached daily):

```js
export async function rates(base) {
  const key = `fx:${base}`;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.d === new Date().toISOString().slice(0, 10)) return c.r; } catch {}
  try {
    const j = await (await fetch(`https://api.frankfurter.app/latest?from=${base}`)).json();
    const r = { ...j.rates, [base]: 1 };
    localStorage.setItem(key, JSON.stringify({ d: new Date().toISOString().slice(0, 10), r }));
    return r;
  } catch { return { [base]: 1 }; }
}
```

> NOTE: `new Date()` is fine in browser modules; it is only forbidden inside Workflow scripts. Tests for `convert`/`simplifyDebts` already cover the pure math.

- [ ] **Step 2** — in `budget.js`, convert each booking/expense amount to the trip base currency via `convert(amt, rates[cur])` before the category roll-up (amounts already mostly in base; this handles ISK/CHF mixed in).
- [ ] **Step 3** — add a **Settle-up** panel under the balances using `simplifyDebts(computeBalances(...).net)`: render each `{from} owes {to} {fmtMoney(amount)}`.
- [ ] **Step 4** — smoke passes. Commit: `feat(budget): multi-currency roll-up + settle-up panel`.

### Task 13: Docs + final verification

**Files:** Modify `pipeline/README.md` (Places API setup), `docs/HANDOFF.md` if present.

- [ ] **Step 1** — document the one-time user action: enable **Places API (New)** in Google Cloud, add billing, set Script Property `PLACES_KEY`, redeploy the Web App. Note the app is fully usable without it (fallback mode).
- [ ] **Step 2 — full verify:** `node tools/test-core.mjs` (exit 0), `for f in js/*.js; do node --check "$f"; done`, `cd /tmp/trips-smoke && node smoke.mjs` (ALL RENDERS OK). Push. Live-check the dashboard.
- [ ] **Step 3 — commit:** `docs: Places API setup + verification notes`.

---

## Self-review

- **Spec coverage:** §1 enrichment → Tasks 1–4; §2 hybrid card → Task 4; §3 per-leg/routes → Tasks 5–7; §4 logos → Tasks 8–9; §5 weather/FX/settle-up → Tasks 10–12; risks/fallbacks → fallback paths in Tasks 3,6,11,12 + smoke degraded-mode; user action → Task 13. All covered.
- **Type consistency:** `enrich()` returns the `parsePlace` shape (rating/reviews/category/priceLevel/openNow/hoursToday/photoRef/website/phone/placeId/gmapsUrl) — consumed unchanged in Task 4. `leg()` returns `{km,mins}` — produced by both `parseOsrm` and `legFallback`, consumed in Tasks 7. `simplifyDebts` consumes `computeBalances().net`. `SAVE_URL` import added in Task 3 (export confirmed in Task 3 step 2). Consistent.
- **Fallback-first:** every external fetch (places, OSRM, photo, weather, FX) has a null/degraded path; smoke runs with `fetch → {ok:false}` to prove renders survive. No placeholders remain.
