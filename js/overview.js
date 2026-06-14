/* B20 · Trip overview timeline — a compact at-a-glance list: each day is one row
   with its date, headline, first planned stop and booking markers, so the whole
   trip is visible without scrolling day cards. Tap a day to jump to it in the
   Itinerary view. Read-only; operates on already-loaded data. */
import { esc, tripOverview, effectivePlans, tripTotals, daysToDeparture, dayDate, gmapsRouteUrl } from './core.js';
import { tripBookings } from './data.js';
import { icon } from './icons.js';

const pad = n => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

const STYLE = `
  .ov{max-width:640px;margin:0 auto}
  .ov-intro{color:#5d564a;font-size:.92rem;margin:0 0 12px}
  .ov-count{display:flex;align-items:baseline;gap:10px;border:1px solid rgba(184,134,11,.4);background:rgba(184,134,11,.08);border-radius:12px;padding:12px 14px;margin:0 0 10px}
  .ov-count b{font-size:1.6rem;line-height:1;color:#b8860b}
  .ov-count span{color:#5d564a;font-size:.9rem}
  .ov-stats{list-style:none;margin:0 0 14px;padding:0;display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
  .ov-stat{border:1px solid rgba(128,128,128,.24);border-radius:12px;padding:10px 12px;background:rgba(128,128,128,.04)}
  .ov-stat b{display:block;font-size:1.25rem;font-weight:700}
  .ov-stat span{color:#5d564a;font-size:.78rem;text-transform:uppercase;letter-spacing:.04em}
  @media (max-width:430px){.ov-count b{font-size:1.35rem}}
  .ov-list{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px}
  .ov-row{display:flex;gap:12px;align-items:center;border:1px solid rgba(128,128,128,.24);border-radius:12px;padding:10px 12px;background:rgba(128,128,128,.04);cursor:pointer;text-align:left}
  .ov-row:hover,.ov-row:focus{border-color:rgba(184,134,11,.5);background:rgba(184,134,11,.07);outline:none}
  .ov-n{flex:0 0 28px;height:28px;display:flex;align-items:center;justify-content:center;border-radius:8px;background:#b8860b;color:#fff;font-weight:700;font-size:.9rem}
  .ov-body{flex:1;min-width:0}
  .ov-date{font-size:.74rem;letter-spacing:.05em;text-transform:uppercase;color:#b8860b;font-weight:600}
  .ov-head{font-size:1rem;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ov-sub{color:#5d564a;font-size:.84rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ov-marks{flex:0 0 auto;display:flex;gap:5px;color:#5d564a;align-items:center}
  .ov-go{flex:0 0 auto;color:#a39e92;font-size:1.2rem;line-height:1}
  .ov-route{display:inline-flex;align-items:center;gap:8px;width:100%;justify-content:center;border:1px solid rgba(184,134,11,.5);background:rgba(184,134,11,.1);color:#b8860b;font-weight:600;font-size:.92rem;border-radius:12px;padding:11px 14px;margin:0 0 14px;cursor:pointer;text-decoration:none;box-sizing:border-box}
  .ov-route:hover,.ov-route:focus{background:rgba(184,134,11,.18);outline:none}
  @media (max-width:430px){.ov-head{font-size:.95rem}.ov-n{flex-basis:24px;height:24px}}`;

export function render(root, ctx) {
  const { state } = ctx;
  const plans = effectivePlans(state.days, (state.overlay.itinerary || {}).dayPlans || null);
  const bookings = tripBookings(state, state.trip.id);
  const rows = tripOverview(state.days, plans, bookings);
  const totals = tripTotals(state.days, bookings, { plans });
  const start = state.tripData.meta.start;
  const dleft = start ? daysToDeparture(dayDate(start, 0).iso, todayIso()) : null;

  root.innerHTML = `
    <style>${STYLE}</style>
    <div class="ov">
      <p class="ov-intro">The whole <b>${esc(state.trip.label)}</b> at a glance — ${rows.length} day${rows.length === 1 ? '' : 's'}. Tap a day to open it.</p>
      ${countdownHtml(dleft)}
      ${statsHtml(totals)}
      ${routeHtml(gmapsRouteUrl(state.days))}
      ${rows.length ? `<ol class="ov-list">${rows.map(rowHtml).join('')}</ol>` : '<p class="muted">No days in this trip yet.</p>'}
    </div>`;

  root.querySelectorAll('.ov-row[data-jump]').forEach(el => {
    const go = () => jump(state.trip.id, el.dataset.jump);
    el.onclick = go;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
}

function countdownHtml(d) {
  if (d == null) return '';
  const txt = d > 0 ? `<b>${d}</b> <span>day${d === 1 ? '' : 's'} to departure</span>`
    : d === 0 ? '<b>Today</b> <span>the trip begins</span>'
    : `<b>Day ${1 - d}</b> <span>trip under way</span>`;
  return `<div class="ov-count">${txt}</div>`;
}

// B36 · whole-trip "Open in Google Maps" — a real <a> deep link (works offline as
// a link; the OS/Maps app resolves it) covering every day base in order. Hidden
// when there aren't two distinct coordinate stops to route between.
function routeHtml(url) {
  if (!url) return '';
  return `<a class="ov-route" href="${esc(url)}" target="_blank" rel="noopener"
    >${icon('car', 16)} Open full route in Google Maps</a>`;
}

function statsHtml(t) {
  const cells = [
    [t.km.toLocaleString(), 'km driving'],
    [`${t.driveHours} h`, 'driving time'],
    [t.nights, `night${t.nights === 1 ? '' : 's'}`],
    [t.stops, `planned stop${t.stops === 1 ? '' : 's'}`],
    [t.bookings, `booking${t.bookings === 1 ? '' : 's'}`],
    [t.days, `day${t.days === 1 ? '' : 's'}`],
  ];
  return `<ul class="ov-stats">${cells.map(([n, l]) =>
    `<li class="ov-stat"><b>${esc(String(n))}</b><span>${esc(l)}</span></li>`).join('')}</ul>`;
}

function rowHtml(r) {
  const marks = r.bookings.map(b => `<span class="ov-mark" title="${esc(b.title)}">${icon(b.type, 16)}</span>`).join('');
  const sub = r.firstStop && r.firstStop !== r.headline ? r.firstStop : '';
  return `
    <li class="ov-row" data-jump="${esc(r.id)}" role="button" tabindex="0">
      <span class="ov-n">${esc(String(r.n ?? ''))}</span>
      <div class="ov-body">
        <div class="ov-date">${esc(r.date)}</div>
        <div class="ov-head">${esc(r.headline || '—')}</div>
        ${sub ? `<div class="ov-sub">${esc(sub)}</div>` : ''}
      </div>
      <div class="ov-marks">${marks}</div>
      <span class="ov-go">›</span>
    </li>`;
}

// Navigate to the Itinerary view, then scroll the chosen day's card into view
// (the daycard carries id="it-day-<id>"). The brief delay lets the hashchange
// re-render rebuild the DOM before we scroll.
function jump(tripId, dayId) {
  location.hash = `#${tripId}/itinerary`;
  setTimeout(() => {
    const el = document.getElementById('it-day-' + dayId);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, 80);
}
