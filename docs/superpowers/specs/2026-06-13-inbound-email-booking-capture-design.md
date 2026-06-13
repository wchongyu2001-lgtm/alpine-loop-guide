# Inbound-email booking capture — design

**Date:** 2026-06-13 · **Status:** approved by user (chat). Extends the VPS sync backend (commit `eafc7cc`). Wanderlog-clone of the `trip+XXXX@wanderlog.com` forward-to-capture flow.

## Goal

Forward a booking confirmation email to a dedicated address → the VPS receives it, parses body + PDF with Claude, and the booking appears in the dashboard on the correct trip with the PDF attached. No clicks after forwarding. By default a Gmail filter auto-forwards likely confirmations, so even forwarding is hands-off.

## User decisions (confirmed in chat)

- **Transport:** an inbound-email *service webhook* (no custom domain). The service provides a ready address and POSTs parsed email JSON to our endpoint.
- **Landing:** auto-added to the per-trip **bookings overlay on the VPS** (not the public repo), flagged `source:"email"`, editable/reassignable/deletable in the existing UI.
- **Parsing:** **Claude API** on the VPS (Wanderlog-grade fields, reads the PDF). One secret (`ANTHROPIC_API_KEY`) on the box.
- **Auto-forward:** include a Gmail filter that auto-forwards likely confirmations to the inbound address.

## Architecture

```
Gmail (filter auto-forwards)  ──►  inbound-parse service  ──►  POST …/trips-sync/inbound?key=SECRET
confirmation email                 (Postmark/Mailgun)            │
                                                                 ▼
                                            verify key + sender allowlist
                                                                 ▼
                                   extract text (body, stripped) + PDF text (pypdf)
                                                                 ▼
                                        Claude API → strict-JSON booking fields
                                                                 ▼
                          save PDF to files store · assign trip (smallest-range rule)
                                                                 ▼
                       merge into overlays/{trip}__bookings.json  (manual[] + attachments[])
                                                                 ▼
                                  (optional Telegram ping)  →  dashboard shows it next load
```

### Inbound transport
A service with a genuine free inbound tier (evaluate Postmark vs Mailgun at build; both expose the same shape). It yields an address like `abc123@inbound.postmarkapp.com`. Configured to POST inbound JSON to `https://markets-dashboard.duckdns.org/trips-sync/inbound?key=<INBOUND_SECRET>`. The contract we depend on: sender/From, Subject, TextBody, HtmlBody, Attachments[{Name, ContentType, Content(base64)}]. Adapter normalizes whichever service is chosen into that internal shape.

