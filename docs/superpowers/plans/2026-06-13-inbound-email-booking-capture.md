# Inbound-Email Booking Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Forward a booking confirmation email to a dedicated address → the VPS receives it via an inbound-parse service webhook, Claude extracts structured fields from the body + PDF, and the booking appears in the dashboard on the correct trip with the PDF attached.

**Architecture:** A new FastAPI router (`server/inbound.py`) handles `POST /inbound`. Pure, network-free logic (forward-stripping, PDF text, trip assignment, Claude-JSON normalization, overlay merge/dedupe) lives in `server/parse.py` and is unit-tested with mocked Claude output. The booking is written to the existing per-trip bookings overlay (`overlays/{trip}__bookings.json`) in the exact `manual[]` + `attachments` shape the frontend already renders, so no render code changes. `server/app.py` is touched only by one appended `include_router` block to avoid colliding with the parallel session editing it.

**Tech Stack:** Python 3 / FastAPI (existing), `anthropic` SDK (Claude Haiku 4.5), `pypdf`, pytest. Frontend is vanilla ES modules (one copy edit).

---

## File structure

- **Create** `server/parse.py` — pure functions: `strip_forward`, `extract_pdf_text`, `assign_trip`, `build_extraction_input`, `normalize_booking`, `fallback_booking`, `merge_into_overlay`. No FastAPI, no network → fully unit-testable.
- **Create** `server/inbound.py` — `APIRouter` with `POST /inbound`: auth, sender allowlist, service-payload adapter, PDF save, Claude call, orchestration, optional Telegram ping. Reads its own env (decoupled from `app.py` to avoid circular import).
- **Create** `server/conftest.py` — puts `server/` on `sys.path` so tests can `import parse`/`inbound`.
- **Create** `server/tests/test_parse.py`, `server/tests/test_inbound.py`, `server/tests/fixtures/*.json`.
- **Modify** `server/requirements.txt` — add `anthropic`, `pypdf`.
- **Modify** `server/app.py` — append a 2-line `include_router` block (the ONLY edit).
- **Modify** `js/bookings.js` — intro copy → real inbound address; remove the stale `bkhelp` Apps-Script block.
- **Create** `server/INBOUND_SETUP.md` — user setup (service webhook, env keys, Gmail auto-forward filter) + deploy/coordination checklist.

**Internal booking record shape** (matches existing entries in `data/bookings.json`):
```json
{"id":"em-<sha1[:10]>","trip":"alpine","type":"flight","title":"...","provider":"...|null",
 "start":"YYYY-MM-DDTHH:MM|YYYY-MM-DD","end":"...|null","location":{"name":"...","lat":null,"lng":null}|null,
 "price":{"amount":0,"currency":"EUR"}|null,"confirmation":"...|null","pax":["..."]|null,
 "notes":"...|null","gmail_link":null,"source":"email"}
```

**Overlay file shape** (`overlays/{trip}__bookings.json`), written by the existing `/save`:
```json
{"payload":{"overrides":{},"manual":[<booking>...],"attachments":{"<id>":[{"name","url","fileId"}]},"emailSeen":[]},"updated":"<iso>"}
```

---

## Task 1: Test environment + dependencies

**Files:**
- Modify: `server/requirements.txt`
- Create: `server/conftest.py`
- Create: `server/tests/__init__.py` (empty)

- [ ] **Step 1: Add deps**

Edit `server/requirements.txt` to:
```
fastapi
uvicorn[standard]
anthropic
pypdf
```

- [ ] **Step 2: Create a local venv and install (tests run locally, not on the box)**

