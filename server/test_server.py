"""Plain-assert tests for server/triphub.py — run: python3 server/test_server.py"""
import json
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
import triphub as T

fails = 0


def eq(got, want, msg):
    global fails
    if got != want:
        fails += 1
        print(f"FAIL {msg}\n  got  {got!r}\n  want {want!r}")
    else:
        print(f"ok   {msg}")


TRIPS = [
    {"id": "preexchange", "label": "Pre-exchange", "start": "2026-07-24", "end": "2026-08-01"},
    {"id": "alpine", "label": "Alpine Loop", "start": "2026-08-01", "end": "2026-08-17"},
    {"id": "iceland", "label": "Iceland", "start": "2026-08-20", "end": "2026-08-29"},
]

# assign_trip
eq(T.assign_trip(TRIPS, "2026-07-25"), "preexchange", "assign_trip preexchange")
eq(T.assign_trip(TRIPS, "2026-08-05"), "alpine", "assign_trip alpine (smallest range)")
eq(T.assign_trip(TRIPS, "2026-12-01"), "unassigned", "assign_trip outside")
eq(T.assign_trip(TRIPS, None), "unassigned", "assign_trip none")

# parse_email_stub
s = T.parse_email_stub("Fwd: Your Wizz Air booking NP7QJQ", "Flight W6 4551 departs 20 Aug 2026 at 09:00.")
eq(s, {"type": "flight", "title": "Your Wizz Air booking NP7QJQ", "confirmation": "NP7QJQ", "start": "2026-08-20"}, "stub flight")
s = T.parse_email_stub("Hotel Internazionale", "Check-in: 30 July 2026. Booking number: 308663-2026.")
eq(s["type"], "hotel", "stub hotel type")
eq(s["start"], "2026-07-30", "stub hotel date")

# parse_cmd
eq(T.parse_cmd("/today"), ("today", ""), "cmd no-arg")
eq(T.parse_cmd("/wl https://x"), ("wl", "https://x"), "cmd with arg")
eq(T.parse_cmd("/add@TripBot dinner"), ("add", "dinner"), "cmd strips @bot")
eq(T.parse_cmd("just text"), ("", "just text"), "non-command text")

# classify_capture
c = T.classify_capture("idea: Matterhorn glacier", TRIPS)
eq((c["kind"], c["item"]["title"]), ("bucket", "Matterhorn glacier"), "capture idea→bucket")
c = T.classify_capture("Hotel booking, check-in 5 Aug 2026, conf ABC12345", TRIPS)
eq((c["kind"], c["booking"]["type"], c["trip"]), ("bookings", "hotel", "alpine"), "capture booking→bookings")
c = T.classify_capture("remember to buy adapters", TRIPS)
eq(c["kind"], "bucket", "capture plain→bucket note")

# compose_brief — pre-trip
b = T.compose_brief(TRIPS, "2026-07-20", TRIPS[0], [], {}, [{"title": "EK353", "start": "2026-07-24T00:50"}])
assert "starts in 4 days" in b and "EK353" in b, f"brief pre-trip: {b!r}"
print("ok   brief pre-trip")

# compose_brief — in-trip with a day + stops + leg
days = [{"id": "d1", "_date": "2026-08-01", "_n": 1, "short": "Lake Garda",
         "plan": [{"n": "Sirmione", "time": "09:00", "ll": [45.49, 10.61]},
                  {"n": "Bardolino", "ll": [45.55, 10.72]}]}]
b = T.compose_brief(TRIPS, "2026-08-01", TRIPS[1], days, {}, [], weather={"tmax": 28.2, "tmin": 18.4, "icon": "☀️", "precip": 10})
assert "Day 1: Lake Garda" in b and "Sirmione 09:00" in b and "km)" in b and "28°/18°" in b, f"brief in-trip: {b!r}"
print("ok   brief in-trip (day, stops, leg, weather)")

# extract_trip — __NEXT_DATA__ fixture
fixture = {
    "props": {"pageProps": {"trip": {
        "name": "My Italy Trip",
        "items": [
            {"name": "Sirmione", "latitude": 45.49, "longitude": 10.61, "note": "lakefront town"},
            {"name": "Grotte di Catullo", "lat": 45.50, "lng": 10.60, "description": "Roman ruins"},
            {"name": "Hotel Rialto", "latitude": 45.43, "longitude": 12.33,
             "reservationType": "lodging", "checkInDate": "2026-08-17", "confirmationNumber": "308663-2026"},
        ],
    }}}
}
html = f'<html><body><script id="__NEXT_DATA__" type="application/json">{json.dumps(fixture)}</script></body></html>'
ex = T.extract_trip(html)
eq(len(ex["places"]), 3, "extract: 3 places (incl. the hotel as a place)")
names = sorted(p["name"] for p in ex["places"])
eq(names, ["Grotte di Catullo", "Hotel Rialto", "Sirmione"], "extract: place names")
eq(len(ex["reservations"]), 1, "extract: 1 reservation")
eq((ex["reservations"][0]["type"], ex["reservations"][0]["start"], ex["reservations"][0]["confirmation"]),
   ("hotel", "2026-08-17", "308663-2026"), "extract: reservation normalized")
eq(T.extract_trip("<html>no data here</html>"), {"places": [], "reservations": []}, "extract: no payload → empty")

# decorate_days — preset filter + sequential dates from meta.start
td = {"meta": {"start": [2026, 7, 1], "presets": [{"key": "grand"}, {"key": "easy"}]},
      "presets": {"grand": ["a", "b", "c"], "easy": ["a", "c"]},
      "days": [{"id": "a", "short": "D1"}, {"id": "b", "short": "D2"}, {"id": "c", "short": "D3"}]}
dd = T.decorate_days(td, {})
eq([d["_date"] for d in dd], ["2026-08-01", "2026-08-02", "2026-08-03"], "decorate_days default preset dates (Aug, monthIndex+1)")
dd2 = T.decorate_days(td, {"preset": "easy"})
eq([(d["id"], d["_date"]) for d in dd2], [("a", "2026-08-01"), ("c", "2026-08-02")], "decorate_days easy preset re-sequences dates")
eq(T.wmo_icon(0), "☀️", "wmo clear"); eq(T.wmo_icon(61), "🌧️", "wmo rain")

print(f"\n{fails} failures" if fails else "\nALL PASS")
sys.exit(1 if fails else 0)
