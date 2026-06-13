/* Service worker: offline app shell + trip data.
   Cache-first for the shell (html/css/js), network-first-then-cache for trip JSON,
   stale-while-revalidate for CDN assets (Leaflet, fonts, Sortable) so the app opens
   with no signal. Bump CACHE on any shell/data change to invalidate old caches. */
const CACHE = 'tc-shell-v3';
// Map tiles live in their own cache so they survive shell-cache version bumps
// (a CACHE bump shouldn't wipe the offline map). Tiles are stale-while-revalidate.
const TILES = 'tc-tiles-v1';
// 1×1 transparent PNG — returned for an uncached tile when offline so the map
// shows blank gaps instead of broken-image icons (degrade gracefully).
const BLANK_TILE = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==';
const blankTile = () => {
  const bin = atob(BLANK_TILE), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Response(arr, { headers: { 'Content-Type': 'image/png' } });
};

// App shell — keep js/ list in sync with the modules index.html loads (test-core guards this).
const SHELL = [
  './', 'index.html', 'css/app.css', 'manifest.webmanifest', 'icon.svg',
  'js/app.js', 'js/attachments.js', 'js/bookings.js', 'js/budget.js', 'js/checklists.js',
  'js/core.js', 'js/data.js', 'js/fx.js', 'js/icons.js', 'js/ideas.js', 'js/itinerary.js',
  'js/logos.js', 'js/map.js', 'js/places.js', 'js/routing.js', 'js/shipped.js', 'js/sync.js', 'js/today.js', 'js/weather.js',
];
// Trip data — precache all so any trip's itinerary renders offline (Alpine is the priority).
const DATA = [
  'data/trips.json', 'data/taxonomy.json', 'data/bookings.json', 'data/shipped.json',
  'data/alpine.json', 'data/preexchange.json', 'data/iceland.json',
];

const isData = url => url.origin === location.origin && /\/data\/.*\.json$/.test(url.pathname);
const sameOrigin = url => url.origin === location.origin;
const isTile = url => /(^|\.)tile\.openstreetmap\.org$/.test(url.hostname);

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const cache = await caches.open(CACHE);
    // Fail-soft: a single missing asset must not break the whole install.
    await Promise.allSettled([...SHELL, ...DATA].map(u => cache.add(u)));
    self.skipWaiting();
  })());
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CACHE && k !== TILES).map(k => caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);

  if (isData(url)) {
    // Network-first: fresh trip data when online, cached copy when not.
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      try {
        const res = await fetch(req);
        if (res && res.ok) cache.put(req, res.clone());
        return res;
      } catch {
        const hit = await cache.match(req);
        if (hit) return hit;
        throw new Error('offline and no cached data');
      }
    })());
    return;
  }

  if (isTile(url)) {
    // Map tiles: serve the cached tile if we have it, revalidate in the
    // background, and persist freshly fetched tiles to the dedicated cache.
    // Offline with no cached tile → transparent placeholder, not a broken image.
    e.respondWith((async () => {
      const cache = await caches.open(TILES);
      const hit = await cache.match(req);
      const fetching = fetch(req).then(res => {
        if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
        return res;
      }).catch(() => null);
      return hit || (await fetching) || blankTile();
    })());
    return;
  }

  if (sameOrigin(url)) {
    // Cache-first for the shell; fall back to network and backfill the cache.
    e.respondWith((async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req) || (req.mode === 'navigate' ? await cache.match('index.html') : null);
      if (hit) return hit;
      const res = await fetch(req);
      if (res && res.ok) cache.put(req, res.clone());
      return res;
    })());
    return;
  }

  // Cross-origin (Leaflet, fonts, Sortable): stale-while-revalidate.
  e.respondWith((async () => {
    const cache = await caches.open(CACHE);
    const hit = await cache.match(req);
    const fetching = fetch(req).then(res => {
      if (res && (res.ok || res.type === 'opaque')) cache.put(req, res.clone());
      return res;
    }).catch(() => null);
    return hit || (await fetching) || new Response('', { status: 504 });
  })());
});
