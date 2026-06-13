/* Day-by-day editable itinerary: drag-drop plans, place search, route stats. */
import { esc, gmapsUrl, amapsUrl, gmapsDirUrl, routeStats, optimizeOrder, effectivePlans, thumbAccent } from './core.js';
import { tripBookings } from './data.js';

const TYPE_ICON = { flight: '✈', hotel: '🛏', train: '🚆', bus: '🚌', car: '🚗', activity: '🎟', other: '📌' };

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
    <div class="days">${state.days.map(day => dayCard(day, plans[day.id], bookings, state)).join('')}</div>`;

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

  // edit time/note inline
  root.querySelectorAll('[data-edit]').forEach(b => b.onclick = () => {
    const [dayId, pid] = b.dataset.edit.split('|');
    const p = plans[dayId].find(x => x.id === pid); if (!p) return;
    const time = prompt('Time (e.g. 09:00–10:30, blank to clear):', p.time || '');
    if (time === null) return;
    const note = prompt('Note:', p.note || p.d || '');
    if (note === null) return;
    p.time = time || undefined; p.note = note || undefined;
    setPlan(ctx, dayId, plans[dayId]); ctx.rerender();
  });

  // optimize order (keeps first stop)
  root.querySelectorAll('[data-opt]').forEach(b => b.onclick = () => {
    const dayId = b.dataset.opt;
    setPlan(ctx, dayId, optimizeOrder(plans[dayId], p => p.ll));
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
  return `
  <div class="daycard">
    <div class="dayhead">
      <span class="daynum">${day._n}</span>
      <div>
        <div class="daydate">${esc(day._label || day.date)}${day.drive ? ` · 🚐 ~${day.drive}h leg` : ''}</div>
        <h3>${esc(day.short)}</h3>
      </div>
      <div class="dayactions">
        ${plan.length > 2 ? `<button class="mini" data-opt="${day.id}" title="Reorder stops by nearest-neighbour">⚡ optimize</button>` : ''}
        ${pts.length > 1 ? `<a class="mini" target="_blank" rel="noopener" href="${gmapsDirUrl(pts.slice(0, 10))}">↗ route</a>` : ''}
      </div>
    </div>
    ${day.note ? `<p class="note">${esc(day.note)}</p>` : ''}
    ${dayBk.length ? `<div class="bkchips">${dayBk.map(b =>
      `<span class="bkchip">${TYPE_ICON[b.type] || '📌'} ${esc(b.title.split('·')[0].trim())}</span>`).join('')}</div>` : ''}
    <ul class="planlist" data-day="${day.id}">
      ${plan.map(p => `
      <li data-pid="${p.id}">
        <span class="grab">⠿</span>
        <div class="pbody">
          <div class="pname">${tag[p.t] || '•'} <b>${esc(p.n)}</b>${p.time ? ` <span class="ptime">${esc(p.time)}</span>` : ''}</div>
          ${p.note || p.d ? `<div class="pdesc">${esc(p.note || p.d)}</div>` : ''}
        </div>
        <span class="plinks">
          ${p.ll ? `<a target="_blank" rel="noopener" title="Google Maps" href="${gmapsUrl(p.ll, p.n)}">G</a>
          <a target="_blank" rel="noopener" title="Apple Maps" href="${amapsUrl(p.ll, p.n)}"></a>` : ''}
          <button data-edit="${day.id}|${p.id}" title="Edit time/note">✎</button>
          <button data-del="${day.id}|${p.id}" title="Remove">✕</button>
        </span>
        ${p.img
          ? `<img class="pthumb" loading="lazy" alt="" src="${esc(p.img)}">`
          : `<span class="pthumb ph" style="--acc:${thumbAccent(p.t)}">${tag[p.t] || '📍'}</span>`}
      </li>`).join('')}
    </ul>
    ${stats ? `<div class="routestats">~${stats.km} km · ~${stats.hours} h driving today</div>` : ''}
    ${sugg.length ? `<div class="suggs">${sugg.slice(0, 6).map((st, i) =>
      `<button class="chip" data-sug="${day.id}|${(day.stops || []).indexOf(st)}" title="${esc(st.d || '')}">+ ${tag[st.t] || '•'} ${esc(st.n)}</button>`).join('')}</div>` : ''}
    <div class="addplace" data-day="${day.id}">
      <input placeholder="+ add a place — type & press Enter" />
      <div class="results"></div>
    </div>
    ${day.sleep ? `<div class="sleep">Sleep · ${esc(day.sleep)}</div>` : ''}
  </div>`;
}

const ovFull = state => ({ preset: state.preset, dayPlans: {}, ...(state.overlay.itinerary || {}) });
const ovPlans = state => (state.overlay.itinerary || {}).dayPlans || null;

function setPlan(ctx, dayId, list) {
  const ov = ovFull(ctx.state);
  ov.dayPlans = { ...(ov.dayPlans || {}), [dayId]: list };
  ctx.save('itinerary', ov);
}
