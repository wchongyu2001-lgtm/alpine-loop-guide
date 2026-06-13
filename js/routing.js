/* Per-leg travel time/distance. OSRM public router for driving (cached), with a
   haversine fallback for walk/cycle or when OSRM is unreachable. Always returns
   {km, mins} so a connector always shows. */
import { osrmUrl, parseOsrm, legFallback } from './core.js';

export async function leg(a, b, mode = 'drive') {
  if (!a || !b) return null;
  if (mode !== 'drive') return legFallback(a, b, mode);
  const key = `leg:${mode}:${a}:${b}`;
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c); } catch {}
  let v = null;
  try { const r = await fetch(osrmUrl(a, b, mode)); if (r.ok) v = parseOsrm(await r.json()); } catch {}
  if (!v) v = legFallback(a, b, mode);
  try { localStorage.setItem(key, JSON.stringify(v)); } catch {}
  return v;
}
