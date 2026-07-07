/* Board · a unified cross-trip planning board. One column of day sections spanning
   the whole away-window (2026-07-24 → 2026-08-29), each showing its date, the day's
   location(s), a forecast/typical weather chip and the bookings that land on it.
   Drag a card between/within days to re-slot it (persisted to the 'board' overlay),
   or drop it on a trip chip to reassign which trip owns it (the 'bookings' overlay).
   Read-model comes from core.boardModel; nothing here fetches synchronously. */
import { esc, boardModel } from './core.js';
import { allBookings, boardOverlay, saveBoardOverlay } from './data.js';
import { planWeather } from './weather.js';
import { icon } from './icons.js';

const START = '2026-07-24', END = '2026-08-29';
const TRIPS = [['preexchange', 'Pre-exchange'], ['alpine', 'Alpine'], ['iceland', 'Iceland']];
const TRIP_LABEL = Object.fromEntries(TRIPS);

const STYLE = `
  .bd{max-width:680px;margin:0 auto}
  .bd-intro{color:var(--ink-soft);font-size:.92rem;margin:0 0 12px}
  .bd-trips{display:flex;gap:8px;flex-wrap:wrap;position:sticky;top:0;z-index:5;
    background:var(--paper);padding:8px 0 10px;margin:0 0 4px}
  .bd-trip{border:1px dashed var(--line);border-radius:999px;padding:8px 14px;font-size:.82rem;
    font-weight:600;color:var(--ink);background:var(--card);min-height:40px;display:flex;align-items:center}
  .bd-trip.tp-preexchange{border-color:color-mix(in srgb,var(--gold) 55%,var(--line));color:var(--gold)}
  .bd-trip.tp-alpine{border-color:color-mix(in srgb,var(--pine) 55%,var(--line));color:var(--pine)}
  .bd-trip.tp-iceland{border-color:color-mix(in srgb,var(--glacier) 55%,var(--line));color:var(--glacier)}
  .bd-trip.bd-over{background:color-mix(in srgb,var(--terra) 14%,var(--card));border-style:solid}
  .bd-days{display:flex;flex-direction:column;gap:10px}
  .bd-day{background:var(--card);border:1px solid var(--line);border-radius:14px;
    padding:12px 14px;box-shadow:var(--shadow)}
  .bd-dhead{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 8px}
  .bd-date{font-weight:700;font-size:1rem;color:var(--ink)}
  .bd-loc{color:var(--ink-soft);font-size:.86rem;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bd-wx{font-family:'JetBrains Mono',monospace;font-size:.76rem;color:var(--terra);white-space:nowrap;margin-left:auto}
  .bd-wx .typ{color:var(--ink-soft);font-weight:400}
  .bd-gaps{display:flex;gap:6px;flex-wrap:wrap;margin:0 0 8px}
  .bd-gap{font-size:.74rem;border-radius:999px;padding:3px 9px;font-weight:600;
    background:color-mix(in srgb,var(--rose) 16%,var(--card));color:var(--rose);
    border:1px solid color-mix(in srgb,var(--rose) 40%,var(--line))}
  .bd-cards{list-style:none;margin:0;padding:0;display:flex;flex-direction:column;gap:6px;min-height:20px}
  .bd-empty{color:var(--ink-soft);font-size:.82rem;font-style:italic;padding:2px 0}
  .bd-card{display:flex;align-items:center;gap:9px;background:var(--paper-2);
    border:1px solid var(--line);border-radius:10px;padding:8px 10px}
  .bd-card .grab{cursor:grab;color:var(--ink-soft);user-select:none;font-size:1rem;line-height:1;
    touch-action:none;padding:10px 8px;margin:-8px -2px -8px -6px;display:flex;align-items:center}
  .bd-ic{flex:0 0 auto;color:var(--ink-soft);display:flex}
  .bd-cbody{flex:1;min-width:0}
  .bd-title{font-size:.92rem;font-weight:600;color:var(--ink);overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .bd-cmeta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;font-size:.76rem;color:var(--ink-soft);margin-top:1px}
  .bd-time{font-family:'JetBrains Mono',monospace;color:var(--terra)}
  .bd-conf{font-family:'JetBrains Mono',monospace}
  .bd-tag{flex:0 0 auto;font-size:.66rem;font-weight:700;text-transform:uppercase;letter-spacing:.04em;
    border-radius:6px;padding:2px 6px;background:var(--card);border:1px solid var(--line);color:var(--ink-soft)}
  .bd-tag.tp-preexchange{color:var(--gold)}
  .bd-tag.tp-alpine{color:var(--pine)}
  .bd-tag.tp-iceland{color:var(--glacier)}
  .sortable-ghost{opacity:.4}
  .sortable-chosen{box-shadow:var(--shadow)}
  @media (max-width:430px){.bd-title{font-size:.88rem}.bd-date{font-size:.94rem}}`;

