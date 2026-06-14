/* Per-leg travel time/distance. OSRM public router for driving (cached), with a
   haversine fallback for walk/cycle or when OSRM is unreachable. Always returns
   {km, mins} so a connector always shows. */
import { osrmUrl, parseOsrm, legFallback, osrmRouteUrl, parseOsrmRoute } from './core.js';

// Road-following geometry for a whole sequence of points (cached, offline-safe).
// Returns { coords:[[lat,lng]...], km, mins, legs } or null (caller keeps the straight line).
export async function routeGeometry(points, mode = 'drive') {
  if (!Array.isArray(points) || points.length < 2) return null;
  const key = `routegeo:${mode}:${points.map(p => p.join(',')).join('|')}`;
  try { const c = localStorage.getItem(key); if (c) return JSON.parse(c); } catch {}
  let v = null;
  try { const r = await fetch(osrmRouteUrl(points, mode)); if (r.ok) v = parseOsrmRoute(await r.json()); } catch {}
  if (v) { try { localStorage.setItem(key, JSON.stringify(v)); } catch {} }
  return v;
}

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
