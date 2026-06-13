#!/bin/bash
# Overnight Trip-Planner Build Loop — driver.
# Fired by launchd every 10 min. One headless claude iteration per fire.
# Fail-soft everywhere; the only clean early exits are lock contention and the deadline teardown.
set -uo pipefail

REPO="$HOME/claude/alpine-loop-guide"
LOOP="$REPO/loop"
export PATH="/opt/homebrew/bin:/usr/local/bin:$HOME/.local/bin:/usr/bin:/bin:/usr/sbin:/sbin"
CLAUDE="${CLAUDE_BIN:-$HOME/.local/bin/claude}"
LABEL="com.chongyu.alpine-build-loop"
LOCK="/tmp/alpine-build-loop.lock"
LOG="$LOOP/loop.log"
LIVE_URL="https://wchongyu2001-lgtm.github.io/alpine-loop-guide/"
MARKER="Travel Companion"

cd "$REPO" 2>/dev/null || exit 0
NOW(){ date -u +%Y-%m-%dT%H:%M:%SZ; }
say(){ echo "[$(NOW)] $*" >> "$LOG"; }

# --- Deadline teardown -------------------------------------------------------
DEADLINE=$(cat "$LOOP/.deadline" 2>/dev/null || echo 0)
if [ "$(date +%s)" -ge "$DEADLINE" ]; then
  say "=== DEADLINE reached — tearing down ==="
  # morning summary ping (best-effort)
  bash "$LOOP/notify.sh" summary >> "$LOG" 2>&1 || true
  # stop caffeinate
  CPID=$(cat "$LOOP/.caffeinate.pid" 2>/dev/null || true)
  [ -n "${CPID:-}" ] && kill "$CPID" 2>/dev/null || true
  # unload self so it never runs during the day / trip
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null \
    || launchctl unload "$HOME/Library/LaunchAgents/$LABEL.plist" 2>/dev/null || true
  rm -f "$LOCK"
  say "=== loop disarmed ==="
  exit 0
fi

# --- Lock (a run younger than 30 min means an iteration is still in flight) --
if [ -e "$LOCK" ]; then
  if [ -n "$(find "$LOCK" -mmin -30 2>/dev/null)" ]; then exit 0; fi
  rm -f "$LOCK"  # stale
fi
touch "$LOCK"; trap 'rm -f "$LOCK"' EXIT

say "=== iteration start ==="

# --- Post-deploy health net on LAST push (coarse: catches 404/500/missing shell) ---
git fetch origin main -q 2>/dev/null || true
HTTP=$(curl -fsS -o /tmp/alpine-live.html -w "%{http_code}" --max-time 25 "$LIVE_URL" 2>/dev/null || echo 000)
LAST_GOOD=$(cat "$LOOP/.last_good" 2>/dev/null || true)
if [ "$HTTP" = "200" ] && grep -q "$MARKER" /tmp/alpine-live.html 2>/dev/null; then
  git rev-parse origin/main > "$LOOP/.last_good" 2>/dev/null || true
  say "live OK ($HTTP); last_good=$(cat "$LOOP/.last_good" 2>/dev/null)"
else
  say "LIVE UNHEALTHY ($HTTP, marker?=$(grep -qc "$MARKER" /tmp/alpine-live.html 2>/dev/null; echo $?))"
  if [ -n "${LAST_GOOD:-}" ] && [ "$(git rev-parse origin/main 2>/dev/null)" != "$LAST_GOOD" ]; then
    say "ROLLING BACK origin/main -> $LAST_GOOD"
    git checkout main -q 2>/dev/null || true
    git reset --hard "$LAST_GOOD" 2>>"$LOG" \
      && git push --force-with-lease origin main >>"$LOG" 2>&1 \
      && say "rollback pushed" || say "rollback FAILED (manual check needed)"
    bash "$LOOP/notify.sh" "⚠️ Auto-rollback: live site was unhealthy ($HTTP), reverted main to last-good." >> "$LOG" 2>&1 || true
  fi
fi

# --- One iteration (portable 25-min watchdog; macOS has no `timeout`) ---------
say "running claude iteration"
"$CLAUDE" -p "$(cat "$LOOP/ITERATION_PROMPT.md")" \
  --permission-mode bypassPermissions \
  --max-turns 120 >> "$LOG" 2>&1 &
CPID=$!
( sleep 1500; kill "$CPID" 2>/dev/null ) & WPID=$!
wait "$CPID" 2>/dev/null; RC=$?
kill "$WPID" 2>/dev/null
say "claude exited $RC"

say "=== iteration done ==="
exit 0
