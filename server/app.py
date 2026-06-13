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
import os, re, json, base64, uuid, time, urllib.request, urllib.parse
from pathlib import Path
from fastapi import FastAPI, Request, Header, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware

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
