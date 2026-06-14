#!/bin/bash
# Overnight Trip-Planner Build Loop — CONTINUOUS driver.
# Event-driven: the next feature starts the instant the previous one ends (no fixed tick).
# launchd starts this ONCE (RunAtLoad); it loops internally until the backlog drains, the
# deadline passes, or loop/STOP appears. Fail-soft; only clean exits are drain/deadline/STOP.
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

# --- Single-instance lock (a heartbeat younger than 30 min means a driver is already looping) ---
if [ -e "$LOCK" ] && [ -n "$(find "$LOCK" -mmin -30 2>/dev/null)" ]; then exit 0; fi
touch "$LOCK"; trap 'rm -f "$LOCK"' EXIT

teardown(){
  say "=== DEADLINE/END — tearing down ==="
  bash "$LOOP/notify.sh" summary >> "$LOG" 2>&1 || true
  CPID=$(cat "$LOOP/.caffeinate.pid" 2>/dev/null || true)
  [ -n "${CPID:-}" ] && kill "$CPID" 2>/dev/null || true
  launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null \
    || launchctl unload "$HOME/Library/LaunchAgents/$LABEL.plist" 2>/dev/null || true
  rm -f "$LOCK"
  say "=== loop disarmed ==="
}

say "=== CONTINUOUS loop start ==="
ITER=0
while true; do
  touch "$LOCK"                                   # heartbeat — keeps the single-instance lock fresh
  DEADLINE=$(cat "$LOOP/.deadline" 2>/dev/null || echo 0)
  [ "$(date +%s)" -ge "$DEADLINE" ] && { teardown; exit 0; }
  [ -e "$LOOP/STOP" ] && { say "STOP sentinel present — exiting"; rm -f "$LOCK"; exit 0; }

  # Nothing left to do? finish cleanly (the natural end of the loop).
  git fetch origin main -q 2>/dev/null || true
  git checkout main -q 2>/dev/null && git pull --rebase origin main >/dev/null 2>&1 || true
  if ! grep -q 'status: todo' "$LOOP/BACKLOG.md" 2>/dev/null; then
    say "backlog drained — no todo items left"; teardown; exit 0
  fi

  # Post-deploy health net on the LAST push (coarse: catches 404/500/missing shell).
  HTTP=$(curl -fsS -o /tmp/alpine-live.html -w "%{http_code}" --max-time 25 "$LIVE_URL" 2>/dev/null || echo 000)
  LAST_GOOD=$(cat "$LOOP/.last_good" 2>/dev/null || true)
  if [ "$HTTP" = "200" ] && grep -q "$MARKER" /tmp/alpine-live.html 2>/dev/null; then
    git rev-parse origin/main > "$LOOP/.last_good" 2>/dev/null || true
  else
    say "LIVE UNHEALTHY ($HTTP)"
    if [ -n "${LAST_GOOD:-}" ] && [ "$(git rev-parse origin/main 2>/dev/null)" != "$LAST_GOOD" ]; then
      say "ROLLING BACK origin/main -> $LAST_GOOD"
      git reset --hard "$LAST_GOOD" 2>>"$LOG" && git push --force-with-lease origin main >>"$LOG" 2>&1 \
        && say "rollback pushed" || say "rollback FAILED"
      bash "$LOOP/notify.sh" "⚠️ Auto-rollback: live unhealthy ($HTTP), reverted to last-good." >> "$LOG" 2>&1 || true
    fi
  fi

  ITER=$((ITER+1))
  say "--- iteration $ITER: running claude (one feature) ---"
  # Portable 25-min watchdog (macOS has no `timeout`).
  "$CLAUDE" -p "$(cat "$LOOP/ITERATION_PROMPT.md")" \
    --permission-mode bypassPermissions --max-turns 120 >> "$LOG" 2>&1 &
  CPID=$!
  ( sleep 1500; kill "$CPID" 2>/dev/null ) & WPID=$!
  wait "$CPID" 2>/dev/null; RC=$?
  kill "$WPID" 2>/dev/null
  say "--- iteration $ITER done (claude rc=$RC) ---"

  sleep 2     # brief breath, then immediately start the next feature
done
