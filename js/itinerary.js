/* Day-by-day editable itinerary: drag-drop plans, place search, route stats,
   live place enrichment (rating/category/hours/photo), per-leg travel times,
   per-day weather. */
import { esc, gmapsPlaceUrl, amapsPlaceUrl, gmapsDirUrl, routeStats, optimizeOrder, optimizePreview, effectivePlans, thumbAccent,
  wikiSummaryUrl, wikiGeoUrl, pickSummaryThumb, pickGeoThumb, pickSummaryExtract, thumbCacheKey, factCacheKey,
  splitTime, joinTime, matchBooking, legFeasibility, dayLoad,
  overpassUrl, parseOverpass, nearbyCacheKey,
  fmtRating, priceTier, placePhotoUrl, fmtDuration, wmoIcon } from './core.js';
import { tripBookings } from './data.js';
import { BASE } from './sync.js';
import { enrich } from './places.js';
import { leg } from './routing.js';
import { dayWeather } from './weather.js';

const MODES = [['drive', '🚗'], ['walk', '🚶'], ['cycle', '🚲']];

const TYPE_ICON = { flight: '✈', hotel: '🛏', train: '🚆', bus: '🚌', car: '🚗', activity: '🎟', other: '📌' };

// Which place detail drawer is open (survives rerenders).
let openId = null;
// Last optimize, for the inline savings preview + one-tap undo (survives rerenders).
let lastOpt = null;

