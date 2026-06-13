# BACKLOG — pick the topmost item whose status is `todo`

Format per item. Statuses: `todo` → `done` (merged) | `blocked: <reason>` | `wip` (claimed this run).
When you finish, set the status line and add a one-line result. Keep priority order; do not reorder done items.
If you think of a valuable new item mid-run, append it to the bottom as `todo`.

---

## P1 — Alpine-critical (offline + mobile, must survive the field)

### B01 · status: done · pillar: offline · 1499985 — manifest + icon + sw.js (cache-first shell, network-first trip data, SWR for CDN); registered in index.html
**Offline PWA shell.** Add a `manifest.webmanifest` + service worker that caches the app shell
(index.html, all `js/*.js`, `css/app.css`) and the current trip JSON so the itinerary + today view
load with no signal. Cache-first for shell, network-first-then-cache for trip data.
Accept: app opens and shows the Alpine itinerary with network disabled (verify via served check).

### B02 · status: done · 1cf5fd3 · pillar: offline — dedicated `tc-tiles` SW cache (SWR, survives shell-cache bumps, transparent fallback offline) + per-coord last-known weather persisted to localStorage
**Cache map tiles + last-known place/weather data** for offline. Persist the most recently fetched
Leaflet tiles + enrichment/weather to localStorage/Cache API; on offline, render from cache instead
of blank. Accept: map + weather show cached content when offline, degrade gracefully.

### B03 · status: done · 666333f · pillar: offline/mobile — new `today.js` view + Today tab (today's plan/times, next booking, weather), auto-selected when trip range contains today; pure `pickTodayDay`/`nextBooking` in core.js
**Mobile "Today" view.** A single-screen, thumb-friendly view: today's date, the day's ordered
plan with times, the next upcoming booking, today's weather. Auto-select when the open trip's date
range contains today; reachable from a clear tab/button otherwise. Accept: renders today's Alpine
day cleanly at 390px width.

## P1 — Bookings = single source of truth

### B04 · status: done · 66f686f · pillar: bookings — pure `bookingWarnings`/`flightRoute` in core.js (out-of-range + timed-overlap + broken-flight-chain) + dismissible `bk-warnings` banner in bookings view; 0 false positives on seeded preexchange/alpine/iceland
**Booking gap/conflict detector.** Scan a trip's bookings + days and surface: missing return leg
(outbound flight/train with no return), overlapping bookings (same time window), and bookings whose
date falls outside the trip range. Show as a dismissible banner/list in the bookings view.
Accept: with the seeded Alpine/Iceland data, correct warnings render; none are false positives on clean data.

### B05 · status: done · bb862dc · pillar: bookings — pure `orphanBookings` in core.js (flags empty/null trip, 'unassigned', and stale-unknown trip ids) wired into the 📥 Unassigned inbox + per-booking "assign to…" select writing to `ov.overrides`; 2 new guards in test-core
**Unassigned-booking triage.** Any booking with no trip / unknown trip gets a clear "assign to trip"
affordance in the bookings view, writing to the bookings overlay. Accept: an unassigned booking can
be assigned and persists.

## P2 — Day logistics, timing & discovery

### B06 · status: done · f0bff42 · pillar: logistics — pure `legGapMins`/`legFeasibility`/`dayLoad` in core.js; itinerary leg connectors turn `.leg-tight` (terra + "⚠ tight by N") when travel > scheduled gap, plus a per-day "⚠ Packed day" banner; 3 new test-core guards. Seeded Alpine: Sirmione→Jamaica (0 buffer) flags, relaxed afternoon stays quiet.
**"Can I make it?" timing warnings.** For each day, compare consecutive places' scheduled time gap
against the computed leg travel time (routing.js / haversine fallback). Flag legs where travel time
> gap, and flag over-packed days (sum of legs + dwell > waking hours). Inline on the itinerary.
Accept: a deliberately tight Alpine leg shows a warning; a comfortable one does not.

### B07 · status: done · b19bf3d · pillar: discovery — pure `overpassUrl`/`parseOverpass`/`nearbyCacheKey` in core.js (keyless OpenStreetMap Overpass POI source); `.pd-nearby` panel in the open place drawer renders nearest-first eat/do chips, one tap pushes onto the day plan via setPlan (7d localStorage cache, []-on-failure). 7 new test-core guards.
**Nearby discovery into itinerary.** For a selected day/place, suggest a few nearby eat/do options
(reuse places.js enrichment / a free POI source) with one-tap "add to day". Accept: suggestions
appear for an Alpine place and one can be added to the day plan.

## P2 — Money & splitting

### B08 · status: done · 1cf8e9f · pillar: money — quick-add now needs only an amount (optional note; cat/payer/split default → ≤3 taps); new pure `budgetVsActual(days,expenses)` in core.js powers a per-day "Budget vs actual" card (est vs logged, coloured delta + total) beside the existing simplifyDebts settle-up. 4 new test-core guards.
**Faster expense entry + settle-up clarity.** Quick-add expense (amount, who paid, split, category)
in ≤3 taps; a clear "who owes whom" settle-up summary using existing `computeBalances`/`simplifyDebts`;
budget-vs-actual per day. Accept: adding an expense updates balances and the settle-up summary correctly.

## P3 — Safe roadmap (no new secrets)

### B09 · status: done · c8c0c83 · pillar: bookings — dedicated `.bk-forward` line in the bookings view ("📨 Forward booking confirmations to <addr>") with a one-tap Copy button (#bkcopyaddr), backed by a single `INBOUND_ADDR` constant in bookings.js. No backend change. (Deferred from INBOUND_TODO item 4: left the `bkhelp` Apps-Script block in place — it still backs the Gmail-fetch-error fallback UX in wireFetch.)
**Frontend label for the inbound booking-forward address** (per INBOUND_TODO.md item 4) — show the
forward-to address in the bookings view so the user knows where to forward confirmations. Accept:
address visible; no backend change required.

### B10 · status: wip · pillar: polish
**Itinerary print/share view** — a clean, printable one-page-per-day summary (places, times, bookings)
for an offline paper backup. Accept: print stylesheet produces a readable per-day handout.
