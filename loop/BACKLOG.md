# BACKLOG — pick the topmost item whose status is `todo`

Format per item. Statuses: `todo` → `done` (merged) | `blocked: <reason>` | `wip` (claimed this run).
When you finish, set the status line and add a one-line result. Keep priority order; do not reorder done items.
If you think of a valuable new item mid-run, append it to the bottom as `todo`.

> **Batch 1 (B01–B11): all shipped & verified** — offline PWA, offline tiles+weather, Today view,
> booking gap/conflict detector, unassigned triage, "can I make it?" timing, nearby discovery,
> faster expenses + budget-vs-actual, forward-to address, print/share, Today progress (now/next).
> See `data/shipped.json` for details. Below is Batch 2.

---

## Batch 2 — P1 (on-trip, mobile & live)

### B12 · status: done (64516b2) · pillar: mobile/live
**Packing list generator.** From the trip length + the day weather forecasts (weather.js) + activity
types in the plan, generate a suggested packing checklist into the Checklists view (one tap to add).
Accept: a "Suggest packing list" action adds weather-appropriate items for the Alpine trip (e.g. rain
layer if rain forecast, warm layer for alpine temps); items land in the existing checklist overlay.

### B16 · status: wip · pillar: mobile/live
**Next-up countdown on the Today view.** Show a live countdown to the next timed stop and the next
upcoming booking ("Next: Funicular in 1h 20m"). Updates each minute. Accept: on the current Alpine
day the Today view shows a correct countdown to the next stop/booking; degrades gracefully if none left.

### B18 · status: todo · pillar: offline
**Offline trip search.** A search box that instantly filters across the open trip's places, notes and
bookings, working with no network (operates on already-loaded data). Accept: typing a query filters
matches live with zero network calls; clearing restores the full view.

## Batch 2 — P2 (logistics, money, discovery)

### B13 · status: todo · pillar: logistics
**Optimize day order.** Per day, a button that reorders that day's stops nearest-first using the
existing `optimizeRouteOrder` in core.js, with a preview of the time saved and an undo. Accept:
clicking reorders a day to reduce total travel distance; the change is undoable and persists via the
itinerary overlay.

### B15 · status: todo · pillar: money
**Quick currency converter.** A small converter in the Budget view using fx.js live rates — type an
amount in the trip currency, see it in your home currency (and vice-versa). Accept: converts both
directions with the live rate; works offline using the last cached rate.

### B19 · status: todo · pillar: discovery/live
**Weather-aware re-plan nudge.** If a day with mostly outdoor stops has rain in the forecast, show a
gentle banner suggesting indoor alternatives (reuse the B07 nearby-discovery indoor categories).
Accept: a rainy outdoor Alpine day shows the nudge; a clear day does not; no false positives on clean data.

## Batch 2 — P3 (essentials & polish)

### B14 · status: todo · pillar: offline
**Country essentials card.** Per trip, an offline card with the emergency number, currency, power
plug type and a few language basics for the destination country. Accept: the Alpine (Italy) trip
shows emergency 112, EUR, plug type C/F; renders offline; data is static (no API).

### B17 · status: todo · pillar: bookings
**Calendar export (.ics).** Export a trip's bookings + timed stops to a downloadable `.ics` file so
the plan drops into any calendar app. Accept: a download produces a valid VCALENDAR with one VEVENT
per booking/timed stop; opens in a calendar app without errors.

### B20 · status: todo · pillar: polish
**Trip overview timeline.** A compact at-a-glance overview: each day as a row with its date, headline
stop and any key booking, so the whole trip is visible without scrolling day cards. Accept: renders
all Alpine days with date + first place + booking marker; tapping a day jumps to it.
