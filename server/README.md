# trips-sync backend

FastAPI service behind nginx TLS at `https://markets-dashboard.duckdns.org/trips-sync/`.
Stores per-(trip,kind) overlay edits + booking attachments. Also hosts the
**three-way hub**: a Telegram bot (capture + daily briefings) and **Wanderlog
public share-link import**. Pure logic lives in `triphub.py` (tested by
`python3 server/test_server.py`); IO + endpoints in `app.py`.

## Endpoints

| Route | Purpose |
|---|---|
| `GET /load`, `POST /save`, `POST /upload` | overlay sync + attachments (dashboard) |
| `GET /place`, `GET /placephoto` | Google Places enrichment proxy (needs `PLACES_KEY`) |
| `POST /tg/webhook` | Telegram updates → `/today` `/next` `/add` `/wl` `/help` `/start` |
| `GET /tg/brief?key=…` | compose + push the daily briefing (timer hits this) |
| `POST /wl-import {url,trip}` | import a public Wanderlog trip into the dashboard |

## Environment (set in the systemd unit's EnvironmentFile, e.g. `/opt/trips-sync/.env`)

```
TRIPS_TOKEN=…            # existing soft write-guard
PLACES_KEY=…            # optional: Google Places enrichment
TELEGRAM_TOKEN=…        # from @BotFather
TELEGRAM_CHAT_ID=…      # your chat id (the bot replies it to /start)
TG_WEBHOOK_SECRET=…     # any random string; guards /tg/webhook + /tg/brief
TRIPS_APP_DIR=/opt/trips/app   # dashboard mirror clone (trip JSON source); this is the default
```

Secrets live only here — never in the repo.

## One-time Telegram setup

1. Create a bot with **@BotFather**, copy the token → `TELEGRAM_TOKEN`.
2. Pick a random `TG_WEBHOOK_SECRET`. `systemctl restart trips-sync`.
3. `/start` the bot in Telegram — it replies your chat id. Put it in
   `TELEGRAM_CHAT_ID`, `systemctl restart trips-sync` again.
4. Register the webhook (once):
   ```
   curl "https://api.telegram.org/bot<TOKEN>/setWebhook?url=https://markets-dashboard.duckdns.org/trips-sync/tg/webhook&secret_token=<TG_WEBHOOK_SECRET>"
   ```
5. Enable the morning briefing:
   ```
   cp server/trips-tg-brief.{service,timer} /etc/systemd/system/
   systemctl daemon-reload && systemctl enable --now trips-tg-brief.timer
   ```
   Adjust `OnCalendar` in the timer for the trip's timezone (default 06:00 UTC ≈ 08:00 CEST).

Until configured, the bot/briefing endpoints simply refuse politely; the dashboard
and sync are unaffected.

## Wanderlog import

`POST /wl-import` (or `/wl <url>` in Telegram) fetches a **public** Wanderlog trip
page, extracts its embedded JSON, and maps places → the trip's bucket list and
reservations → `bookings.manual`. Parsing is best-effort and recursive (resilient
to schema drift); if the page isn't public or the payload shape defeats it, it
imports nothing and says so. There is **no write-back to Wanderlog** (no API).
