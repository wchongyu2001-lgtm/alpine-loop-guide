"""Inbound-email booking capture: POST /inbound (mounted by app.py include_router).

An inbound-parse service (Postmark/Mailgun) POSTs a forwarded confirmation email
here. We verify a shared secret + sender allowlist, extract text (body + PDF),
ask Claude for structured fields, save PDFs, assign a trip (triphub.assign_trip),
and merge into the per-trip bookings overlay — the same store /save writes, so the
dashboard shows it as-is. On any parse failure we fall back to triphub's heuristic
so nothing is lost.
"""
import os, json, base64, re, uuid, urllib.request, urllib.parse
from datetime import datetime, timezone
from pathlib import Path
from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

import triphub
import mailparse

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
TG_CHAT = os.environ.get("TELEGRAM_CHAT_ID", "") or os.environ.get("TELEGRAM_CHAT", "")

router = APIRouter()


def _normalize_payload(d: dict) -> dict:
    """Adapter: Postmark (Capitalized) / Mailgun (lower) → internal shape."""
    frm = d.get("From") or d.get("from") or d.get("sender") or ""
    subject = d.get("Subject") or d.get("subject") or ""
    text = d.get("TextBody") or d.get("text") or d.get("body-plain") or ""
    html = d.get("HtmlBody") or d.get("html") or d.get("body-html") or ""
    atts = []
    for a in (d.get("Attachments") or d.get("attachments") or []):
        atts.append({
            "name": a.get("Name") or a.get("name") or "file.pdf",
            "ctype": a.get("ContentType") or a.get("content-type") or "",
            "b64": a.get("Content") or a.get("content") or "",
        })
    mid = (d.get("MessageID") or d.get("Message-Id") or d.get("message-id")
           or (subject + "|" + frm))
    return {"from": frm, "subject": subject, "text": text, "html": html,
            "attachments": atts, "message_id": mid}


def _sender_email(frm: str) -> str:
    m = (frm or "").lower()
    if "<" in m and ">" in m:
        m = m[m.index("<") + 1:m.index(">")]
    return m.strip()


def _load_trips():
    try:
        return json.loads(Path(TRIPS_JSON).read_text())["trips"]
    except Exception:
        return []


def _save_pdf(name: str, raw: bytes) -> dict:
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
        system=mailparse.EXTRACTION_SYSTEM,
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
    if not SECRET or request.query_params.get("key", "") != SECRET:
        return JSONResponse({"ok": False, "error": "bad key"}, status_code=401)
    raw = await request.json()
    msg = _normalize_payload(raw)
    if ALLOW and _sender_email(msg["from"]) not in ALLOW:
        return {"ok": True, "ignored": True}

    body = mailparse.strip_forward(msg["text"] or msg["html"])
    pdf_texts, pdf_attachment = [], None
    for a in msg["attachments"]:
        if "pdf" not in (a["ctype"].lower() + a["name"].lower()):
            continue
        try:
            data = base64.b64decode(a["b64"])
        except Exception:
            continue
        pdf_texts.append(mailparse.extract_pdf_text(data))
        if pdf_attachment is None:
            pdf_attachment = _save_pdf(a["name"], data)

    trips = _load_trips()
    try:
        fields = _claude_extract(mailparse.build_extraction_input(msg["subject"], body, pdf_texts))
        trip = triphub.assign_trip(trips, fields.get("start"))
        booking = mailparse.normalize_booking(fields, msg["message_id"], trip)
    except Exception as e:
        booking = mailparse.fallback_booking(msg["subject"], body, msg["message_id"], trips)
        _telegram(f"⚠️ inbound fell back to heuristic: {msg['subject'][:60]} ({e})")

    p = _ov_file(booking["trip"])
    overlay = json.loads(p.read_text())["payload"] if p.exists() else None
    overlay, added = mailparse.merge_into_overlay(overlay, booking, pdf_attachment)
    if added:
        p.write_text(json.dumps({"payload": overlay,
                                 "updated": datetime.now(timezone.utc).isoformat()}))
        _telegram(f"📩 imported {booking['title']} → {booking['trip']}")
    return {"ok": True, "added": added, "deduped": (not added), "trip": booking["trip"]}
