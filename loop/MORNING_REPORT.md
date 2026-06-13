# Morning Report — Overnight Build Loop (2026-06-14)

Each iteration appends below. ✅ done = built, green, merged & deployed. ⛔ blocked = left on a branch / not shipped.
Live app: https://wchongyu2001-lgtm.github.io/alpine-loop-guide/

---

### 2026-06-13T16:42:13Z · B01 Offline PWA shell
- status: done
- pillar: offline
- what: Added manifest.webmanifest + icon.svg + sw.js (service worker) and registered the SW in index.html. Shell (html/css/all js) is cache-first, trip JSON (data/*.json incl. alpine.json) network-first-then-cache, CDN assets (Leaflet/fonts/Sortable) stale-while-revalidate — so the Alpine itinerary loads with no signal.
- evidence: node tools/test-core.mjs exits 0 (incl. new guard: sw.js precaches every js/ module + alpine.json); node --check sw.js OK; manifest valid JSON; served check OK — index serves Travel Companion marker + refs manifest/sw, sw.js/manifest/icon all served.
- deploy: live (frontend)
- commit: 1499985

### 2026-06-14T00:00:00Z · B02 Offline map tiles + last-known weather
- status: done
- pillar: offline
- what: Added a dedicated `tc-tiles-v1` SW cache for OSM map tiles (stale-while-revalidate, survives shell-cache version bumps, transparent-PNG fallback when offline & uncached) so previously-viewed map areas render with no signal. weather.js now persists the last-known open-meteo forecast per coordinate to localStorage (fresh <6h served without a fetch; stale copy used when offline) so the day weather still renders offline. New `weatherCacheKey` helper in core.js.
- verified: PASS (independent agent) — tc-tiles cache + OSM handling + weatherCacheKey present on origin/main; node tools/test-core.mjs exits 0 with new B02 guards; live sw.js serves HTTP 200 with the tc-tiles marker (propagated on retry).
- whatsnew: recorded
- deploy: live (frontend)
- commit: 1cf5fd3

### 2026-06-14T01:30:00Z · B03 Mobile Today view
- status: done
- pillar: offline/mobile
- what: New `js/today.js` view + "Today" tab — a single thumb-friendly screen with today's date & weather, the day's ordered plan with times, and the next upcoming booking. Auto-selects when the open trip's date range contains today (app.js), else reachable from the tab and previews day 1 with a banner. Pure helpers `pickTodayDay`/`nextBooking` added to core.js; sw.js precaches the new module (CACHE bumped to v3).
- verified: PASS (independent agent) — js/today.js + 'today' view registration + auto-select on origin/main, sw.js precaches it; node tools/test-core.mjs exits 0 with new pickTodayDay/nextBooking guards; live js/today.js serves HTTP 200 with the Today-view marker (propagated on retry).
- whatsnew: recorded
- deploy: live (frontend)
- commit: 666333f

### 2026-06-14T02:30:00Z · B04 Booking gap/conflict detector
- status: done
- pillar: bookings
- what: New pure helpers `bookingWarnings`/`flightRoute` in core.js scan a trip's bookings for three problems — out-of-range dates, time-overlapping point-bookings, and broken flight chains (arrive one airport, next flight departs another → missing connecting/return leg). Surfaced as a dismissible `bk-warnings` banner atop the bookings view (per-warning ✕ persists to the bookings overlay). Conservative: hotels/cars never count as time clashes, only adjacent flights chain.
- verified: PASS (independent agent) — merge 66f686f on origin/main (bookingWarnings in core.js, bk-warnings banner in bookings.js); node tools/test-core.mjs exits 0 with 6 new B04 guards; 0 warnings on real preexchange/alpine/iceland, 1 on a deliberately broken booking; live core.js serves 200 with the marker.
- whatsnew: recorded
- deploy: live (frontend)
- commit: 66f686f

### 2026-06-14T03:30:00Z · B05 Unassigned-booking triage
- status: done
- pillar: bookings
- what: Broadened the 📥 Unassigned inbox to catch every orphan booking — empty/null trip, the literal 'unassigned' tag, AND stale trip ids no longer in the registry — via a new pure `orphanBookings(bookings, trips)` in core.js; each gets the existing persistent "assign to…" select.
- verified: PASS (independent agent) — orphanBookings on origin/main in core.js+bookings.js; test-core exits 0 with 2 new B05 guards; live js/core.js serves 200 with the orphanBookings marker (retry 2).
- whatsnew: recorded
- deploy: live (frontend)
- commit: bb862dc

### 2026-06-14T04:15Z · B06 "Can I make it?" timing warnings
- status: done
- pillar: logistics
- what: Per-leg feasibility (legGapMins/legFeasibility) flags hops where computed travel time exceeds the scheduled gap (connector turns terra + "⚠ tight by N"); dayLoad flags over-packed days (dwell + travel > waking budget) with a banner. Inline on the itinerary; 3 new pure-logic guards.
- verified: PASS — independent agent confirmed merge f0bff42 on origin/main (exports legFeasibility/dayLoad; itinerary references leg-tight), test-core exits 0 with B06 guards, an independent import check confirmed tight leg → {tight:true} & comfortable → {tight:false}, live core.js/itinerary.js serve 200 with markers.
- whatsnew: recorded
- deploy: live (frontend)
- commit: f0bff42

### 2026-06-14T04:50:00Z · B07 Nearby discovery into itinerary
- status: done
- pillar: discovery
- what: Open-place drawer now shows a "Nearby eat & do" panel — keyless OpenStreetMap Overpass POIs (restaurants/cafés/bars/viewpoints/museums) ranked nearest-first; one-tap chip adds the spot to that day's plan. 7d cache, fail-soft to [].
- verified: PASS — independent agent confirmed merge b19bf3d on origin/main (overpassUrl/parseOverpass/nearbyCacheKey + .pd-nearby/data-near→setPlan), test-core exits 0 with 7 new guards, live core.js & itinerary.js serve 200 with parseOverpass/pd-nearby markers after Pages propagation.
- whatsnew: recorded
- deploy: live (frontend)
- commit: b19bf3d

### 2026-06-14T05:30Z · B08 Faster expense entry + budget-vs-actual per day
- status: done
- pillar: money
- what: Quick-add expense now needs only an amount (note optional; cat/payer/split default → ≤3 taps). New pure `budgetVsActual` in core.js powers a per-day "Budget vs actual" card (estimate vs logged, coloured delta + total) beside the existing settle-up summary.
- verified: PASS — independent agent confirmed merge 1cf8e9f on origin/main; test-core exits 0 with 4 new budgetVsActual guards; pure-logic sanity (actual 120/delta 20); live core.js & budget.js HTTP 200 with marker on first try (no Pages lag).
- whatsnew: recorded
- deploy: live (frontend)
- commit: 1cf8e9f
