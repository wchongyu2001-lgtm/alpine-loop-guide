import json, os, importlib
from fastapi import FastAPI
from fastapi.testclient import TestClient

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def _client(tmp_path, monkeypatch, claude_return):
    monkeypatch.setenv("TRIPS_DIR", str(tmp_path))
    monkeypatch.setenv("INBOUND_SECRET", "s3cret")
    monkeypatch.setenv("INBOUND_ALLOW", "wchongyu2001@gmail.com")
    (tmp_path / "overlays").mkdir(parents=True, exist_ok=True)
    (tmp_path / "files").mkdir(parents=True, exist_ok=True)
    import inbound
    importlib.reload(inbound)
    monkeypatch.setattr(inbound, "_claude_extract", lambda text: claude_return)
    monkeypatch.setattr(inbound, "_load_trips",
                        lambda: [{"id": "iceland", "start": "2026-08-20", "end": "2026-08-29"}])
    app = FastAPI(); app.include_router(inbound.router)
    return TestClient(app), tmp_path


def _payload():
    return json.load(open(os.path.join(FIX, "postmark_flight.json")))


def test_inbound_rejects_bad_key(tmp_path, monkeypatch):
    c, _ = _client(tmp_path, monkeypatch, {})
    r = c.post("/inbound?key=wrong", json={"From": "x", "Subject": "s", "TextBody": "b"})
    assert r.status_code == 401


def test_inbound_ignores_disallowed_sender(tmp_path, monkeypatch):
    c, base = _client(tmp_path, monkeypatch, {"type": "flight", "title": "X"})
    r = c.post("/inbound?key=s3cret", json={"From": "spammer@evil.com", "Subject": "s", "TextBody": "b"})
    assert r.status_code == 200 and r.json()["ok"] and r.json().get("ignored")
    assert list((base / "overlays").glob("*.json")) == []


def test_inbound_parses_and_writes_overlay(tmp_path, monkeypatch):
    claude = {"type": "flight", "title": "FI 418 · KEF → DUB", "start": "2026-08-29T09:40",
              "confirmation": "DT6I97", "provider": "Icelandair"}
    c, base = _client(tmp_path, monkeypatch, claude)
    r = c.post("/inbound?key=s3cret", json=_payload())
    assert r.status_code == 200 and r.json()["ok"] and r.json()["added"]
    ov = json.loads((base / "overlays" / "iceland__bookings.json").read_text())
    man = ov["payload"]["manual"]
    assert man[0]["confirmation"] == "DT6I97" and man[0]["trip"] == "iceland"
    assert man[0]["source"] == "email"


def test_inbound_dedupes_second_forward(tmp_path, monkeypatch):
    claude = {"type": "flight", "title": "FI 418", "start": "2026-08-29T09:40", "confirmation": "DT6I97"}
    c, base = _client(tmp_path, monkeypatch, claude)
    c.post("/inbound?key=s3cret", json=_payload())
    r2 = c.post("/inbound?key=s3cret", json=_payload())
    assert r2.json().get("deduped") is True
    ov = json.loads((base / "overlays" / "iceland__bookings.json").read_text())
    assert len(ov["payload"]["manual"]) == 1


def test_inbound_falls_back_when_claude_raises(tmp_path, monkeypatch):
    def boom(_text):
        raise RuntimeError("no api key")
    c, base = _client(tmp_path, monkeypatch, {})
    import inbound
    monkeypatch.setattr(inbound, "_claude_extract", boom)
    r = c.post("/inbound?key=s3cret", json=_payload())
    assert r.status_code == 200 and r.json()["added"]
    # heuristic picked flight + DT6I97 + iceland from the body
    ov = json.loads((base / "overlays" / "iceland__bookings.json").read_text())
    b = ov["payload"]["manual"][0]
    assert b["type"] == "flight" and b["confirmation"] == "DT6I97" and b["source"] == "email"
