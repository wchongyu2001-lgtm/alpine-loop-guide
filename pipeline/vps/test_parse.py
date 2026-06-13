"""Parity test: Python parse_email_stub must match js/core.js parseEmailStub
(same cases as tools/test-core.mjs)."""
import sys, os, importlib.util
_p = os.path.join(os.path.dirname(__file__), "import.py")
_spec = importlib.util.spec_from_file_location("trips_import", _p)
_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_mod)
parse_email_stub, assign_trip = _mod.parse_email_stub, _mod.assign_trip

fails = 0
def eq(got, want, msg):
    global fails
    if got != want:
        fails += 1; print(f"FAIL {msg}\n  got  {got}\n  want {want}")
    else:
        print(f"ok   {msg}")

eq(parse_email_stub("Fwd: Your Wizz Air booking confirmation NP7QJQ", "Flight W6 4551 departs 20 Aug 2026 at 09:00."),
   {"type": "flight", "title": "Your Wizz Air booking confirmation NP7QJQ", "confirmation": "NP7QJQ", "start": "2026-08-20"},
   "flight w/ PNR + body date")
eq(parse_email_stub("Reservation confirmed - Hotel Internazionale Bologna", "Check-in: 30 July 2026. Booking number: 308663-2026. We look forward to your stay."),
   {"type": "hotel", "title": "Reservation confirmed - Hotel Internazionale Bologna", "confirmation": "308663-2026", "start": "2026-07-30"},
   "hotel w/ dashed conf + long month")
eq(parse_email_stub("Your Trenitalia train ticket", "Departure 2026-08-03 from Milano Centrale."),
   {"type": "train", "title": "Your Trenitalia train ticket", "confirmation": None, "start": "2026-08-03"},
   "train w/ ISO date")
eq(parse_email_stub("Fwd: Re: hello", "nothing useful here"),
   {"type": "other", "title": "hello", "confirmation": None, "start": None},
   "strips Fwd:/Re:, nulls when nothing found")
eq(parse_email_stub("GetYourGuide ticket: Vatican tour", "Reference: ABC123XY. Date: 5 Aug 2026."),
   {"type": "activity", "title": "GetYourGuide ticket: Vatican tour", "confirmation": "ABC123XY", "start": "2026-08-05"},
   "activity w/ labelled reference")

trips = [{"id": "preexchange", "start": "2026-07-24", "end": "2026-08-20"},
         {"id": "alpine", "start": "2026-08-01", "end": "2026-08-17"},
         {"id": "iceland", "start": "2026-08-20", "end": "2026-08-29"}]
eq(assign_trip(trips, "2026-08-05"), "alpine", "Aug5 → alpine (smallest range)")
eq(assign_trip(trips, "2026-08-20T09:00"), "iceland", "Aug20 → iceland (10d < 28d)")
eq(assign_trip(trips, "2026-09-15"), "unassigned", "outside all → unassigned")
eq(assign_trip(trips, None), "unassigned", "no date → unassigned")

sys.exit(1 if fails else 0)
