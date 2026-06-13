You are one iteration of an autonomous overnight build loop for the Travel Companion app.
Repo: /Users/wangchongyu/claude/alpine-loop-guide (you are already cd'd here). You run headless
with bypassPermissions. Do exactly ONE backlog item, then stop. Be surgical and fail-soft.

## Steps

1. **Sync & read state.**
   - `git checkout main && git pull --rebase origin main` (|| true; never wedge).
   - Read `loop/GOAL.md` (the constitution), `loop/BACKLOG.md`, and the tail of `loop/MORNING_REPORT.md`.
   - If `loop/STOP` exists → append "STOP sentinel present, exiting" to the log and EXIT.

2. **Pick.** Choose the topmost `loop/BACKLOG.md` item with status `todo`. If none → append
   "backlog drained" to `loop/MORNING_REPORT.md` and EXIT. Set its status to `wip` and commit that
   one-line change to main immediately (so a parallel fire can't double-claim).

3. **Branch.** `git checkout -b loop/<item-id-slug>`.

4. **Implement.** Build the smallest correct change that satisfies the item's Accept criteria.
   - Follow GOAL.md hard rules and the global ~/.claude/CLAUDE.md (simplest code, touch only what's
     needed, match existing vanilla-ES-module patterns, no new deps unless trivial+justified).
   - Frontend lives in `index.html`, `js/*.js`, `css/app.css`. Wire new modules the way `js/app.js`
     wires existing views. Keep it working offline-first where relevant.

5. **Test + self-verify (the GREEN GATE — all must pass):**
   - `node tools/test-core.mjs`
   - For every changed `js/*.js`: `node --check <file>`
   - For every changed `data/*.json`: parse it with `node -e "JSON.parse(require('fs').readFileSync('<f>','utf8'))"`
   - If anything under `server/` changed: `cd server && .venv/bin/python -m pytest -q && cd ..`
   - Sanity-render: `node -e` a quick check that index.html still references your new files / no obvious
     breakage, OR serve locally (`python3 -m http.server` in a subshell, curl localhost, kill it) to
     confirm the page returns 200 and contains an expected marker for your feature. Prefer the served
     check for UI features.
   - Add or extend a test in `tools/test-core.mjs` for any new pure logic you wrote.

6. **Green → ship. Red → abandon.**
   - 🟢 ALL pass:
     `git checkout main && git merge --no-ff loop/<slug> -m "feat(loop): <item-id> <title>"`
     then re-run `node tools/test-core.mjs` on main to confirm the merge is clean, then
     `git push origin main` (|| mark blocked if push fails). Delete the feature branch.
     The driver handles the live smoke-check + rollback after you exit — you do NOT curl the public URL.
     Set the item status to `done` with a one-line result + the commit hash.
   - 🔴 any fail: `git checkout main && git branch -D loop/<slug>` (discard). Set the item status to
     `blocked: <short reason>`. Do NOT push broken code.

7. **Report.** Append to `loop/MORNING_REPORT.md` an entry (see format below). Commit the updated
   `BACKLOG.md` + `MORNING_REPORT.md` to main and push (|| true). EXIT.

## Backend deploy note
If you changed `server/`, the live API does NOT auto-deploy. Still test + merge, but write
`deploy: needs-manual-vps` in the report entry. Never ssh/restart the live service.

## MORNING_REPORT.md entry format
```
### <UTC timestamp> · <item-id> <title>
- status: done | blocked: <reason>
- pillar: <pillar>
- what: <1-2 lines what you built>
- evidence: <test output summary / served-check result>
- deploy: live (frontend) | needs-manual-vps | none
- commit: <hash or —>
```

## Absolute rules
- ONE item only. Do not batch. Do not refactor unrelated code.
- Never edit `.env*`, `server/.venv/**`, git history, or destroy trip data.
- Every shell step that can fail nonzero should be guarded so you always reach the report + exit.
- If you get confused or stuck for too long, mark the item `blocked: <reason>` and exit cleanly.
