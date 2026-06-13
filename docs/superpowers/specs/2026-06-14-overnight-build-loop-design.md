# Overnight Trip-Planner Build Loop — Design

**Date:** 2026-06-14 · **Repo:** `alpine-loop-guide` (Travel Companion) · **Status:** approved, building

## Goal

A goal-driven autonomous loop that builds, tests, self-verifies, and (when green) auto-merges
+ deploys trip-planner features overnight, so the owner wakes to working, live features and a
report. North-star: **make the Travel Companion the single tool a real traveler trusts — the
Alpine trip (Jun 15) bulletproof first, then broader planner power.**

## Decisions (from brainstorming)

- **North-star:** all of it — harden Alpine + new planner features + finish safe roadmap items.
- **Pain pillars (all four):** bookings = single source of truth; day logistics/timing/discovery;
  money & splitting; offline / mobile / live re-plan.
- **Autonomy:** auto-merge + deploy **when green** (tests + verify pass), with auto-rollback.
- **Cadence:** self-paced overnight, one item per iteration, morning report + Telegram ping.
- **Driver:** A — launchd fires a headless `claude -p` every 10 min; `caffeinate` keeps the Mac
  awake; a lockfile prevents overlap (same pattern as the existing idea-loop).

## Hard guardrails

1. **Tonight only.** Active window: now → **2026-06-14 07:30** local. After the deadline the driver
   boots itself out of launchd and kills `caffeinate`. It will NOT run during the day or mid-trip.
   Re-arm manually after the trip.
2. **Frontend auto-deploys; backend does not.** `git push origin main` deploys only the static
   frontend (GitHub Pages + VPS `*/10` git-pull of `/opt/trips/app`). The FastAPI service at
   `/opt/trips-sync` is NOT git-deployed, so backend changes are tested + merged but flagged
   "needs manual deploy" — the loop never restarts the live API overnight.
3. **Green gate before merge:** `node tools/test-core.mjs` passes AND `pytest` passes (if backend
   touched) AND syntax/JSON checks on changed files pass AND the working tree is sane.
4. **Auto-rollback:** after push, the driver curls the live URL; non-200 / missing marker →
   `git revert` the merge + push, and flag in the report.
5. **Never touch** `.env`, secrets, or existing trip data files destructively. App already falls
   back to localStorage, so a backend hiccup cannot strand the traveler.
6. **Fail-soft:** every step `|| true`; a bad iteration abandons its branch, marks the item
   `blocked: <reason>`, and the next fire continues. The loop never wedges.

## Components (all under `loop/`)

| File | Role |
|------|------|
| `GOAL.md` | The constitution: north-star, green-gate definition, guardrails. Read every iteration. |
| `BACKLOG.md` | Prioritized queue (seeded tonight). Loop picks the top unblocked item; marks done/blocked. |
| `ITERATION_PROMPT.md` | The prompt `claude -p` runs: pick → branch → implement → test → verify → merge → report. ONE item per run. |
| `run-build-loop.sh` | Driver (plain zsh, launchd-invoked): lock, deadline/window guard, run claude iteration, post-deploy live smoke + rollback, self-bootout at deadline. |
| `notify.sh` | Best-effort Telegram ping via budget_bot token (kickoff + morning summary). |
| `MORNING_REPORT.md` | Appended each iteration: feature, status, evidence, links. The morning deliverable. |
| `loop.log` | Full driver + iteration log. |
| `~/Library/LaunchAgents/com.chongyu.alpine-build-loop.plist` | Fires the driver every 10 min. |

## One iteration (inside `claude -p`)

1. `git pull` (sync) · read `GOAL.md`, `BACKLOG.md`, `MORNING_REPORT.md`.
2. If `loop/STOP` exists or backlog has no unblocked items → exit 0.
3. Pick the **highest-value unblocked** item.
4. Branch `loop/<slug>` · implement surgically (follow repo patterns + global CLAUDE.md: simplest
   code, touch only what's needed).
5. Test + self-verify (commands scaled to what changed; see green gate).
6. 🟢 → merge `--no-ff` into `main`, push. Re-verify on `main`. (Driver does live smoke after.)
   🔴 → abandon branch, mark item `blocked: <reason>`.
7. Append a `MORNING_REPORT.md` entry with evidence. Update `BACKLOG.md`. Exit.

## Seeded backlog (priority order)

1. **Offline/PWA** — service worker + manifest so the itinerary, map tiles, and today's plan work
   with no signal. (Alpine-critical.)
2. **Mobile "Today" view** — a fast, thumb-friendly single-screen view of today's plan + next
   booking + weather, defaulting when the trip is live.
3. **Bookings gap/conflict detector** — flag missing return legs, overlaps, unassigned bookings.
4. **"Can I make it?" timing warnings** — compare leg travel time vs gap between scheduled places;
   flag over-packed days.
5. **Nearby discovery into itinerary** — suggest eat/do near a day's places, one-tap add.
6. **Faster expense entry + settle-up clarity** — quick-add, who-owes-who summary, budget vs actual.
7. **Safe roadmap items** from `INBOUND_TODO.md` that need no new secrets.

## Morning deliverable

`loop/MORNING_REPORT.md` (built / deployed / blocked, with evidence + live link) plus a Telegram
summary ping to Chongyu. Kickoff ping sent at launch so the owner has confidence going to bed.

## Stop conditions

Deadline reached (07:30) · backlog exhausted · `loop/STOP` sentinel present. At the deadline the
driver unloads its launchd job and ends `caffeinate`.
