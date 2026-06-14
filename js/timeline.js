/* B23 · Booking timeline: a dedicated, read-only chronological view of a trip's
   bookings grouped by day and time-sorted, with type icon, time, provider,
   confirmation # and price. Time overlaps are visibly flagged. */
import { esc, fmtMoney, bookingTimeline } from './core.js';
import { tripBookings } from './data.js';
import { icon } from './icons.js';
import { logoImg } from './logos.js';

export function render(root, ctx) {
  const { state } = ctx;
  const list = tripBookings(state, state.trip.id);
  const days = bookingTimeline(list, state.trip);
  const overlaps = days.reduce((n, d) => n + d.items.filter(i => i.overlap).length, 0);

  root.innerHTML = `
    <div class="tl-intro">
      <p>Every booking for <b>${esc(state.trip.label)}</b> in time order, day by day.
      ${overlaps ? `<b class="tl-overlap-lead">⚠ ${overlaps} booking${overlaps > 1 ? 's' : ''} overlap in time</b> — highlighted below.` : 'No time conflicts.'}</p>
    </div>
    ${days.length ? days.map(d => `
      <div class="tl-day">
        <div class="tl-date">${prettyDate(d.date)}</div>
        ${d.items.map(i => row(i)).join('')}
      </div>`).join('') : '<p class="muted">No bookings for this trip yet.</p>'}`;
}

function row({ booking: b, overlap }) {
  const price = b.price && b.price.amount ? fmtMoney(b.price.amount, b.price.currency + ' ') : '';
  return `
    <div class="tl-row${overlap ? ' tl-clash' : ''}">
      <span class="tl-time">${time(b.start)}${b.end ? '–' + time(b.end) : ''}</span>
      <span class="tl-icon">${icon(b.type, 18)}</span>
      <div class="tl-main">
        <div class="tl-title">${esc(b.title)}${logoImg(b)}${overlap ? '<span class="tl-clash-tag">overlap</span>' : ''}</div>
        <div class="tl-meta">
          ${b.provider ? esc(b.provider) : ''}
          ${b.provider && b.confirmation ? ' · ' : ''}
          ${b.confirmation ? `conf <b>${esc(b.confirmation)}</b>` : ''}
          ${price ? `${(b.provider || b.confirmation) ? ' · ' : ''}${price}` : ''}
        </div>
      </div>
    </div>`;
}

const time = s => { const t = String(s); return t.length > 10 ? t.slice(11, 16) : '–'; };

function prettyDate(d) {
  const x = new Date(d + (d.length === 10 ? 'T12:00' : ''));
  return x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}
