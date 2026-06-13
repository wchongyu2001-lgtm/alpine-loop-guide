Al l# Handoff — Trips dashboard goes self-hosted on Hetzner (24/7)

**Date:** 2026-06-13 · **Status:** shipped + verified. One user action remains (Gmail app password). This session moved the dashboard's backend off Google Apps Script onto the user's own Hetzner box so it runs 24/7 with cross-device edit sync, a backup mirror, nightly backups, and an auto-importer for booking emails.

## TL;DR of what changed this session

| Piece | What it does | State |
|---|---|---|
| **Sync backend** | Your edits (itinerary/expenses/checklists/bucket/bookings) save to the VPS and follow you to any device | ✅ live + verified |
| **VPS mirror** | Whole dashboard also served from the box (fallback if GitHub Pages is down) | ✅ live + verified |
| **Nightly backup** | Snapshots your edit data daily, keeps 14 days | ✅ live + verified |
| **Bookings importer** | Reads booking emails 24/7 and adds them to the dashboard | ⏳ built + scheduled; **needs your Gmail app password** |

Commits on `origin/main`: `eafc7cc` (sync backend + mirror), `39cde8f` (bookings importer). Nightly backup is box-only (not in repo).

## The box

- Host `root@46.62.169.80`, SSH key `~/.ssh/hetzner_budget_bot` (Ubuntu 24.04). Also runs The Desk, markets, worker-intake — **all left untouched** (nginx edited with backup + `nginx -t` gate; verified intact).
- **Sync backend:** FastAPI `server/app.py` → systemd `trips-sync` on `127.0.0.1:8090` → nginx TLS at `https://markets-dashboard.duckdns.org/trips-sync/`. Data in `/opt/trips-sync/overlays` (edits) + `/opt/trips-sync/files` (attachments). Token in `/opt/trips-sync/.env`; CORS allow-list = GitHub Pages + markets domain.
- **Mirror:** nginx `/trips/` → `/opt/trips/app` (repo clone, `*/10` git-pull cron). URL `https://markets-dashboard.duckdns.org/trips/`.
- **Backup:** `/opt/trips-sync/backup.sh` (cron 03:15) → `/opt/trips-sync/backups/trips-*.tgz`, keeps 14. Restore verified byte-identical.
- **Importer:** `pipeline/vps/import.py` (stdlib only) → systemd `trips-import.timer` (daily 09:30 UTC, Persistent). Reads Gmail over IMAP (X-GM-RAW search), parses with a Python port of `core.js parseEmailStub` (parity test `pipeline/vps/test_parse.py`, 9/9), assigns trip, writes new bookings to trips-sync as per-trip `bookings` overlay `{manual:[]}`. No git push, no API key, no MCP. Config `/opt/trips-pipeline/.env` (reuses the trips-sync token). **No-ops cleanly** until `GMAIL_APP_PASSWORD` is set.

## Your two URLs

- Primary: https://wchongyu2001-lgtm.github.io/alpine-loop-guide/
- VPS mirror: https://markets-dashboard.duckdns.org/trips/

Edits sync between both (same backend).

## ⏳ THE ONE OPEN STEP (yours) — turn on the bookings importer

The importer is built and scheduled; it just needs read-access to your inbox via a **Gmail app password** (not your real password — a revocable 16-char code). **Do NOT paste it into the chat** — set it on the box yourself:

1. Enable 2-Step Verification: https://myaccount.google.com/security
2. Create an app password named "trips pipeline": https://myaccount.google.com/apppasswords → copy the 16-char code.
3. In a Mac Terminal: `ssh -i ~/.ssh/hetzner_budget_bot root@46.62.169.80`
4. Paste (it prompts hidden for the code):
   ```sh
   read -s -p "App password: " PW && PW=$(echo "$PW" | tr -d ' ') && sed -i "s/^GMAIL_APP_PASSWORD=.*/GMAIL_APP_PASSWORD=$PW/" /opt/trips-pipeline/.env && unset PW && echo "✓ saved"
   ```
5. Test now: `systemctl start trips-import.service && journalctl -u trips-import.service -n 20 --no-pager`
   - Good: `search since …: N candidate messages` → `imported N new booking(s)`.
   - Auth error → re-do step 4. Then `exit`.

After that it runs daily on its own. Revoke the app password anytime at the same Google page — no effect on your real password.

## Operate / debug (SSH'd into the box)

```sh
systemctl status trips-sync trips-import.timer        # health
journalctl -u trips-sync -n 50 --no-pager             # sync backend logs
journalctl -u trips-import.service -n 30 --no-pager   # last import run
curl -s http://127.0.0.1:8090/health                  # backend up?
ls -la /opt/trips-sync/overlays /opt/trips-sync/backups
```

If you change `server/app.py`: `scp` it to `/opt/trips-sync/`, then `systemctl restart trips-sync`. If you change the mirror: it pulls itself every 10 min, or `cd /opt/trips/app && git pull`.

## Known notes / risks

- **Token is in the public client** (`js/sync.js`) — soft guard only; real protection is the CORS allow-list + your accepted-public-data choice. Fine for a personal app; not real per-user auth.
- **Parser skips emails with no detectable date** (deliberate — better than writing garbage). Add those manually.
- **Single box** = single point of failure; nightly backup mitigates data loss but not downtime.
- **Parallel sessions are actively building in this repo** (Telegram hub, inbound-email webhook capture, Wanderlog import, Google Places enrichment). Those have their OWN pending user-actions (Telegram token, `ANTHROPIC_API_KEY`/`PLACES_KEY` on the box, Postmark inbound) tracked in `~/.claude/.../memory/trips-v2-dashboard.md` and `server/README.md` / `server/INBOUND_SETUP.md` — **not part of this handoff.** `/opt/trips-sync` is manual-sync (not git) per that work; coordinate before redeploying `app.py`.

## Where things live (repo)

`server/app.py` (sync backend) · `pipeline/vps/import.py` + `test_parse.py` (importer) · `js/sync.js` (client transport) · specs in `docs/superpowers/specs/2026-06-13-*`.
