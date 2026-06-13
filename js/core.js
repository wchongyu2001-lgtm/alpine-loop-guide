/* Pure helpers — no DOM. Tested by tools/test-core.mjs (node). */

export function haversineKm(a, b) {
  const toR = x => x * Math.PI / 180;
  const dLat = toR(b[0] - a[0]), dLng = toR(b[1] - a[1]);
  const s = Math.sin(dLat / 2) ** 2 + Math.cos(toR(a[0])) * Math.cos(toR(b[0])) * Math.sin(dLng / 2) ** 2;
  return 6371 * 2 * Math.asin(Math.sqrt(s));
}

// Straight-line distance scaled to road reality (winding alpine roads ≈ ×1.3).
export function routeStats(points, roadFactor = 1.3, avgKmh = 55) {
  let km = 0;
  for (let i = 1; i < points.length; i++) km += haversineKm(points[i - 1], points[i]);
  km *= roadFactor;
  return { km: Math.round(km), hours: Math.round(km / avgKmh * 10) / 10 };
}

// Nearest-neighbour reorder, keeping the first point fixed.
export function optimizeOrder(items, getLL) {
  if (items.length < 3) return items.slice();
  const rest = items.slice(1), out = [items[0]];
  while (rest.length) {
    const cur = getLL(out[out.length - 1]);
    let best = 0, bestD = Infinity;
    rest.forEach((it, i) => {
      const d = haversineKm(cur, getLL(it));
      if (d < bestD) { bestD = d; best = i; }
    });
    out.push(rest.splice(best, 1)[0]);
  }
  return out;
}

export const gmapsUrl = (ll, name) => ll
  ? `https://www.google.com/maps/search/?api=1&query=${ll[0]},${ll[1]}`
  : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(name || '')}`;

export const amapsUrl = (ll, name) => ll
  ? `https://maps.apple.com/?ll=${ll[0]},${ll[1]}&q=${encodeURIComponent(name || 'Pin')}`
  : `https://maps.apple.com/?q=${encodeURIComponent(name)}`;

export const gmapsDirUrl = (points) =>
  `https://www.google.com/maps/dir/${points.map(p => `${p[0]},${p[1]}`).join('/')}`;

export const flightStatusUrl = code =>
  `https://www.google.com/search?q=${encodeURIComponent(code + ' flight status')}`;

// Editorial accent per place tag — drives the thumbnail placeholder wash.
const TAG_ACCENT = {
  view: '#2a5a5a', swim: '#2a5a5a',     // glacier
  hike: '#5a6342', van: '#5a6342',      // pine
  act: '#b9531a', food: '#b9531a',      // terra
  town: '#b8860b',                      // gold
  gem: '#9c5a6a',                       // rose
};
export const thumbAccent = t => TAG_ACCENT[t] || '#5d564a';

// Wikipedia photo lookup for place thumbnails — pure URL builders + response parsers.
export const wikiSummaryUrl = name => name
  ? `https://en.wikipedia.org/api/rest_v1/page/summary/${encodeURIComponent(name)}?redirect=true`
  : null;

export const wikiGeoUrl = ll => ll
  ? `https://en.wikipedia.org/w/api.php?action=query&format=json&origin=*&prop=pageimages&piprop=thumbnail&pithumbsize=320&generator=geosearch&ggscoord=${encodeURIComponent(`${ll[0]}|${ll[1]}`)}&ggsradius=2000&ggslimit=3`
  : null;

export const pickSummaryThumb = j =>
  (j && j.type !== 'disambiguation' && j.thumbnail && j.thumbnail.source) || null;

export const pickGeoThumb = j => {
  const pages = j && j.query && j.query.pages;
  if (!pages) return null;
  for (const p of Object.values(pages)) if (p.thumbnail && p.thumbnail.source) return p.thumbnail.source;
  return null;
};

export const thumbCacheKey = name => 'thumb:' + name;

// Assign a booking to the smallest-date-range trip containing its start date.
export function assignTrip(trips, startISO) {
  if (!startISO) return 'unassigned';
  const d = startISO.slice(0, 10);
  const hits = trips.filter(t => t.start <= d && d <= t.end);
  if (!hits.length) return 'unassigned';
  hits.sort((a, b) => (new Date(a.end) - new Date(a.start)) - (new Date(b.end) - new Date(b.start)));
  return hits[0].id;
}

