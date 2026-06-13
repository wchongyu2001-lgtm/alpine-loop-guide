"""Trips sync backend — drop-in replacement for the Apps Script /exec endpoint.

Stores per-(trip, kind) overlay edits as JSON files and booking attachments as
plain files on disk. Mirrors the existing worker-intake FastAPI+uvicorn+systemd
pattern on the Hetzner box. Reverse-proxied by nginx under /trips-sync/ with TLS.

Frontend protocol (js/sync.js):
  GET  /load?trip=&kind=        -> {ok, payload, updated}
  POST /save     {trip,kind,payload,updated}  -> {ok}
  POST /upload   {filename,mimeType,dataB64}  -> {ok, fileId, url}
  GET  /fetchmail                              -> {ok, messages}  (phase 2)
  GET  /health
"""
import os, re, json, base64, uuid, time, datetime, urllib.request, urllib.parse
from pathlib import Path
from fastapi import FastAPI, Request, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

import triphub as TH

BASE = Path(os.environ.get("TRIPS_DIR", "/opt/trips-sync"))
OVERLAYS = BASE / "overlays"
FILES = BASE / "files"
OVERLAYS.mkdir(parents=True, exist_ok=True)
FILES.mkdir(parents=True, exist_ok=True)

TOKEN = os.environ.get("TRIPS_TOKEN", "")
PUBLIC_BASE = os.environ.get("PUBLIC_BASE", "https://markets-dashboard.duckdns.org/trips-sync")
ALLOWED = [
    "https://wchongyu2001-lgtm.github.io",      # GitHub Pages copy
    "https://markets-dashboard.duckdns.org",    # VPS-hosted mirror (same-origin)
]

app = FastAPI(title="trips-sync")
app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED,
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["*"],
)

SAFE = re.compile(r"^[A-Za-z0-9_-]+$")


def ov_path(trip: str, kind: str) -> Path:
    if not (trip and kind and SAFE.match(trip) and SAFE.match(kind)):
        raise HTTPException(400, "bad trip/kind")
    return OVERLAYS / f"{trip}__{kind}.json"


def require_token(tok: str):
    # Soft guard: the token also ships in the public client, so this only deters
    # anonymous scanners — real protection is the CORS origin allow-list + the
    # data already being public by the owner's accepted-risk choice.
    if TOKEN and tok != TOKEN:
        raise HTTPException(401, "bad token")


@app.get("/health")
def health():
    return {"ok": True, "service": "trips-sync"}


@app.get("/load")
def load(trip: str, kind: str):
    p = ov_path(trip, kind)
    if p.exists():
        rec = json.loads(p.read_text())
        return {"ok": True, "payload": rec.get("payload"), "updated": rec.get("updated")}
    return {"ok": True, "payload": None}


@app.post("/save")
async def save(request: Request, x_trips_token: str = Header(default="")):
    require_token(x_trips_token)
    msg = await request.json()
    p = ov_path(msg.get("trip"), msg.get("kind"))
    p.write_text(json.dumps({"payload": msg.get("payload"), "updated": msg.get("updated")}))
    return {"ok": True}


@app.post("/upload")
async def upload(request: Request, x_trips_token: str = Header(default="")):
    require_token(x_trips_token)
    msg = await request.json()
    raw = base64.b64decode(msg.get("dataB64", ""))
    if len(raw) > 15 * 1024 * 1024:
        raise HTTPException(413, "file too large")
    fid = uuid.uuid4().hex[:12]
    fname = re.sub(r"[^A-Za-z0-9._-]", "_", msg.get("filename", "file"))[:80]
    (FILES / f"{fid}__{fname}").write_bytes(raw)
    return {"ok": True, "fileId": fid, "url": f"{PUBLIC_BASE}/files/{fid}__{fname}"}


@app.get("/fetchmail")
def fetchmail():
    # Wired in phase 2 once the Gmail pipeline runs on the box. Frontend shows
    # this message gracefully until then.
    return {"ok": False, "error": "On-demand Gmail fetch moves to the VPS pipeline (phase 2)."}


