# Booking pipeline

Daily Gmail → `data/bookings.json` import via headless Claude + gmail-multi MCP.

**Enable:**
```sh
chmod +x pipeline/sync-bookings.sh
cp pipeline/com.user.trip-bookings.plist ~/Library/LaunchAgents/
launchctl load ~/Library/LaunchAgents/com.user.trip-bookings.plist
```

**Test once:** `zsh pipeline/sync-bookings.sh` then check `pipeline/sync.log`.

Forward any booking email to wchongyu2001@gmail.com and it's picked up on the
next run. Bookings outside every trip's dates land in the dashboard's
"Unassigned" inbox for manual filing.

# Apps Script backend (live edits sync)

Itinerary edits / expenses / checklists / bucket sync through the Google Apps
Script in `apps-script/Code.gs`:

1. Open the existing bucket-list Apps Script project (the Sheet it's bound to).
2. Replace the code with `Code.gs`; paste your Telegram token/chat id at the top.
3. Deploy → Manage deployments → Edit → New version (keeps the same /exec URL).

Until redeployed, edits still work — they save to localStorage per device and
queue for the Sheet.

# Place enrichment (optional — real Google ratings/photos/hours)

Itinerary place cards show a live `★ rating · category · hours` line and a Google
photo when the trips-sync backend (`server/app.py`) has a Places key. Without it,
cards fall back to Wikipedia photos + a "Reviews ↗" link — the app works either way.

To enable on the VPS:
1. In Google Cloud, enable **Places API** (classic) + **billing** (personal use sits
   in the free monthly credit). Create an API key; restrict it to the Places API.
2. Set the key as an env var for the `trips-sync` service:
   `PLACES_KEY=...` in the systemd unit (`server/trips-sync.service`) or its
   EnvironmentFile, then `systemctl restart trips-sync`.
3. The client (`js/places.js`) calls `…/trips-sync/place` and caches results 30 days.

The key lives only on the server — never in this public repo.
