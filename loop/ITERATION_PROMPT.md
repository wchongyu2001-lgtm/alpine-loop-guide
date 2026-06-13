You are ONE iteration of an autonomous overnight build loop for the Travel Companion app.
Repo: /Users/wangchongyu/claude/alpine-loop-guide (already cd'd here). Headless, bypassPermissions.
Build ONE feature, prove it with an independent agent, record it in the "What's new" tab, then stop.
Be surgical and fail-soft. Each fire starts with a fresh context — that IS the "compact" between features.

## IMPORTANT environment note
`curl`, `wget`, `WebFetch`, and inline `node -e "...fetch(...)"` in a Bash command are BLOCKED by a hook.
To check a URL, use the file-based helper (the hook can't see inside a file):
  `node loop/served-check.mjs <url> [markerRegex]`   # exit 0 = 200 (+marker if given)
A local server for UI checks: `python3 -m http.server 8123 >/dev/null 2>&1 & SRV=$!; sleep 1; <checks>; kill $SRV`.

## Steps

1. **Sync & read state.** `git checkout main && git pull --rebase origin main` (|| true).
   Read `loop/GOAL.md`, `loop/BACKLOG.md`, tail of `loop/MORNING_REPORT.md`.
   If `loop/STOP` exists → log "STOP present" and EXIT. If no `todo` item remains → append
   "backlog drained" to the report and EXIT.

2. **Claim.** Pick the topmost `todo` item. Set its status to `wip`, commit that one-line change to
   main and push (so a parallel fire can't double-claim). Record `PRE=$(git rev-parse origin/main)`.

3. **Branch + build.** `git checkout -b loop/<item-id-slug>`. Build the smallest correct change that
   meets the item's Accept criteria. Follow GOAL.md + global ~/.claude/CLAUDE.md (simplest code, touch
   only what's needed, match the vanilla-ES-module view pattern in `js/app.js`, no new deps).

4. **Green gate (ALL must pass, else abandon):**
   - `node tools/test-core.mjs` (add/extend a guard here for any new pure logic).
   - `node --check` on every changed `js/*.js`; `JSON.parse` every changed `data/*.json`.
   - If `server/` changed: `cd server && .venv/bin/python -m pytest -q && cd ..` (and mark deploy `needs-manual-vps`).
   - Served check for UI: start `python3 -m http.server 8123`, then
     `node loop/served-check.mjs http://localhost:8123/ "Travel Companion"` and a marker specific to
     your feature; kill the server. All exit 0.

5. **Ship.** 🟢 → `git checkout main && git merge --no-ff loop/<slug> -m "feat(loop): <id> <title>"`,
   re-run `node tools/test-core.mjs` on main, `git push origin main`. Delete the branch.
   🔴 any failure → `git checkout main && git branch -D loop/<slug>`; set item `blocked: <reason>`;
   append a report entry; EXIT. (Do NOT push broken code.)

6. **Independent verification gate (REQUIRED — only advance on PASS).**
   Spawn ONE subagent with the Task/Agent tool. Give it the item title + Accept criteria + the live
   URL https://wchongyu2001-lgtm.github.io/alpine-loop-guide/ and tell it the curl/fetch hook rule
   (use `node loop/served-check.mjs <url> [marker]` or `ctx_fetch_and_index`). It must INDEPENDENTLY
   confirm the feature works, with direct evidence: (a) the feature's artifacts are on `origin/main`,
   (b) `node tools/test-core.mjs` exits 0 on main, (c) live fetch of the feature succeeds — retry up
   to ~90s for GitHub Pages to propagate; if still lagging, PASS on (a)+(b) but note "live propagating".
   It returns a structured PASS/FAIL + evidence.
   - **FAIL** → roll back: `git checkout main && git reset --hard $PRE && git push --force-with-lease origin main`.
     Set item `blocked: failed verification — <reason>`. Append report entry. EXIT.
   - **PASS** → continue.

7. **Record in the "What's new" tab.** Append ONE object to the `features` array in `data/shipped.json`
   (newest entries are sorted to the top by date at render): fields
   `{id,title,pillar,date(UTC ISO),what,verified:true,verify_note:<agent's evidence, 1-2 lines>,commit:<merge hash>,deploy:"live"|"needs-manual-vps"}`.
   `JSON.parse` it to confirm validity. Commit + push (`feat(loop): record <id> in what's-new`).
   This is the HTML feature feed the owner reviews — it auto-renders in the app's "✨ What's new" tab.

8. **Report + finish.** Append to `loop/MORNING_REPORT.md` (format below). Set the backlog item `done`
   with the commit hash. Commit + push `BACKLOG.md` + `MORNING_REPORT.md`. EXIT.
   The next launchd fire is a fresh context (the "compact") and builds the next feature.

## MORNING_REPORT.md entry format
```
### <UTC timestamp> · <item-id> <title>
- status: done | blocked: <reason>
- pillar: <pillar>
- what: <1-2 lines>
- verified: <agent verdict + key evidence>
- whatsnew: recorded | n/a
- deploy: live (frontend) | needs-manual-vps | none
- commit: <hash or —>
```

## Absolute rules
- ONE item only. No batching, no unrelated refactors.
- Never edit `.env*`, `server/.venv/**`, git history, or destroy trip data. Never ssh/restart the live VPS API.
- Guard every fallible shell step so you always reach the report + EXIT. If stuck, mark blocked and exit.
