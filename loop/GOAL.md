# GOAL — Overnight Trip-Planner Build Loop

## North-star
Make the **Travel Companion** the single tool a real traveler trusts.
Priority 1: the **Alpine trip (starts 2026-06-15)** must be bulletproof in the field —
works offline, bookings/itinerary always render, fast on a phone.
Priority 2: broader trip-planner power across all four pain pillars below.

## The four pain pillars (what every feature should serve)
1. **Bookings = single source of truth** — every confirmation in one reliable timeline; flag gaps/conflicts.
2. **Day logistics, timing & discovery** — realistic "can I make it?" scheduling; smart nearby eat/do suggestions.
3. **Money & splitting** — effortless expense entry, multi-currency, who-owes-who settle-up, budget vs actual.
4. **Offline, mobile & live re-plan** — no-signal resilience, fast mobile today-view, re-plan on delays/weather.

## Green gate (ALL must hold before merging to main)
- `node tools/test-core.mjs` exits 0.
- If anything under `server/` changed: `cd server && .venv/bin/python -m pytest -q` exits 0.
- Every changed `js/*.js` passes `node --check`.
- Every changed `data/*.json` parses as valid JSON.
- Working tree is clean except the intended change; no secrets/.env touched; no trip data destroyed.
- The change visibly serves the picked backlog item (no scope creep).

## Deploy rules
- Merging to `main` + push auto-deploys the **static frontend** (GitHub Pages + VPS git-pull). Safe.
- The **FastAPI backend** at `/opt/trips-sync` is NOT git-deployed. If you change `server/`, you may
  test + merge, but mark the item `deployed: needs-manual-vps` in the report. NEVER ssh-restart the
  live service from inside an iteration.

## Hard rules
- ONE backlog item per iteration. Smallest correct change (see global CLAUDE.md).
- Match existing patterns (vanilla ES modules, no build step, no new deps unless trivial & justified).
- Fail-soft: if blocked, abandon the branch cleanly and mark the item blocked. Never leave main broken.
- Never edit: `.env*`, anything under `server/.venv`, `data/trips.json`/`data/*.json` trip content
  destructively (additive/computed-only is fine), git history.
- Active only until the deadline in `run-build-loop.sh`. Do not schedule anything past the trip.
