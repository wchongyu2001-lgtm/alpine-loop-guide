# Travel Companion → Wanderlog-grade — Design

**Date:** 2026-06-13 · **Status:** approved, ready for implementation plan
**Repo:** `~/claude/alpine-loop-guide` · **Live:** https://wchongyu2001-lgtm.github.io/alpine-loop-guide/

## Goal

Bring the personal Travel Companion dashboard to feel "extremely similar to Wanderlog,"
with heavy frontend-design polish and real brand logos where a brand exists. Personal
use, single (public) repo, static GitHub Pages, vanilla ES modules, no build step.

## Approved decisions

| Decision | Choice |
|---|---|
| Visual direction | **Hybrid** — keep the editorial paper palette (`--paper`/`--ink`/`--terra`…) + Fraunces serif headings, adopt Wanderlog's photo-left card density + per-leg connectors. |
| Place ratings | **Google Places API via Apps Script proxy** — key in Script Properties, never the repo. Graceful fallback to free sources when no key. |
| Phase-1 scope | **All four**: per-leg travel times + map routes; brand logos; richer place cards; weather + budget polish. |

## Architecture

No change to the core model: repo JSON = read-only base; Apps Script + Sheet = edit
overlay; browser merges at load; localStorage cache + retry queue. New data is fetched
client-side and **cached in localStorage**; all enrichment **degrades gracefully** — a
missing key or offline source never breaks a render, it falls back to free sources or
hides the affected chip.

New modules (each one purpose, isolated, testable):

- `js/places.js` — place enrichment orchestration (fetch + cache + fallback).
- `js/routing.js` — per-leg travel time/distance (OSRM + haversine fallback), cached.
- `js/logos.js` — airline/hotel/provider logo `<img>` with `onerror` icon fallback.
- `js/weather.js` — open-meteo daily forecast per day, cached.
- Pure helpers added to `js/core.js` (URL builders, parsers, formatters) with tests.

Backend: extend existing `apps-script/Code.gs` Web App (same `/exec` URL).

### 1. Place enrichment — `js/places.js` + Apps Script proxy

**Proxy (`Code.gs`):**
- `?fn=place&q=<name>&lat=&lng=` → Places Text Search → Place Details. Returns trimmed
  `{placeId, rating, reviews, photoRef, hours, openNow, types[], category, priceLevel,
  website, phone, gmapsUrl}`.
- `?fn=placephoto&ref=<photoRef>&w=400` → 302/redirect or proxied bytes for a Places photo.
- Key from `PropertiesService.getScriptProperties().getProperty('PLACES_KEY')`.
- `CacheService` 6h cache keyed by name+rounded-latlng to cut quota.

**Client (`places.js`):**
- `enrich(place)` → checks `localStorage['place:'+key]` (30-day TTL) → else GET proxy →
  store. Returns the enrichment object or `null`.
- **Fallback** when proxy/key absent or errors: reuse existing Wikipedia photo + an
  OSM/Overpass lookup for `opening_hours`/category. No star rating in fallback mode;
  card shows category + hours + a "Reviews ↗" link to Google search.
- Pure (in core, tested): `placeProxyUrl`, `placePhotoUrl`, `parsePlace`, `placeCacheKey`,
  `formatHours`, `starString(rating)`, `priceTier(level)`.

### 2. Hybrid place card — `js/itinerary.js` + `css/app.css`

Restructure the place row to photo-left:

```
[photo 64px] Title                 09:00–11:00   [▸]
             ★4.6 · attraction · €8 · open till 8PM
             Storybook lakefront town on a peninsula…
  ⌄ 12 min · 8.4 km drive to next stop          ← per-leg connector (see §3)
```

- Photo: Places photo if enriched, else Wikipedia thumb, else category-glyph tile.
- Meta line built from enrichment; each piece hidden if absent (rating only with a key).
- Detail drawer (already exists) gains: Google photo(s), full hours, phone, website,
  "Reviews ↗". Keep existing time-edit + note + reservations + fun fact.
- Hybrid styling: paper palette + Fraunces headings retained; denser photo-left layout.

### 3. Per-leg travel times + routes — `js/routing.js` + core + `js/map.js`

