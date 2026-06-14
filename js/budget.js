/* Budget: guide estimates (from v1 data) + actual expenses with splitting,
   multi-currency roll-up (booked items converted to the trip base) + settle-up. */
import { esc, fmtMoney, computeBalances, convert, simplifyDebts, budgetVsActual, tripEstimate, fxConvert } from './core.js';
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

  // --- currency converter setup ---
  const convList = (fxRates ? Object.keys(fxRates).filter(c => c !== base) : ['USD']).sort();
  let convHome = ov.convHome && convList.includes(ov.convHome) ? ov.convHome
    : (convList.includes('USD') ? 'USD' : convList[0]);
  const convReady = !!(fxRates && convHome && fxRates[convHome]);
  const convRate = convReady ? Math.round(fxRates[convHome] * 1e4) / 1e4 : null;

  // --- estimates from guide data ---
  const { rows: est, total: estTotal } = tripEstimate(state.days, td.budget, td.meta, mode);
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

  // budget vs actual per day (dated expenses mapped onto each day's estimate)
  const bva = budgetVsActual(
    est.map(e => ({ id: e.d.id, iso: e.d._date, label: e.d.short, estimate: e.total })),
    all);
  const bvaRows = bva.rows.filter(r => r.estimate || r.actual);

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
          <input name="amount" type="number" step="0.01" inputmode="decimal" placeholder="${cur} amount" required autofocus />
          <input name="title" placeholder="note (optional)" />
          <select name="cat"><option>food</option><option>camp</option><option>activity</option><option>fuel</option><option>transport</option><option>other</option></select>
          <select name="paidBy">${state.travellers.map(t => `<option>${esc(t)}</option>`).join('')}</select>
          <select name="split">
            <option value="equal">split 50/50</option>
            <option value="solo">payer only</option>
          </select>
          <button>Add</button>
        </form>
      </div>

      <div class="budcard">
        <h3>Budget vs actual</h3>
        <div class="bignum ${bva.totals.delta > 0 ? 'over' : 'under'}">${bva.totals.delta > 0 ? '+' : ''}${fmtMoney(bva.totals.delta, cur)}</div>
        <div class="muted">${bva.totals.delta > 0 ? 'over' : 'under'} the guide estimate · per day below</div>
        <table class="budtable bvatable">
          ${bvaRows.map(r => `<tr>
            <td>${esc(r.label)}</td>
            <td>${fmtMoney(r.estimate, cur)}</td>
            <td><b>${fmtMoney(r.actual, cur)}</b></td>
            <td class="${r.delta > 0 ? 'over' : 'under'}">${r.delta > 0 ? '+' : ''}${fmtMoney(r.delta, cur)}</td>
          </tr>`).join('') || '<tr><td class="muted" colspan="4">No dated expenses yet — add one to compare against the day budget.</td></tr>'}
        </table>
      </div>

      <div class="budcard">
        <h3>Currency converter</h3>
        ${convReady ? `<div class="muted">1 ${base} = ${convRate} ${convHome} · live rate</div>` : `<div class="muted">${fxRates ? 'Rate unavailable offline — open online once to cache it.' : 'Loading live rate…'}</div>`}
        <div class="convrow">
          <input id="convA" type="number" step="0.01" inputmode="decimal" placeholder="amount" ${convReady ? '' : 'disabled'} />
          <span class="convcur">${base}</span>
        </div>
        <div class="convswap">⇅</div>
        <div class="convrow">
          <input id="convB" type="number" step="0.01" inputmode="decimal" placeholder="amount" ${convReady ? '' : 'disabled'} />
          <select id="convHomeCur">${convList.map(c => `<option ${c === convHome ? 'selected' : ''}>${c}</option>`).join('')}</select>
        </div>
      </div>
    </div>`;

  // --- currency converter (live, no rerender so input focus survives) ---
  const convA = root.querySelector('#convA'), convB = root.querySelector('#convB');
  if (convA && convReady) {
    const r = fxRates[convHome];
    convA.oninput = () => { const v = fxConvert(parseFloat(convA.value), r, 'toHome'); convB.value = v == null ? '' : v; };
    convB.oninput = () => { const v = fxConvert(parseFloat(convB.value), r, 'toBase'); convA.value = v == null ? '' : v; };
  }
  const homeSel = root.querySelector('#convHomeCur');
  if (homeSel) homeSel.onchange = () => {
    const o = exOv(state); o.convHome = homeSel.value;
    ctx.save('expenses', o); ctx.rerender();
  };

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
      id: 'ex' + Date.now(), title: (f.get('title') || '').trim() || f.get('cat'), amount: +f.get('amount'),
      cat: f.get('cat'), paidBy: f.get('paidBy'), split: { type: f.get('split') },
      date: new Date().toISOString().slice(0, 10),
    }];
    ctx.save('expenses', o); ctx.rerender();
  };
}

const exOv = state => ({ items: [], mode: 'bu', ...(state.overlay.expenses || {}) });
