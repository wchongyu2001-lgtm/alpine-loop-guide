/* Bookings timeline: pipeline + Wanderlog-seeded + manual; unassigned inbox. */
import { esc, gmapsUrl, amapsUrl, flightStatusUrl, fmtMoney, assignTrip } from './core.js';
import { tripBookings, allBookings } from './data.js';

const TYPE_ICON = { flight: '✈', hotel: '🛏', train: '🚆', bus: '🚌', car: '🚗', activity: '🎟', other: '📌' };
const TYPES = Object.keys(TYPE_ICON);

export function render(root, ctx) {
  const { state } = ctx;
  const list = tripBookings(state, state.trip.id);
  const unassigned = allBookings(state).filter(b => b.trip === 'unassigned');

  const byDate = {};
  list.forEach(b => { const d = String(b.start).slice(0, 10); (byDate[d] = byDate[d] || []).push(b); });

  root.innerHTML = `
    <div class="bk-intro">
      <p>Everything booked for <b>${esc(state.trip.label)}</b> — imported from Gmail by the pipeline (or seeded from Wanderlog). Forward any confirmation email to <b>wchongyu2001@gmail.com</b> and it appears here after the next sync.</p>
      <div class="lastsync">${esc(syncLabel(state))}</div>
    </div>
    ${Object.keys(byDate).sort().map(d => `
      <div class="bk-group">
        <div class="bk-date">${prettyDate(d)}</div>
        ${byDate[d].map(b => card(b, state)).join('')}
      </div>`).join('') || '<p class="muted">No bookings for this trip yet.</p>'}

    ${unassigned.length ? `
    <div class="bk-unassigned">
      <h3>📥 Unassigned (${unassigned.length})</h3>
      <p class="muted">Bookings that didn't match a trip's dates — file them:</p>
      ${unassigned.map(b => `
        <div class="bkcard">
          ${cardBody(b)}
          <select data-assign="${b.id}">
            <option value="">→ assign to…</option>
            ${state.registry.trips.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>` : ''}

    <details class="bk-add"><summary>＋ Add a booking manually</summary>
      <form id="bkform">
        <select name="type">${TYPES.map(t => `<option>${t}</option>`).join('')}</select>
        <input name="title" placeholder="Title (e.g. FI 418 · KEF → DUB)" required />
        <input name="start" type="datetime-local" required />
        <input name="conf" placeholder="Confirmation #" />
        <input name="amount" type="number" step="0.01" placeholder="Price" />
        <input name="currency" placeholder="EUR" size="4" />
        <button>Add</button>
      </form>
    </details>`;

  root.querySelectorAll('[data-assign]').forEach(sel => sel.onchange = () => {
    if (!sel.value) return;
    const ov = bkOv(state);
    ov.overrides = { ...(ov.overrides || {}), [sel.dataset.assign]: sel.value };
    ctx.save('bookings', ov); ctx.rerender();
  });

  const form = root.querySelector('#bkform');
  if (form) form.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(form);
    const start = f.get('start');
    const ov = bkOv(state);
    ov.manual = [...(ov.manual || []), {
      id: 'manual-' + Date.now(),
      trip: assignTrip(state.registry.trips, start),
      type: f.get('type'), title: f.get('title'), start,
      confirmation: f.get('conf') || null,
      price: f.get('amount') ? { amount: +f.get('amount'), currency: f.get('currency') || state.trip.currency } : null,
      source: 'manual',
    }];
    ctx.save('bookings', ov); ctx.rerender();
  };
}

function card(b, state) { return `<div class="bkcard">${cardBody(b)}</div>`; }

function cardBody(b) {
  const ll = b.location && b.location.lat != null ? [b.location.lat, b.location.lng] : null;
  return `
    <div class="bkrow">
      <span class="bkicon">${TYPE_ICON[b.type] || '📌'}</span>
      <div class="bkmain">
        <div class="bktitle">${esc(b.title)}</div>
        <div class="bkmeta">
          ${time(b.start)}${b.end ? ' → ' + time(b.end) : ''}
          ${b.provider ? ` · ${esc(b.provider)}` : ''}
          ${b.price && b.price.amount ? ` · ${fmtMoney(b.price.amount, b.price.currency + ' ')}` : ''}
        </div>
        ${b.confirmation ? `<div class="bkconf">conf <b>${esc(b.confirmation)}</b></div>` : ''}
        ${b.pax ? `<div class="bkpax muted">${b.pax.map(esc).join(' · ')}</div>` : ''}
        ${b.notes ? `<div class="bkpax muted">${esc(b.notes)}</div>` : ''}
      </div>
      <span class="plinks">
        ${b.flight ? `<a target="_blank" rel="noopener" title="Flight status" href="${flightStatusUrl(b.flight)}">⚑</a>` : ''}
        ${ll ? `<a target="_blank" rel="noopener" title="Google Maps" href="${gmapsUrl(ll, b.location.name)}">G</a>
               <a target="_blank" rel="noopener" title="Apple Maps" href="${amapsUrl(ll, b.location.name)}"></a>` : ''}
        ${b.gmail_link ? `<a target="_blank" rel="noopener" title="Original email" href="${esc(b.gmail_link)}">✉</a>` : ''}
      </span>
    </div>`;
}

const time = s => { const t = String(s); return t.length > 10 ? t.slice(11, 16) : prettyDate(t); };

function prettyDate(d) {
  const x = new Date(d + (d.length === 10 ? 'T12:00' : ''));
  return x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function syncLabel(state) {
  const u = state.bookingsFile.updated;
  if (!u) return '';
  const ageH = (Date.now() - new Date(u)) / 36e5;
  return `Pipeline last sync: ${new Date(u).toLocaleString()}${ageH > 48 ? ' ⚠ stale' : ''}`;
}

const bkOv = state => ({ overrides: {}, manual: [], ...(state.overlay.bookings || {}) });
