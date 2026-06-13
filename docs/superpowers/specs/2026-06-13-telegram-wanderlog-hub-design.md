# Three-way hub: Dashboard ⇄ trips-sync ⇄ Telegram, + Wanderlog import — Design

**Date:** 2026-06-13 · **Status:** approved, ready for plan
**Repo:** `~/claude/alpine-loop-guide` · **Backend:** `server/app.py` (FastAPI `trips-sync` on the Hetzner VPS, nginx TLS at `https://markets-dashboard.duckdns.org/trips-sync/`)

## Goal

Make the VPS the hub of a three-way connection: a **two-way Telegram bot** (capture + briefings) and **Wanderlog public share-link import**, both writing into the same overlay store the dashboard already reads.

## Approved decisions

| Decision | Choice |
|---|---|
| Telegram | Two-way hub: inbound capture/query + outbound daily briefing |
| Wanderlog | Read-only import from a **public share URL** (no write-back; no API) |
| Briefing time | 08:00 in the active trip's local timezone |
| `/add` fallback | Unrecognized text files to the **current/next trip** (no prompt) |
| Secrets | `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`, `TG_WEBHOOK_SECRET`, `PLACES_KEY` live only in VPS env — never the repo |

## Architecture

```
Wanderlog ──parse share-link──▶ trips-sync (server/app.py) ──overlays──▶ Dashboard
                                    ▲     │ reads data/*.json + overlays
                          webhook   │     ▼ to compose briefings
                          Telegram ◀─bot──  outbound alerts (systemd timer)
```

All new logic is in `server/app.py` (same process) plus a systemd timer unit. The
dashboard gets one small "Import from Wanderlog" input. The bot reads trip base
data from the dashboard mirror clone (`TRIPS_APP_DIR`, default `/opt/trips/app`)
and overlays from `OVERLAYS` (`/opt/trips-sync/overlays`); it writes overlays via
the existing `ov_path(trip, kind)` so the dashboard picks them up on next sync.

## Components

### A. Telegram send + webhook (server/app.py)
- `tg_send(text, chat_id=None)` — POST to `api.telegram.org/bot<TOKEN>/sendMessage`
  (Markdown), default chat = `TELEGRAM_CHAT_ID`. No-op when token unset.
- `POST /tg/webhook` — verifies header `X-Telegram-Bot-Api-Secret-Token ==
  TG_WEBHOOK_SECRET`; parses `update.message.text`; dispatches:
  - `/start` → reply with the chat id (so the user can copy it into env) + help.
  - `/help` → command list.
  - `/today`, `/next` → `tg_send(compose_brief(...))`.
  - `/wl <url>` → run import, reply with the summary.
  - `/add <text>` or any plain/forwarded text → `capture(text)` (see C), reply ✓.
  Always returns `{"ok": true}` fast (Telegram retries on non-200).

### B. Daily briefing (outbound)
- `GET /tg/brief?key=<TG_WEBHOOK_SECRET>` → compose + send to `TELEGRAM_CHAT_ID`.
- `server/trips-tg-brief.timer` + `.service` (committed) call it at 08:00 trip-local
  (timer in UTC with the trip tz noted; v1 uses a fixed 06:00 UTC ≈ 08:00 CEST and
  documents how to adjust). Guard: the `key` must equal the secret.
- `compose_brief(trips, active_trip, overlay_itin, bookings, today)` (pure, tested):
  picks the trip containing `today` else the next upcoming; emits day header +
  weather (open-meteo, fetched in the endpoint, passed in for testability) + today's
  stops with times + per-leg distance (haversine in Python) + next-booking countdown.
  Pre-trip days emit "Pre-exchange starts in N days · next: EK353 in N days".

### C. Capture (inbound → dashboard overlays)
`capture(text, trips, bookings)` (pure mapping, tested) classifies text:
- `idea: <x>` / `bucket: <x>` → append to the **`bucket`** overlay (shape ideas.js
  expects — confirmed at build time).