# ---- Google Places proxy (key stays server-side in PLACES_KEY env) ----
# Enrichment for itinerary place cards: rating, reviews, photo, hours, category.
# The client (js/places.js) caches results 30d and degrades to free sources when
# PLACES_KEY is unset, so this is optional infra — the app works without it.
_PLACE_CACHE = {}  # ck -> (expires_epoch, dict)


def _get_json(url):
    with urllib.request.urlopen(url, timeout=10) as r:
        return json.loads(r.read().decode())


@app.get("/place")
def place(q: str, lat: str = "", lng: str = ""):
    key = os.environ.get("PLACES_KEY", "")
    if not key:
        return {"ok": False, "reason": "no-key"}
    ck = f"{q}@{lat},{lng}"
    hit = _PLACE_CACHE.get(ck)
    if hit and hit[0] > time.time():
        return hit[1]
    find = ("https://maps.googleapis.com/maps/api/place/findplacefromtext/json"
            f"?input={urllib.parse.quote(q)}&inputtype=textquery&fields=place_id&key={key}"
            + (f"&locationbias=point:{lat},{lng}" if lat and lng else ""))
    try:
        cand = (_get_json(find).get("candidates") or [])
    except Exception:
        return {"ok": False, "reason": "upstream-error"}
    if not cand:
        return {"ok": False, "reason": "not-found"}
    pid = cand[0]["place_id"]
    det = ("https://maps.googleapis.com/maps/api/place/details/json"
           f"?place_id={pid}&fields=rating,user_ratings_total,photos,types,price_level,"
           f"opening_hours,website,formatted_phone_number,url&key={key}")
    d = (_get_json(det).get("result") or {})
    oh = d.get("opening_hours") or {}
    wt = oh.get("weekday_text") or []
    out = {
        "ok": True, "place_id": pid, "rating": d.get("rating"),
        "user_ratings_total": d.get("user_ratings_total"),
        "photoRef": (d.get("photos") or [{}])[0].get("photo_reference"),
        "types": d.get("types"), "price_level": d.get("price_level"),
        # Google weekday_text is Monday-first; Python tm_wday is Monday=0 too.
        "opening_hours": {"open_now": oh.get("open_now"), "today": wt[time.localtime().tm_wday] if wt else None} if oh else None,
        "website": d.get("website"), "formatted_phone_number": d.get("formatted_phone_number"),
        "gmapsUrl": d.get("url"),
    }
    _PLACE_CACHE[ck] = (time.time() + 21600, out)
    return out


@app.get("/placephoto")
def placephoto(ref: str, w: int = 400):
    key = os.environ.get("PLACES_KEY", "")
    if not key:
        raise HTTPException(404, "no-key")
    url = ("https://maps.googleapis.com/maps/api/place/photo"
           f"?maxwidth={int(w)}&photo_reference={urllib.parse.quote(ref)}&key={key}")
    with urllib.request.urlopen(url, timeout=10) as r:
        data, ctype = r.read(), r.headers.get("Content-Type", "image/jpeg")
    return Response(content=data, media_type=ctype, headers={"Cache-Control": "public, max-age=2592000"})


# ============================================================================
# Three-way hub. Inbound Telegram commands (/trip /wl /place) are handled by the
# EXISTING budget_bot (python-telegram-bot, long-polling on Render) which calls
# /trip-brief, /capture, /wl-import here — a bot's incoming updates can only go to
# one consumer, so we don't run a second webhook. Outbound: the daily briefing is
# pushed from here via the SAME bot token (sending isn't exclusive).
# Secrets from env only: TELEGRAM_BOT_TOKEN (same bot as budget_bot),
# TELEGRAM_CHAT_ID, TG_WEBHOOK_SECRET (guards /tg/brief). Trip data is read from
# the dashboard mirror clone (TRIPS_APP_DIR). Everything degrades politely.
# ============================================================================
TELEGRAM_TOKEN = os.environ.get("TELEGRAM_BOT_TOKEN") or os.environ.get("TELEGRAM_TOKEN", "")
TELEGRAM_CHAT_ID = os.environ.get("TELEGRAM_CHAT_ID", "")
TG_SECRET = os.environ.get("TG_WEBHOOK_SECRET", "")
TRIPS_APP_DIR = Path(os.environ.get("TRIPS_APP_DIR", "/opt/trips/app"))