export function render(root, ctx) {
  const { state } = ctx;
  const td = state.tripData;
  const plans = effectivePlans(state.days, ovPlans(state));
  const bookings = tripBookings(state, state.trip.id);

  const presetBar = td.meta.presets ? `
    <div class="presetbar">${td.meta.presets.map(p => `
      <button class="chip ${state.preset === p.key ? 'on' : ''}" data-preset="${p.key}" title="${esc(p.desc || '')}">${p.label}</button>`).join('')}
    </div>` : '';

  root.innerHTML = `
    ${presetBar}
    <div class="ittools"><button class="printbtn" id="itprint" title="Open the print dialog — one clean page per day for an offline paper backup">🖨 Print day-by-day</button></div>
    <div class="days">${state.days.map(day => dayCard(day, plans[day.id], bookings, state)).join('')}</div>`;

  // B10: print/share — a clean per-day handout via the print stylesheet.
  const printBtn = root.querySelector('#itprint');
  if (printBtn) printBtn.onclick = () => window.print();

  hydrateThumbs(root);
  hydrateEnrich(root);
  hydrateLegs(root);
  hydrateWeather(root);

  // per-day travel mode (drive/walk/cycle)
  root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    const [dayId, m] = b.dataset.mode.split('|');
    setMode(ctx, dayId, m); ctx.rerender();
  });

  // preset switch
  root.querySelectorAll('[data-preset]').forEach(b => b.onclick = () => {
    const ov = ovFull(state); ov.preset = b.dataset.preset;
    ctx.save('itinerary', ov); ctx.rerender();
  });

  // drag-drop per day
  root.querySelectorAll('.planlist').forEach(ul => {
    if (window.Sortable) new Sortable(ul, {
      handle: '.grab', animation: 150,
      onEnd: () => {
        const dayId = ul.dataset.day;
        const ids = [...ul.querySelectorAll('li[data-pid]')].map(li => li.dataset.pid);
        const cur = plans[dayId];
        setPlan(ctx, dayId, ids.map(id => cur.find(p => p.id === id)).filter(Boolean));
      },
    });
  });

  // remove place
  root.querySelectorAll('[data-del]').forEach(b => b.onclick = () => {
    const [dayId, pid] = b.dataset.del.split('|');
    setPlan(ctx, dayId, plans[dayId].filter(p => p.id !== pid));
    ctx.rerender();
  });

  // toggle the place detail drawer (click name/thumb area or chevron)
  root.querySelectorAll('[data-open]').forEach(el => {
    const toggle = () => { const [, pid] = el.dataset.open.split('|'); openId = openId === pid ? null : pid; ctx.rerender(); };
    el.onclick = toggle;
    el.onkeydown = e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(); } };
  });

  // edit timing — two time inputs, recompose into the stored "start–end" string
  root.querySelectorAll('.pd-times input[type=time]').forEach(inp => inp.onchange = () => {
    const wrap = inp.closest('.pd-times');
    const start = wrap.querySelector('[data-pt=start]').value;
    const end = wrap.querySelector('[data-pt=end]').value;
    const dayId = inp.closest('.daycard').querySelector('.planlist').dataset.day;
    const p = plans[dayId].find(x => x.id === inp.dataset.pid); if (!p) return;
    p.time = joinTime(start, end) || undefined;
    setPlan(ctx, dayId, plans[dayId]); ctx.rerender();
  });

  // edit note — save on blur, keep drawer open
  root.querySelectorAll('.pd-note').forEach(ta => ta.onblur = () => {
    const [dayId, pid] = ta.dataset.note.split('|');
    const p = plans[dayId].find(x => x.id === pid); if (!p) return;
    const v = ta.value.trim();
    if (v === (p.note || p.d || '')) return;
    p.note = v || undefined; if (p.d && !v) p.d = undefined;
    setPlan(ctx, dayId, plans[dayId]); ctx.rerender();
  });

  hydrateFacts(root);

  // B07: nearby eat/do discovery in the open place drawer — one-tap add to the day.
  const tagOf = state.taxonomy.tags;
  root.querySelectorAll('.pd-nearby[data-nearby]').forEach(async el => {
    const ll = el.dataset.nearby.split(',').map(Number);
    const dayId = el.dataset.day;
    const sugg = await nearbyEat(ll);
    const list = el.querySelector('.muted') || el;
    if (!sugg.length) { list.textContent = 'No nearby spots found.'; return; }
    el.innerHTML = `<div class="pd-h">Nearby eat &amp; do</div>
      <div class="nearby">${sugg.slice(0, 8).map((s, i) =>
        `<button class="chip" data-near="${i}" title="${esc(s.cat)}${s.km != null ? ` · ${s.km} km` : ''}">+ ${tagOf[s.t] || '📍'} ${esc(s.n)}</button>`).join('')}</div>`;
    el.querySelectorAll('[data-near]').forEach(btn => btn.onclick = () => {
      const s = sugg[+btn.dataset.near];
      const cur = plans[dayId];
      cur.push({ id: 'p' + Math.random().toString(36).slice(2, 8), n: s.n, t: s.t, ll: s.ll, d: s.cat });
      setPlan(ctx, dayId, cur); ctx.rerender();
    });
  });

  // optimize order (keeps first stop) — store the previous order + savings for an undo banner
  root.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => {
    const dayId = b.dataset.opt;
    const day = state.days.find(d => d.id === dayId);
    const prev = plans[dayId].slice();
    const pv = optimizePreview(plans[dayId], p => p.ll, day && day.ll);
    setPlan(ctx, dayId, pv.optimized);
    lastOpt = { dayId, prev, savedKm: pv.savedKm, savedHours: pv.savedHours };
    ctx.rerender();
  });

  // undo the last optimize — restore the stored pre-optimize order
  root.querySelectorAll('[data-undo]').forEach(b => b.onclick = () => {
    const dayId = b.dataset.undo;
    if (lastOpt && lastOpt.dayId === dayId) { setPlan(ctx, dayId, lastOpt.prev); lastOpt = null; }
    ctx.rerender();
  });

  // add suggested stop
  root.querySelectorAll('[data-sug]').forEach(b => b.onclick = () => {
    const [dayId, idx] = b.dataset.sug.split('|');
    const day = state.days.find(d => d.id === dayId);
    const st = (day.stops || [])[+idx]; if (!st) return;
    const list = plans[dayId];
    list.push({ id: 'p' + Math.random().toString(36).slice(2, 8), n: st.n, t: st.t, ll: st.ll, d: st.d });
    setPlan(ctx, dayId, list); ctx.rerender();
  });

  // place search (Nominatim)
  root.querySelectorAll('.addplace input').forEach(inp => {
    inp.addEventListener('keydown', async e => {
      if (e.key !== 'Enter' || !inp.value.trim()) return;
      const menu = inp.parentElement.querySelector('.results');
      menu.innerHTML = '<div class="muted">searching…</div>';
      try {
        const r = await fetch(`https://nominatim.openstreetmap.org/search?format=json&limit=5&q=${encodeURIComponent(inp.value)}`);
        const res = await r.json();
        menu.innerHTML = res.length ? res.map((x, i) =>
          `<button data-pick="${i}">${esc(x.display_name.slice(0, 70))}</button>`).join('') : '<div class="muted">no results</div>';
        menu.querySelectorAll('[data-pick]').forEach(btn => btn.onclick = () => {
          const x = res[+btn.dataset.pick];
          const dayId = inp.closest('.addplace').dataset.day;
          const list = plans[dayId];
          list.push({ id: 'p' + Math.random().toString(36).slice(2, 8), n: x.display_name.split(',')[0], t: 'town', ll: [+x.lat, +x.lon], d: '' });
          setPlan(ctx, dayId, list); ctx.rerender();
        });
      } catch { menu.innerHTML = '<div class="muted">search failed</div>'; }
    });
  });
}

