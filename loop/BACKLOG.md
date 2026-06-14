# BACKLOG — pick the topmost item whose status is `todo`

Format per item. Statuses: `todo` → `done` (merged) | `blocked: <reason>` | `wip` (claimed this run).
When you finish, set the status line and add a one-line result. Keep priority order; do not reorder done items.
If you think of a valuable new item mid-run, append it to the bottom as `todo`.

> **Batch 1 (B01–B11): all shipped & verified** — offline PWA, offline tiles+weather, Today view,
> booking gap/conflict detector, unassigned triage, "can I make it?" timing, nearby discovery,
> faster expenses + budget-vs-actual, forward-to address, print/share, Today progress (now/next).
> See `data/shipped.json` for details. Below is Batch 2.

---

## Batch 3 — BOOKING PLANNING (priority focus — build these first)

> Owner asked to focus on the booking/planning side: capturing, organising, and pressure-testing
> the reservations that make a trip actually happen. These sit ABOVE Batch 2 so the loop builds them
> next. Build on the existing bookings model (data/bookings.json + the `bookings` overlay: manual[]
> + overrides{}) and the Bookings view (js/bookings.js). Frontend-only, no backend/secrets.

### B21 · status: done (cb5e914) · pillar: bookings
**Manual quick-add booking.** A form in the Bookings view to add a reservation by hand (type
flight/hotel/train/bus/car/activity/other, title, provider, start datetime, optional end, confirmation #,
price+currency, pax, location), saved to the `bookings` overlay `manual[]` so it shows in the timeline
like an imported one. Accept: adding a hotel for the Alpine trip persists, appears in the bookings list
and on its day, and survives reload.

### B22 · status: done (f06ba5c) · pillar: bookings
**"Still to book" coverage gaps.** Auto-detect what's missing: nights with no accommodation booking,
and moves between consecutive places/cities with no transport booking. Render a clear "Still to book"
checklist grouped by date with what's missing. Accept: on the seeded data it lists uncovered nights /
missing transport legs; a fully-covered stretch shows nothing (no false positives).

### B23 · status: done (3041b71) · pillar: bookings
**Booking timeline view.** A dedicated chronological timeline of all of a trip's bookings grouped by
day, with type icon, time, provider, confirmation #, and price — visually flagging overlaps and gaps.
Accept: the Alpine bookings render in time order grouped by day; an overlap is visibly flagged.

### B24 · status: done (568f4b2) · pillar: bookings
**Accommodation coverage strip.** A per-night strip across the trip dates showing which nights are
covered by a hotel/stay booking and which are uncovered (tap an uncovered night → quick-add). Accept:
nights with a hotel show covered, nights without show a clear gap, for the seeded trip.

### B25 · status: done (e1ae08d) · pillar: bookings
**Booking action reminders.** Surface time-sensitive booking actions: online check-in window (flights),
free-cancellation deadline, and hotel check-in/out times — a "Needs attention" list sorted by urgency.
Accept: a flight/hotel with the relevant fields produces a correctly-sorted reminder; nothing spurious.

### B26 · status: done (baf738f) · pillar: bookings
**Booking cost rollup vs budget.** Total committed reservation spend broken down by type (flights,
stays, transport, activities) in the trip currency (FX-converted), shown against the trip budget so
you see how much of the trip is already paid/committed. Accept: the rollup sums the seeded bookings by
type with a correct grand total; integrates with the existing budget figures.

### B27 · status: done (75e8e3d) · pillar: bookings
**Transport continuity check.** Verify the chain of transport bookings makes sense: each leg's arrival
location should be where the next leg departs, no impossible same-time jumps, and a flagged "no return"
when an outbound has no matching return. Accept: a deliberately broken chain flags; a clean chain passes.

### B28 · status: done (dec79aa) · pillar: bookings
**Booking detail drawer.** Tap any booking to expand a detail view: all fields, confirmation # with a
one-tap Copy, any attachment link, a map link for the location, and add-to-calendar for that single
booking. Accept: opening an Alpine booking shows its full details and the Copy/map/calendar actions work.

## Batch 2 — P1 (on-trip, mobile & live)

### B12 · status: done (64516b2) · pillar: mobile/live
**Packing list generator.** From the trip length + the day weather forecasts (weather.js) + activity
types in the plan, generate a suggested packing checklist into the Checklists view (one tap to add).
Accept: a "Suggest packing list" action adds weather-appropriate items for the Alpine trip (e.g. rain
layer if rain forecast, warm layer for alpine temps); items land in the existing checklist overlay.

### B16 · status: done (b5b0189) · pillar: mobile/live
**Next-up countdown on the Today view.** Show a live countdown to the next timed stop and the next
upcoming booking ("Next: Funicular in 1h 20m"). Updates each minute. Accept: on the current Alpine
day the Today view shows a correct countdown to the next stop/booking; degrades gracefully if none left.

### B18 · status: done (b58f0fd) · pillar: offline
**Offline trip search.** A search box that instantly filters across the open trip's places, notes and
bookings, working with no network (operates on already-loaded data). Accept: typing a query filters
matches live with zero network calls; clearing restores the full view.

## Batch 2 — P2 (logistics, money, discovery)

### B13 · status: done (99310dd) · pillar: logistics
**Optimize day order.** Per day, a button that reorders that day's stops nearest-first using the
existing `optimizeRouteOrder` in core.js, with a preview of the time saved and an undo. Accept:
clicking reorders a day to reduce total travel distance; the change is undoable and persists via the
itinerary overlay.

### B15 · status: done (0bd7adc) · pillar: money
**Quick currency converter.** A small converter in the Budget view using fx.js live rates — type an
amount in the trip currency, see it in your home currency (and vice-versa). Accept: converts both
directions with the live rate; works offline using the last cached rate.

### B19 · status: done (b31f421) · pillar: discovery/live
**Weather-aware re-plan nudge.** If a day with mostly outdoor stops has rain in the forecast, show a
gentle banner suggesting indoor alternatives (reuse the B07 nearby-discovery indoor categories).
Accept: a rainy outdoor Alpine day shows the nudge; a clear day does not; no false positives on clean data.

## Batch 2 — P3 (essentials & polish)

### B14 · status: done (b0f1bbe) · pillar: offline
**Country essentials card.** Per trip, an offline card with the emergency number, currency, power
plug type and a few language basics for the destination country. Accept: the Alpine (Italy) trip
shows emergency 112, EUR, plug type C/F; renders offline; data is static (no API).
New "Essentials" view tab; countryEssentials() static table in core.js keyed by trip.country (IT/IS).

### B17 · status: todo · pillar: bookings
**Calendar export (.ics).** Export a trip's bookings + timed stops to a downloadable `.ics` file so
the plan drops into any calendar app. Accept: a download produces a valid VCALENDAR with one VEVENT
per booking/timed stop; opens in a calendar app without errors.

### B20 · status: todo · pillar: polish
**Trip overview timeline.** A compact at-a-glance overview: each day as a row with its date, headline
stop and any key booking, so the whole trip is visible without scrolling day cards. Accept: renders
all Alpine days with date + first place + booking marker; tapping a day jumps to it.
