/* B20 · Trip overview timeline — a compact at-a-glance list: each day is one row
   with its date, headline, first planned stop and booking markers, so the whole
   trip is visible without scrolling day cards. Tap a day to jump to it in the
   Itinerary view. Read-only; operates on already-loaded data. */
import { esc, tripOverview, effectivePlans } from './core.js';
import { tripBookings } from './data.js';
import { icon } from './icons.js';

const STYLE = `
  .ov{max-width:640px;margin:0 auto}
  .ov-intro{color:#5d564a;font-size:.92rem;margin:0 0 12px}
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
  @media (max-width:430px){.ov-head{font-size:.95rem}.ov-n{flex-basis:24px;height:24px}}`;

export function render(root, ctx) {
  const { state } = ctx;
  const plans = effectivePlans(state.days, (state.overlay.itinerary || {}).dayPlans || null);
  const bookings = tripBookings(state, state.trip.id);
  const rows = tripOverview(state.days, plans, bookings);

  root.innerHTML = `
    <style>${STYLE}</style>
    <div class="ov">
      <p class="ov-intro">The whole <b>${esc(state.trip.label)}</b> at a glance — ${rows.length} day${rows.length === 1 ? '' : 's'}. Tap a day to open it.</p>
      ${rows.length ? `<ol class="ov-list">${rows.map(rowHtml).join('')}</ol>` : '<p class="muted">No days in this trip yet.</p>'}
    </div>`;

  root.querySelectorAll('.ov-row[data-jump]').forEach(el => {
    const go = () => jump(state.trip.id, el.dataset.jump);
    el.onclick = go;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } };
  });
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
