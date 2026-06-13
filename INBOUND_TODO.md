# TODO — turn on inbound-email capture

The forward-to-address email→booking feature is **built and live** on the VPS, but runs
in heuristic-parse mode and has no forwarding address yet. These are the steps left to
fully enable it. Details + commands: `server/INBOUND_SETUP.md`. Handoff: `/tmp/inbound-email-handoff.md`.

- [ ] **1. Inbound-parse service.** Sign up for Postmark or Mailgun (free inbound), point its
      webhook at `https://markets-dashboard.duckdns.org/trips-sync/inbound?key=<INBOUND_SECRET>`
      (secret is in `/opt/trips-sync/.env`, not the repo). Note the address it gives you.
- [ ] **2. Claude parsing.** Add `ANTHROPIC_API_KEY=sk-ant-…` to `/opt/trips-sync/.env`,
      then `systemctl restart trips-sync`. (Until then: heuristic fallback — works, captures less.)
- [ ] **3. Gmail auto-forward.** Gmail → Filters → forward `subject:(booking OR confirmation OR
      reservation OR itinerary OR "e-ticket")` to the inbound address (verify the code first).
- [ ] **4. Frontend label (deferred ~1-line).** Set `INBOUND_ADDR` in `js/bookings.js` to the
      address and delete the stale "redeploy Apps Script" `bkhelp` block. Do after `bookings.js`
      settles (parallel session is editing it). Claude can do this on request once you have the address.

_Verify it's live anytime:_ `curl -s -o /dev/null -w "%{http_code}" -X POST "https://markets-dashboard.duckdns.org/trips-sync/inbound?key=wrong" -d '{}'` → `401`.