function dayCard(day, plan, bookings, state) {
  const dayBk = bookings.filter(b => String(b.start).slice(0, 10) === day._date);
  const pts = [day.ll, ...plan.map(p => p.ll)].filter(Boolean);
  const stats = pts.length > 1 ? routeStats(pts) : null;
  const tag = state.taxonomy.tags;
  const sugg = (day.stops || []).filter(st => !plan.some(p => p.n === st.n));
  const mode = dayMode(state, day.id);
  const load = dayLoad(plan, mode);
  return `
  <div class="daycard">
    <div class="dayhead">
      <span class="daynum">${day._n}</span>
      <div>
        <div class="daydate">${esc(day._label || day.date)}${day.drive ? ` · 🚐 ~${day.drive}h leg` : ''}${day.ll && day._date ? `<span class="wx" data-ll="${day.ll[0]},${day.ll[1]}" data-date="${day._date}"></span>` : ''}</div>
        <h3>${esc(day.short)}</h3>
      </div>
      <div class="dayactions">
        <span class="modes" data-day="${day.id}">${MODES.map(([m, ic]) =>
          `<button class="modebtn ${m === mode ? 'on' : ''}" data-mode="${day.id}|${m}" title="${m}">${ic}</button>`).join('')}</span>
        ${plan.length > 2 ? `<button class="mini" data-opt="${day.id}" title="Reorder stops by nearest-neighbour">⚡ optimize</button>` : ''}
        ${pts.length > 1 ? `<a class="mini" target="_blank" rel="noopener" href="${gmapsDirUrl(pts.slice(0, 10))}">↗ route</a>` : ''}
      </div>
    </div>
    ${day.note ? `<p class="note">${esc(day.note)}</p>` : ''}
    ${dayBk.length ? `<div class="bkchips">${dayBk.map(b =>
      `<span class="bkchip">${TYPE_ICON[b.type] || '📌'} ${esc(b.title.split('·')[0].trim())}</span>`).join('')}</div>` : ''}
    <ul class="planlist" data-day="${day.id}">
      ${plan.map((p, i) => placeRow(day, p, plan[i + 1], mode, dayBk, tag)).join('')}
    </ul>
    ${stats ? `<div class="routestats">~${stats.km} km · ~${stats.hours} h driving today</div>` : ''}
    ${lastOpt && lastOpt.dayId === day.id ? `<div class="optundo">⚡ Reordered nearest-first${
      lastOpt.savedKm ? ` · saved ~${lastOpt.savedKm} km / ~${lastOpt.savedHours} h` : ' · already shortest'
    }<button class="mini" data-undo="${day.id}" title="Restore the previous order">↶ undo</button></div>` : ''}
    ${load.overpacked ? `<div class="dayload-warn">⚠ Packed day — ~${fmtDuration(load.totalMins)} of stops + travel</div>` : ''}
    ${sugg.length ? `<div class="suggs">${sugg.slice(0, 6).map((st, i) =>
      `<button class="chip" data-sug="${day.id}|${(day.stops || []).indexOf(st)}" title="${esc(st.d || '')}">+ ${tag[st.t] || '•'} ${esc(st.n)}</button>`).join('')}</div>` : ''}
    <div class="addplace" data-day="${day.id}">
      <input placeholder="+ add a place — type & press Enter" />
      <div class="results"></div>
    </div>
    ${day.sleep ? `<div class="sleep">Sleep · ${esc(day.sleep)}</div>` : ''}
  </div>`;
}

