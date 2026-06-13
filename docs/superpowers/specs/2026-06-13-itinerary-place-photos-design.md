# Real photos inside itinerary place thumbnails — design

**Date:** 2026-06-13 · **Status:** approved (autonomous session; follow-up to the placeholder-tile feature, commit 489dcc2)

## Goal

Put a real photo *inside* each place thumbnail instead of only the category-coloured
emoji tile. The tile stays as the instant-load placeholder; a representative photo
swaps in when found.

## Source & strategy

Client-side, no build step, no new data files, no API keys. **Wikipedia** is the source.

1. **Primary — REST summary by name:**
   `https://en.wikipedia.org/api/rest_v1/page/summary/<name>?redirect=true`
   Use `thumbnail.source`. Skip if `type === 'disambiguation'` or no thumbnail.
   Great for landmark names (Sirmione, Duomo di Milano, Galleria Vittorio Emanuele II).
2. **Fallback — Action API geosearch by coordinates** (CORS via `origin=*`):
   `…/w/api.php?action=query&prop=pageimages&piprop=thumbnail&pithumbsize=320&generator=geosearch&ggscoord=<lat>|<lon>&ggsradius=2000&ggslimit=3`
   First returned page with a `thumbnail.source` wins. Covers descriptive names
   ("Bardolino dinner" → nearest article Bardolino) when the name lookup misses.
3. **No photo →** keep the existing emoji placeholder tile.

## Caching

`localStorage` key `thumb:<name>` stores the resolved URL, or `''` as a **negative cache**
so a miss is not refetched. This is auto-derived data, NOT a user edit — it stays out of
the Apps Script overlay sync.

## Rendering (progressive enhancement)

- `dayCard` renders the placeholder span with `data-thumb="<name>"` and (if present)
  `data-ll="lat,lon"`, exactly as today plus those attributes.
- After `render()`, `hydrateThumbs(root)` walks `.pthumb.ph[data-thumb]`, resolves each
  thumb (cache → primary → fallback), and on success sets the tile's `background-image`
  (cover), adds `.has-photo`, clears the emoji. Fire-and-forget; failures are swallowed
  and negative-cached. The `<img>` branch for places with explicit `p.img` is unchanged.

## Pure logic (core.js, tested)

- `wikiSummaryUrl(name)` → REST URL, or `null` for empty name.
- `wikiGeoUrl(ll)` → Action API URL for `[lat, lon]`, or `null` if no coords.
- `pickSummaryThumb(json)` → `thumbnail.source` or `null` (null on disambiguation/missing).
- `pickGeoThumb(json)` → first `query.pages[*].thumbnail.source` or `null`.
- `thumbCacheKey(name)` → `'thumb:' + name`.

## Out of scope

Per-place manual photo picker, attribution overlay, image preloading/prefetch, photos in
Ideas/Bookings/Map. The `<img>`/`p.img` path already supports hand-set photos.

## Verify

`node tools/test-core.mjs` (new pure-fn assertions), `node --check js/*.js`, jsdom smoke
(fetch mock throws → tiles stay emoji, no crash), 390px check, live URL after push.