- Between consecutive plan stops render a connector: `⌄ {mins} · {km} {mode}`.
- **Mode toggle** per day (drive/walk/cycle) in the day header; stored in the itinerary
  overlay (`dayModes[dayId]`, default 'drive').
- `routing.js`: `leg(a, b, mode)` → OSRM public router
  (`/route/v1/{profile}/{lng,lat;lng,lat}?overview=false`), cached in localStorage by
  `leg:<mode>:<a>:<b>`. On failure/offline → core `legFallback(a,b,mode)` (haversine ×
  road-factor ÷ mode speed). A duration always shows.
- Map: ensure ordered route polylines for day + whole-trip views (mostly present today).
- Pure (core, tested): `legFallback(a,b,mode)`, `osrmUrl(a,b,mode)`, `modeProfile(mode)`,
  `fmtDuration(mins)`.

### 4. Brand logos — `js/logos.js` + core

- **Airlines:** `iataFromFlight('EK353')` → `'EK'` → `airlineLogoUrl('EK')` (airhex CDN,
  no key). Shown on flight booking cards next to the title.
- **Hotels/providers:** `brandDomain(name)` via a small curated map
  (Emirates→emirates.com, Booking.com→booking.com, Trenitalia→trenitalia.com, …) →
  `brandLogoUrl(domain)` (Clearbit/logo.dev by domain). Unknown → `null`.
- `logos.js`: renders `<img class="brandlogo" onerror=…>` that swaps to the existing
  SVG category icon (`js/icons.js`) on load failure, so a brand-less or 404 logo never
  shows a broken image.
- Place cards without a photo show the category glyph (already available via icons.js).
- Pure (core, tested): `iataFromFlight`, `airlineLogoUrl`, `brandDomain`, `brandLogoUrl`.

### 5. Weather + budget polish — `js/weather.js` + core + `js/budget.js`

- **Weather chip** on each day card header: WMO icon + hi/lo + precip%. open-meteo
  (`/v1/forecast?latitude=&longitude=&daily=…`), free, cached by `wx:<ll>:<date>`. Only
  render for days within the forecast window (~16 days of the run date); else omit.
  Pure (core, tested): `weatherUrl(ll)`, `pickDaily(json, isoDate)`, `wmoIcon(code)`.
- **Multi-currency:** convert booking/expense amounts to the trip base currency for the
  budget roll-up. Frankfurter (`api.frankfurter.app/latest?from=&to=`), free, cached
  daily (`fx:<base>:<date>`). Pure: `convert(amount, rate)`.
- **Settle-up panel** in budget: from existing `computeBalances` net, show "X owes Y €N".
  Pure (core, tested): `simplifyDebts(net)` → minimal transfer list.

## Build order (incremental; every commit ships working + verified)

1. Places proxy + `places.js` enrichment + hybrid place-card redesign.
2. Per-leg travel times + mode toggle + map route polish.
3. Brand logos on bookings + place category glyphs.
4. Weather chips + multi-currency + settle-up.

## Testing & verification

- Every pure helper → assertions in `tools/test-core.mjs` (must exit 0).
- `node --check js/*.js` for syntax.
- Render smoke (`/tmp/trips-smoke`) extended: mocked `fetch` returns `{ok:false}` for
  external sources so **degraded mode** is exercised — all trip×view renders must pass.
- Live-deploy check per phase (assets 200, page renders).

## Risks / honest constraints

- **Places API is a user action:** enable Places API (New) in Google Cloud, add billing,
  put the key in Apps Script Script Properties as `PLACES_KEY`, redeploy the Web App.
  Until done, the app runs in **free-source fallback** (no star numbers). Build the
  fallback first so the app is fully usable with zero setup.
- **OSRM** public demo is rate-limited/best-effort → haversine fallback always covers it.
- **Logo CDNs** (airhex / Clearbit / logo.dev) are by IATA/domain, no key; unknown
  brands fall back to category icons.
- **Cost/quota:** enrich only places actually rendered; aggressive localStorage +
  Apps Script caching.
- **Public repo:** all keys stay in Apps Script Script Properties. Never commit a key.
  No new PII kinds added (consistent with prior accepted-risk decision).
