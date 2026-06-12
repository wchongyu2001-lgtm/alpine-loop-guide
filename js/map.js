/* Leaflet map: whole-trip / per-day / per-category views, deep links in popups. */
import { esc, gmapsUrl, amapsUrl, effectivePlans } from './core.js';
import { tripBookings } from './data.js';

let map, layer;

export function render(root, ctx) {
  const { state } = ctx;
  const td = state.tripData;
  const cats = state.taxonomy.cats || {};

  root.innerHTML = `
    <div class="mapbar">
      <select id="mapview">
        <option value="trip">🗺 Whole trip</option>
        ${state.days.map(d => `<option value="day:${d.id}">Day ${d._n} · ${esc(d.short)}</option>`).join('')}
        <optgroup label="By category">
          ${Object.entries(cats).map(([k, v]) => `<option value="cat:${k}">${esc(v)}</option>`).join('')}
        </optgroup>
      </select>
    </div>
    <div id="map"></div>`;

  if (map) { map.remove(); map = null; }
  map = L.map(root.querySelector('#map')).setView(td.meta.mapCenter, td.meta.mapZoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',
    { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(map);
  layer = L.layerGroup().addTo(map);

  const sel = root.querySelector('#mapview');
  sel.onchange = () => draw(state, sel.value);
  draw(state, 'trip');
}

function pin(ll, html, opts = {}) {
  const icon = L.divIcon({
    className: 'pin' + (opts.cls ? ' ' + opts.cls : ''),
    html: `<span style="background:${opts.color || '#5a6342'}">${opts.label || '•'}</span>`,
    iconSize: [26, 26], iconAnchor: [13, 13],
  });
  return L.marker(ll, { icon }).bindPopup(html, { maxWidth: 260 });
}

const popup = (name, desc, ll) => `
  <b>${esc(name)}</b>
  ${desc ? `<div class="popdesc">${esc(desc)}</div>` : ''}
  <div class="poplinks">
    <a target="_blank" rel="noopener" href="${gmapsUrl(ll, name)}">Google Maps ↗</a> ·
    <a target="_blank" rel="noopener" href="${amapsUrl(ll, name)}">Apple Maps ↗</a>
  </div>`;

function draw(state, view) {
  layer.clearLayers();
  const regions = state.taxonomy.regions || {};
  const catColors = state.taxonomy.catColors || {};
  const plans = effectivePlans(state.days, (state.overlay.itinerary || {}).dayPlans || null);
  const bounds = [];

  if (view === 'trip') {
    const route = [];
    state.days.forEach(d => {
      if (!d.ll) return;
      route.push(d.ll); bounds.push(d.ll);
      const color = (regions[d.region] || {}).color || '#5a6342';
      pin(d.ll, popup(`Day ${d._n} · ${d.short}`, d.note, d.ll), { label: d._n, color }).addTo(layer);
    });
    if (route.length > 1) L.polyline(route, { color: '#2a5a5a', weight: 3, opacity: .6, dashArray: '6 6' }).addTo(layer);
    bookingPins(state); // pins shown but excluded from bounds (e.g. SIN departure airport)
  } else if (view.startsWith('day:')) {
    const d = state.days.find(x => x.id === view.slice(4));
    const pts = [];
    if (d.ll) { pts.push(d.ll); bounds.push(d.ll); pin(d.ll, popup(`Day ${d._n} base · ${d.short}`, d.sleep && 'Sleep · ' + d.sleep, d.ll), { label: '⌂', color: '#1a1814' }).addTo(layer); }
    (plans[d.id] || []).forEach((p, i) => {
      if (!p.ll) return;
      pts.push(p.ll); bounds.push(p.ll);
      pin(p.ll, popup(p.n, p.note || p.d, p.ll), { label: i + 1, color: catColors[p.t] || '#b9531a' }).addTo(layer);
    });
    (d.stops || []).forEach(st => {
      if (!st.ll || (plans[d.id] || []).some(p => p.n === st.n)) return;
      bounds.push(st.ll);
      pin(st.ll, popup(st.n, st.d, st.ll), { label: '+', color: '#9b9484', cls: 'ghost' }).addTo(layer);
    });
    if (pts.length > 1) L.polyline(pts, { color: '#b9531a', weight: 3, opacity: .7 }).addTo(layer);
  } else if (view.startsWith('cat:')) {
    const cat = view.slice(4);
    state.days.forEach(d => {
      [...(plans[d.id] || []), ...(d.stops || [])].forEach(p => {
        if (p.t !== cat || !p.ll) return;
        bounds.push(p.ll);
        pin(p.ll, popup(p.n, (p.note || p.d || '') + ` — day ${d._n}`, p.ll), { label: '•', color: catColors[cat] || '#b9531a' }).addTo(layer);
      });
    });
  }

  if (bounds.length) map.fitBounds(bounds, { padding: [30, 30] });
}

function bookingPins(state) {
  tripBookings(state, state.trip.id).forEach(b => {
    if (!b.location || b.location.lat == null) return;
    const ll = [b.location.lat, b.location.lng];
    pin(ll, popup(b.title, b.confirmation && 'conf ' + b.confirmation, ll), { label: '⚑', color: '#9c5a6a' }).addTo(layer);
  });
}
