/* Place enrichment: Google Places via the trips-sync proxy, 30-day localStorage
   cache, graceful fallback (returns null → callers keep the Wikipedia photo). */
import { BASE } from './sync.js';
import { placeProxyUrl, placeCacheKey, parsePlace } from './core.js';

const TTL = 30 * 864e5;

export async function enrich(name, ll) {
  if (!name) return null;
  const key = placeCacheKey(name, ll);
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const o = JSON.parse(raw); if (Date.now() - o._t < TTL) return o.v; }
  } catch {}
  let v = null;
  try {
    const r = await fetch(placeProxyUrl(BASE, name, ll));
    if (r.ok) { const j = await r.json(); if (j && j.ok) v = parsePlace(j); }
  } catch {}
  try { localStorage.setItem(key, JSON.stringify({ _t: Date.now(), v })); } catch {}
  return v;
}
