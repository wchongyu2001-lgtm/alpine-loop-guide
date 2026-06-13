/* Per-day forecast from open-meteo (free, no key). One forecast fetch per
   coordinate is shared across that location's days. Returns null off-range.
   Persists the last-known forecast per coordinate to localStorage: a fresh
   copy (<6h) is served without a network hit, and when offline the stale copy
   is used instead of a blank — so the weather still renders with no signal. */
import { weatherUrl, pickDaily, weatherCacheKey } from './core.js';

const mem = {};
const FRESH = 6 * 36e5; // serve cache without re-fetching within this window

function forecast(ll) {
  const ck = ll.join(',');
  if (mem[ck]) return mem[ck];
  const key = weatherCacheKey(ll);
  let cached = null;
  try { const raw = localStorage.getItem(key); if (raw) cached = JSON.parse(raw); } catch {}
  if (cached && Date.now() - cached._t < FRESH) return (mem[ck] = Promise.resolve(cached.v));
  return (mem[ck] = fetch(weatherUrl(ll)).then(r => r.ok ? r.json() : null).catch(() => null)
    .then(j => {
      if (j) { try { localStorage.setItem(key, JSON.stringify({ _t: Date.now(), v: j })); } catch {} return j; }
      return cached ? cached.v : null; // offline/failed → last-known, however stale
    }));
}

export async function dayWeather(ll, iso) {
  if (!ll || !iso) return null;
  const j = await forecast(ll);
  return j ? pickDaily(j, iso) : null;
}