### New code (isolated from the parallel session's `app.py`)
- `server/inbound.py` — FastAPI `APIRouter` with `POST /inbound`. Mounted by adding **one line** to `app.py`: `app.include_router(inbound.router)`. This is the only edit to the file the other session owns.
- `server/parse.py` — pure functions: `strip_forward(text)`, `pdf_text(bytes)`, `build_prompt(...)`, `assign_trip(trips, start_iso)` (Python port of `core.assignTrip`), `merge_into_overlay(overlay, booking, attachment)`. No network → unit-testable.
- `server/inbound.py` calls the Claude API (`anthropic` SDK) and reuses the existing files-store + overlay-path helpers from `app.py` (import, don't duplicate).

### `/inbound` request handling
1. Reject if `?key` ≠ `INBOUND_SECRET` → 401.
2. Resolve the *original* sender (the forwarded message's From, falling back to the envelope From). If not in `INBOUND_ALLOW` (comma-list of the owner's addresses) → return 200 and ignore (don't give scanners a retry signal); log it.
3. Build parse input: stripped TextBody (or HtmlBody→text), plus extracted text of each PDF attachment.
4. Claude call with a strict JSON schema (tool/`response`-style) → `{type∈[flight,hotel,train,bus,car,activity,other], title, provider|null, start, end|null, location|null, price{amount,currency}|null, confirmation|null, pax[]|null}`. Temperature 0.
5. Save each PDF to the files store (existing logic) → `{name,url,fileId}`.
6. `assign_trip` against `trips.json` read from the repo mirror on the box (`/opt/trips/app/data/trips.json`), else `unassigned`.
7. Merge into `overlays/{trip}__bookings.json` payload: append to `manual[]` with id `em-<sha1(messageId|confirmation)[:10]>`; attach PDFs under `attachments[id]`. **Idempotent**: if that id or the same `confirmation` already exists in the overlay (or in the repo base `bookings.json`), skip.
8. Optional Telegram ping (reuse a token from `.env` if present): "📩 imported `<title>` → `<trip>`".

### Frontend (minimal)
No render changes needed — a forwarded booking is just another `manual[]` overlay entry the existing `data.js` merge already shows. Two small copy edits in `js/bookings.js` (coordinated, since the other session also edits it):
- Replace the "Forward … to wchongyu2001@gmail.com … after the daily sync" line with the **real inbound address** and "appears within ~a minute".
- Remove the stale `bkhelp` block that references redeploying `apps-script/Code.gs` (obsolete after the VPS migration).

## Data model (unchanged shape)
Booking record matches existing entries (`id, trip, type, title, provider, start, end, location, price, confirmation, pax, notes, gmail_link, source:"email"`). Attachments use the existing overlay `attachments[bookingId] = [{name,url,fileId}]`.

## Error handling
- Bad key → 401. Disallowed sender → 200 + ignore + log.
- PDF text extraction fails → proceed with body only.
- Claude error/timeout → retry once; if still failing, **never write a half record** — instead file a minimal `{type:"other", title:<subject>, trip:<assigned or unassigned>, source:"email", notes:"auto-parse failed — open the attached PDF"}` with the PDF attached, and Telegram-ping so nothing is silently lost.
- Duplicate (id/confirmation already present) → skip, return `{ok:true, deduped:true}`.

## Security / privacy
- `INBOUND_SECRET` in the webhook URL + sender allowlist are the gates. Service-side basic-auth added if the chosen service supports it.
- Real confirmations live only in the VPS overlay store + files dir (already the accepted-public-data posture), never committed to the public repo.
- `ANTHROPIC_API_KEY`, `INBOUND_SECRET`, `INBOUND_ALLOW`, optional Telegram token all in `/opt/trips-sync/.env`. `requirements.txt += anthropic, pypdf`.

## Testing
- **pytest** on `server/parse.py` + merge logic using saved sample inbound payloads (one flight, one hotel-with-PDF, one spam/disallowed, one duplicate). Claude call mocked → asserts schema mapping, trip assignment, dedupe, and the parse-fail fallback.
- Existing frontend `tools/test-core.mjs` + jsdom smoke must still pass (overlay shape unchanged).
- **End-to-end:** forward one real confirmation → assert it lands in the right overlay with the PDF, and a second forward of the same email dedupes.

## Coordination with the parallel session (owns the VPS backend)
- This inbound webhook overlaps — and likely supersedes — that session's planned "phase 2" Gmail *poller* (no Gmail auth needed here). Flag and align before deploying.
- New logic lives in new files; `app.py` gets one `include_router` line only.
- Deploy steps (new `.env` keys, `pip install`, `systemctl restart trips-sync`) run on `root@46.62.169.80` (SSH key `~/.ssh/hetzner_budget_bot`). Coordinate the restart so we don't clobber their in-flight work.

## User setup (exact steps provided at delivery)
1. Create the inbound-service account; copy the inbound address; point its webhook at `…/trips-sync/inbound?key=<secret>`.
2. Add `ANTHROPIC_API_KEY` (+ secret/allowlist) to `/opt/trips-sync/.env`.
3. Gmail → Settings → Filters: auto-forward likely confirmations (from common providers / subjects containing booking|confirmation|itinerary|e-ticket) to the inbound address. Manual forwarding always works too.

## Out of scope
Editing existing bookings via email; calendar (.ics) parsing; non-PDF attachments (images pass through as attachments but aren't OCR'd); replacing the daily Mac pipeline (left as-is until the parallel session retires it).
