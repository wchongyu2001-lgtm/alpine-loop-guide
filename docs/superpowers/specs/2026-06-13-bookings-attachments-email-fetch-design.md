# Bookings: PDF attachments + on-demand Gmail fetch — design

**Date:** 2026-06-13 · **Status:** approved by user (chat), supersedes nothing — extends the v2 spec.

## User decisions (confirmed in chat)

- **Attachment storage: Google Drive**, via the existing Apps Script backend. OneDrive rejected (needs Azure app registration), iCloud rejected (no free API). Files must NOT enter the public repo (PII rule in v2 spec).
- **Email fetch: on-demand button** in the Bookings view, powered by Apps Script `GmailApp` running as the user. The daily Claude pipeline (launchd 09:30) stays as the thorough pass; forward-to-`wchongyu2001@gmail.com` keeps working and is also picked up instantly by the button.
- Attachments accepted: PDFs and images, ≤ 10 MB.

## Architecture

One redeploy of `apps-script/Code.gs` (already owed — open item #1) gains two actions on the same `/exec` URL, adding Drive + Gmail OAuth scopes:

1. `POST {action:'upload', filename, mimeType, dataB64}` → saves file to private Drive folder **"Trips Attachments"** (created on first use) → returns `{ok, fileId, url}`. POSTs without `action` keep the existing (trip, kind) save semantics.
2. `GET ?action=fetchmail` → searches last 30 days of Gmail for confirmation-looking mail (booking / confirmation / reservation / itinerary / e-ticket keywords), saves PDF attachments to the same folder (named `<msgId>-<name>` to dedupe across fetches), returns `{ok, messages:[{id, subject, from, date, body, attachments:[{name,url}]}]}` (≤ 20 messages, body truncated ~1500 chars).

Client (`js/sync.js`) gains `uploadAttachment(filename, mimeType, dataB64)` and `fetchMail()` — both `fetch` with readable responses (Apps Script text/plain POST is a simple request; CORS headers come back after redirect). If the deployed backend is still the old version, both fail visibly with a "redeploy Apps Script" message.

## Data model

Attachment **metadata only** (never file bytes) lives in the bookings overlay, synced via the existing `save('bookings', …)` path:

```js
overlay.bookings = {
  overrides: {...},            // existing
  manual: [...],               // existing
  attachments: { [bookingId]: [{name, url, fileId}] },   // NEW — works for repo + manual bookings
  emailSeen: ["gmailMsgId", ...],                          // NEW — added/dismissed suggestions
}
```

## UI (`js/bookings.js`)

- **Drag-and-drop:** every booking card is a drop target (highlight on dragover). Drop → validate (pdf/image, ≤10 MB) → base64 → upload → 📎 chip linking to the Drive file appears on the card. A per-card 📎 button opens a file picker (phones have no drag-and-drop).
- **Fetch from Gmail:** "📥 Fetch from Gmail" button next to the last-sync line. Results render as suggestion cards (subject · date · from · attachment chips), excluding `emailSeen` ids and emails whose Gmail message already matches an existing booking. **Add** pre-fills the existing manual-add form via `parseEmailStub()` and links the email's attachments to the new booking on submit; **Dismiss** records the id in `emailSeen`.

## Pure logic (`js/core.js`, TDD)

`parseEmailStub(subject, body, emailDateISO)` → `{type, title, confirmation, start}`:
- `type` from keywords (flight/hotel/train/bus/car/activity, else `other`)
- `title` = subject stripped of `Fwd:`/`Re:` prefixes
- `confirmation` = labelled code (confirmation/booking/reference/PNR + 5–12 alphanumerics) or null
- `start` = first recognizable date in body (`12 Aug 2026`, `2026-08-12` forms) else null
Tests in `tools/test-core.mjs` written before implementation.

## Errors

- Upload/fetch network or `{ok:false}` → inline message on the card / under the button; never silent. Old backend deployed → same path (response unparseable or missing `ok`).
- Oversize / wrong-type file → rejected client-side with message, no upload.

## Verification

`node tools/test-core.mjs` (existing 15 + new assertions) · `node --check js/*.js` · jsdom smoke at `/tmp/trips-smoke` · 390 px layout check · push → verify live URL. Gmail/Drive end-to-end is verifiable only after the user redeploys `Code.gs` (re-auth adds Drive+Gmail scopes; re-add Telegram token while in the editor).

## Out of scope

Editing existing bookings, attachment deletion UI (remove = delete the file in Drive yourself; chip disappears if metadata removed manually), parsing quality parity with the Claude pipeline, non-Gmail mailboxes.
