/* App shell: trip switcher, view tabs, hash routing (#trip/view), sync refresh. */
import { loadRegistry, loadTrip, refreshOverlays, decorateDays } from './data.js';
import { save, retryQueue } from './sync.js';
import { esc } from './core.js';
import { icon } from './icons.js';
import * as itinerary from './itinerary.js';
import * as bookings from './bookings.js';
import * as map from './map.js';
import * as budget from './budget.js';
import * as checklists from './checklists.js';
import * as ideas from './ideas.js';

const VIEWS = { itinerary, bookings, map, budget, checklists, ideas };
const VIEW_LABELS = {
  itinerary: 'Itinerary', bookings: 'Bookings', map: 'Map',
  budget: 'Budget', checklists: 'Checklists', ideas: 'Ideas',
};

let base, state, view = 'itinerary';

function route() {
  const [t, v] = location.hash.replace('#', '').split('/');
  return { tripId: t || localStorage.getItem('v2:active') || 'alpine', view: VIEWS[v] ? v : 'itinerary' };
}

async function boot() {
  base = await loadRegistry();
  retryQueue();
  await go();
  window.addEventListener('hashchange', go);
}

async function go() {
  const r = route();
  view = r.view;
  if (!state || state.trip.id !== r.tripId) {
    state = await loadTrip(base, r.tripId);
    localStorage.setItem('v2:active', state.trip.id);
    refreshOverlays(state, renderAll); // background Sheet pull
  }
  renderAll();
}

const ctx = {
  get state() { return state; },
  save(kind, payload) {
    state.overlay[kind] = payload;
    save(state.trip.id, kind, payload);
    if (kind === 'itinerary') decorateDays(state);
  },
  rerender: () => renderAll(),
};

function renderAll() {
  const td = state.tripData;
  document.title = td.meta.label + ' · Travel Companion';
  document.getElementById('triptabs').innerHTML = base.registry.trips.map(t => `
    <a class="triptab ${t.id === state.trip.id ? 'on' : ''}" href="#${t.id}/${view}">${esc(t.label)}</a>`).join('');
  document.getElementById('hero').innerHTML = `
    <div class="kicker">${esc(td.meta.kicker || '')}</div>
    <h1>${td.meta.h1Html || esc(state.trip.title)}</h1>
    <div class="sub">${esc(td.meta.sub || '')}</div>`;
  document.getElementById('viewtabs').innerHTML = Object.keys(VIEWS).map(v => `
    <a class="viewtab ${v === view ? 'on' : ''}" href="#${state.trip.id}/${v}">${icon(v)}<span>${VIEW_LABELS[v]}</span></a>`).join('');
  VIEWS[view].render(document.getElementById('view'), ctx);
}

boot().catch(e => {
  document.getElementById('view').innerHTML =
    `<p class="muted">Failed to load: ${esc(e.message)}. Hard-refresh, or check data/*.json.</p>`;
});