Run:
```bash
cd ~/claude/alpine-loop-guide/server
python3 -m venv .venv && . .venv/bin/activate
pip install -r requirements.txt pytest httpx
```
Expected: installs succeed (`httpx` is needed by FastAPI's `TestClient`).

- [ ] **Step 3: Make `server/` importable in tests**

Create `server/conftest.py`:
```python
import sys, os
sys.path.insert(0, os.path.dirname(__file__))
```
Create empty `server/tests/__init__.py`.

- [ ] **Step 4: Verify pytest collects nothing yet (no error)**

Run: `cd ~/claude/alpine-loop-guide/server && . .venv/bin/activate && python -m pytest -q`
Expected: "no tests ran" (exit 5) — environment works.

- [ ] **Step 5: Commit**

```bash
cd ~/claude/alpine-loop-guide
echo "server/.venv/" >> .gitignore
git add server/requirements.txt server/conftest.py server/tests/__init__.py .gitignore
git commit -m "chore(inbound): test env + anthropic/pypdf deps"
```

---

## Task 2: `strip_forward` — clean forwarded-email cruft

**Files:**
- Create: `server/parse.py`
- Test: `server/tests/test_parse.py`

- [ ] **Step 1: Write the failing test**

Create `server/tests/test_parse.py`:
```python
from parse import strip_forward

def test_strip_forward_removes_header_and_quotes():
    raw = (
        "---------- Forwarded message ---------\n"
        "From: Indie Campers <support@indiecampers.com>\n"
        "Date: Mon, 30 Mar 2026 at 15:49\n"
        "Subject: Your road trip\n"
        "To: <wchongyu2001@gmail.com>\n"
        "\n"
        "> Booking Code V43VXZ\n"
        "Pickup August 01, 2026 14:30 in Venice\n"
    )
    out = strip_forward(raw)
    assert "Forwarded message" not in out
    assert "Date:" not in out
    assert "Booking Code V43VXZ" in out          # quote marker stripped, content kept
    assert "Pickup August 01, 2026 14:30" in out

def test_strip_forward_passthrough_plain():
    assert strip_forward("Just a normal body") == "Just a normal body"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -q`
Expected: FAIL — `ModuleNotFoundError: No module named 'parse'`.

- [ ] **Step 3: Implement**

Create `server/parse.py`:
```python
"""Pure helpers for inbound-email booking capture. No FastAPI, no network."""
import re, io, hashlib

_FWD_LINE = re.compile(r"^-+\s*Forwarded message\s*-+\s*$", re.I)
_HDR = re.compile(r"^(From|Sent|Date|To|Cc|Subject|Reply-To):", re.I)

def strip_forward(text: str) -> str:
    """Drop 'Forwarded message' banners + leading mail headers, unquote '> ' lines."""
    out = []
    for line in (text or "").splitlines():
        if _FWD_LINE.match(line.strip()):
            continue
        if _HDR.match(line.strip()):
            continue
        out.append(re.sub(r"^\s*>+\s?", "", line))
    return "\n".join(out).strip()
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -q`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add server/parse.py server/tests/test_parse.py
git commit -m "feat(inbound): strip_forward email cleaner"
```

---

## Task 3: `extract_pdf_text` — pull text from a PDF attachment

**Files:**
- Modify: `server/parse.py`
- Test: `server/tests/test_parse.py`

- [ ] **Step 1: Write the failing test** (generates a one-page PDF in-memory with reportlab-free pypdf is not possible; use a tiny checked-in PDF)

Add to `server/tests/test_parse.py`:
```python
import base64, os
from parse import extract_pdf_text

# Minimal valid one-page PDF containing the text "CONF ABC123" (base64, checked in below).
_MIN_PDF_B64_PATH = os.path.join(os.path.dirname(__file__), "fixtures", "min_pdf_b64.txt")

def test_extract_pdf_text_reads_words():
    data = base64.b64decode(open(_MIN_PDF_B64_PATH).read())
    txt = extract_pdf_text(data)
    assert "CONF" in txt and "ABC123" in txt

def test_extract_pdf_text_bad_bytes_returns_empty():
    assert extract_pdf_text(b"not a pdf") == ""
```

- [ ] **Step 2: Create the fixture PDF**

Run (generates a real text PDF with pypdf-compatible content via a tiny script):
```bash
cd ~/claude/alpine-loop-guide/server && . .venv/bin/activate && mkdir -p tests/fixtures
python - <<'PY'
# Build a minimal PDF with extractable text "CONF ABC123" using reportlab if present,
# else a hand-written minimal PDF. pypdf can read both.
import base64
try:
    from reportlab.pdfgen import canvas      # not a project dep; only if already installed
    import io
    buf = io.BytesIO(); c = canvas.Canvas(buf); c.drawString(72, 720, "CONF ABC123"); c.showPage(); c.save()
    data = buf.getvalue()
except Exception:
    # Hand-rolled minimal PDF with a text object "CONF ABC123".
    data = (b"%PDF-1.4\n"
            b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
            b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
            b"3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 200 200]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
            b"4 0 obj<</Length 44>>stream\nBT /F1 12 Tf 20 100 Td (CONF ABC123) Tj ET\nendstream endobj\n"
            b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
            b"trailer<</Root 1 0 R>>\n%%EOF")
open("tests/fixtures/min_pdf_b64.txt","w").write(base64.b64encode(data).decode())
print("wrote fixture", len(data), "bytes")
PY
```
Expected: prints "wrote fixture ...". Verify pypdf can read it in the next step (if the hand-rolled PDF yields empty text in your pypdf version, install reportlab in the venv and re-run: `pip install reportlab` then re-run the block).

- [ ] **Step 3: Run to verify the test fails**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -k pdf -q`
Expected: FAIL — `extract_pdf_text` not defined.

- [ ] **Step 4: Implement**

Add to `server/parse.py`:
```python
def extract_pdf_text(data: bytes) -> str:
    """Best-effort plain text from a PDF; '' on any failure."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    except Exception:
        return ""
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -k pdf -q`
Expected: 2 passed. (If `test_extract_pdf_text_reads_words` fails on the hand-rolled PDF, `pip install reportlab` and re-run Step 2.)

- [ ] **Step 6: Commit**

```bash
git add server/parse.py server/tests/test_parse.py server/tests/fixtures/min_pdf_b64.txt
git commit -m "feat(inbound): extract_pdf_text via pypdf"
```

---

## Task 4: `assign_trip` — Python port of the JS rule

**Files:**
- Modify: `server/parse.py`
- Test: `server/tests/test_parse.py`

- [ ] **Step 1: Write the failing test**

Add to `server/tests/test_parse.py`:
```python
from parse import assign_trip

_TRIPS = [
    {"id": "preexchange", "start": "2026-07-24", "end": "2026-08-01"},
    {"id": "alpine",      "start": "2026-08-01", "end": "2026-08-17"},
    {"id": "iceland",     "start": "2026-08-20", "end": "2026-08-29"},
]

def test_assign_trip_smallest_range_wins():
    assert assign_trip(_TRIPS, "2026-08-01T14:30") == "alpine"   # alpine 16d < preexchange 8d? both contain Aug1; smallest range wins
    assert assign_trip(_TRIPS, "2026-08-25") == "iceland"
    assert assign_trip(_TRIPS, "2026-12-01") == "unassigned"
    assert assign_trip(_TRIPS, None) == "unassigned"
```
(Note: Aug 1 is in both preexchange [8 days] and alpine [16 days]; smallest range = preexchange. Adjust assertion: `assign_trip(_TRIPS, "2026-08-01T14:30") == "preexchange"`.)

Use this corrected test body:
```python
def test_assign_trip_smallest_range_wins():
    assert assign_trip(_TRIPS, "2026-08-01T14:30") == "preexchange"  # 8d range < alpine 16d
    assert assign_trip(_TRIPS, "2026-08-10") == "alpine"
    assert assign_trip(_TRIPS, "2026-08-25") == "iceland"
    assert assign_trip(_TRIPS, "2026-12-01") == "unassigned"
    assert assign_trip(_TRIPS, None) == "unassigned"
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -k assign -q`
Expected: FAIL — not defined.

- [ ] **Step 3: Implement** (mirrors `js/core.js` `assignTrip`)

Add to `server/parse.py`:
```python
from datetime import date as _date

def _d(iso: str) -> _date:
    return _date.fromisoformat(iso[:10])

def assign_trip(trips, start_iso):
    if not start_iso:
        return "unassigned"
    d = start_iso[:10]
    hits = [t for t in trips if t["start"] <= d <= t["end"]]
    if not hits:
        return "unassigned"
    hits.sort(key=lambda t: (_d(t["end"]) - _d(t["start"])).days)
    return hits[0]["id"]
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -k assign -q`
Expected: 1 passed.

- [ ] **Step 5: Commit**

```bash
git add server/parse.py server/tests/test_parse.py
git commit -m "feat(inbound): assign_trip (port of core.assignTrip)"
```

---

## Task 5: `normalize_booking` + `fallback_booking`

**Files:**
- Modify: `server/parse.py`
- Test: `server/tests/test_parse.py`

- [ ] **Step 1: Write the failing test**

Add to `server/tests/test_parse.py`:
```python
from parse import normalize_booking, fallback_booking

def test_normalize_booking_maps_and_ids():
    raw = {"type": "FLIGHT", "title": " FI 418 ", "provider": "Icelandair",
           "start": "2026-08-29T09:40", "end": "2026-08-29T13:15",
           "confirmation": "DT6I97", "price": {"amount": 120, "currency": "EUR"},
           "pax": ["Chongyu Wang"], "location": {"name": "KEF"}}
    b = normalize_booking(raw, msg_id="abc", trip="iceland")
    assert b["id"] == "em-" + __import__("hashlib").sha1(b"abc").hexdigest()[:10]
    assert b["type"] == "flight"          # lowercased + valid
    assert b["title"] == "FI 418"          # trimmed
    assert b["trip"] == "iceland"
    assert b["source"] == "email"
    assert b["confirmation"] == "DT6I97"

def test_normalize_booking_clamps_unknown_type():
    b = normalize_booking({"type": "spaceship", "title": "X"}, msg_id="m", trip="unassigned")
    assert b["type"] == "other"
    assert b["start"] is None             # missing → None, not fabricated

def test_fallback_booking_minimal_record():
    b = fallback_booking(subject="Re: Your booking", msg_id="z", trip="unassigned")
    assert b["type"] == "other"
    assert b["title"] == "Your booking"   # Re/Fwd stripped
    assert b["source"] == "email"
    assert "auto-parse failed" in b["notes"]
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -k "normalize or fallback" -q`
Expected: FAIL — not defined.

- [ ] **Step 3: Implement**

Add to `server/parse.py`:
```python
TYPES = ["flight", "hotel", "train", "bus", "car", "activity", "other"]
_SUBJ_PREFIX = re.compile(r"^(\s*(fwd|fw|re)\s*:)+\s*", re.I)

def _booking_id(msg_id: str) -> str:
    return "em-" + hashlib.sha1((msg_id or "").encode()).hexdigest()[:10]

def normalize_booking(raw: dict, msg_id: str, trip: str) -> dict:
    t = str(raw.get("type", "")).strip().lower()
    return {
        "id": _booking_id(msg_id),
        "trip": trip,
        "type": t if t in TYPES else "other",
        "title": (raw.get("title") or "Booking").strip(),
        "provider": (raw.get("provider") or None),
        "start": (raw.get("start") or None),
        "end": (raw.get("end") or None),
        "location": raw.get("location") or None,
        "price": raw.get("price") or None,
        "confirmation": (raw.get("confirmation") or None),
        "pax": raw.get("pax") or None,
        "notes": (raw.get("notes") or None),
        "gmail_link": None,
        "source": "email",
    }

def fallback_booking(subject: str, msg_id: str, trip: str) -> dict:
    title = _SUBJ_PREFIX.sub("", subject or "Booking").strip() or "Booking"
    return normalize_booking(
        {"type": "other", "title": title,
         "notes": "auto-parse failed — open the attached PDF"},
        msg_id=msg_id, trip=trip)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -k "normalize or fallback" -q`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add server/parse.py server/tests/test_parse.py
git commit -m "feat(inbound): normalize_booking + fallback_booking"
```

---

## Task 6: `merge_into_overlay` — append + dedupe

**Files:**
- Modify: `server/parse.py`
- Test: `server/tests/test_parse.py`

- [ ] **Step 1: Write the failing test**

Add to `server/tests/test_parse.py`:
```python
from parse import merge_into_overlay

def _booking(id_, conf=None):
    return {"id": id_, "trip": "alpine", "type": "car", "title": "Van",
            "confirmation": conf, "source": "email"}

def test_merge_appends_and_attaches():
    ov, added = merge_into_overlay(None, _booking("em-1", "V43VXZ"),
                                   attachment={"name": "b.pdf", "url": "u", "fileId": "f"})
    assert added is True
    assert ov["manual"][0]["id"] == "em-1"
    assert ov["attachments"]["em-1"][0]["fileId"] == "f"
    assert ov["overrides"] == {} and ov["emailSeen"] == []

def test_merge_dedupes_by_id():
    ov = {"overrides": {}, "manual": [_booking("em-1")], "attachments": {}, "emailSeen": []}
    ov2, added = merge_into_overlay(ov, _booking("em-1"), None)
    assert added is False and len(ov2["manual"]) == 1

def test_merge_dedupes_by_confirmation():
    ov = {"overrides": {}, "manual": [_booking("em-1", "V43VXZ")], "attachments": {}, "emailSeen": []}
    ov2, added = merge_into_overlay(ov, _booking("em-2", "v43vxz"), None)  # case-insensitive
    assert added is False and len(ov2["manual"]) == 1
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -k merge -q`
Expected: FAIL — not defined.

- [ ] **Step 3: Implement**

Add to `server/parse.py`:
```python
def merge_into_overlay(overlay, booking, attachment):
    """Append booking to overlay.manual (dedupe by id or confirmation, case-insensitive).
    Returns (overlay, added_bool). Attachment metadata stored under attachments[id]."""
    ov = overlay or {}
    ov.setdefault("overrides", {})
    ov.setdefault("manual", [])
    ov.setdefault("attachments", {})
    ov.setdefault("emailSeen", [])
    ids = {b.get("id") for b in ov["manual"]}
    confs = {str(b.get("confirmation")).lower() for b in ov["manual"] if b.get("confirmation")}
    if booking["id"] in ids:
        return ov, False
    if booking.get("confirmation") and str(booking["confirmation"]).lower() in confs:
        return ov, False
    ov["manual"].append(booking)
    if attachment:
        ov["attachments"].setdefault(booking["id"], []).append(attachment)
    return ov, True
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -k merge -q`
Expected: 3 passed.

- [ ] **Step 5: Commit**

```bash
git add server/parse.py server/tests/test_parse.py
git commit -m "feat(inbound): merge_into_overlay with id/confirmation dedupe"
```

---

## Task 7: `build_extraction_input` — assemble the Claude prompt input

**Files:**
- Modify: `server/parse.py`
- Test: `server/tests/test_parse.py`

- [ ] **Step 1: Write the failing test**

Add to `server/tests/test_parse.py`:
```python
from parse import build_extraction_input, EXTRACTION_SYSTEM

def test_build_extraction_input_includes_body_and_pdf():
    s = build_extraction_input("Hotel confirmed", "Body text here", ["PDF CONF ABC123"])
    assert "Hotel confirmed" in s and "Body text here" in s and "PDF CONF ABC123" in s

def test_extraction_system_lists_schema_keys():
    for k in ["type", "title", "start", "confirmation"]:
        assert k in EXTRACTION_SYSTEM
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -k extraction -q`
Expected: FAIL — not defined.

- [ ] **Step 3: Implement**

Add to `server/parse.py`:
```python
EXTRACTION_SYSTEM = (
    "You extract ONE travel booking from a forwarded confirmation email. "
    "Reply with ONLY a JSON object, no prose, no code fences. Schema:\n"
    '{"type":"flight|hotel|train|bus|car|activity|other","title":"short human title",'
    '"provider":"company or null","start":"YYYY-MM-DDTHH:MM or YYYY-MM-DD",'
    '"end":"same format or null","location":{"name":"...","lat":null,"lng":null} or null,'
    '"price":{"amount":number,"currency":"ISO"} or null,"confirmation":"code or null",'
    '"pax":["names"] or null}\n'
    "Use null when unknown — never invent dates or codes. Dates must be ISO. "
    "title example: 'FI 418 · KEF → DUB' or 'Hotel Rialto · Venezia'."
)

def build_extraction_input(subject: str, body_text: str, pdf_texts) -> str:
    parts = [f"SUBJECT: {subject or ''}", "", "EMAIL BODY:", body_text or ""]
    for i, t in enumerate(pdf_texts or []):
        if t:
            parts += ["", f"PDF ATTACHMENT {i+1}:", t[:6000]]
    return "\n".join(parts)
```

- [ ] **Step 4: Run to verify it passes**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_parse.py -k extraction -q`
Expected: 2 passed.

- [ ] **Step 5: Commit**

```bash
git add server/parse.py server/tests/test_parse.py
git commit -m "feat(inbound): extraction prompt builder + system schema"
```

---

## Task 8: `inbound.py` router (with Claude call mockable)

**Files:**
- Create: `server/inbound.py`
- Test: `server/tests/test_inbound.py`
- Create: `server/tests/fixtures/postmark_flight.json`

- [ ] **Step 1: Create the fixture inbound payload (Postmark shape)**

Create `server/tests/fixtures/postmark_flight.json`:
```json
{
  "From": "wchongyu2001@gmail.com",
  "FromFull": {"Email": "wchongyu2001@gmail.com"},
  "Subject": "Fwd: Your Icelandair booking DT6I97",
  "TextBody": "---------- Forwarded message ---------\nFrom: Icelandair\n\nFlight FI 418 KEF to DUB on 2026-08-29 09:40. Confirmation DT6I97.",
  "HtmlBody": "",
  "Attachments": []
}
```

- [ ] **Step 2: Write the failing test** (FastAPI TestClient; Claude + trips loading monkeypatched; overlay dir = tmp)

Create `server/tests/test_inbound.py`:
```python
import json, os, importlib
from pathlib import Path
from fastapi import FastAPI
from fastapi.testclient import TestClient

def _client(tmp_path, monkeypatch, claude_return):
    monkeypatch.setenv("TRIPS_DIR", str(tmp_path))
    monkeypatch.setenv("INBOUND_SECRET", "s3cret")
    monkeypatch.setenv("INBOUND_ALLOW", "wchongyu2001@gmail.com")
    (tmp_path / "overlays").mkdir(parents=True, exist_ok=True)
    (tmp_path / "files").mkdir(parents=True, exist_ok=True)
    import inbound
    importlib.reload(inbound)
    monkeypatch.setattr(inbound, "_claude_extract", lambda text: claude_return)
    monkeypatch.setattr(inbound, "_load_trips", lambda: [
        {"id": "iceland", "start": "2026-08-20", "end": "2026-08-29"}])
    app = FastAPI(); app.include_router(inbound.router)
    return TestClient(app), tmp_path

def test_inbound_rejects_bad_key(tmp_path, monkeypatch):
    c, _ = _client(tmp_path, monkeypatch, {})
    r = c.post("/inbound?key=wrong", json={"From": "x", "Subject": "s", "TextBody": "b"})
    assert r.status_code == 401

def test_inbound_ignores_disallowed_sender(tmp_path, monkeypatch):
    c, base = _client(tmp_path, monkeypatch, {"type": "flight", "title": "X"})
    r = c.post("/inbound?key=s3cret", json={"From": "spammer@evil.com", "Subject": "s", "TextBody": "b"})
    assert r.status_code == 200 and r.json()["ok"] is True and r.json().get("ignored")
    assert list((base / "overlays").glob("*.json")) == []

def test_inbound_parses_and_writes_overlay(tmp_path, monkeypatch):
    claude = {"type": "flight", "title": "FI 418 · KEF → DUB", "start": "2026-08-29T09:40",
              "confirmation": "DT6I97", "provider": "Icelandair"}
    c, base = _client(tmp_path, monkeypatch, claude)
    payload = json.loads(open(os.path.join(os.path.dirname(__file__), "fixtures", "postmark_flight.json")).read())
    r = c.post("/inbound?key=s3cret", json=payload)
    assert r.status_code == 200 and r.json()["ok"] and r.json()["added"]
    ov = json.loads((base / "overlays" / "iceland__bookings.json").read_text())
    man = ov["payload"]["manual"]
    assert man[0]["confirmation"] == "DT6I97" and man[0]["trip"] == "iceland" and man[0]["source"] == "email"

def test_inbound_dedupes_second_forward(tmp_path, monkeypatch):
    claude = {"type": "flight", "title": "FI 418", "start": "2026-08-29T09:40", "confirmation": "DT6I97"}
    c, base = _client(tmp_path, monkeypatch, claude)
    payload = json.loads(open(os.path.join(os.path.dirname(__file__), "fixtures", "postmark_flight.json")).read())
    c.post("/inbound?key=s3cret", json=payload)
    r2 = c.post("/inbound?key=s3cret", json=payload)
    assert r2.json().get("deduped") is True
    ov = json.loads((base / "overlays" / "iceland__bookings.json").read_text())
    assert len(ov["payload"]["manual"]) == 1
```

- [ ] **Step 3: Run to verify it fails**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_inbound.py -q`
Expected: FAIL — `No module named 'inbound'`.

- [ ] **Step 4: Implement `server/inbound.py`**

Create `server/inbound.py`:
```python
"""Inbound-email booking capture: POST /inbound (mounted by app.py include_router).

An inbound-parse service (Postmark/Mailgun) POSTs the forwarded email here. We
verify a shared secret + sender allowlist, extract text (body + PDF), ask Claude
for structured fields, save PDFs, assign a trip, and merge into the per-trip
bookings overlay — the same store /save writes, so the dashboard shows it as-is.
"""
import os, json, base64, hashlib, urllib.request, urllib.parse
from pathlib import Path
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse
import parse

BASE = Path(os.environ.get("TRIPS_DIR", "/opt/trips-sync"))
OVERLAYS = BASE / "overlays"
FILES = BASE / "files"
PUBLIC_BASE = os.environ.get("PUBLIC_BASE", "https://markets-dashboard.duckdns.org/trips-sync")
SECRET = os.environ.get("INBOUND_SECRET", "")
ALLOW = [a.strip().lower() for a in os.environ.get("INBOUND_ALLOW", "").split(",") if a.strip()]
TRIPS_JSON = os.environ.get("TRIPS_JSON", "/opt/trips/app/data/trips.json")
API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
MODEL = os.environ.get("INBOUND_MODEL", "claude-haiku-4-5-20251001")
TG_TOKEN = os.environ.get("TELEGRAM_TOKEN", "")
TG_CHAT = os.environ.get("TELEGRAM_CHAT", "")

router = APIRouter()


def _normalize_payload(d: dict) -> dict:
    """Adapter for Postmark (Capitalized keys) / Mailgun (lower keys) → internal shape."""
    frm = (d.get("From") or d.get("from") or d.get("sender") or "")
    subject = d.get("Subject") or d.get("subject") or ""
    text = d.get("TextBody") or d.get("text") or d.get("body-plain") or ""
    html = d.get("HtmlBody") or d.get("html") or d.get("body-html") or ""
    atts = []
    for a in (d.get("Attachments") or d.get("attachments") or []):
        name = a.get("Name") or a.get("name") or "file.pdf"
        ctype = a.get("ContentType") or a.get("content-type") or ""
        content = a.get("Content") or a.get("content") or ""   # base64
        atts.append({"name": name, "ctype": ctype, "b64": content})
    # message id for idempotency
    mid = d.get("MessageID") or d.get("Message-Id") or d.get("message-id") or (subject + frm)
    return {"from": frm, "subject": subject, "text": text, "html": html,
            "attachments": atts, "message_id": mid}


def _sender_email(frm: str) -> str:
    m = frm.lower()
    if "<" in m and ">" in m:
        m = m[m.index("<") + 1:m.index(">")]
    return m.strip()


def _load_trips():
    try:
        return json.loads(Path(TRIPS_JSON).read_text())["trips"]
    except Exception:
        return []


def _save_pdf(name: str, raw: bytes) -> dict:
    import re, uuid
    fid = uuid.uuid4().hex[:12]
    fname = re.sub(r"[^A-Za-z0-9._-]", "_", name)[:80]
    (FILES / f"{fid}__{fname}").write_bytes(raw)
    return {"name": name, "url": f"{PUBLIC_BASE}/files/{fid}__{fname}", "fileId": fid}


def _claude_extract(text: str) -> dict:
    """Call Claude → dict of booking fields. Raises on failure (caller handles)."""
    from anthropic import Anthropic
    client = Anthropic(api_key=API_KEY)
    resp = client.messages.create(
        model=MODEL, max_tokens=1024, temperature=0,
        system=parse.EXTRACTION_SYSTEM,
        messages=[{"role": "user", "content": text}],
    )
    out = resp.content[0].text.strip()
    if out.startswith("```"):
        out = out.strip("`")
        out = out[out.find("{"):out.rfind("}") + 1]
    return json.loads(out)


def _telegram(msg: str):
    if not (TG_TOKEN and TG_CHAT):
        return
    try:
        data = urllib.parse.urlencode({"chat_id": TG_CHAT, "text": msg}).encode()
        urllib.request.urlopen(
            f"https://api.telegram.org/bot{TG_TOKEN}/sendMessage", data=data, timeout=8)
    except Exception:
        pass


def _ov_file(trip: str) -> Path:
    return OVERLAYS / f"{trip}__bookings.json"


@router.post("/inbound")
async def inbound(request: Request):
    if request.query_params.get("key", "") != SECRET or not SECRET:
        return JSONResponse({"ok": False, "error": "bad key"}, status_code=401)
    raw = await request.json()
    msg = _normalize_payload(raw)
    sender = _sender_email(msg["from"])
    if ALLOW and sender not in ALLOW:
        return {"ok": True, "ignored": True}

    # Extract text: stripped body + PDF text
    body = parse.strip_forward(msg["text"] or msg["html"])
    pdf_texts, pdf_attachment = [], None
    for a in msg["attachments"]:
        if "pdf" not in (a["ctype"].lower() + a["name"].lower()):
            continue
        try:
            data = base64.b64decode(a["b64"])
        except Exception:
            continue
        pdf_texts.append(parse.extract_pdf_text(data))
        if pdf_attachment is None:
            pdf_attachment = _save_pdf(a["name"], data)

    trips = _load_trips()

    # Parse with Claude; fall back to a minimal record on any failure.
    try:
        raw_fields = _claude_extract(
            parse.build_extraction_input(msg["subject"], body, pdf_texts))
        trip = parse.assign_trip(trips, raw_fields.get("start"))
        booking = parse.normalize_booking(raw_fields, msg["message_id"], trip)
    except Exception as e:
        trip = "unassigned"
        booking = parse.fallback_booking(msg["subject"], msg["message_id"], trip)
        _telegram(f"⚠️ inbound parse failed: {msg['subject'][:60]} ({e})")

    p = _ov_file(booking["trip"])
    overlay = json.loads(p.read_text())["payload"] if p.exists() else None
    overlay, added = parse.merge_into_overlay(overlay, booking, pdf_attachment)
    if added:
        from datetime import datetime, timezone
        p.write_text(json.dumps({"payload": overlay, "updated":
                                 datetime.now(timezone.utc).isoformat()}))
        _telegram(f"📩 imported {booking['title']} → {booking['trip']}")
    return {"ok": True, "added": added, "deduped": (not added), "trip": booking["trip"]}
```

- [ ] **Step 5: Run to verify the tests pass**

Run: `cd server && . .venv/bin/activate && python -m pytest tests/test_inbound.py -q`
Expected: 4 passed. (`datetime.now` is fine here — this is server code, not a workflow script.)

- [ ] **Step 6: Run the whole suite**

Run: `cd server && . .venv/bin/activate && python -m pytest -q`
Expected: all pass (Tasks 2-8).

- [ ] **Step 7: Commit**

```bash
git add server/inbound.py server/tests/test_inbound.py server/tests/fixtures/postmark_flight.json
git commit -m "feat(inbound): /inbound router — auth, parse, claude, overlay merge"
```

---

## Task 9: Mount the router in `app.py` (the one edit)

**Files:**
- Modify: `server/app.py` (append only)

- [ ] **Step 1: Append the include block at the very end of `server/app.py`**

Add these lines after the last line (`/placephoto` handler) — appending minimizes merge conflicts with the parallel session:
```python


# ---- Inbound-email booking capture (server/inbound.py) ----
import inbound  # noqa: E402
app.include_router(inbound.router)
```

- [ ] **Step 2: Verify the app imports and exposes /inbound**

Run:
```bash
cd ~/claude/alpine-loop-guide/server && . .venv/bin/activate
TRIPS_DIR=$(mktemp -d) INBOUND_SECRET=x python -c "import app; print([r.path for r in app.app.routes if getattr(r,'path','')=='/inbound'])"
```
Expected: prints `['/inbound']`.

- [ ] **Step 3: Commit**

```bash
git add server/app.py
git commit -m "feat(inbound): mount /inbound router in app"
```

---

## Task 10: Frontend copy — real address + drop stale Apps-Script help

**Files:**
- Modify: `js/bookings.js`

> Coordination: the parallel session also edits `js/bookings.js`. Before editing, run `git pull --rebase` (or re-read the file) so you edit the current version. The two edits below are localized to the intro template; reapply by matching the surrounding text if line numbers have shifted.

- [ ] **Step 1: Replace the intro paragraph + remove the `bkhelp` block**

In `js/bookings.js` `render()`, change the intro `<p>` to reference the inbound address (use a placeholder constant `INBOUND_ADDR` defined at top of file) and delete the `<details class="bkhelp">…</details>` block entirely.

At the top of `js/bookings.js` (after imports) add:
```javascript
const INBOUND_ADDR = 'YOUR_INBOUND_ADDRESS'; // set to the service address from INBOUND_SETUP.md
```
Replace the intro paragraph with:
```javascript
      <p>Everything booked for <b>${esc(state.trip.label)}</b>. <b>Forward any confirmation email to <code>${esc(INBOUND_ADDR)}</code></b> and it appears here within ~a minute (Claude parses it on the server). Or <b>drop a PDF / tap “📎 Attach PDF”</b> on any booking — saved on this device right away.</p>
```
Delete the entire `<details class="bkhelp"> … </details>` block (the Apps-Script setup text — now obsolete after the VPS migration), and remove the now-unused line in `wireFetch`'s catch that does `root.querySelector('.bkhelp').open = true;` (replace with just setting `#bkfetcherr` text).

- [ ] **Step 2: Verify syntax + smoke**

Run:
```bash
cd ~/claude/alpine-loop-guide && node --check js/bookings.js && node tools/test-core.mjs >/dev/null && echo core-ok
cd /tmp/trips-smoke && node smoke.mjs 2>&1 | tail -1
```
Expected: `core-ok` and `ALL RENDERS OK`.

- [ ] **Step 3: Commit**

```bash
cd ~/claude/alpine-loop-guide
git add js/bookings.js
git commit -m "feat(inbound): bookings intro shows inbound address; drop stale Apps-Script help"
```

---

## Task 11: Setup + deploy doc

**Files:**
- Create: `server/INBOUND_SETUP.md`

- [ ] **Step 1: Write the setup doc**

Create `server/INBOUND_SETUP.md`:
```markdown
# Inbound-email capture — setup & deploy

## 1. Box deps + env (root@46.62.169.80, key ~/.ssh/hetzner_budget_bot)
    cd /opt/trips-sync && git -C /opt/trips/app pull   # or rsync the repo's server/ dir
    /opt/trips-sync/.venv/bin/pip install -r requirements.txt   # adds anthropic, pypdf
Append to /opt/trips-sync/.env:
    INBOUND_SECRET=<long random hex>
    INBOUND_ALLOW=wchongyu2001@gmail.com,businessinfo0225@gmail.com
    ANTHROPIC_API_KEY=sk-ant-...
    TRIPS_JSON=/opt/trips/app/data/trips.json
    # optional: TELEGRAM_TOKEN=..., TELEGRAM_CHAT=...
Then: `systemctl restart trips-sync` (coordinate with the other session first).
Verify: `curl -s 'https://markets-dashboard.duckdns.org/trips-sync/inbound?key=wrong' -X POST -d '{}'` → 401.

## 2. Inbound-parse service
- Postmark: create a server → Inbound stream → set the **inbound webhook URL** to
  `https://markets-dashboard.duckdns.org/trips-sync/inbound?key=<INBOUND_SECRET>`.
  Use the generated `…@inbound.postmarkapp.com` address. (Mailgun Routes work the same;
  the /inbound adapter handles both payload shapes.)

## 3. Frontend
- Set `INBOUND_ADDR` in `js/bookings.js` to the service address, commit, push.

## 4. Gmail auto-forward (optional, default-on per spec)
- Gmail → Settings → Forwarding → add the inbound address (confirm the code Postmark receives — check the Inbound dashboard).
- Settings → Filters → Create: matches `subject:(booking OR confirmation OR reservation OR itinerary OR e-ticket)` → action **Forward to** the inbound address.
- Re-forwards are deduped server-side by confirmation # / message id.
```

- [ ] **Step 2: Commit**

```bash
git add server/INBOUND_SETUP.md
git commit -m "docs(inbound): setup + deploy checklist"
```

---

## Task 12: Final verification

- [ ] **Step 1: Full backend suite**

Run: `cd ~/claude/alpine-loop-guide/server && . .venv/bin/activate && python -m pytest -q`
Expected: all green (parse + inbound).

- [ ] **Step 2: Frontend regression**

Run: `cd ~/claude/alpine-loop-guide && node tools/test-core.mjs && for f in js/*.js; do node --check "$f"; done && cd /tmp/trips-smoke && node smoke.mjs 2>&1 | tail -1`
Expected: tests pass, all `node --check` clean, `ALL RENDERS OK`.

- [ ] **Step 3: Live endpoint smoke (after deploy)**

Run (or via ctx_execute fetch, since curl may be sandbox-blocked):
```bash
curl -s 'https://markets-dashboard.duckdns.org/trips-sync/inbound?key=wrong' -X POST -H 'Content-Type: application/json' -d '{}'
```
Expected: `{"ok":false,"error":"bad key"}` (401). Then forward one real confirmation and confirm it appears on the right trip with the PDF; forward again → no duplicate.

- [ ] **Step 4: Update memory**

Append to `~/.claude/projects/-Users-wangchongyu/memory/trips-v2-dashboard.md`: inbound-email capture shipped; `/inbound` endpoint; address + secret location; Gmail auto-forward filter; supersedes the planned phase-2 Gmail poller.

---

## Self-review notes (author)

- **Spec coverage:** transport adapter (Task 8 `_normalize_payload`), Claude parsing (Task 8 `_claude_extract` + Task 7 prompt), overlay landing + source:"email" (Tasks 5/6/8), trip assignment (Task 4), PDF save/attach (Task 8 `_save_pdf`), dedupe/idempotency (Task 6), never-half-record fallback (Tasks 5/8), allowlist+secret (Task 8), Telegram ping (Task 8), frontend copy + stale-help removal (Task 10), Gmail auto-forward (Task 11), coordination via append-only app.py edit (Task 9). All covered.
- **Type consistency:** `merge_into_overlay(overlay, booking, attachment) → (overlay, added)`; `normalize_booking(raw, msg_id, trip)`; `assign_trip(trips, start_iso)`; `_claude_extract(text)`; `_load_trips()` — names match across tasks and tests.
- **No placeholders** except the intentional `INBOUND_ADDR`/`INBOUND_SECRET`/`ANTHROPIC_API_KEY` values the user supplies at setup (documented in Task 11), and the Postmark-vs-Mailgun pick (adapter handles both).
