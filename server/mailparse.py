"""Email-specific pure helpers for inbound booking capture. No FastAPI, no network.

Trip assignment + the heuristic email classifier are REUSED from triphub.py
(the parallel session's hub); this module only adds the email/PDF/Claude/overlay
pieces that triphub doesn't have.
"""
import re, io, hashlib

import triphub  # reuse assign_trip + parse_email_stub

_FWD_LINE = re.compile(r"^-+\s*Forwarded message\s*-+\s*$", re.I)
_HDR = re.compile(r"^(From|Sent|Date|To|Cc|Subject|Reply-To):", re.I)
_SUBJ_PREFIX = re.compile(r"^(\s*(fwd|fw|re)\s*:)+\s*", re.I)

TYPES = ["flight", "hotel", "train", "bus", "car", "activity", "other"]

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


def strip_forward(text: str) -> str:
    """Drop 'Forwarded message' banners + leading mail headers, unquote '> ' lines."""
    out = []
    for line in (text or "").splitlines():
        s = line.strip()
        if _FWD_LINE.match(s) or _HDR.match(s):
            continue
        out.append(re.sub(r"^\s*>+\s?", "", line))
    return "\n".join(out).strip()


def extract_pdf_text(data: bytes) -> str:
    """Best-effort plain text from a PDF; '' on any failure."""
    try:
        from pypdf import PdfReader
        reader = PdfReader(io.BytesIO(data))
        return "\n".join((page.extract_text() or "") for page in reader.pages).strip()
    except Exception:
        return ""


def build_extraction_input(subject: str, body_text: str, pdf_texts) -> str:
    parts = [f"SUBJECT: {subject or ''}", "", "EMAIL BODY:", body_text or ""]
    for i, t in enumerate(pdf_texts or []):
        if t:
            parts += ["", f"PDF ATTACHMENT {i + 1}:", t[:6000]]
    return "\n".join(parts)


def _booking_id(msg_id: str) -> str:
    return "em-" + hashlib.sha1((msg_id or "").encode()).hexdigest()[:10]


def normalize_booking(raw: dict, msg_id: str, trip: str) -> dict:
    """Map a raw Claude-extracted dict into the dashboard's booking record shape."""
    t = str(raw.get("type", "")).strip().lower()
    return {
        "id": _booking_id(msg_id),
        "trip": trip,
        "type": t if t in TYPES else "other",
        "title": (raw.get("title") or "Booking").strip(),
        "provider": raw.get("provider") or None,
        "start": raw.get("start") or None,
        "end": raw.get("end") or None,
        "location": raw.get("location") or None,
        "price": raw.get("price") or None,
        "confirmation": (raw.get("confirmation") or None),
        "pax": raw.get("pax") or None,
        "notes": (raw.get("notes") or None),
        "gmail_link": None,
        "source": "email",
    }


def fallback_booking(subject: str, body: str, msg_id: str, trips) -> dict:
    """No-Claude fallback: use triphub's heuristic so we still capture type/date/conf."""
    stub = triphub.parse_email_stub(subject, body)
    trip = triphub.assign_trip(trips, stub.get("start"))
    b = normalize_booking(stub, msg_id, trip)
    b["notes"] = "auto-parsed by heuristic (Claude unavailable) — verify against the PDF"
    return b


def merge_into_overlay(overlay, booking, attachment):
    """Append booking to overlay.manual, deduping by id or confirmation (case-insensitive).
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
