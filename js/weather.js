/* Per-day forecast from open-meteo (free, no key). One forecast fetch per
   coordinate is shared across that location's days. Returns null off-range. */
import { weatherUrl, pickDaily } from './core.js';

const mem = {};

export async function dayWeather(ll, iso) {
  if (!ll || !iso) return null;
  const ck = ll.join(',');
  if (!mem[ck]) mem[ck] = fetch(weatherUrl(ll)).then(r => r.ok ? r.json() : null).catch(() => null);
  const j = await mem[ck];
  return j ? pickDaily(j, iso) : null;
}
