/* Loads repo JSON (base layer) + sync overlays (edit layer) into one state object. */
import { pull, cached, save as syncSave } from './sync.js';
import { dayDate } from './core.js';

const j = url => fetch(url).then(r => { if (!r.ok) throw new Error(`${url}: ${r.status}`); return r.json(); });

export async function loadRegistry() {
  const [registry, taxonomy, bookings] = await Promise.all([
    j('data/trips.json'), j('data/taxonomy.json'), j('data/bookings.json'),
  ]);
  return { registry, taxonomy, bookingsFile: bookings };
}

// Overlay kinds stored in the Sheet (or localStorage until it's reachable).
const KINDS = ['itinerary', 'expenses', 'checklists', 'bucket', 'bookings', 'ideas'];
// The planning board is a single UNIFIED cross-trip overlay, so it is anchored to one
// fixed trip id for read+write regardless of which trip tab is active.
const BOARD_TRIP = 'preexchange';

export async function loadTrip(base, tripId) {
  const trip = base.registry.trips.find(t => t.id === tripId) || base.registry.trips[0];
  const tripData = await j('data/' + trip.file);

  // Fast paint from local cache, then refresh from the Sheet in the background.
  const overlay = {};
  for (const k of KINDS) overlay[k] = cached(trip.id, k);
  overlay.board = cached(BOARD_TRIP, 'board'); // unified board overlay (fixed anchor)

  const state = {
    trip, tripData,
    travellers: base.registry.travellers,
    taxonomy: base.taxonomy,
    registry: base.registry,
    bookingsFile: base.bookingsFile,
    overlay,
  };
  decorateDays(state);
  return state;
}

export async function refreshOverlays(state, onChange) {
  let changed = false;
  for (const k of KINDS) {
    const remote = await pull(state.trip.id, k);
    if (remote != null && JSON.stringify(remote) !== JSON.stringify(state.overlay[k])) {
      state.overlay[k] = remote;
      changed = true;
    }
  }
  // Board overlay is cross-trip → always pull it from the fixed anchor, not state.trip.id.
  const remoteBoard = await pull(BOARD_TRIP, 'board');
  if (remoteBoard != null && JSON.stringify(remoteBoard) !== JSON.stringify(state.overlay.board)) {
    state.overlay.board = remoteBoard;
    changed = true;
  }
  if (changed) { decorateDays(state); onChange(); }
}

// Active days for the trip (preset-filtered for alpine) with computed dates.
export function decorateDays(state) {
  const td = state.tripData;
  const presetKey = (state.overlay.itinerary && state.overlay.itinerary.preset)
    || (td.meta.presets && td.meta.presets[0] && td.meta.presets[0].key);
  let days = td.days;
  if (td.presets && presetKey && td.presets[presetKey]) {
    const ids = td.presets[presetKey];
    days = ids.map(id => td.days.find(d => d.id === id)).filter(Boolean);
  }
  days.forEach((d, i) => {
    const dd = td.meta.start ? dayDate(td.meta.start, i) : null;
    d._date = d.iso || (dd && dd.iso);
    d._label = dd ? dd.label : d.date;
    d._n = i + 1;
  });
  state.days = days;
  state.preset = presetKey || null;
}

// All bookings for a trip: file bookings (with overlay trip overrides) + manual ones.
export function tripBookings(state, tripId) {
  const ov = state.overlay.bookings || {};
  const overrides = ov.overrides || {};
  const all = [...state.bookingsFile.bookings, ...(ov.manual || [])];
  return all.filter(b => (overrides[b.id] || b.trip) === tripId)
    .sort((a, b) => String(a.start).localeCompare(String(b.start)));
}

export function allBookings(state) {
  const ov = state.overlay.bookings || {};
  const overrides = ov.overrides || {};
  return [...state.bookingsFile.bookings, ...(ov.manual || [])]
    .map(b => ({ ...b, trip: overrides[b.id] || b.trip }));
}

// Board overlay for the planning board — { dayOverride:{}, order:{} }. It is a single
// UNIFIED cross-trip overlay, so it is always anchored to BOARD_TRIP (not the active
// trip) for both read and write. Read precedence: in-session state.overlay.board →
// synced cache (v2:<BOARD_TRIP>:board) → plain-localStorage fallback ('board:overlay').
export function boardOverlay(state) {
  let ov = (state && state.overlay && state.overlay.board) || cached(BOARD_TRIP, 'board');
  if (!ov) { try { ov = JSON.parse(localStorage.getItem('board:overlay') || 'null'); } catch { ov = null; } }
  ov = ov || {};
  return { dayOverride: ov.dayOverride || {}, order: ov.order || {} };
}

// Persist the board overlay. Writes the in-session copy, a plain-localStorage fallback
// (guarantees same-device reload survival even if the backend is unreachable), and syncs
// to the backend under the fixed BOARD_TRIP anchor so it survives reload + cross-device.
export function saveBoardOverlay(state, payload) {
  if (state && state.overlay) state.overlay.board = payload;
  try { localStorage.setItem('board:overlay', JSON.stringify(payload)); } catch {}
  syncSave(BOARD_TRIP, 'board', payload);
}
