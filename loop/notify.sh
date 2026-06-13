#!/bin/bash
# Best-effort Telegram ping for the build loop. Never fails the caller.
#   notify.sh "<message>"   -> send literal message
#   notify.sh kickoff       -> launch announcement
#   notify.sh summary       -> morning summary parsed from MORNING_REPORT.md
set -uo pipefail
ENV="$HOME/claude/budget_bot/.env"
REPORT="$HOME/claude/alpine-loop-guide/loop/MORNING_REPORT.md"
LIVE="https://wchongyu2001-lgtm.github.io/alpine-loop-guide/"

TOKEN=$(grep -E '^TELEGRAM_BOT_TOKEN=' "$ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
CHAT=$(grep -E '^TELEGRAM_USER_ID_CHONGYU=' "$ENV" 2>/dev/null | head -1 | cut -d= -f2- | tr -d '"' | tr -d "'")
[ -z "${TOKEN:-}" ] || [ -z "${CHAT:-}" ] && { echo "telegram not configured; skipping"; exit 0; }

case "${1:-}" in
  kickoff)
    MSG="🏔️ *Alpine build loop armed.* Building trip-planner features overnight, auto-deploying when green, disarming by ~07:30. You'll get a summary in the morning. Live: $LIVE" ;;
  summary)
    if [ -f "$REPORT" ]; then
      DONE=$(grep -c 'status: done' "$REPORT" 2>/dev/null || echo 0)
      BLK=$(grep -c 'status: blocked' "$REPORT" 2>/dev/null || echo 0)
      SHIPPED=$(grep -A4 'status: done' "$REPORT" 2>/dev/null | grep -E '^### ' | sed 's/^### [^·]*· /• /' | head -15)
      MSG="☀️ *Good morning — build loop done.*%0A✅ shipped: $DONE   ⛔ blocked: $BLK%0A%0A$(echo "$SHIPPED" | sed 's/$/%0A/' | tr -d '\n')%0AOpen it: $LIVE%0AFull report: loop/MORNING_REPORT.md"
    else
      MSG="☀️ Build loop finished. No report file found — check loop/loop.log."
    fi ;;
  *) MSG="${1:-（empty）}" ;;
esac

curl -fsS --max-time 20 \
  "https://api.telegram.org/bot${TOKEN}/sendMessage" \
  --data-urlencode "chat_id=${CHAT}" \
  --data-urlencode "text=${MSG}" \
  -d "parse_mode=Markdown" -d "disable_web_page_preview=true" >/dev/null 2>&1 \
  && echo "telegram sent" || echo "telegram send failed (ignored)"
exit 0
