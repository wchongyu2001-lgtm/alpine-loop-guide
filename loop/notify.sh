#!/bin/bash
# Best-effort Telegram ping for the build loop. Never fails the caller. Plain text (no Markdown,
# so feature titles with (), ", — etc. can't trigger a Telegram 400).
#   notify.sh "<message>"   -> send literal message
#   notify.sh kickoff       -> launch announcement
#   notify.sh summary       -> summary parsed from MORNING_REPORT.md
set -uo pipefail
ENV="$HOME/claude/budget_bot/.env"
REPORT="$HOME/claude/alpine-loop-guide/loop/MORNING_REPORT.md"
SHIPPED="$HOME/claude/alpine-loop-guide/data/shipped.json"
LIVE="https://wchongyu2001-lgtm.github.io/alpine-loop-guide/"

TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
CHAT=$(grep -E '^TELEGRAM_USER_ID_CHONGYU=' "$ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
if [ -z "${TOKEN:-}" ] || [ -z "${CHAT:-}" ]; then echo "telegram not configured; skipping"; exit 0; fi

case "${1:-}" in
  kickoff)
    MSG="Alpine build loop armed (continuous). Building trip-planner features back-to-back, verifying each with an agent, auto-deploying when green. Live: $LIVE" ;;
  summary)
    DONE=$(grep -c 'status: done' "$REPORT" 2>/dev/null || echo 0)
    BLK=$(grep -c 'status: blocked' "$REPORT" 2>/dev/null || echo 0)
    TITLES=$(node -e "try{const f=require('$SHIPPED').features||[];console.log(f.slice(-12).map(x=>'• '+x.title).join('\n'))}catch(e){}" 2>/dev/null)
    MSG="Build loop finished. Shipped: $DONE  Blocked: $BLK

$TITLES

Open it: $LIVE
Full report: loop/MORNING_REPORT.md" ;;
  *) MSG="${1:-(empty)}" ;;
esac

curl -fsS --max-time 20 \
  "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT}" \
  --data-urlencode "text=${MSG}" \
  -d "disable_web_page_preview=true" >/dev/null 2>&1 \
  && echo "telegram sent" || echo "telegram send failed (ignored)"
exit 0
