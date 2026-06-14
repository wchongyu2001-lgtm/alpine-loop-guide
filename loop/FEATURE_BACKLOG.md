# Feature backlog — post-plan app build-out (owner-requested 2026-06-14)

The trip plan is complete (see TRIP_LOOP_LOG.md `DONE`). These are NEW app features to help
plan + execute the Alpine campervan trip. Same loop rules: discover by using the live app,
build vanilla + frontend-only, green-gate before every push to main, record each in
data/shipped.json, fail-soft. Server-dependent parts → DEFERRED.md.

Status keys: todo | wip | done | blocked

---

## F1 · Drive-leg planner — status: done (commit 1cf6749)
Per-day driving summary + running total for the whole loop.
- Each day card / a dedicated strip shows: distance (km), drive time, est fuel cost
  (use the van consumption + fuelPerH already in meta; ~€1.90/L), and tolls/vignettes.
- Footer/rollup: total km, total fuel €, total tolls for the trip.
- Clearly flag drive=0 "van stays put" days.
- Data source: day.drive + leg distances (routing.js / OSRM already present) or authored
  per-day km. Don't add new deps. Acceptance: every day shows a drive line; total renders.

## F2 · Weather-smart lift-day optimizer — status: todo
Protect the expensive weather-dependent lift days (Jungfraujoch, Gornergrat, Seceda, Tre Cime).
- Near the trip, read the forecast (weather.js / Open-Meteo already present) for the lift-day
  location + altitude and flag a bad-weather day with a suggested swap to a clearer day.
- Extends the existing weather re-plan nudge (B19). Acceptance: a lift day with poor forecast
  shows a warning + swap suggestion in the Today/itinerary view.

## F3 · Booking countdown tracker — status: todo
Turn the flat "Bookings to make" checklist into deadline-driven cards.
- Each bookable item: "book by <date>", days-left countdown, booked/not status, sorted by
  sell-out risk (campsites > Jungfraujoch slot > rest).
- Reuse the bookings_to_make data + checklists. Acceptance: a countdown view/section renders
  with per-item deadlines and status; overdue/urgent highlighted.

## F4 · Offline road-pack + confirmation locker — status: todo
One-tap make-the-trip-work-with-no-signal.
- A "Download trip for offline" action that pre-caches maps tiles + all trip data via the
  service worker (sw.js already cache-first); plus a small locker to store each campsite/lift
  confirmation number per booking (attachments.js exists for bookings).
- Acceptance: button triggers a cache pass + reports done; confirmation numbers persist and
  show offline.

## F5 · Ideas 2.0 — capture inbox → assign to days — status: todo  (frontend part)
Upgrade the Ideas tab into a capture inbox you can plan from.
- Inbox of captured cards: each has a link (Instagram/TikTok/web), an optional thumbnail
  (OpenGraph/oEmbed best-effort; Instagram may block — fall back to the bare link + manual
  title/note), and a note.
- A "paste a link" box to add an idea manually, and register the app as a PWA **Web Share
  Target** (manifest + SW handler) so phone Share → "Travel Companion" drops a link into Ideas.
- Each idea card has "➕ add to Day N" that inserts it into that day's plan (and a way to
  remove from the inbox once placed).
- Acceptance: paste a link → it appears as an idea card → assign it to a day → it shows in
  that day. Share-target registered in manifest.
- DEFERRED (server): Telegram bot → ideas ingestion (forward a reel to the existing trip bot
  → it creates an idea via trips-sync). Logged to DEFERRED.md; built as a manual-VPS follow-up.

---
DONE-FEATURES when: F1-F5 frontend all status:done, green, live, recorded in shipped.json.
