# Itinerary place thumbnails (Wanderlog-style) — design

**Date:** 2026-06-13 · **Status:** approved (user supplied Wanderlog screenshot as target; autonomous session per CLAUDE.md prefs)

## Goal

Give each place row in the Itinerary view the visual rhythm of a Wanderlog place card:
a photo-sized thumbnail on the right edge of every row. Until real photos exist, the
thumbnail is a **placeholder tile** — a soft wash of the place-category accent colour
with the category emoji centred — so the user "has more of an idea of what it is".

## Decisions

- **Placeholder-first, photo-ready.** If a place object has `img` (URL string), render
  `<img>`; otherwise render the placeholder tile. No image fetching, no new data files.
- **Colour mapping is pure logic** → `thumbAccent(type)` in `js/core.js`, tested in
  `tools/test-core.mjs`. Maps the 8 taxonomy tags to the existing editorial accents:

  | tag | accent | | tag | accent |
  |---|---|---|---|---|
  | view | glacier `#2a5a5a` | | town | gold `#b8860b` |
  | hike | pine `#5a6342` | | food | terra `#b9531a` |
  | swim | glacier `#2a5a5a` | | gem | rose `#9c5a6a` |
  | act | terra `#b9531a` | | van | pine `#5a6342` |

  Unknown/missing tag → ink-soft `#5d564a`.
- **Row layout:** `grab · pbody · plinks · pthumb` — thumbnail far right like the
  screenshot; controls keep their current position.
- **Sizing:** 76×58px desktop, 60×48px under 720px (matches existing breakpoint).
  Tile uses `color-mix()` for the wash (fine on current Safari/Chrome).
- **Scope:** Itinerary view only. Ideas/Bookings cards untouched.

## Out of scope

Real photo sourcing (Wikipedia/Wikimedia), per-place image-URL editing UI,
distance-between-places chips. Possible follow-ups, not built now.

## Verify

`node tools/test-core.mjs` (new thumbAccent assertions), `node --check js/*.js`,
jsdom smoke render, 390px visual check, live URL after push.
