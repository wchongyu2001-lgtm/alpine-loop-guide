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
import os, re, json, base64, uuid
from pathlib import Path
from fastapi import FastAPI, Request, Header, HTTPException
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