- looks like a booking (matches `parse_email_stub` Python port: flight/hotel/etc. +
  a date/confirmation) → a booking object appended to **`bookings`** overlay
  `manual[]`, trip via `assign_trip(trips, start)`.
- otherwise → a note appended to the bucket overlay tagged `source:"telegram"`, on
  the current/next trip.
Returns `{kind, trip, summary}`; the webhook handler persists via `ov_path` (merge
existing payload, dedup, write) and replies with `summary`.

> `parse_email_stub` + `assign_trip` are re-implemented minimally in Python
> (mirroring `js/core.js`); both get Python unit tests against the same cases.

### D. Wanderlog import
- `extract_trip(html)` (pure, tested): pulls the embedded JSON from the public trip
  page — try `<script id="__NEXT_DATA__" type="application/json">…</script>` first,
  then `__APOLLO_STATE__`/`__INITIAL_STATE__` assignments — then **recursively walks**
  the object collecting place-shaped nodes (a name + lat/lng) and reservation-shaped
  nodes (a type + start date). Robust to schema drift; returns `{places[], reservations[]}`.
  On no-parse → returns empty + the caller reports a clear failure (no half-import).
- `POST /wl-import {url, trip}` (also via bot `/wl`): fetch URL server-side →
  `extract_trip` → map **places → `bucket` overlay** (dedup by name) and
  **reservations → `bookings` overlay `manual[]`** (dedup by confirmation or
  title+date) → write overlays → return `{ok, places, reservations}` and `tg_send`
  the summary. Places go to the bucket (not auto-slotted into days) — YAGNI; the
  user drags them onto days in the dashboard.

### E. Dashboard touch (minimal)
- Bookings page: a `Import from Wanderlog` bar next to the Gmail-fetch bar — a URL
  input + button → `POST {BASE}/wl-import` with the current trip → shows the result.
- A short Telegram-setup `<details>` blurb (create bot, env vars, webhook).
- JS pure helper `wlShareValid(url)` (in core.js, tested) gates the input.
- Covered by render smoke (degraded: fetch fails → button shows an error, no crash).

## Setup actions (user, one-time — documented in `server/README.md`)
1. @BotFather → create bot, copy token. `/start` the bot → it replies your chat id.
2. VPS env (systemd unit / EnvironmentFile): `TELEGRAM_TOKEN`, `TELEGRAM_CHAT_ID`,
   `TG_WEBHOOK_SECRET` (any random string). `systemctl restart trips-sync`.
3. Register webhook once:
   `curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://markets-dashboard.duckdns.org/trips-sync/tg/webhook&secret_token=<SECRET>"`.
4. Enable the briefing timer: `systemctl enable --now trips-tg-brief.timer`.
- App works without any of this; only the bot/briefing are gated on it.

## Testing
- JS: `wlShareValid` assertions in `tools/test-core.mjs`; render smoke for the import bar.
- Python: `server/test_server.py` (plain asserts, run `python3 server/test_server.py`,
  no pytest dep) covering `extract_trip` (against a saved sample payload fixture),
  `compose_brief`, `capture`, `parse_email_stub`, `assign_trip`.
- `python3 -m py_compile server/app.py`; `for f in js/*.js; do node --check; done`.

## Risks / honest constraints
- **Wanderlog parser is best-effort** — depends on the page being public and its
  payload shape. Recursive shape-matching reduces brittleness; on failure it reports
  cleanly and imports nothing. MCP-reauth is the documented fallback.
- **No write-back to Wanderlog** (no API) — import only.
- **No live Telegram test without the bot token** — pure functions are unit-tested;
  the round-trip is user-verified post-setup.
- **Deploy is a VPS infra step** (env + webhook + timer + service restart), like `PLACES_KEY`.
- Public repo: zero secrets committed; bot/brief endpoints guarded by the secret token.
