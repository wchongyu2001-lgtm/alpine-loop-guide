# Trips v2 — Wanderlog-style travel dashboard

**Date:** 2026-06-12 · **Status:** approved (user: "build it")
**Replaces:** single-file v1 guide (preserved at `legacy/v1.html`)

## Goal

Rebuild the alpine-loop-guide GitHub Pages site as a personal Wanderlog clone:
trip-based dashboard with bookings imported from Gmail, editable day-by-day
itinerary, map views with Google/Apple Maps deep links, budget with expense
splitting, checklists, and ideas — covering Wanderlog's feature surface.

## Decisions (user-confirmed)

| Decision | Choice |
|---|---|
| Email intake | Mac pipeline (launchd, headless Claude + gmail-multi MCP) → `data/bookings.json` → git push |
| Rebuild scope | Fresh multi-file rebuild in same repo; v1 archived |
| Features | Bookings, itinerary builder, maps, budget + splitting, checklists, recommendations (+ route stats/optimize, flight-status links) |
| Privacy | Public repo, accepted risk (full booking details published) |
| Gmail source | wchongyu2001@gmail.com only (forward other bookings there) |
| Edit storage | Existing Google Apps Script + Sheet, extended (per-trip, per-kind); localStorage queue fallback |
| Stack | Vanilla ES modules, no build step; Leaflet; SortableJS via CDN |

## Architecture

Three parts:

1. **Static dashboard** (GitHub Pages). `index.html` shell; `js/` one module per
   feature (`app`, `data`, `sync`, `itinerary`, `bookings`, `map`, `budget`,
   `checklists`, `ideas`, `geo`); `css/app.css` (v1 editorial palette);
   `data/` JSON (trips registry + one file per trip + bookings + taxonomy).
2. **Mac pipeline** (`pipeline/`). Daily launchd job runs headless Claude:
   search Gmail for booking confirmations since last run (incl. self-forwarded),
   parse to booking records, assign to trip by date (smallest date-range trip
   containing booking start; no match → `unassigned`), merge into
   `data/bookings.json`, commit, push. State file holds last-sync timestamp.
3. **Apps Script backend** (`apps-script/Code.gs`, user deploys over existing
   `/exec`). Sheet tabs per kind: `bucket` (existing), `itinerary`, `expenses`,
   `checklists`. GET `?trip=&kind=`, POST `{trip, kind, payload}`.
   Last-write-wins. Telegram pings kept for bucket saves.

**Data model:** repo JSON = read-only base (trip skeleton + pipeline bookings);
Sheet = edits overlay (itinerary mods, manual expenses, checklist state);
browser merges at load. Offline/unreachable → localStorage cache + retry queue.

## Booking record

```json
{ "id": "gmail-msgid-or-hash", "trip": "alpine|iceland|preexchange|unassigned",
  "type": "flight|hotel|train|bus|car|activity|other",
  "title": "EK 353 SIN→DXB", "provider": "Emirates",
  "start": "2026-07-24T00:50", "end": "2026-07-24T04:05",
  "location": {"name": "...", "lat": 0, "lng": 0},
  "price": {"amount": 0, "currency": "EUR"},
  "confirmation": "NP7QJQ", "pax": ["..."], "gmail_link": "https://mail.google.com/...",
  "source": "pipeline|manual|wanderlog-seed" }
```

Seed: current Wanderlog trips (Pre-exchange flights/hotels/transit, Alpine
camping, Iceland flights) imported via MCP at build time.

## Features (per trip; switcher on top)

- **Bookings:** date-grouped timeline; type icon, provider, dates, price,
  confirmation, Gmail link, flight-status link (Google "<flight> status").
  Auto-shown on itinerary days; auto-feed budget. Unassigned inbox with
  manual trip assignment.
- **Itinerary:** editable days; drag-drop reorder (SortableJS); add place via
  Nominatim search; times + notes per place; per-day drive time/distance
  (haversine × road factor) and "optimize order" (nearest-neighbor).
- **Map:** Leaflet; views: whole trip / single day / category filter; markers
  numbered in day order; per-day route polyline; popup deep links to Google
  Maps and Apple Maps.
- **Budget:** totals per trip/day/category; bookings auto-imported; manual
  expenses; split tracking (payer, equal/custom split, running balance for
  2 travellers); keeps v1 budget/splurge presets + CHF/EUR display.
- **Checklists:** per-trip packing/to-do with templates; synced. Seeded from
  Wanderlog "Before departure" checklist.
- **Ideas:** v1 Ideas tab + shared bucket list (Apps Script sync + Telegram)
  carried over; per-day nearby suggestions via Wikipedia/Overpass (v1 code).

## Trips at launch

`preexchange` (Jul 24–Aug 20, Italy cities), `alpine` (Aug 1–17),
`iceland` (Aug 20–29). v1 had two; Pre-exchange added because its bookings
exist now in Wanderlog and don't fit the other two.

## Error handling

- Pipeline: per-email parse failure → skip + log, never corrupt bookings.json.
- Dashboard: shows last-pipeline-sync time, flags staleness > 48h.
- Sync: failed POSTs queue in localStorage and retry on next load/save.

## Verification

- Trip-assignment + merge logic in pure functions with node test
  (`tools/test-merge.mjs`).
- Pipeline prompt tested against sample email fixtures before enabling launchd.
- Manual check at 390px and desktop before push.
