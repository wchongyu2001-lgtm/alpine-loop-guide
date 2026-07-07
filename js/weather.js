/* Per-day forecast from open-meteo (free, no key). One forecast fetch per
   coordinate is shared across that location's days. Returns null off-range.
   Persists the last-known forecast per coordinate to localStorage: a fresh
   copy (<6h) is served without a network hit, and when offline the stale copy
   is used instead of a blank — so the weather still renders with no signal. */
import { weatherUrl, pickDaily, weatherCacheKey } from './core.js';

const mem = {};
const typMem = {}; // in-flight/last dedup for typicalWeather, keyed by coord+MM-DD
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

// Typical (climatology) temps for a date beyond the forecast horizon: average the
// SAME month-day across the 5 most recent COMPLETE years from the Open-Meteo archive.
// The average is cached per coord+MM-DD so the network is hit at most once. Wrapped in
// try/catch → null on any failure, exactly like dayWeather (offline-tolerant).
export async function typicalWeather(ll, iso) {
  try {
    if (!ll || !iso) return null;
    const [lat, lng] = ll;
    const md = String(iso).slice(5, 10); // MM-DD
    const key = `wx:typ:${lat.toFixed(2)},${lng.toFixed(2)}:${md}`;
    try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch {}
    // Dedup concurrent calls for the same coord+MM-DD (the board fires ~1 per day at once).
    if (typMem[key]) return typMem[key];
    typMem[key] = (async () => {
      const nowY = new Date().getFullYear();
      const years = [1, 2, 3, 4, 5].map(n => nowY - n); // 5 most recent complete years
      const days = await Promise.all(years.map(y => {
        const d = `${y}-${md}`;
        const url = `https://archive-api.open-meteo.com/v1/archive?latitude=${lat}&longitude=${lng}&start_date=${d}&end_date=${d}&daily=temperature_2m_max,temperature_2m_min&timezone=auto`;
        return fetch(url).then(r => r.ok ? r.json() : null).catch(() => null);
      }));
      let sx = 0, sn = 0, c = 0;
      for (const j of days) {
        const dl = j && j.daily;
        const mx = dl && dl.temperature_2m_max && dl.temperature_2m_max[0];
        const mn = dl && dl.temperature_2m_min && dl.temperature_2m_min[0];
        if (mx == null || mn == null) continue;
        sx += mx; sn += mn; c++;
      }
      if (!c) { delete typMem[key]; return null; }
      const v = { tmax: Math.round(sx / c * 10) / 10, tmin: Math.round(sn / c * 10) / 10, source: 'typical' };
      // Only PERSIST a complete average. A partial one (some years rate-limited/failed)
      // is served this session but left uncached so it recomputes once the network recovers.
      if (c === years.length) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }
      else delete typMem[key];
      return v;
    })().catch(() => { delete typMem[key]; return null; });
    return typMem[key];
  } catch { return null; }
}

// Best available temps for a PLANNING date: within 15 days of today → the live
// forecast (source 'live', carries the weather code); otherwise the typical
// climatology (source 'typical'). Both shapes normalised to {tmax,tmin,source}.
// Null-tolerant.
export async function planWeather(ll, iso) {
  if (!ll || !iso) return null;
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const target = Date.parse(String(iso).slice(0, 10) + 'T00:00:00');
  const within = !Number.isNaN(target) && Math.abs(target - today.getTime()) <= 15 * 864e5;
  if (within) {
    const w = await dayWeather(ll, iso);
    return w ? { tmax: w.tmax, tmin: w.tmin, source: 'live', code: w.code } : null;
  }
  return typicalWeather(ll, iso);
}
