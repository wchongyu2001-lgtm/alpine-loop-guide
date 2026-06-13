import base64, os, hashlib
import mailparse as M

FIX = os.path.join(os.path.dirname(__file__), "fixtures")


def test_strip_forward_removes_header_and_quotes():
    raw = ("---------- Forwarded message ---------\n"
           "From: Indie Campers <support@indiecampers.com>\n"
           "Date: Mon, 30 Mar 2026 at 15:49\n"
           "Subject: Your road trip\n"
           "To: <wchongyu2001@gmail.com>\n\n"
           "> Booking Code V43VXZ\n"
           "Pickup August 01, 2026 14:30 in Venice\n")
    out = M.strip_forward(raw)
    assert "Forwarded message" not in out and "Date:" not in out
    assert "Booking Code V43VXZ" in out and "Pickup August 01, 2026 14:30" in out


def test_strip_forward_passthrough():
    assert M.strip_forward("Just a normal body") == "Just a normal body"


def test_extract_pdf_text_reads_words():
    data = base64.b64decode(open(os.path.join(FIX, "min_pdf_b64.txt")).read())
    txt = M.extract_pdf_text(data)
    assert "CONF" in txt and "ABC123" in txt


def test_extract_pdf_text_bad_bytes_empty():
    assert M.extract_pdf_text(b"not a pdf") == ""


def test_build_extraction_input_includes_body_and_pdf():
    s = M.build_extraction_input("Hotel confirmed", "Body text", ["PDF CONF ABC123"])
    assert "Hotel confirmed" in s and "Body text" in s and "PDF CONF ABC123" in s


def test_extraction_system_lists_schema_keys():
    for k in ["type", "title", "start", "confirmation"]:
        assert k in M.EXTRACTION_SYSTEM


def test_normalize_booking_maps_and_ids():
    raw = {"type": "FLIGHT", "title": " FI 418 ", "provider": "Icelandair",
           "start": "2026-08-29T09:40", "confirmation": "DT6I97"}
    b = M.normalize_booking(raw, msg_id="abc", trip="iceland")
    assert b["id"] == "em-" + hashlib.sha1(b"abc").hexdigest()[:10]
    assert b["type"] == "flight" and b["title"] == "FI 418"
    assert b["trip"] == "iceland" and b["source"] == "email"


def test_normalize_booking_clamps_unknown_type():
    b = M.normalize_booking({"type": "spaceship", "title": "X"}, msg_id="m", trip="unassigned")
    assert b["type"] == "other" and b["start"] is None


_TRIPS = [
    {"id": "preexchange", "start": "2026-07-24", "end": "2026-08-01"},
    {"id": "alpine", "start": "2026-08-01", "end": "2026-08-17"},
    {"id": "iceland", "start": "2026-08-20", "end": "2026-08-29"},
]


def test_fallback_booking_uses_heuristic_and_assigns_trip():
    b = M.fallback_booking(
        subject="Fwd: Icelandair confirmation DT6I97",
        body="Flight on 2026-08-25 KEF to DUB. Confirmation: DT6I97.",
        msg_id="z", trips=_TRIPS)
    assert b["source"] == "email"
    assert b["type"] == "flight"
    assert b["confirmation"] == "DT6I97"
    assert b["trip"] == "iceland"          # 2026-08-25 ∈ iceland
    assert "heuristic" in b["notes"]


def _bk(id_, conf=None):
    return {"id": id_, "trip": "alpine", "type": "car", "title": "Van",
            "confirmation": conf, "source": "email"}


def test_merge_appends_and_attaches():
    ov, added = M.merge_into_overlay(None, _bk("em-1", "V43VXZ"),
                                     {"name": "b.pdf", "url": "u", "fileId": "f"})
    assert added and ov["manual"][0]["id"] == "em-1"
    assert ov["attachments"]["em-1"][0]["fileId"] == "f"
    assert ov["overrides"] == {} and ov["emailSeen"] == []


def test_merge_dedupes_by_id():
    ov = {"overrides": {}, "manual": [_bk("em-1")], "attachments": {}, "emailSeen": []}
    ov2, added = M.merge_into_overlay(ov, _bk("em-1"), None)
    assert not added and len(ov2["manual"]) == 1


def test_merge_dedupes_by_confirmation_caseinsensitive():
    ov = {"overrides": {}, "manual": [_bk("em-1", "V43VXZ")], "attachments": {}, "emailSeen": []}
    ov2, added = M.merge_into_overlay(ov, _bk("em-2", "v43vxz"), None)
    assert not added and len(ov2["manual"]) == 1
