/* Per-trip checklists: packing, pre-trip to-dos. Whole-array sync, last write wins. */
import { esc, effectivePlans, suggestPacking } from './core.js';
import { dayWeather } from './weather.js';

const TEMPLATES = {
  'Packing — van trip': ['Passports + IDP', 'Phone mounts + chargers', 'Power bank', 'Water shoes', 'Rain shells', 'Headlamps', 'Quick-dry towels', 'First-aid kit', 'Reusable bottles', 'Camping chairs'],
  'Packing — city': ['Passports', 'Day bag', 'Comfortable shoes', 'Adapters', 'Meds', 'Sunglasses'],
  'Pre-trip basics': ['Travel insurance', 'Offline maps downloaded', 'Bank travel notice', 'eSIM installed', 'Copies of bookings offline'],
};

export function render(root, ctx) {
  const { state } = ctx;
  const lists = getLists(state);

  root.innerHTML = `
    <div class="cl-toolbar">
      <button class="mini" id="cl-new">＋ New list</button>
      <button class="mini" id="cl-suggest">🎒 Suggest packing list</button>
      <select id="cl-template">
        <option value="">＋ From template…</option>
        ${Object.keys(TEMPLATES).map(t => `<option>${t}</option>`).join('')}
      </select>
    </div>
    <div class="cl-grid">
      ${lists.map((l, li) => `
      <div class="clcard">
        <div class="clhead">
          <h3>${esc(l.title)}</h3>
          <span class="muted">${l.items.filter(i => i.done).length}/${l.items.length}</span>
          <button class="mini" data-dellist="${li}" title="Delete list">✕</button>
        </div>
        <ul>
          ${l.items.map((it, ii) => `
          <li class="${it.done ? 'done' : ''}">
            <label><input type="checkbox" data-tick="${li}|${ii}" ${it.done ? 'checked' : ''}/> ${esc(it.t)}</label>
            <button class="mini" data-delitem="${li}|${ii}">✕</button>
          </li>`).join('')}
        </ul>
        <form data-additem="${li}"><input placeholder="+ add item" /></form>
      </div>`).join('') || '<p class="muted">No checklists yet — start one above.</p>'}
    </div>`;

  const commit = ls => { ctx.save('checklists', ls); ctx.rerender(); };

  root.querySelector('#cl-new').onclick = () => {
    const title = prompt('List title:'); if (!title) return;
    commit([...lists, { id: 'cl' + Date.now(), title, items: [] }]);
  };
  root.querySelector('#cl-suggest').onclick = async e => {
    const btn = e.currentTarget;
    btn.disabled = true; btn.textContent = 'Suggesting…';
    const ovPlans = (state.overlay.itinerary || {}).dayPlans || null;
    const plans = effectivePlans(state.days, ovPlans);
    const dayInfos = await Promise.all(state.days.map(async d => ({
      weather: (d.ll && d._date) ? await dayWeather(d.ll, d._date) : null,
      text: (plans[d.id] || []).map(p => `${p.n || ''} ${p.note || p.d || ''}`).join(' ') + ' ' + (d.short || ''),
    })));
    const items = suggestPacking(dayInfos);
    commit([...lists, { id: 'cl' + Date.now(), title: 'Packing (suggested)', items: items.map(t => ({ t, done: false })) }]);
  };
  root.querySelector('#cl-template').onchange = e => {
    const t = e.target.value; if (!t) return;
    commit([...lists, { id: 'cl' + Date.now(), title: t, items: TEMPLATES[t].map(x => ({ t: x, done: false })) }]);
  };
  root.querySelectorAll('[data-tick]').forEach(cb => cb.onchange = () => {
    const [li, ii] = cb.dataset.tick.split('|').map(Number);
    lists[li].items[ii].done = cb.checked; commit(lists);
  });
  root.querySelectorAll('[data-delitem]').forEach(b => b.onclick = () => {
    const [li, ii] = b.dataset.delitem.split('|').map(Number);
    lists[li].items.splice(ii, 1); commit(lists);
  });
  root.querySelectorAll('[data-dellist]').forEach(b => b.onclick = () => {
    if (!confirm('Delete this list?')) return;
    lists.splice(+b.dataset.dellist, 1); commit(lists);
  });
  root.querySelectorAll('[data-additem]').forEach(f => f.onsubmit = e => {
    e.preventDefault();
    const v = f.querySelector('input').value.trim(); if (!v) return;
    lists[+f.dataset.additem].items.push({ t: v, done: false }); commit(lists);
  });
}

const getLists = state =>
  state.overlay.checklists || JSON.parse(JSON.stringify(state.tripData.checklists || []));
