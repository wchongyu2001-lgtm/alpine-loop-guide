/* Budget: guide estimates (from v1 data) + actual expenses with splitting,
   multi-currency roll-up (booked items converted to the trip base) + settle-up. */
import { esc, fmtMoney, computeBalances, convert, simplifyDebts } from './core.js';
import { tripBookings } from './data.js';
import { rates } from './fx.js';

let fxRates = null; // {CUR: units per 1 base}, loaded once per session

export function render(root, ctx) {
  const { state } = ctx;
  const td = state.tripData;
  const cur = td.meta.curSymbol || '€';
  const base = state.trip.currency || 'EUR';
  if (!fxRates) rates(base).then(r => { fxRates = r; ctx.rerender(); });
  const toBase = (amt, c) => (!c || c === base || !fxRates || !fxRates[c]) ? amt : convert(amt, 1 / fxRates[c]);
  const ov = exOv(state);
  const mode = ov.mode || 'bu';

  // --- estimates from guide data ---
  const est = state.days.map(d => {
    const b = (td.budget || {})[d.id] || {};
    const act = typeof b.act === 'object' ? (b.act[mode === 'sp' ? 'sp' : 'bu'] || 0) : (b.act || 0);
    const fuel = (d.drive || 0) * (td.meta.fuelPerH || 0);
    const total = (b.camp || 0) + (b.food || 0) + act + (b.x || 0) + fuel;
    return { d, total };
  });
  const estTotal = est.reduce((s, e) => s + e.total, 0);
  const hasSplurge = Object.values(td.budget || {}).some(b => typeof b.act === 'object');

  // --- actuals: manual expenses + priced bookings ---
  const manual = ov.items || [];
  const booked = tripBookings(state, state.trip.id)
    .filter(b => b.price && b.price.amount)
    .map(b => ({ id: b.id, title: b.title, amount: toBase(b.price.amount, b.price.currency), origCur: b.price.currency, cat: b.type, paidBy: null, fromBooking: true }));
  const all = [...booked, ...manual];
  const actualTotal = all.reduce((s, e) => s + (+e.amount || 0), 0);
  const bal = computeBalances(manual, state.travellers);
  const transfers = simplifyDebts(bal.net);

  const byCat = {};
  all.forEach(e => { const c = e.cat || 'other'; byCat[c] = (byCat[c] || 0) + (+e.amount || 0); });

  root.innerHTML = `
    <div class="budgrid">
      <div class="budcard">
        <h3>Guide estimate ${hasSplurge ? `
          <span class="modetoggle">
            <button class="chip ${mode === 'bu' ? 'on' : ''}" data-mode="bu">budget</button>
            <button class="chip ${mode === 'sp' ? 'on' : ''}" data-mode="sp">splurge</button>
          </span>` : ''}</h3>
        <div class="bignum">${fmtMoney(estTotal, cur)}</div>
        <div class="muted">per couple · ${state.days.length} days · camp + food + activities + fuel</div>
        <table class="budtable">
          ${est.map(e => `<tr><td>${e.d._n}. ${esc(e.d.short)}</td><td>${fmtMoney(e.total, cur)}</td></tr>`).join('')}
        </table>
      </div>

      <div class="budcard">
        <h3>Actually spent</h3>
        <div class="bignum">${fmtMoney(actualTotal, cur)}</div>
        <div class="settle">${transfers.length
          ? transfers.map(t => `<div>${esc(t.from)} owes ${esc(t.to)} <b>${fmtMoney(t.amount, cur)}</b></div>`).join('')
          : 'All square ✓'}</div>
        <div class="catbars">
          ${Object.entries(byCat).sort((a, b) => b[1] - a[1]).map(([c, v]) => `
            <div class="catbar"><span>${esc(c)}</span>
              <i style="width:${actualTotal ? Math.round(v / actualTotal * 100) : 0}%"></i>
              <b>${fmtMoney(v, cur)}</b></div>`).join('') || '<p class="muted">Nothing logged yet.</p>'}
        </div>
        <ul class="exlist">
          ${all.map(e => `
            <li>
              <span>${esc(e.title)}${e.fromBooking ? ' <small class="muted">(booking)</small>' : ''}</span>
              <span>${e.paidBy ? `<small class="muted">${esc(e.paidBy)} paid</small> ` : ''}${fmtMoney(e.amount, cur)}
              ${!e.fromBooking ? `<button class="mini" data-delex="${e.id}">✕</button>` : ''}</span>
            </li>`).join('')}
        </ul>
        <form id="exform">
          <input name="title" placeholder="Expense — e.g. groceries Bardolino" required />
          <input name="amount" type="number" step="0.01" placeholder="${cur}" required />
          <select name="cat"><option>food</option><option>camp</option><option>activity</option><option>fuel</option><option>transport</option><option>other</option></select>
          <select name="paidBy">${state.travellers.map(t => `<option>${esc(t)}</option>`).join('')}</select>
          <select name="split">
            <option value="equal">split 50/50</option>
            <option value="solo">payer only</option>
          </select>
          <button>Add</button>
        </form>
      </div>
    </div>`;

  root.querySelectorAll('[data-mode]').forEach(b => b.onclick = () => {
    const o = exOv(state); o.mode = b.dataset.mode;
    ctx.save('expenses', o); ctx.rerender();
  });

  root.querySelectorAll('[data-delex]').forEach(b => b.onclick = () => {
    const o = exOv(state);
    o.items = (o.items || []).filter(e => e.id !== b.dataset.delex);
    ctx.save('expenses', o); ctx.rerender();
  });

  root.querySelector('#exform').onsubmit = e => {
    e.preventDefault();
    const f = new FormData(e.target);
    const o = exOv(state);
    o.items = [...(o.items || []), {
      id: 'ex' + Date.now(), title: f.get('title'), amount: +f.get('amount'),
      cat: f.get('cat'), paidBy: f.get('paidBy'), split: { type: f.get('split') },
      date: new Date().toISOString().slice(0, 10),
    }];
    ctx.save('expenses', o); ctx.rerender();
  };
}

const exOv = state => ({ items: [], mode: 'bu', ...(state.overlay.expenses || {}) });
