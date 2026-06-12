#!/bin/zsh
# Booking import: Gmail → data/bookings.json → git push (runs via launchd, daily 09:30)
set -euo pipefail
cd "$HOME/claude/alpine-loop-guide"

export PATH="/opt/homebrew/bin:/usr/local/bin:$PATH"
LOG="$HOME/claude/alpine-loop-guide/pipeline/sync.log"

{
  echo "=== $(date '+%Y-%m-%d %H:%M:%S') booking sync start ==="
  claude -p "$(cat pipeline/BOOKINGS_PROMPT.md)" \
    --allowedTools "mcp__gmail-multi__search_emails,mcp__gmail-multi__read_email,mcp__gmail-multi__list_accounts,Read,Write,Edit,Bash(git add:*),Bash(git commit:*),Bash(git push:*),Bash(git status:*),Bash(git diff:*)" \
    --max-turns 60 || echo "claude exited $?"
  echo "=== done ==="
} >> "$LOG" 2>&1
