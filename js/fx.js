/* FX rates from Frankfurter (free, ECB data), cached for the day. Returns a
   {currency: rate-from-base} map; base→base is 1. Falls back to {base:1}. */
export async function rates(base) {
  const today = new Date().toISOString().slice(0, 10);
  const key = `fx:${base}`;
  try { const c = JSON.parse(localStorage.getItem(key) || 'null'); if (c && c.d === today) return c.r; } catch {}
  try {
    const j = await (await fetch(`https://api.frankfurter.app/latest?from=${base}`)).json();
    const r = { ...(j.rates || {}), [base]: 1 };
    localStorage.setItem(key, JSON.stringify({ d: today, r }));
    return r;
  } catch { return { [base]: 1 }; }
}
