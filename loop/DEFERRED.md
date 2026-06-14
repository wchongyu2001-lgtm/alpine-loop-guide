# DEFERRED — out-of-scope & blocked frictions

This file holds frictions the trip-planner discovery loop hit but **must not fix in-loop**:

- **Server-side work** — anything needing the FastAPI/VPS backend (overlay sync, auth,
  persistence beyond `data/*.json`). The auto-deploy loop is **frontend-only** (`js/ css/
  data/ index.html` → GitHub Pages). Server changes are out of scope; record them here for a
  human to action separately.
- **Genuinely blocked items** — a planning step that resisted two attempts, or a fix that
  failed its green-gate / confirm re-drive and was reverted.

Append one entry per item. Suggested format:

```
- [YYYY-MM-DD] (server | blocked) <view/step> — what was attempted, why it can't be done in-loop, suggested next action.
```

## Items

_(none yet)_

## Ideas 2.0 — Telegram/Instagram ingestion (server) — deferred 2026-06-14
Forwarding a reel/link to the existing trip Telegram bot should create an Ideas-tab card via
trips-sync (parse title/thumbnail/location). Needs the FastAPI/VPS backend + bot handler
(TELEGRAM_BOT_TOKEN already configured). Out of the auto-deploy frontend loop scope; build as a
manual-VPS follow-up after the Ideas 2.0 frontend (F5) lands. The PWA Web Share Target (in F5)
covers the Instagram→share→app path without the backend.
