#!/usr/bin/env python3
"""Trips bookings importer (no-AI, stdlib only) — runs 24/7 on the Hetzner box.

Reads confirmation emails from Gmail over IMAP (Gmail X-GM-RAW search), parses them
with the same heuristics as js/core.js parseEmailStub, assigns each to a trip, and
writes new bookings to the trips-sync backend as per-trip `bookings` overlays
(payload {manual:[...]}). No git push, no API key — only a Gmail app password.

Config via /opt/trips-pipeline/.env (systemd EnvironmentFile):
  GMAIL_USER, GMAIL_APP_PASSWORD, TRIPS_TOKEN, SYNC_BASE, MIRROR_BASE
If GMAIL_APP_PASSWORD is empty/placeholder the run is a clean no-op (awaiting setup).
"""
import os, re, json, imaplib, email, urllib.request
from email.header import decode_header, make_header
from datetime import datetime, timedelta, timezone

GMAIL_USER = os.environ.get("GMAIL_USER", "")
GMAIL_PASS = os.environ.get("GMAIL_APP_PASSWORD", "")
TOKEN = os.environ.get("TRIPS_TOKEN", "")
SYNC = os.environ.get("SYNC_BASE", "https://markets-dashboard.duckdns.org/trips-sync")
MIRROR = os.environ.get("MIRROR_BASE", "https://markets-dashboard.duckdns.org/trips")
STATE = "/opt/trips-pipeline/state.json"

# ── parsing, ported 1:1 from js/core.js parseEmailStub ──────────────────────
TYPE_RULES = [
    ("flight", re.compile(r"flight|airline|airways|boarding pass|e-?ticket .*air|wizz|ryanair|easyjet|emirates|icelandair", re.I)),
    ("train", re.compile(r"train|trenitalia|rail|öbb|sbb", re.I)),
    ("bus", re.compile(r"\bbus\b|flixbus", re.I)),
    ("car", re.compile(r"car rental|rental car|hertz|sixt|europcar|campervan|camper", re.I)),
    ("hotel", re.compile(r"hotel|hostel|apartment|booking\.com|airbnb|your stay|check-in.*(?:room|night)|room|night", re.I)),
    ("activity", re.compile(r"tour|admission|getyourguide|tiqets|museum|ticket", re.I)),
]
MONTHS = dict(jan=1, feb=2, mar=3, apr=4, may=5, jun=6, jul=7, aug=8, sep=9, oct=10, nov=11, dec=12)
_LAB = re.compile(r"(?:confirmation|booking|reservation|reference|pnr|conf)(?:\s+(?:number|code|id))?[:#\s-]{0,4}(.{0,24})", re.I)
_TOK = re.compile(r"\b([A-Z0-9][A-Z0-9-]{4,13})\b")
_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})\b")
_TXT = re.compile(r"\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b", re.I)


def parse_email_stub(subject, body):
    title = re.sub(r"^(\s*(fwd|fw|re)\s*:)+\s*", "", str(subject or ""), flags=re.I).strip()
    allt = title + "\n" + str(body or "")
    typ = "other"
    for t, rx in TYPE_RULES:
        if rx.search(allt):
            typ = t
            break
    confirmation = None
    for m in _LAB.finditer(allt):
        tok = _TOK.search(m.group(1))
        if tok:
            confirmation = tok.group(1)
            break
    start = None
    iso = _ISO.search(allt)
    txt = _TXT.search(allt)
    if iso and (not txt or iso.start() < txt.start()):
        start = iso.group(0)
    elif txt:
        start = f"{txt.group(3)}-{MONTHS[txt.group(2).lower()[:3]]:02d}-{int(txt.group(1)):02d}"
    return {"type": typ, "title": title, "confirmation": confirmation, "start": start}


def assign_trip(trips, start_iso):
    if not start_iso:
        return "unassigned"
    d = start_iso[:10]
    hits = [t for t in trips if t["start"] <= d <= t["end"]]
    if not hits:
        return "unassigned"
    hits.sort(key=lambda t: (datetime.fromisoformat(t["end"]) - datetime.fromisoformat(t["start"])))
    return hits[0]["id"]


# ── small HTTP helpers (stdlib) ─────────────────────────────────────────────
def get_json(url):
    with urllib.request.urlopen(url, timeout=20) as r:
        return json.loads(r.read().decode())


