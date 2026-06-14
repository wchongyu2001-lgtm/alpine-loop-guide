/* B18 · Offline trip search: an instant filter across the open trip's places,
   day notes and bookings. Operates entirely on already-loaded state — zero
   network calls — so it works in the field with no signal. Typing filters live;
   clearing the box restores the full picture. */
import { esc, effectivePlans, searchRecords } from './core.js';
import { tripBookings } from './data.js';
import { icon } from './icons.js';

// Flatten the open trip into searchable records (places, notes, bookings).
function buildRecords(state) {
  const recs = [];
  const plans = effectivePlans(state.days, (state.overlay.itinerary || {}).dayPlans || null);
  for (const day of state.days) {
    const dl = day._label || day.date || '';
    for (const p of plans[day.id] || []) {
      const desc = p.note || p.d || '';
      recs.push({ kind: 'place', title: p.n, sub: [desc, p.time].filter(Boolean).join(' · '), day: dl,
        text: [p.n, desc, p.time, dl, day.short].filter(Boolean).join(' ') });
    }
    const notes = [day.note, ...(day.tips || []), ...(day.why || [])].filter(Boolean);
    for (const n of notes)
      recs.push({ kind: 'note', title: day.short || dl, sub: n, day: dl,
        text: [n, day.short, dl].filter(Boolean).join(' ') });
  }
  for (const b of tripBookings(state, state.trip.id)) {
    const loc = b.location && b.location.name;
    recs.push({ kind: 'booking', title: b.title, sub: [b.provider, b.confirmation && 'conf ' + b.confirmation, loc].filter(Boolean).join(' · '),
      day: String(b.start || '').slice(0, 10),
      text: [b.title, b.provider, b.confirmation, loc, b.type].filter(Boolean).join(' ') });
  }
  return recs;
}

const KIND_LABEL = { place: 'Places', note: 'Notes', booking: 'Bookings' };
const KIND_ICON = { place: 'itinerary', note: 'checklists', booking: 'bookings' };

export function render(root, ctx) {
  const records = buildRecords(ctx.state);
  const counts = records.reduce((a, r) => (a[r.kind] = (a[r.kind] || 0) + 1, a), {});
  const summary = ['place', 'note', 'booking']
    .map(k => `${counts[k] || 0} ${(counts[k] === 1 ? KIND_LABEL[k].replace(/s$/, '') : KIND_LABEL[k]).toLowerCase()}`)
    .join(' · ');

  root.innerHTML = `
    <div class="searchbar">
      <input id="tripsearch" type="search" inputmode="search" autocomplete="off"
        placeholder="Search this trip — place, note or booking" aria-label="Search this trip" />
    </div>
    <div class="search-hint muted">Works offline · ${summary}</div>
    <div id="searchresults"></div>`;

  const input = root.querySelector('#tripsearch');
  const out = root.querySelector('#searchresults');

  // Render only the results container on each keystroke so the input keeps focus
  // (no full view rerender — and crucially, no network).
  function update() {
    const q = input.value.trim();
    if (!q) { out.innerHTML = ''; return; }
    const hits = searchRecords(records, q);
    if (!hits.length) { out.innerHTML = `<p class="muted">No matches for “${esc(q)}”.</p>`; return; }
    const groups = {};
    for (const h of hits) (groups[h.kind] = groups[h.kind] || []).push(h);
    out.innerHTML = `<div class="search-count muted">${hits.length} match${hits.length > 1 ? 'es' : ''}</div>` +
      ['place', 'note', 'booking'].filter(k => groups[k]).map(k => `
        <div class="search-group">
          <div class="search-gh">${icon(KIND_ICON[k], 16)} ${KIND_LABEL[k]} · ${groups[k].length}</div>
          ${groups[k].map(row).join('')}
        </div>`).join('');
  }

  input.addEventListener('input', update);
  input.focus();
}

function row(r) {
  return `
    <div class="search-row">
      <div class="search-title">${esc(r.title)}</div>
      ${r.sub ? `<div class="search-sub muted">${esc(r.sub)}</div>` : ''}
      ${r.day ? `<div class="search-day">${esc(r.day)}</div>` : ''}
    </div>`;
}
