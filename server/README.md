# trips-sync backend

FastAPI service behind nginx TLS at `https://markets-dashboard.duckdns.org/trips-sync/`.
Stores per-(trip,kind) overlay edits + booking attachments. Also backs the
**three-way hub**: the existing **budget_bot** (`~/claude/budget_bot`, Telegram bot
on Render) handles inbound `/trip` `/wl` `/place` commands by calling the endpoints
below; the daily briefing is pushed from here via the **same** bot token. Pure logic
lives in `triphub.py` (tested by `python3 server/test_server.py`); IO in `app.py`.

> Why no webhook here: a Telegram bot's incoming updates can only go to ONE
> consumer, and budget_bot already long-polls them. So trip commands live in
> budget_bot/bot.py and call this backend. Sending (the briefing) is not exclusive,
> so this service can push using the same `TELEGRAM_BOT_TOKEN`.

## Endpoints

| Route | Purpose |
|---|---|
| `GET /load`, `POST /save`, `POST /upload` | overlay sync + attachments (dashboard) |
| `GET /place`, `GET /placephoto` | Google Places enrichment proxy (needs `PLACES_KEY`) |
| `GET /trip-brief` | briefing text — budget_bot `/trip` calls this (X-Trips-Token) |
| `POST /capture {text}` | classify+store a place/idea/booking — budget_bot `/place` |
| `POST /wl-import {url,trip}` | import a public Wanderlog trip — budget_bot `/wl` + dashboard |
| `GET /tg/brief?key=…` | compose + push the daily briefing (timer hits this) |

## Environment (set in the systemd unit's EnvironmentFile, e.g. `/opt/trips-sync/.env`)

```
TRIPS_TOKEN=…            # soft write-guard (same value the dashboard + budget_bot send)
PLACES_KEY=…            # optional: Google Places enrichment
TELEGRAM_BOT_TOKEN=…    # the SAME budget_bot token (for the outbound briefing only)
TELEGRAM_CHAT_ID=…      # chat id to send the briefing to
TG_WEBHOOK_SECRET=…     # any random string; guards /tg/brief
TRIPS_APP_DIR=/opt/trips/app   # dashboard mirror clone (trip JSON source); default
```

Secrets live only here — never in the repo.

## One-time setup

**Inbound commands** (`/trip` `/wl` `/place`) are added in `~/claude/budget_bot`:
set `TRIPS_SYNC_BASE` (default ok) + `TRIPS_TOKEN` (match `TRIPS_TOKEN` here) in the
Render env, then redeploy budget_bot. Nothing to register with Telegram — the bot
already polls.

**Outbound daily briefing** (optional):
1. Put the budget_bot token in `TELEGRAM_BOT_TOKEN`, your chat id in
   `TELEGRAM_CHAT_ID`, a random `TG_WEBHOOK_SECRET`. `systemctl restart trips-sync`.
2. Enable the timer:
   ```
   cp server/trips-tg-brief.{service,timer} /etc/systemd/system/
   systemctl daemon-reload && systemctl enable --now trips-tg-brief.timer
   ```
   Adjust `OnCalendar` for the trip timezone (default 06:00 UTC ≈ 08:00 CEST).

Until configured, the endpoints refuse politely; the dashboard and sync are unaffected.

## Wanderlog import

`POST /wl-import` (or `/wl <url>` in Telegram) fetches a **public** Wanderlog trip
page, extracts its embedded JSON, and maps places → the trip's bucket list and
reservations → `bookings.manual`. Parsing is best-effort and recursive (resilient
to schema drift); if the page isn't public or the payload shape defeats it, it
imports nothing and says so. There is **no write-back to Wanderlog** (no API).