function placeRow(day, p, next, mode, dayBk, tag) {
  const open = openId === p.id;
  const thumb = p.img
    ? `<img class="pthumb" loading="lazy" alt="" src="${esc(p.img)}">`
    : `<span class="pthumb ph" data-thumb="${esc(p.n)}"${p.ll ? ` data-ll="${p.ll[0]},${p.ll[1]}"` : ''} style="--acc:${thumbAccent(p.t)}">${tag[p.t] || '📍'}</span>`;
  const legHtml = (next && p.ll && next.ll)
    ? `<div class="pleg" data-from="${p.ll[0]},${p.ll[1]}" data-to="${next.ll[0]},${next.ll[1]}" data-mode="${mode}" data-ft="${esc(p.time || '')}" data-tt="${esc(next.time || '')}"></div>` : '';
  return `
  <li data-pid="${p.id}"${open ? ' class="open"' : ''}>
    <div class="prow">
      <span class="grab">⠿</span>
      ${thumb}
      <div class="pbody" data-open="${day.id}|${p.id}" data-enrich="${esc(p.n)}"${p.ll ? ` data-ll="${p.ll[0]},${p.ll[1]}"` : ''} role="button" tabindex="0">
        <div class="pname">${tag[p.t] || '•'} <b>${esc(p.n)}</b>${p.time ? ` <span class="ptime">${esc(p.time)}</span>` : ''}</div>
        <div class="pmeta"></div>
        ${p.note || p.d ? `<div class="pdesc">${esc(p.note || p.d)}</div>` : ''}
      </div>
      <span class="plinks">
        <button class="pchev" data-open="${day.id}|${p.id}" title="Details" aria-expanded="${open}">${open ? '▾' : '▸'}</button>
        <button data-del="${day.id}|${p.id}" title="Remove">✕</button>
      </span>
    </div>
    ${open ? placeDetail(day, p, dayBk, tag) : ''}
    ${legHtml}
  </li>`;
}

function placeDetail(day, p, dayBk, tag) {
  const [t0, t1] = splitTime(p.time);
  const res = dayBk.filter(b => matchBooking(p, b));
  const place = gmapsPlaceUrl(p.n, p.ll);
  return `
  <div class="pdetail">
    <div class="pd-times">
      <label>From <input type="time" data-pt="start" data-pid="${p.id}" value="${esc(t0)}"></label>
      <label>To <input type="time" data-pt="end" data-pid="${p.id}" value="${esc(t1)}"></label>
    </div>
    <textarea class="pd-note" data-note="${day.id}|${p.id}" placeholder="Notes…">${esc(p.note || p.d || '')}</textarea>
    ${res.length ? `<div class="pd-res"><div class="pd-h">Reservations</div>${res.map(b => `
      <div class="pd-resitem">${TYPE_ICON[b.type] || '📌'} <b>${esc(b.title)}</b>${b.confirmation ? ` <span class="pd-conf">${esc(b.confirmation)}</span>` : ''}</div>`).join('')}</div>` : ''}
    <div class="pd-fact" data-fact="${esc(p.n)}"${p.ll ? ` data-ll="${p.ll[0]},${p.ll[1]}"` : ''}>${p.ll || p.n ? 'Loading fun fact…' : ''}</div>
    ${p.ll ? `<div class="pd-nearby" data-nearby="${p.ll[0]},${p.ll[1]}" data-day="${day.id}"><div class="pd-h">Nearby eat &amp; do</div><div class="muted">Finding nearby spots…</div></div>` : ''}
    <div class="pd-links">
      <a target="_blank" rel="noopener" href="${place}">📍 Google Maps</a>
      <a target="_blank" rel="noopener" href="${amapsPlaceUrl(p.n, p.ll)}"> Apple Maps</a>
      <a target="_blank" rel="noopener" href="${place}">★ Google reviews</a>
    </div>
  </div>`;
}

// Progressive enhancement: swap a real Wikipedia photo into each emoji placeholder tile.
// Cached in localStorage (incl. negative cache); failures stay as the emoji tile.
async function resolveThumb(name, ll) {
  const key = thumbCacheKey(name);
  const cached = localStorage.getItem(key);
  if (cached !== null) return cached || null;
  let src = null;
  try {
    const r = await fetch(wikiSummaryUrl(name));
    if (r.ok) src = pickSummaryThumb(await r.json());
  } catch {}
  if (!src && ll) {
    try {
      const r = await fetch(wikiGeoUrl(ll));
      if (r.ok) src = pickGeoThumb(await r.json());
    } catch {}
  }
  localStorage.setItem(key, src || '');
  return src;
}

function hydrateThumbs(root) {
  root.querySelectorAll('.pthumb.ph[data-thumb]').forEach(async el => {
    const name = el.dataset.thumb;
    const ll = el.dataset.ll ? el.dataset.ll.split(',').map(Number) : null;
    const src = await resolveThumb(name, ll);
    if (src) {
      el.style.backgroundImage = `url("${src}")`;
      el.classList.add('has-photo');
      el.textContent = '';
    }
  });
}