def _now():
    return datetime.datetime.utcnow().isoformat() + "Z"


def _today():
    return datetime.date.today().isoformat()


def _read_json(p, default=None):
    try:
        return json.loads(Path(p).read_text())
    except Exception:
        return default


def load_trips():
    return (_read_json(TRIPS_APP_DIR / "data" / "trips.json", {}) or {}).get("trips", [])


def load_bookings():
    return (_read_json(TRIPS_APP_DIR / "data" / "bookings.json", {}) or {}).get("bookings", [])


def overlay_read(trip, kind):
    p = ov_path(trip, kind)
    return json.loads(p.read_text()).get("payload") if p.exists() else None


def overlay_write(trip, kind, payload):
    ov_path(trip, kind).write_text(json.dumps({"payload": payload, "updated": _now()}))


def tg_send(text, chat_id=None):
    cid = chat_id or TELEGRAM_CHAT_ID
    if not (TELEGRAM_TOKEN and cid):
        return False
    try:
        data = urllib.parse.urlencode({"chat_id": cid, "text": text}).encode()
        urllib.request.urlopen(f"https://api.telegram.org/bot{TELEGRAM_TOKEN}/sendMessage", data=data, timeout=10)
        return True
    except Exception:
        return False


def current_trip_id():
    trips = load_trips()
    t = TH.active_trip(trips, _today())
    return t["id"] if t else (trips[0]["id"] if trips else "alpine")


def fetch_weather(ll, iso):
    try:
        j = _get_json(f"https://api.open-meteo.com/v1/forecast?latitude={ll[0]}&longitude={ll[1]}"
                      "&daily=weather_code,temperature_2m_max,temperature_2m_min,"
                      "precipitation_probability_max&timezone=auto&forecast_days=16")
        t = j["daily"]["time"]
        if iso in t:
            i = t.index(iso)
            return {"icon": TH.wmo_icon(j["daily"]["weather_code"][i]),
                    "tmax": j["daily"]["temperature_2m_max"][i],
                    "tmin": j["daily"]["temperature_2m_min"][i],
                    "precip": j["daily"]["precipitation_probability_max"][i]}
    except Exception:
        pass
    return None


def build_brief():
    trips = load_trips()
    today = _today()
    trip = TH.active_trip(trips, today)
    if not trip:
        return "No trips configured."
    td = _read_json(TRIPS_APP_DIR / "data" / trip["file"], {}) or {}
    ov_itin = overlay_read(trip["id"], "itinerary") or {}
    days = TH.decorate_days(td, ov_itin)
    bookings = [b for b in load_bookings() if b.get("trip") == trip["id"]]
    bookings += (overlay_read(trip["id"], "bookings") or {}).get("manual", [])
    day = next((d for d in days if d.get("_date") == today), None)
    weather = fetch_weather(day["ll"], today) if day and day.get("ll") else None
    return TH.compose_brief(trips, today, trip, days, ov_itin.get("dayPlans"), bookings, weather)