def post_json(path, obj):
    req = urllib.request.Request(
        f"{SYNC}{path}", data=json.dumps(obj).encode(),
        headers={"Content-Type": "application/json", "X-Trips-Token": TOKEN}, method="POST")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read().decode())


def body_text(msg):
    """Best-effort plain-text body from an email.message.Message."""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() == "text/plain":
                try:
                    return part.get_payload(decode=True).decode(part.get_content_charset() or "utf-8", "replace")
                except Exception:
                    pass
        return ""
    try:
        return msg.get_payload(decode=True).decode(msg.get_content_charset() or "utf-8", "replace")
    except Exception:
        return str(msg.get_payload())


# ── main ────────────────────────────────────────────────────────────────────
def load_state():
    try:
        return json.load(open(STATE))
    except Exception:
        return {"last_sync": (datetime.now(timezone.utc) - timedelta(days=14)).date().isoformat()}


def main():
    if not GMAIL_PASS or GMAIL_PASS in ("CHANGEME", "PASTE_APP_PASSWORD_HERE"):
        print("awaiting GMAIL_APP_PASSWORD — no-op (set it in /opt/trips-pipeline/.env)")
        return

    state = load_state()
    since = datetime.fromisoformat(state["last_sync"]).date()
    q = (f"after:{since:%Y/%m/%d} (confirmation OR booking OR reservation OR itinerary) "
         "(flight OR hotel OR train OR ferry OR \"car rental\" OR campervan OR tour)")

    M = imaplib.IMAP4_SSL("imap.gmail.com")
    M.login(GMAIL_USER, GMAIL_PASS)
    M.select('"[Gmail]/All Mail"')
    typ, data = M.uid("SEARCH", "X-GM-RAW", q)
    uids = (data[0].split() if data and data[0] else [])
    print(f"search since {since}: {len(uids)} candidate messages")

    # existing confirmations/ids to dedup against (base file + per-trip overlays)
    try:
        base = get_json(f"{MIRROR}/data/bookings.json").get("bookings", [])
    except Exception:
        base = []
    trips = get_json(f"{MIRROR}/data/trips.json")["trips"]
    seen_conf = {b.get("confirmation") for b in base if b.get("confirmation")}
    seen_id = {b.get("id") for b in base}

    overlays = {}  # trip -> {manual, overrides}
    for tid in [t["id"] for t in trips] + ["unassigned"]:
        d = get_json(f"{SYNC}/load?trip={tid}&kind=bookings")
        ov = d.get("payload") or {"manual": [], "overrides": {}}
        ov.setdefault("manual", []); ov.setdefault("overrides", {})
        overlays[tid] = ov
        for b in ov["manual"]:
            if b.get("confirmation"): seen_conf.add(b["confirmation"])
            seen_id.add(b.get("id"))

    added = 0
    for uid in uids:
        u = uid.decode()
        bid = f"gm-{u}"
        if bid in seen_id:
            continue
        typ, msgdata = M.uid("FETCH", u, "(RFC822)")
        if not msgdata or not msgdata[0]:
            continue
        msg = email.message_from_bytes(msgdata[0][1])
        subject = str(make_header(decode_header(msg.get("Subject", ""))))
        stub = parse_email_stub(subject, body_text(msg))
        if not stub["start"]:                 # need at least a date to place it
            continue
        if stub["confirmation"] and stub["confirmation"] in seen_conf:
            continue
        trip = assign_trip(trips, stub["start"])
        rec = {
            "id": bid, "trip": trip, "type": stub["type"], "title": stub["title"][:80],
            "provider": "", "start": stub["start"], "end": None,
            "location": {"name": "", "lat": None, "lng": None},
            "price": {"amount": 0, "currency": "EUR"},
            "confirmation": stub["confirmation"], "pax": [],
            "gmail_link": f"https://mail.google.com/mail/u/0/#all/{u}", "source": "pipeline",
        }
        overlays[trip]["manual"].append(rec)
        seen_id.add(bid)
        if stub["confirmation"]: seen_conf.add(stub["confirmation"])
        added += 1

    for tid, ov in overlays.items():
        # only push trips we actually touched
        if any(b.get("source") == "pipeline" for b in ov["manual"]):
            post_json("/save", {"trip": tid, "kind": "bookings", "payload": ov,
                                "updated": datetime.now(timezone.utc).isoformat()})

    json.dump({"last_sync": datetime.now(timezone.utc).date().isoformat()}, open(STATE, "w"))
    M.logout()
    print(f"imported {added} new booking(s)")


if __name__ == "__main__":
    main()
