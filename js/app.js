/* App shell: trip switcher, view tabs, hash routing (#trip/view), sync refresh. */
import { loadRegistry, loadTrip, refreshOverlays, decorateDays } from './data.js';
import { save, retryQueue } from './sync.js';
import { esc, cycleTheme, effectiveTheme } from './core.js';
import { icon } from './icons.js';
import * as today from './today.js';
import * as overview from './overview.js';
import * as itinerary from './itinerary.js';
import * as search from './search.js';
import * as bookings from './bookings.js';
import * as timeline from './timeline.js';
import * as map from './map.js';
import * as budget from './budget.js';
import * as checklists from './checklists.js';
import * as essentials from './essentials.js';
import * as ideas from './ideas.js';
import * as shipped from './shipped.js';

const VIEWS = { today, overview, itinerary, search, bookings, timeline, map, budget, checklists, essentials, ideas, shipped };
const VIEW_LABELS = {
  today: 'Today', overview: 'Overview', itinerary: 'Itinerary', search: 'Search', bookings: 'Bookings', timeline: 'Timeline', map: 'Map',
  budget: 'Budget', checklists: 'Checklists', essentials: 'Essentials', ideas: 'Ideas', shipped: "What's new",
};

let base, state, view = 'itinerary';

function route() {
  const [t, v] = location.hash.replace('#', '').split('/');
  return { tripId: t || localStorage.getItem('v2:active') || 'alpine',
    view: VIEWS[v] ? v : 'itinerary', explicitView: !!VIEWS[v] };
}

const pad = n => String(n).padStart(2, '0');
const todayIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };

// B35 · Dark mode — light/dark/auto theme toggle in the header, persisted to
// localStorage. The early inline script in index.html applies it before paint;
// this wires the toggle and keeps 'auto' in sync with the OS preference.
const THEME_LABELS = { auto: '🌗 Auto', light: '☀️ Light', dark: '🌙 Dark' };
function applyTheme(choice) {
  const root = document.documentElement;
  root.dataset.theme = effectiveTheme(choice, matchMedia('(prefers-color-scheme: dark)').matches);
  root.dataset.themeChoice = choice;
  const btn = document.getElementById('themetoggle');
  if (btn) btn.textContent = THEME_LABELS[choice];
}
function initTheme() {
  let choice = localStorage.getItem('v2:theme') || 'auto';
  applyTheme(choice);
  document.getElementById('themetoggle')?.addEventListener('click', () => {
    choice = cycleTheme(choice);
    localStorage.setItem('v2:theme', choice);
    applyTheme(choice);
  });
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if ((localStorage.getItem('v2:theme') || 'auto') === 'auto') applyTheme('auto');
  });
}

async function boot() {
  initTheme();
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
  // No explicit view + the open trip's range contains today → open the Today view.
  if (!r.explicitView && state.days.some(d => d._date === todayIso())) view = 'today';
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