export function render(root, ctx) {
  const { state } = ctx;
  const bookings = allBookings(state);
  const model = boardModel(bookings, boardOverlay(state), START, END);
  // Natural (start-date) day of each booking — so a drag only writes a dayOverride
  // when a card is moved OFF its own day.
  const natural = Object.fromEntries(bookings.map(b => [b.id, String(b.start).slice(0, 10)]));

  root.innerHTML = `
    <style>${STYLE}</style>
    <div class="bd">
      <p class="bd-intro">Every booking across all three trips on one timeline, ${esc(START)} → ${esc(END)}.
        Drag a card between days to re-slot it, or onto a trip chip to reassign it.</p>
      <div class="bd-trips">${TRIPS.map(([id, label]) =>
        `<div class="bd-trip tp-${id}" data-trip="${id}" title="Drop a card here to move it to ${esc(label)}">${esc(label)}</div>`).join('')}</div>
      <div class="bd-days">${model.map(dayHtml).join('')}</div>
    </div>`;

  hydrateWeather(root);
  wireDrag(root, ctx, natural);
}

function dayHtml(day) {
  const loc = day.locations.map(l => l.name).join(' · ');
  const ll = (day.locations.find(l => l.ll) || {}).ll || null;
  const gaps = [];
  if (day.gaps.noLodging) gaps.push('⚠️ No lodging booked');
  if (day.gaps.transportGap) gaps.push('⚠️ Transport gap');
  return `
    <section class="bd-day">
      <div class="bd-dhead">
        <span class="bd-date">${esc(day.label)}</span>
        ${loc ? `<span class="bd-loc">📍 ${esc(loc)}</span>` : ''}
        <span class="bd-wx"${ll ? ` data-ll="${ll[0]},${ll[1]}" data-iso="${day.iso}"` : ''}>${ll ? '…' : '—'}</span>
      </div>
      ${gaps.length ? `<div class="bd-gaps">${gaps.map(g => `<span class="bd-gap">${esc(g)}</span>`).join('')}</div>` : ''}
      <ul class="bd-cards" data-iso="${day.iso}">
        ${day.bookings.length ? day.bookings.map(cardHtml).join('') : '<li class="bd-empty">— free day —</li>'}
      </ul>
    </section>`;
}

function cardHtml(b) {
  const time = /T\d/.test(String(b.start)) ? String(b.start).slice(11, 16) : '';
  const meta = [
    time ? `<span class="bd-time">${esc(time)}</span>` : '',
    b.confirmation ? `<span class="bd-conf">${esc(b.confirmation)}</span>` : '',
  ].filter(Boolean).join('');
  return `
    <li class="bd-card" data-bid="${esc(b.id)}">
      <span class="grab" title="Drag">⠿</span>
      <span class="bd-ic">${icon(b.type, 18)}</span>
      <div class="bd-cbody">
        <div class="bd-title">${esc(b.title || '(untitled)')}</div>
        ${meta ? `<div class="bd-cmeta">${meta}</div>` : ''}
      </div>
      <span class="bd-tag tp-${esc(b.trip)}">${esc(TRIP_LABEL[b.trip] || b.trip || '')}</span>
    </li>`;
}

// Async weather chips — never blocks first paint, tolerates nulls/offline.
function hydrateWeather(root) {
  root.querySelectorAll('.bd-wx[data-ll]').forEach(async el => {
    const ll = el.dataset.ll.split(',').map(Number);
    const w = await planWeather(ll, el.dataset.iso);
    if (!w) { el.textContent = '—'; return; }
    el.innerHTML = `🌡️ ${Math.round(w.tmax)}°/${Math.round(w.tmin)}°${w.source === 'typical' ? ' <span class="typ">(typical)</span>' : ''}`;
  });
}

// Two drag modes on a shared 'board' group:
//   (a) day-move + within-day reorder  → persist {dayOverride, order} to the board overlay
//   (b) drop on a trip chip            → reassign the booking's trip via the bookings overlay
function wireDrag(root, ctx, natural) {
  if (!window.Sortable) return;

  const persistBoard = () => {
    const cur = boardOverlay(ctx.state);
    const dayOverride = { ...cur.dayOverride };
    const order = {};
    root.querySelectorAll('.bd-cards').forEach(ul => {
      const iso = ul.dataset.iso;
      const bids = [...ul.querySelectorAll('.bd-card[data-bid]')].map(li => li.dataset.bid);
      order[iso] = bids;
      bids.forEach(bid => {
        if (natural[bid] && natural[bid] !== iso) dayOverride[bid] = iso;
        else delete dayOverride[bid];
      });
    });
    saveBoardOverlay(ctx.state, { dayOverride, order });
    ctx.rerender();
  };

  root.querySelectorAll('.bd-cards').forEach(ul => {
    new Sortable(ul, {
      group: 'board', handle: '.grab', animation: 150,
      onEnd: evt => {
        // A drop onto a trip chip is handled by that chip's onAdd — skip the board save.
        if (evt.to && evt.to.classList.contains('bd-trip')) return;
        persistBoard();
      },
    });
  });

  root.querySelectorAll('.bd-trip[data-trip]').forEach(chip => {
    new Sortable(chip, {
      group: { name: 'board', pull: false, put: true },
      sort: false, animation: 150,
      onAdd: evt => {
        const bid = evt.item.dataset.bid;
        const trip = chip.dataset.trip;
        if (bid && trip) reassignTrip(ctx, bid, trip);
        // Defer the rerender out of Sortable's onAdd so we don't tear the board DOM
        // down mid-drop while SortableJS is still settling this same drop.
        setTimeout(() => ctx.rerender(), 0); // also discards the stray node parked in the chip
      },
    });
  });
}

function reassignTrip(ctx, bid, trip) {
  const ov = ctx.state.overlay.bookings || {};
  ctx.save('bookings', { ...ov, overrides: { ...(ov.overrides || {}), [bid]: trip } });
}