def capture_and_store(text):
    trips = load_trips()
    c = TH.classify_capture(text, trips)
    if c["kind"] == "bucket":
        trip = current_trip_id()
        ov = overlay_read(trip, "bucket") or {"items": []}
        items = ov.get("items", [])
        items.append({"id": "tg-" + uuid.uuid4().hex[:8], "title": c["item"]["title"], "source": "telegram"})
        overlay_write(trip, "bucket", {"items": items})
    else:
        target = c["trip"] if c["trip"] != "unassigned" else current_trip_id()
        ov = overlay_read(target, "bookings") or {}
        bk = dict(c["booking"]); bk["id"] = "tg-" + uuid.uuid4().hex[:8]
        ov["manual"] = (ov.get("manual") or []) + [bk]
        overlay_write(target, "bookings", ov)
    return c["summary"]


def wl_import(url, trip):
    if not str(url).startswith("http"):
        return {"ok": False, "summary": "Give a Wanderlog share URL (https://wanderlog.com/view/…)."}
    try:
        req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (TravelCompanion)"})
        html = urllib.request.urlopen(req, timeout=15).read().decode("utf-8", "replace")
    except Exception as e:
        return {"ok": False, "summary": f"Couldn't fetch that Wanderlog page ({e})."}
    ex = TH.extract_trip(html)
    if not ex["places"] and not ex["reservations"]:
        return {"ok": False, "summary": "No trip data found there — is the Wanderlog trip public?"}
    # places → bucket overlay
    bov = overlay_read(trip, "bucket") or {"items": []}
    items = bov.get("items", [])
    have = {str(i.get("title", "")).lower() for i in items}
    addp = 0
    for p in ex["places"]:
        if p["name"].lower() not in have:
            items.append({"id": "wl-" + uuid.uuid4().hex[:8], "title": p["name"],
                          "area": p.get("note", ""), "source": "wanderlog"})
            have.add(p["name"].lower()); addp += 1
    overlay_write(trip, "bucket", {"items": items})
    # reservations → bookings.manual overlay (into the chosen trip)
    bkov = overlay_read(trip, "bookings") or {}
    manual = bkov.get("manual", [])
    havc = {str(b.get("confirmation") or b.get("title", "")).lower() for b in manual}
    addr = 0
    for r in ex["reservations"]:
        kc = str(r.get("confirmation") or r.get("title", "")).lower()
        if kc in havc:
            continue
        manual.append({"id": "wl-" + uuid.uuid4().hex[:8], "type": r["type"], "title": r["title"],
                       "start": r.get("start"), "confirmation": r.get("confirmation"),
                       "trip": trip, "source": "wanderlog"})
        havc.add(kc); addr += 1
    bkov["manual"] = manual
    overlay_write(trip, "bookings", bkov)
    summary = f"✓ Wanderlog import → {trip}: +{addp} places, +{addr} reservations"
    tg_send(summary)
    return {"ok": True, "places": addp, "reservations": addr, "summary": summary}


# ---- Endpoints the budget_bot calls (token-guarded) ----

@app.get("/trip-brief")
def trip_brief(x_trips_token: str = Header(default="")):
    require_token(x_trips_token)
    return {"ok": True, "text": build_brief()}


@app.post("/capture")
async def capture_endpoint(request: Request, x_trips_token: str = Header(default="")):
    require_token(x_trips_token)
    body = await request.json()
    text = (body.get("text") or "").strip()
    if not text:
        return {"ok": False, "summary": "Nothing to capture."}
    return {"ok": True, "summary": capture_and_store(text)}


@app.post("/wl-import")
async def wl_import_endpoint(request: Request, x_trips_token: str = Header(default="")):
    require_token(x_trips_token)
    body = await request.json()
    return wl_import(body.get("url", ""), body.get("trip") or current_trip_id())


# ---- Outbound daily briefing (timer hits this; sends via the same bot token) ----

@app.get("/tg/brief")
def tg_brief(key: str = ""):
    if not TG_SECRET or key != TG_SECRET:
        raise HTTPException(401, "bad key")
    tg_send(build_brief())
    return {"ok": True, "sent": bool(TELEGRAM_TOKEN and TELEGRAM_CHAT_ID)}


# ---- Inbound-email booking capture (server/inbound.py) ----
import inbound  # noqa: E402
app.include_router(inbound.router)
