# Inbound-email booking capture — setup & status

Forward a confirmation email → an inbound-parse service → `POST /trips-sync/inbound`
→ Claude (or heuristic fallback) parses it → booking lands in the per-trip bookings
overlay → dashboard shows it. Built 2026-06-13.

## Deployed status (2026-06-13)
- `/inbound` is **live** on the VPS (`root@46.62.169.80`, manual-sync dir `/opt/trips-sync`,
  service `trips-sync`, uvicorn `app:app` :8090, nginx TLS at
  `https://markets-dashboard.duckdns.org/trips-sync/`). Verified: `/health` ok,
  `/inbound?key=wrong` → 401, end-to-end POST writes the overlay + dedupes on re-send.
- Files on box: `app.py` (97-line original + a 3-line `include_router(inbound.router)` append),
  `triphub.py`, `mailparse.py`, `inbound.py`. Backup of the pre-change app.py:
  `/opt/trips-sync/app.py.bak.<ts>`.
- `.env` keys added: `INBOUND_SECRET`, `INBOUND_ALLOW=wchongyu2001@gmail.com,businessinfo0225@gmail.com`,
  `TRIPS_JSON=/opt/trips/app/data/trips.json`.
- **`ANTHROPIC_API_KEY` is NOT set** → parsing currently uses the heuristic fallback
  (type/title/date/confirmation only). Add the key for Wanderlog-grade fields + PDF reading.

## Remaining setup (you)

### 1. Inbound-parse service (gives the forwarding address)
Pick Postmark or Mailgun (the `/inbound` adapter handles both payload shapes):
- **Postmark:** create a server → Default Inbound Stream → set **Inbound Webhook URL** to
  `https://markets-dashboard.duckdns.org/trips-sync/inbound?key=<INBOUND_SECRET>`
  Use the generated `…@inbound.postmarkapp.com` address.
- **Mailgun:** add a Route `match_recipient(".*@<your-sandbox-or-domain>")` →
  `forward("https://markets-dashboard.duckdns.org/trips-sync/inbound?key=<INBOUND_SECRET>")`.
The secret lives in `/opt/trips-sync/.env` (`grep INBOUND_SECRET`). Keep it out of the repo.

### 2. (Recommended) richer parsing
On the box: add `ANTHROPIC_API_KEY=sk-ant-...` to `/opt/trips-sync/.env`, then
`systemctl restart trips-sync`. Model defaults to `claude-haiku-4-5-20251001`
(override with `INBOUND_MODEL`). Until then the heuristic fallback runs.

### 3. Gmail auto-forward (so you rarely forward by hand)
Gmail → Settings → **Forwarding** → add the inbound address (confirm the verification
code the service receives — check its inbound dashboard). Then **Filters → Create**:
matches `subject:(booking OR confirmation OR reservation OR itinerary OR "e-ticket")`
→ action **Forward to** the inbound address. Manual forwarding works too. Re-forwards
dedupe server-side by confirmation # / message id.

### 4. Frontend address label (optional)
Set `INBOUND_ADDR` near the top of `js/bookings.js` to the service address so the
Bookings intro shows where to forward. Commit + push.

## Allowlist / security
Only emails whose sender is in `INBOUND_ALLOW` are accepted (others → 200, ignored).
The `?key=` secret gates the endpoint. Real confirmations live only in the VPS overlay
store + files dir — never the public repo.

## Redeploying after code changes
`scp server/{app.py-append,triphub.py,mailparse.py,inbound.py} root@46.62.169.80:/opt/trips-sync/`
(do NOT overwrite the box `app.py` with the repo's 368-line hub version — the box runs
the original 97-line app.py + the inbound append; the parallel session's hub is not
deployed). Then `systemctl restart trips-sync` and re-check `/health`.