// Live place enrichment: rating · category · price · hours into .pmeta, and a
// Google Places photo into the tile (preloaded so a missing key never blanks it).
function hydrateEnrich(root) {
  root.querySelectorAll('.pbody[data-enrich]').forEach(async el => {
    const name = el.dataset.enrich;
    const ll = el.dataset.ll ? el.dataset.ll.split(',').map(Number) : null;
    const v = await enrich(name, ll);
    if (!v) return;
    const meta = el.querySelector('.pmeta');
    if (meta) {
      const open = v.openNow == null ? '' : (v.openNow ? (v.hoursToday ? 'open · ' + v.hoursToday : 'open now') : 'closed');
      meta.textContent = [fmtRating(v.rating, v.reviews), v.category, priceTier(v.priceLevel), open].filter(Boolean).join(' · ');
    }
    if (v.photoRef) {
      const ph = el.closest('li').querySelector('.pthumb.ph');
      if (ph) {
        const im = new Image();
        im.onload = () => { ph.style.backgroundImage = `url("${im.src}")`; ph.classList.add('has-photo'); ph.textContent = ''; };
        im.src = placePhotoUrl(BASE, v.photoRef, 160);
      }
    }
  });
}

// Per-leg travel time/distance connector between consecutive stops.
function hydrateLegs(root) {
  root.querySelectorAll('.pleg[data-from]').forEach(async el => {
    const a = el.dataset.from.split(',').map(Number), b = el.dataset.to.split(',').map(Number);
    const v = await leg(a, b, el.dataset.mode);
    if (!v) return;
    const feas = legFeasibility(el.dataset.ft, el.dataset.tt, v.mins);
    let txt = `⌄ ${fmtDuration(v.mins)} · ${v.km} km`;
    if (feas && feas.tight) { txt += ` · ⚠ tight by ${fmtDuration(feas.shortBy)}`; el.classList.add('leg-tight'); }
    el.textContent = txt;
  });
}

// Per-day weather chip (open-meteo); silent off-range or offline.
function hydrateWeather(root) {
  root.querySelectorAll('.wx[data-ll]').forEach(async el => {
    const ll = el.dataset.ll.split(',').map(Number);
    const w = await dayWeather(ll, el.dataset.date);
    if (w) el.textContent = ` · ${wmoIcon(w.code)} ${Math.round(w.tmax)}°/${Math.round(w.tmin)}°${w.precip ? ' · ' + w.precip + '%' : ''}`;
  });
}

// Wikipedia summary extract as a "fun fact" in the open detail drawer (cached, incl. misses).
async function resolveFact(name) {
  const key = factCacheKey(name);
  const cached = localStorage.getItem(key);
  if (cached !== null) return cached || null;
  let text = null;
  try {
    const r = await fetch(wikiSummaryUrl(name));
    if (r.ok) text = pickSummaryExtract(await r.json());
  } catch {}
  localStorage.setItem(key, text || '');
  return text;
}

// Nearby eat/do POIs via Overpass (free OSM), cached 7 days; [] on failure/offline.
async function nearbyEat(ll) {
  const key = nearbyCacheKey(ll);
  try {
    const raw = localStorage.getItem(key);
    if (raw) { const o = JSON.parse(raw); if (Date.now() - o._t < 7 * 864e5) return o.v; }
  } catch {}
  let v = [];
  try {
    const r = await fetch(overpassUrl(ll));
    if (r.ok) v = parseOverpass(await r.json(), ll);
  } catch {}
  try { localStorage.setItem(key, JSON.stringify({ _t: Date.now(), v })); } catch {}
  return v;
}

function hydrateFacts(root) {
  root.querySelectorAll('.pd-fact[data-fact]').forEach(async el => {
    const text = await resolveFact(el.dataset.fact);
    if (text) { el.textContent = text; el.classList.add('has-fact'); }
    else { el.textContent = 'No fun fact found for this place.'; el.classList.add('no-fact'); }
  });
}

const ovFull = state => ({ preset: state.preset, dayPlans: {}, ...(state.overlay.itinerary || {}) });
const ovPlans = state => (state.overlay.itinerary || {}).dayPlans || null;

function setPlan(ctx, dayId, list) {
  const ov = ovFull(ctx.state);
  ov.dayPlans = { ...(ov.dayPlans || {}), [dayId]: list };
  ctx.save('itinerary', ov);
}

const dayMode = (state, dayId) => ((state.overlay.itinerary || {}).dayModes || {})[dayId] || 'drive';

function setMode(ctx, dayId, mode) {
  const ov = ovFull(ctx.state);
  ov.dayModes = { ...(ov.dayModes || {}), [dayId]: mode };
  ctx.save('itinerary', ov);
}
