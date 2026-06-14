/* Map view — Google Maps when a key is set in config.js, else Leaflet/OpenStreetMap.
   Both backends share collectMapData() so the whole-trip / per-day / per-category views,
   coloured numbered pins, popups and deep links are identical either way. */
import { esc, gmapsUrl, amapsUrl, gmapsPlaceUrl, amapsPlaceUrl, effectivePlans } from './core.js';
import { tripBookings } from './data.js';
import { MAPS_KEY } from './config.js';

// ---- popups (shared) ----
const popup = (name, desc, ll) => popupWith(name, desc, gmapsUrl(ll, name), amapsUrl(ll, name));
const placePopup = (name, desc, ll) => popupWith(name, desc, gmapsPlaceUrl(name, ll), amapsPlaceUrl(name, ll));
const popupWith = (name, desc, g, a) => `
  <b>${esc(name)}</b>
  ${desc ? `<div class="popdesc">${esc(desc)}</div>` : ''}
  <div class="poplinks">
    <a target="_blank" rel="noopener" href="${g}">Google Maps ↗</a> ·
    <a target="_blank" rel="noopener" href="${a}">Apple Maps ↗</a>
  </div>`;

// ---- what to plot (shared by both backends) ----
// Returns { markers:[{ll,label,color,cls,html}], route:{ll[],color,dashed}|null, bounds:ll[] }
function collectMapData(state, view) {
  const regions = state.taxonomy.regions || {};
  const catColors = state.taxonomy.catColors || {};
  const plans = effectivePlans(state.days, (state.overlay.itinerary || {}).dayPlans || null);
  const markers = [], bounds = [];
  let route = null;
  const add = (ll, html, o) => markers.push({ ll, html, label: o.label, color: o.color, cls: o.cls });

  if (view === 'trip') {
    const pts = [];
    state.days.forEach(d => {
      if (!d.ll) return;
      pts.push(d.ll); bounds.push(d.ll);
      const color = (regions[d.region] || {}).color || '#5a6342';
      add(d.ll, popup(`Day ${d._n} · ${d.short}`, d.note, d.ll), { label: d._n, color });
    });
    if (pts.length > 1) route = { ll: pts, color: '#2a5a5a', dashed: true };
    // booking pins — shown but excluded from bounds (e.g. a far-away departure airport)
    tripBookings(state, state.trip.id).forEach(b => {
      if (!b.location || b.location.lat == null) return;
      add([b.location.lat, b.location.lng], popup(b.title, b.confirmation && 'conf ' + b.confirmation, [b.location.lat, b.location.lng]), { label: '⚑', color: '#9c5a6a' });
    });
  } else if (view.startsWith('day:')) {
    const d = state.days.find(x => x.id === view.slice(4));
    const pts = [];
    if (d && d.ll) { pts.push(d.ll); bounds.push(d.ll); add(d.ll, popup(`Day ${d._n} base · ${d.short}`, d.sleep && 'Sleep · ' + d.sleep, d.ll), { label: '⌂', color: '#1a1814' }); }
    (d && plans[d.id] || []).forEach((p, i) => {
      if (!p.ll) return;
      pts.push(p.ll); bounds.push(p.ll);
      add(p.ll, placePopup(p.n, p.note || p.d, p.ll), { label: i + 1, color: catColors[p.t] || '#b9531a' });
    });
    (d && d.stops || []).forEach(st => {
      if (!st.ll || (plans[d.id] || []).some(p => p.n === st.n)) return;
      bounds.push(st.ll);
      add(st.ll, placePopup(st.n, st.d, st.ll), { label: '+', color: '#9b9484', cls: 'ghost' });
    });
    if (pts.length > 1) route = { ll: pts, color: '#b9531a', dashed: false };
  } else if (view.startsWith('cat:')) {
    const cat = view.slice(4);
    state.days.forEach(d => {
      [...(plans[d.id] || []), ...(d.stops || [])].forEach(p => {
        if (p.t !== cat || !p.ll) return;
        bounds.push(p.ll);
        add(p.ll, placePopup(p.n, (p.note || p.d || '') + ` — day ${d._n}`, p.ll), { label: '•', color: catColors[cat] || '#b9531a' });
      });
    });
  }
  return { markers, route, bounds };
}

