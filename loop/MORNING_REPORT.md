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

### 2026-06-14T06:15Z · B09 Forward-to address label in bookings
- status: done
- pillar: bookings
- what: Bookings view now shows a dedicated "📨 Forward booking confirmations to <addr>" line with a one-tap Copy button, backed by a single INBOUND_ADDR constant in bookings.js. Frontend-only; forwarded mail still flows via the existing daily pipeline sync.
- verified: PASS — independent agent confirmed merge c8c0c83 on origin/main (INBOUND_ADDR + .bk-forward-addr/#bkcopyaddr in bookings.js, .bk-forward* CSS); test-core exits 0 (no failures); live homepage + live js/bookings.js serve HTTP 200 with the bk-forward-addr marker after Pages propagation.
- whatsnew: recorded
- deploy: live (frontend)
- commit: c8c0c83
- note: deferred the INBOUND_TODO item-4 bkhelp deletion — that block still backs the Gmail-fetch-error fallback in wireFetch, so removing it was out of B09's accept scope.

### 2026-06-14T07:00:00Z · B10 Itinerary print/share view
- status: done
- pillar: polish
- what: "🖨 Print day-by-day" button in the Itinerary view opens the print dialog; a new @media print stylesheet hides interactive chrome and breaks each day onto its own page, keeping places/times/notes/route/bookings for an offline paper (or Save-as-PDF) backup.
- verified: PASS — independent agent confirmed merge b5f243e on origin/main (@media print in css/app.css + window.print in js/itinerary.js), test-core exit 0, local+live served checks 200 with markers; live already propagated.
- whatsnew: recorded
- deploy: live (frontend)
- commit: b5f243e

### 2026-06-14T07:30:00Z · loop
- backlog drained — all items B01–B10 are done; no `todo` remaining. No-op iteration, exiting.

### 2026-06-14T08:00:00Z · loop
- backlog drained — B01–B10 all done, no `todo` remaining. No-op iteration, exiting.

### 2026-06-14T08:35:00Z · B11 Today view — now/next/past progress
- status: done
- pillar: mobile/live
- what: New pure planProgress(plan, nowHHMM) in core.js labels each timed stop now/next/past (untimed → neutral; an open-ended stop runs until the next start). The Today view renders it — gold highlight + NOW pill on the current stop, NEXT pill on the next, faded strike-through on finished stops — but only on the real current day. Seeded backlog item myself (B01–B10 were all done; Alpine trip starts tomorrow, so hardening the field today-view is high value).
- verified: PASS — independent agent confirmed merge dc13fc2 on origin/main (planProgress in core.js, gated import + t-pill-now CSS in today.js, new guards in test-core), node tools/test-core.mjs exit 0 (7 planProgress assertions ok), agent's own throwaway logic assertions passed, local + live served checks 200 with markers; live propagated on first attempt.
- whatsnew: recorded
- deploy: live (frontend)
- commit: dc13fc2

### 2026-06-14T09:00:00Z · loop
- backlog drained — B01–B11 all `done`, no `todo` remaining. No-op iteration, exiting. App covers all four pillars; Alpine trip starts 2026-06-15. Not self-seeding to avoid gold-plating the day before the trip.

### 2026-06-14T09:30:00Z · loop
- backlog drained — B01–B11 all `done`, no `todo` remaining. No-op iteration, exiting. Holding the line per the prior fire: Alpine trip starts 2026-06-15 (tomorrow), all four pillars shipped + verified; not self-seeding new work to avoid gold-plating on the eve of the trip.

### 2026-06-14T10:00:00Z · loop
- backlog drained — B01–B11 all `done`, no `todo` remaining. No-op iteration, exiting. Same posture as prior fires: every pillar shipped + independently verified, Alpine trip starts tomorrow (2026-06-15). Deliberately not self-seeding new work on the eve of the trip to avoid gold-plating; the field-critical surface (offline shell, today-view now/next, bookings/timing/money) is locked.

### 2026-06-14T10:30:00Z · loop
- backlog drained — B01–B11 all `done`, no `todo` remaining. No-op iteration, exiting. Trip starts tomorrow (2026-06-15); all four pillars shipped + independently verified. Not self-seeding new work on the eve of the trip to avoid gold-plating the locked field-critical surface.

### 2026-06-14T09:20Z · B12 Packing list generator
- status: done
- pillar: mobile/live
- what: "🎒 Suggest packing list" button in Checklists builds a weather- + plan-aware packing list (rain shell, alpine warm layer, hiking boots for funicular/mountain days, swimwear for lakes) via new pure suggestPacking() in core.js.
- verified: PASS — independent agent confirmed merge 64516b2 on origin/main, node tools/test-core.mjs exits 0 (10 new suggestPacking guards ok), live js/checklists.js 200 with marker "Suggest packing list" (propagated on retry).
- whatsnew: recorded
- deploy: live (frontend)
- commit: 64516b2

### 2026-06-14T00:00:00Z · B21 Manual quick-add booking
- status: done
- pillar: bookings
- what: Extended the Bookings manual-add form to capture provider, optional end time, location and travellers (pax); routed submit through a new pure buildManualBooking() that trims/files/normalises and saves into the manual[] overlay so hand-added bookings show in the timeline like imported ones.
- verified: PASS — independent agent confirmed merge cb5e914 on origin/main, node tools/test-core.mjs exits 0 (4 new buildManualBooking guards ok), LIVE served checks 200 with buildManualBooking marker in js/bookings.js + js/core.js (no propagation lag).
- whatsnew: recorded
- deploy: live (frontend)
- commit: cb5e914
- note: Owner inserted Batch 3 (booking-planning, B21–B28) above Batch 2 mid-run; pivoted from the previously-claimed B16 (released back to todo) to honor the new top priority.

### 2026-06-14T12:00:00Z · B22 "Still to book" coverage gaps
- status: done
- pillar: bookings
- what: New pure coverageGaps(days, bookings) in core.js auto-detects un-booked nights (no accommodation) and un-covered overnight base changes (the day's `sleep` differs but no transport spans the move). Road-trip aware: a campervan/motorhome is the bed while held, and any held vehicle covers the driving legs. Renders as a 🧳 "Still to book" section (stillToBookHtml) grouped by date in the Bookings view.
- verified: PASS — independent agent confirmed merge f06ba5c on origin/main (coverageGaps + stillToBookHtml + .bk-tobook), node tools/test-core.mjs exit 0 with 6 new coverageGaps guards; on real seeded data pre-exchange flags the missing Genova→Firenze/Firenze→Bologna legs with 0 false lodging gaps, and the Alpine campervan suppresses all ~15 base changes (no false-positive flood); live served checks 200 with both markers.
- whatsnew: recorded
- deploy: live (frontend)
- commit: f06ba5c

### 2026-06-14T05:27Z · B23 Booking timeline view
- status: done
- pillar: bookings
- what: New ⏱ Timeline tab — all of a trip's bookings in one read-only chronological view, grouped by day and time-sorted, each row with type icon, time, provider, conf # and price. Time overlaps flagged via a header count + inline "overlap" tag (reuses bookingWarnings detection). New pure `bookingTimeline` in core.js with 6 guards.
- verified: PASS — independent agent confirmed merge 3041b71 on origin/main (js/timeline.js, view registered in app.js, precached in sw.js); test-core exits 0 with new bookingTimeline guards; throwaway import flagged both overlapping flights; local + live served checks 200 with marker "Booking timeline".
- whatsnew: recorded
- deploy: live (frontend)
- commit: 3041b71

### 2026-06-14T14:00:00Z · B24 Accommodation coverage strip
- status: done
- pillar: bookings
- what: Per-night 🛏 coverage strip in the Bookings view — one cell per night (departure day excluded), green+stay-name when a hotel/campervan spans the night (checkout-exclusive), dashed terracotta gap otherwise; tap a gap → manual add form pre-filled as a hotel for that date.
- verified: PASS — independent agent confirmed merge 568f4b2 on origin/main (accommodationStrip in core.js, stripHtml/data-booknight in bookings.js, .bk-night CSS), node tools/test-core.mjs EXIT=0 with 9 new accommodationStrip guards ok, live GitHub Pages fetch 200 with markers Travel Companion + accommodationStrip + bk-strip (no lag).
- whatsnew: recorded
- deploy: live (frontend)
- commit: 568f4b2

### 2026-06-14T15:32Z · B25 Booking action reminders
- status: done
- pillar: bookings
- what: New pure `bookingReminders()` + a ⏰ "Needs attention" list in the Bookings view — flight online check-in window (derived from departure, horizon-limited), free-cancellation deadlines, and hotel check-in/out times, sorted by urgency; nothing spurious when fields are absent. Added real fields to the Rialto Venice stay so it renders live.
- verified: PASS — independent agent confirmed merge e1ae08d on origin/main, `node tools/test-core.mjs` exit 0 (7 new guards), reproduced correct sort/urgency/no-spurious in a throwaway run, live served checks 200 with markers `bookingReminders` + `Needs attention`.
- whatsnew: recorded
- deploy: live (frontend)
- commit: e1ae08d

### 2026-06-14T17:00Z · B26 Booking cost rollup vs budget
- status: done
- pillar: bookings
- what: Bookings view now has a 💶 "Committed so far" card — total priced reservation spend, broken down by type (flights/stays/transport/activities/other) with FX conversion into the trip base currency, shown as % of the guide budget via a shared tripEstimate helper (budget.js now uses it too).
- verified: PASS — independent agent confirmed merge baf738f on origin/main, node tools/test-core.mjs exits 0 with new bookingRollup/tripEstimate guards (priced-only sum, group mapping, FX via toBase), live served checks 200 with markers bookingRollup + rollupHtml. Live already propagated.
- whatsnew: recorded
- deploy: live (frontend)
- commit: baf738f
