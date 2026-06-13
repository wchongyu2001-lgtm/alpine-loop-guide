# BACKLOG — pick the topmost item whose status is `todo`

Format per item. Statuses: `todo` → `done` (merged) | `blocked: <reason>` | `wip` (claimed this run).
When you finish, set the status line and add a one-line result. Keep priority order; do not reorder done items.
If you think of a valuable new item mid-run, append it to the bottom as `todo`.

---

## P1 — Alpine-critical (offline + mobile, must survive the field)

### B01 · status: todo · pillar: offline
**Offline PWA shell.** Add a `manifest.webmanifest` + service worker that caches the app shell
(index.html, all `js/*.js`, `css/app.css`) and the current trip JSON so the itinerary + today view
load with no signal. Cache-first for shell, network-first-then-cache for trip data.
Accept: app opens and shows the Alpine itinerary with network disabled (verify via served check).

### B02 · status: todo · pillar: offline
**Cache map tiles + last-known place/weather data** for offline. Persist the most recently fetched
Leaflet tiles + enrichment/weather to localStorage/Cache API; on offline, render from cache instead
of blank. Accept: map + weather show cached content when offline, degrade gracefully.

### B03 · status: todo · pillar: offline/mobile
**Mobile "Today" view.** A single-screen, thumb-friendly view: today's date, the day's ordered
plan with times, the next upcoming booking, today's weather. Auto-select when the open trip's date
range contains today; reachable from a clear tab/button otherwise. Accept: renders today's Alpine
day cleanly at 390px width.

## P1 — Bookings = single source of truth

### B04 · status: todo · pillar: bookings
**Booking gap/conflict detector.** Scan a trip's bookings + days and surface: missing return leg
(outbound flight/train with no return), overlapping bookings (same time window), and bookings whose
date falls outside the trip range. Show as a dismissible banner/list in the bookings view.
Accept: with the seeded Alpine/Iceland data, correct warnings render; none are false positives on clean data.

### B05 · status: todo · pillar: bookings
**Unassigned-booking triage.** Any booking with no trip / unknown trip gets a clear "assign to trip"
affordance in the bookings view, writing to the bookings overlay. Accept: an unassigned booking can
be assigned and persists.

## P2 — Day logistics, timing & discovery

### B06 · status: todo · pillar: logistics
**"Can I make it?" timing warnings.** For each day, compare consecutive places' scheduled time gap
against the computed leg travel time (routing.js / haversine fallback). Flag legs where travel time
> gap, and flag over-packed days (sum of legs + dwell > waking hours). Inline on the itinerary.
Accept: a deliberately tight Alpine leg shows a warning; a comfortable one does not.

### B07 · status: todo · pillar: discovery
**Nearby discovery into itinerary.** For a selected day/place, suggest a few nearby eat/do options
(reuse places.js enrichment / a free POI source) with one-tap "add to day". Accept: suggestions
appear for an Alpine place and one can be added to the day plan.

## P2 — Money & splitting

### B08 · status: todo · pillar: money
**Faster expense entry + settle-up clarity.** Quick-add expense (amount, who paid, split, category)
in ≤3 taps; a clear "who owes whom" settle-up summary using existing `computeBalances`/`simplifyDebts`;
budget-vs-actual per day. Accept: adding an expense updates balances and the settle-up summary correctly.

## P3 — Safe roadmap (no new secrets)

### B09 · status: todo · pillar: bookings
**Frontend label for the inbound booking-forward address** (per INBOUND_TODO.md item 4) — show the
forward-to address in the bookings view so the user knows where to forward confirmations. Accept:
address visible; no backend change required.

### B10 · status: todo · pillar: polish
**Itinerary print/share view** — a clean, printable one-page-per-day summary (places, times, bookings)
for an offline paper backup. Accept: print stylesheet produces a readable per-day handout.
