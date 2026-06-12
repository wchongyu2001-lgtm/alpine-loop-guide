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