// ---- view selector (shared markup) ----
function barHtml(state) {
  const cats = state.taxonomy.cats || {};
  return `
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
}

export function render(root, ctx) {
  const { state } = ctx;
  root.innerHTML = barHtml(state);
  const mapEl = root.querySelector('#map');
  const sel = root.querySelector('#mapview');
  if (MAPS_KEY) renderGoogle(mapEl, sel, state);
  else renderLeaflet(mapEl, sel, state);
}

// ================= Leaflet backend (fallback / no key) =================
let lmap, llayer;
function renderLeaflet(mapEl, sel, state) {
  const td = state.tripData;
  if (lmap) { lmap.remove(); lmap = null; }
  lmap = L.map(mapEl).setView(td.meta.mapCenter, td.meta.mapZoom);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { attribution: '© OpenStreetMap', maxZoom: 18 }).addTo(lmap);
  llayer = L.layerGroup().addTo(lmap);
  const draw = view => {
    llayer.clearLayers();
    const { markers, route, bounds } = collectMapData(state, view);
    markers.forEach(m => {
      const icon = L.divIcon({ className: 'pin' + (m.cls ? ' ' + m.cls : ''), html: `<span style="background:${m.color || '#5a6342'}">${m.label || '•'}</span>`, iconSize: [26, 26], iconAnchor: [13, 13] });
      L.marker(m.ll, { icon }).bindPopup(m.html, { maxWidth: 260 }).addTo(llayer);
    });
    if (route) L.polyline(route.ll, { color: route.color, weight: 3, opacity: route.dashed ? .6 : .7, dashArray: route.dashed ? '6 6' : null }).addTo(llayer);
    if (bounds.length) lmap.fitBounds(bounds, { padding: [30, 30] });
  };
  sel.onchange = () => draw(sel.value);
  draw('trip');
}

// ================= Google Maps backend (key set) =================
let gmap, gmarkers = [], gline, ginfo;
function renderGoogle(mapEl, sel, state) {
  const td = state.tripData;
  mapEl.innerHTML = '<p class="muted" style="padding:1rem">Loading Google Maps…</p>';
  loadGoogle(MAPS_KEY).then(() => {
    mapEl.innerHTML = '';
    gmap = new google.maps.Map(mapEl, {
      center: { lat: td.meta.mapCenter[0], lng: td.meta.mapCenter[1] },
      zoom: td.meta.mapZoom, mapTypeControl: true, streetViewControl: false, fullscreenControl: true,
    });
    ginfo = new google.maps.InfoWindow();
    const draw = view => {
      gmarkers.forEach(m => m.setMap(null)); gmarkers = [];
      if (gline) { gline.setMap(null); gline = null; }
      const { markers, route, bounds } = collectMapData(state, view);
      const b = new google.maps.LatLngBounds();
      markers.forEach(m => {
        const pos = { lat: m.ll[0], lng: m.ll[1] };
        const marker = new google.maps.Marker({
          position: pos, map: gmap,
          label: { text: String(m.label || '•'), color: '#fff', fontSize: '11px', fontWeight: '700' },
          icon: { path: google.maps.SymbolPath.CIRCLE, scale: 13, fillColor: m.color || '#5a6342', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 2 },
          opacity: m.cls === 'ghost' ? 0.6 : 1,
        });
        marker.addListener('click', () => { ginfo.setContent(m.html); ginfo.open(gmap, marker); });
        gmarkers.push(marker);
      });
      if (route) gline = new google.maps.Polyline({
        path: route.ll.map(ll => ({ lat: ll[0], lng: ll[1] })), map: gmap, geodesic: true,
        strokeColor: route.color, strokeOpacity: route.dashed ? 0 : 0.75, strokeWeight: 3,
        icons: route.dashed ? [{ icon: { path: 'M 0,-1 0,1', strokeOpacity: 0.7, scale: 3 }, offset: '0', repeat: '12px' }] : undefined,
      });
      bounds.forEach(ll => b.extend({ lat: ll[0], lng: ll[1] }));
      if (!b.isEmpty()) gmap.fitBounds(b, 40);
    };
    sel.onchange = () => draw(sel.value);
    draw('trip');
  }).catch(() => {
    // Bad key / referrer / offline → fall back to Leaflet so the map still works.
    mapEl.innerHTML = '';
    renderLeaflet(mapEl, sel, state);
  });
}

let googlePromise;
function loadGoogle(key) {
  if (window.google && window.google.maps) return Promise.resolve();
  if (googlePromise) return googlePromise;
  googlePromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&v=weekly&loading=async`;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('google maps failed to load'));
    document.head.appendChild(s);
  });
  return googlePromise;
}
