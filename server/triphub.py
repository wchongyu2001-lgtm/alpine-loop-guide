"""Pure helpers for the Telegram/Wanderlog hub — no FastAPI, no filesystem, no
network. Safe to import in tests. IO + endpoints live in app.py.

Mirrors the relevant bits of js/core.js (parse_email_stub, assign_trip) so the
Telegram capture path classifies messages the same way the dashboard does.
"""
import re
from datetime import date, datetime
from math import radians, sin, cos, asin, sqrt

# ---------------- geo ----------------

def haversine_km(a, b):
    dlat = radians(b[0] - a[0]); dlng = radians(b[1] - a[1])
    h = sin(dlat / 2) ** 2 + cos(radians(a[0])) * cos(radians(b[0])) * sin(dlng / 2) ** 2
    return 6371 * 2 * asin(sqrt(h))

# ---------------- trip assignment (mirror js/core assignTrip) ----------------

def _d(iso):
    return date.fromisoformat(iso[:10])

def assign_trip(trips, start_iso):
    if not start_iso:
        return "unassigned"
    d = start_iso[:10]
    hits = [t for t in trips if t["start"] <= d <= t["end"]]
    if not hits:
        return "unassigned"
    hits.sort(key=lambda t: (_d(t["end"]) - _d(t["start"])).days)
    return hits[0]["id"]

# ---------------- email stub (mirror js/core parseEmailStub) ----------------