// Overlay day-plans replace base plans per day; base kept where overlay silent.
export function effectivePlans(days, overlayPlans) {
  const out = {};
  for (const d of days) out[d.id] = (overlayPlans && overlayPlans[d.id]) || d.plan || [];
  return out;
}

// Expense splitting between two travellers (extensible to N via shares).
// split: {type:'equal'} | {type:'solo'} (payer only) | {type:'shares', shares:{name:fraction}}
export function computeBalances(expenses, travellers) {
  const paid = {}, owes = {};
  travellers.forEach(t => { paid[t] = 0; owes[t] = 0; });
  for (const e of expenses) {
    const amt = Number(e.amount) || 0;
    if (!amt || !e.paidBy || !(e.paidBy in paid)) continue;
    paid[e.paidBy] += amt;
    const split = e.split || { type: 'equal' };
    if (split.type === 'solo') owes[e.paidBy] += amt;
    else if (split.type === 'shares' && split.shares) {
      travellers.forEach(t => { owes[t] += amt * (split.shares[t] || 0); });
    } else travellers.forEach(t => { owes[t] += amt / travellers.length; });
  }
  const net = {};
  travellers.forEach(t => { net[t] = Math.round((paid[t] - owes[t]) * 100) / 100; });
  return { paid, owes, net };
}

export function fmtMoney(n, cur = '€') {
  if (n == null || isNaN(n)) return '—';
  const v = Math.round(Number(n));
  return cur.length > 1 ? `${cur}${v.toLocaleString()}` : `${cur}${v.toLocaleString()}`;
}

// Date for the i-th kept day. meta.start = [y, monthIndex, day].
export function dayDate(start, i) {
  const d = new Date(start[0], start[1], start[2] + i);
  const W = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const iso = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  return { label: `${W[d.getDay()]} ${d.getDate()} ${M[d.getMonth()]}`, iso };
}

// Heuristic stub from a confirmation email; user reviews before it becomes a booking.
const TYPE_RULES = [
  ['flight', /flight|airline|airways|boarding pass|e-?ticket .*air|wizz|ryanair|easyjet|emirates|icelandair/i],
  ['train', /train|trenitalia|rail|öbb|sbb/i],
  ['bus', /\bbus\b|flixbus/i],
  ['car', /car rental|rental car|hertz|sixt|europcar|campervan|camper/i],
  ['hotel', /hotel|hostel|apartment|booking\.com|airbnb|your stay|check-in.*(?:room|night)|room|night/i],
  ['activity', /tour|admission|getyourguide|tiqets|museum|ticket/i],
];
const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12 };

export function parseEmailStub(subject, body) {
  const title = String(subject || '').replace(/^(\s*(fwd|fw|re)\s*:)+\s*/i, '').trim();
  const all = title + '\n' + String(body || '');

  let type = 'other';
  for (const [t, re] of TYPE_RULES) if (re.test(all)) { type = t; break; }

  // Labelled code: case-insensitive label, then an UPPERCASE/digit token nearby.
  let confirmation = null;
  const labRe = /(?:confirmation|booking|reservation|reference|pnr|conf)(?:\s+(?:number|code|id))?[:#\s-]{0,4}(.{0,24})/gi;
  for (let m; !confirmation && (m = labRe.exec(all));) {
    const tok = m[1].match(/\b([A-Z0-9][A-Z0-9-]{4,13})\b/);
    if (tok) confirmation = tok[1];
  }

  let start = null;
  const iso = all.match(/\b(\d{4})-(\d{2})-(\d{2})\b/);
  const txt = all.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+(\d{4})\b/i);
  if (iso && (!txt || iso.index < txt.index)) start = iso[0];
  else if (txt) start = `${txt[3]}-${String(MONTHS[txt[2].toLowerCase().slice(0, 3)]).padStart(2, '0')}-${String(+txt[1]).padStart(2, '0')}`;

  return { type, title, confirmation, start };
}

export const esc = s => String(s ?? '').replace(/[&<>"']/g,
  c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