TYPE_RULES = [
    ("flight", re.compile(r"flight|airline|airways|boarding pass|e-?ticket .*air|wizz|ryanair|easyjet|emirates|icelandair", re.I)),
    ("train", re.compile(r"train|trenitalia|rail|öbb|sbb", re.I)),
    ("bus", re.compile(r"\bbus\b|flixbus", re.I)),
    ("car", re.compile(r"car rental|rental car|hertz|sixt|europcar|campervan|camper", re.I)),
    ("hotel", re.compile(r"hotel|hostel|apartment|booking\.com|airbnb|your stay|check-in.*(?:room|night)|room|night", re.I)),
    ("activity", re.compile(r"tour|admission|getyourguide|tiqets|museum|ticket", re.I)),
]
MONTHS = {m: i + 1 for i, m in enumerate(
    ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"])}
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

# ---------------- telegram command parse ----------------

def parse_cmd(text):
    t = (text or "").strip()
    if t.startswith("/"):
        parts = t[1:].split(None, 1)
        cmd = parts[0].lower().split("@")[0]  # strip @botname
        return cmd, (parts[1].strip() if len(parts) > 1 else "")
    return "", t

# ---------------- capture classification ----------------

def classify_capture(text, trips):
    """Decide where a free-text/forwarded message lands. Returns one of:
    {kind:'bucket', item:{title,source}} or
    {kind:'bookings', booking:{...}, trip} — plus a 'summary' reply line."""
    raw = (text or "").strip()
    low = raw.lower()
    if low.startswith("idea:") or low.startswith("bucket:"):
        title = raw.split(":", 1)[1].strip()
        return {"kind": "bucket", "item": {"title": title, "source": "telegram"},
                "summary": f"✓ bucket-listed: {title}"}
    stub = parse_email_stub(raw, raw)
    if stub["type"] != "other" and (stub["start"] or stub["confirmation"]):
        trip = assign_trip(trips, stub["start"])
        title = (stub["title"] or raw)[:80]
        return {"kind": "bookings",
                "booking": {"type": stub["type"], "title": title, "start": stub["start"],
                            "confirmation": stub["confirmation"], "trip": trip, "source": "telegram"},
                "trip": trip, "summary": f"✓ {stub['type']}: {title}" + (f" → {trip}" if trip != 'unassigned' else " → unassigned")}
    return {"kind": "bucket", "item": {"title": raw, "source": "telegram"},
            "summary": f"✓ noted: {raw[:50]}"}

# ---------------- day decoration (mirror js/data decorateDays) ----------------

def day_iso(start, i):
    # start = [year, monthIndex0, day] (JS Date convention); Python months are 1-based.
    from datetime import date, timedelta
    return (date(start[0], start[1] + 1, start[2]) + timedelta(days=i)).isoformat()


def decorate_days(td, ov_itin):
    meta = td.get("meta", {}) or {}
    presets = td.get("presets")
    metapresets = meta.get("presets")
    preset_key = (ov_itin or {}).get("preset") or (metapresets[0]["key"] if metapresets else None)
    days = td.get("days", []) or []
    if presets and preset_key and presets.get(preset_key):
        dmap = {d["id"]: d for d in days}
        days = [dmap[i] for i in presets[preset_key] if i in dmap]
    start = meta.get("start")
    out = []
    for i, d in enumerate(days):
        dd = dict(d)
        dd["_date"] = d.get("iso") or (day_iso(start, i) if start else None)
        dd["_n"] = i + 1
        out.append(dd)
    return out


def wmo_icon(c):
    if c == 0:
        return "☀️"
    if c <= 3:
        return "⛅"
    if c <= 48:
        return "🌫️"
    if c <= 67:
        return "🌧️"
    if c <= 77:
        return "❄️"
    if c <= 82:
        return "🌧️"
    if c <= 86:
        return "❄️"
    return "⛈️"

# ---------------- daily briefing ----------------

def active_trip(trips, today):
    """Trip containing today, else the soonest upcoming, else the last one."""
    inside = [t for t in trips if t["start"] <= today <= t["end"]]
    if inside:
        inside.sort(key=lambda t: (_d(t["end"]) - _d(t["start"])).days)
        return inside[0]
    upcoming = sorted([t for t in trips if t["start"] > today], key=lambda t: t["start"])
    if upcoming:
        return upcoming[0]
    return trips[-1] if trips else None


def _days_between(a, b):
    return (_d(b) - _d(a)).days


def compose_brief(trips, today, trip, days, plans_overlay, bookings, weather=None):
    """Plain-text Telegram briefing. `days` = trip day objects (with _date/short/
    plan), `plans_overlay` = overlay dayPlans dict, `bookings` = list for the trip,
    `weather` = optional {tmax,tmin,icon,precip} for today's location."""
    if not trip:
        return "No trips configured."
    lines = []
    future = trip["start"] > today
    nxt = next((b for b in sorted(bookings, key=lambda b: str(b.get("start") or "")) if str(b.get("start") or "")[:10] >= today), None)
    if future:
        lines.append(f"🧭 {trip['label']} starts in {_days_between(today, trip['start'])} days.")
        if nxt:
            lines.append(f"🎫 Next: {nxt['title']} in {_days_between(today, str(nxt['start'])[:10])} days.")
        return "\n".join(lines)
    # in-trip: find today's day
    day = next((d for d in days if d.get("_date") == today), None)
    head = f"📅 {trip['label']}"
    if day:
        head += f" · Day {day.get('_n','?')}: {day.get('short','')}"
    if weather:
        head += f"\n{weather.get('icon','')} {round(weather['tmax'])}°/{round(weather['tmin'])}°" + (f" · {weather['precip']}% rain" if weather.get('precip') else "")
    lines.append(head)
    if day:
        plan = (plans_overlay or {}).get(day["id"]) or day.get("plan") or []
        prev = None
        for p in plan:
            t = (" " + p["time"]) if p.get("time") else ""
            leg = ""
            if prev and prev.get("ll") and p.get("ll"):
                km = round(haversine_km(prev["ll"], p["ll"]) * 1.3, 1)
                leg = f"  (+{km} km)"
            lines.append(f"• {p.get('n','')}{t}{leg}")
            prev = p
        if not plan:
            lines.append("• (no stops planned yet)")
    if nxt and str(nxt["start"])[:10] != today:
        lines.append(f"🎫 Next booking: {nxt['title']} in {_days_between(today, str(nxt['start'])[:10])} days.")
    return "\n".join(lines)

# ---------------- Wanderlog share-link extraction ----------------

_NEXT = re.compile(r'<script id="__NEXT_DATA__"[^>]*>(.*?)</script>', re.S)
_STATE = [re.compile(r'window\.__APOLLO_STATE__\s*=\s*(\{.*?\})\s*;', re.S),
          re.compile(r'window\.__INITIAL_STATE__\s*=\s*(\{.*?\})\s*;', re.S)]


def _norm_type(t):
    t = str(t or "").lower()
    for k in ("flight", "hotel", "lodging", "train", "bus", "car", "rental", "activity"):
        if k in t:
            return {"lodging": "hotel", "rental": "car"}.get(k, k)
    return "other"


def _first_date(o):
    for k in ("startDate", "checkInDate", "departureTime", "startTime", "date"):
        v = o.get(k)
        if v:
            return str(v)[:10]
    return None


def _walk(obj, places, reservations, seen):
    import json as _json
    if isinstance(obj, dict):
        name = obj.get("name") or obj.get("title") or obj.get("placeName")
        lat = obj.get("latitude", obj.get("lat"))
        lng = obj.get("longitude", obj.get("lng"))
        if isinstance(name, str) and name.strip() and isinstance(lat, (int, float)) and isinstance(lng, (int, float)):
            key = name.strip().lower()
            if key not in seen:
                seen.add(key)
                places.append({"name": name.strip(), "lat": lat, "lng": lng,
                               "note": str(obj.get("note") or obj.get("description") or "")[:200]})
        if isinstance(name, str) and name.strip() and (_first_date(obj) and (obj.get("reservationType") or obj.get("type") or obj.get("confirmationNumber"))):
            reservations.append({"title": name.strip(), "type": _norm_type(obj.get("reservationType") or obj.get("type")),
                                 "start": _first_date(obj),
                                 "confirmation": obj.get("confirmationNumber") or obj.get("confirmation")})
        for v in obj.values():
            _walk(v, places, reservations, seen)
    elif isinstance(obj, list):
        for v in obj:
            _walk(v, places, reservations, seen)


def extract_trip(html):
    """Best-effort: pull embedded trip JSON from a public Wanderlog page and
    recursively collect place-shaped + reservation-shaped nodes. Returns
    {places, reservations}; empty on parse failure (caller reports cleanly)."""
    import json
    blobs = []
    m = _NEXT.search(html or "")
    if m:
        blobs.append(m.group(1))
    for rx in _STATE:
        for mm in rx.finditer(html or ""):
            blobs.append(mm.group(1))
    places, reservations, seen = [], [], set()
    for b in blobs:
        try:
            _walk(json.loads(b), places, reservations, seen)
        except (ValueError, RecursionError):
            continue
    return {"places": places, "reservations": reservations}
