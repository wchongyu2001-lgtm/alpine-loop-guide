/* Bookings timeline: pipeline + Wanderlog-seeded + manual; unassigned inbox.
   Attachments: drag-drop / 📎 → Apps Script → private Drive folder; metadata in overlay.
   Fetch from Gmail: on-demand suggestions parsed by core.parseEmailStub. */
import { esc, gmapsUrl, amapsUrl, flightStatusUrl, fmtMoney, assignTrip, parseEmailStub } from './core.js';
import { tripBookings, allBookings } from './data.js';
import { uploadAttachment, fetchMail } from './sync.js';

const TYPE_ICON = { flight: '✈', hotel: '🛏', train: '🚆', bus: '🚌', car: '🚗', activity: '🎟', other: '📌' };
const TYPES = Object.keys(TYPE_ICON);
const MAX_MB = 10;

let lastMail = null;       // fetched suggestions survive rerenders
let pendingEmail = null;   // suggestion being added via the manual form
let pendingAttach = null;  // booking id awaiting file-picker result

export function render(root, ctx) {
  const { state } = ctx;
  const list = tripBookings(state, state.trip.id);
  const unassigned = allBookings(state).filter(b => b.trip === 'unassigned');
  const atts = bkOv(state).attachments || {};

  const byDate = {};
  list.forEach(b => { const d = String(b.start).slice(0, 10); (byDate[d] = byDate[d] || []).push(b); });

  root.innerHTML = `
    <div class="bk-intro">
      <p>Everything booked for <b>${esc(state.trip.label)}</b> — imported from Gmail by the pipeline (or seeded from Wanderlog). Forward any confirmation email to <b>wchongyu2001@gmail.com</b> and it appears here after the next sync — or pull it now with the button below. Drop a PDF on any booking to attach it.</p>
      <div class="lastsync">${esc(syncLabel(state))}</div>
      <div class="bkfetchbar">
        <button id="bkfetch">📥 Fetch from Gmail</button>
        <span id="bkfetcherr" class="muted"></span>
      </div>
      <div id="bksuggest">${suggestionsHtml(state)}</div>
    </div>
    ${Object.keys(byDate).sort().map(d => `
      <div class="bk-group">
        <div class="bk-date">${prettyDate(d)}</div>
        ${byDate[d].map(b => card(b, atts)).join('')}
      </div>`).join('') || '<p class="muted">No bookings for this trip yet.</p>'}

    ${unassigned.length ? `
    <div class="bk-unassigned">
      <h3>📥 Unassigned (${unassigned.length})</h3>
      <p class="muted">Bookings that didn't match a trip's dates — file them:</p>
      ${unassigned.map(b => `
        <div class="bkcard" data-bid="${esc(b.id)}">
          ${cardBody(b, atts[b.id])}
          <select data-assign="${b.id}">
            <option value="">→ assign to…</option>
            ${state.registry.trips.map(t => `<option value="${t.id}">${esc(t.label)}</option>`).join('')}
          </select>
        </div>`).join('')}
    </div>` : ''}

    <details class="bk-add"><summary>＋ Add a booking manually</summary>
      <form id="bkform">
        <select name="type">${TYPES.map(t => `<option>${t}</option>`).join('')}</select>
        <input name="title" placeholder="Title (e.g. FI 418 · KEF → DUB)" required />
        <input name="start" type="datetime-local" required />
        <input name="conf" placeholder="Confirmation #" />
        <input name="amount" type="number" step="0.01" placeholder="Price" />
        <input name="currency" placeholder="EUR" size="4" />
        <button>Add</button>
      </form>
    </details>
    <input type="file" id="bkfile" accept="application/pdf,image/*" multiple hidden />`;

  root.querySelectorAll('[data-assign]').forEach(sel => sel.onchange = () => {
    if (!sel.value) return;
    const ov = bkOv(state);
    ov.overrides = { ...(ov.overrides || {}), [sel.dataset.assign]: sel.value };
    ctx.save('bookings', ov); ctx.rerender();
  });

  const form = root.querySelector('#bkform');
  if (form) form.onsubmit = e => {
    e.preventDefault();
    const f = new FormData(form);
    const start = f.get('start');
    const ov = bkOv(state);
    const id = 'manual-' + Date.now();
    ov.manual = [...(ov.manual || []), {
      id,
      trip: assignTrip(state.registry.trips, start),
      type: f.get('type'), title: f.get('title'), start,
      confirmation: f.get('conf') || null,
      price: f.get('amount') ? { amount: +f.get('amount'), currency: f.get('currency') || state.trip.currency } : null,
      source: pendingEmail ? 'email-fetch' : 'manual',
    }];
    if (pendingEmail) {
      if (pendingEmail.attachments.length) ov.attachments = { ...(ov.attachments || {}), [id]: pendingEmail.attachments };
      ov.emailSeen = [...(ov.emailSeen || []), pendingEmail.id];
      pendingEmail = null;
    }
    ctx.save('bookings', ov); ctx.rerender();
  };

  wireAttachments(root, ctx, state);
  wireFetch(root, ctx, state);
}

/* ---------- attachments ---------- */

function wireAttachments(root, ctx, state) {
  const input = root.querySelector('#bkfile');
  root.querySelectorAll('[data-attach]').forEach(btn => btn.onclick = () => {
    pendingAttach = btn.dataset.attach;
    input.click();
  });
  input.onchange = () => {
    if (pendingAttach && input.files.length) handleFiles(root, ctx, state, pendingAttach, input.files);
  };
  root.querySelectorAll('.bkcard[data-bid]').forEach(el => {
    el.ondragover = e => { e.preventDefault(); el.classList.add('dragover'); };
    el.ondragleave = () => el.classList.remove('dragover');
    el.ondrop = e => {
      e.preventDefault(); el.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFiles(root, ctx, state, el.dataset.bid, e.dataTransfer.files);
    };
  });
}

async function handleFiles(root, ctx, state, bid, files) {
  const ov = bkOv(state);
  let added = 0;
  for (const f of [...files]) {
    if (!/^(application\/pdf|image\/)/.test(f.type)) { cardMsg(root, bid, `✗ ${f.name}: PDFs or images only`); continue; }
    if (f.size > MAX_MB * 1024 * 1024) { cardMsg(root, bid, `✗ ${f.name}: over ${MAX_MB} MB`); continue; }
    cardMsg(root, bid, `⏳ uploading ${f.name}…`);
    try {
      const d = await uploadAttachment(f.name, f.type, await fileB64(f));
      ov.attachments = ov.attachments || {};
      (ov.attachments[bid] = ov.attachments[bid] || []).push({ name: f.name, url: d.url, fileId: d.fileId });
      added++;
    } catch (err) { cardMsg(root, bid, `✗ ${err.message}`); }
  }
  if (added) { ctx.save('bookings', ov); ctx.rerender(); }
}

const fileB64 = f => new Promise((res, rej) => {
  const r = new FileReader();
  r.onload = () => res(String(r.result).split(',')[1]);
  r.onerror = () => rej(new Error('could not read file'));
  r.readAsDataURL(f);
});

function cardMsg(root, bid, text) {
  const el = root.querySelector(`.bkcard[data-bid="${CSS.escape(bid)}"] .bkmsg`);
  if (el) el.textContent = text;
}

/* ---------- fetch from Gmail ---------- */

function wireFetch(root, ctx, state) {
  const btn = root.querySelector('#bkfetch');
  btn.onclick = async () => {
    btn.disabled = true; btn.textContent = '⏳ Fetching…';
    try {
      lastMail = await fetchMail();
      ctx.rerender();
    } catch (err) {
      root.querySelector('#bkfetcherr').textContent = err.message;
      btn.disabled = false; btn.textContent = '📥 Fetch from Gmail';
    }
  };
  root.querySelectorAll('[data-addmail]').forEach(b => b.onclick = () => {
    const m = visibleMail(state)[+b.dataset.addmail];
    if (!m) return;
    const stub = m._stub;
    const det = root.querySelector('.bk-add'); det.open = true;
    const form = root.querySelector('#bkform');
    form.elements.type.value = TYPES.includes(stub.type) ? stub.type : 'other';
    form.elements.title.value = stub.title;
    if (stub.start) form.elements.start.value = stub.start + 'T12:00';
    form.elements.conf.value = stub.confirmation || '';
    pendingEmail = { id: m.id, attachments: m.attachments || [] };
    det.scrollIntoView({ behavior: 'smooth' });
  });
  root.querySelectorAll('[data-dismail]').forEach(b => b.onclick = () => {
    const m = visibleMail(state)[+b.dataset.dismail];
    if (!m) return;
    const ov = bkOv(state);
    ov.emailSeen = [...(ov.emailSeen || []), m.id];
    ctx.save('bookings', ov); ctx.rerender();
  });
}

// Suggestions not yet added/dismissed and not matching an existing confirmation #.
function visibleMail(state) {
  if (!lastMail) return [];
  const seen = new Set(bkOv(state).emailSeen || []);
  const confs = new Set(allBookings(state).map(b => (b.confirmation || '').toLowerCase()).filter(Boolean));
  return lastMail.filter(m => {
    if (seen.has(m.id)) return false;
    m._stub = m._stub || parseEmailStub(m.subject, m.body);
    return !(m._stub.confirmation && confs.has(m._stub.confirmation.toLowerCase()));
  });
}

function suggestionsHtml(state) {
  if (!lastMail) return '';
  const vis = visibleMail(state);
  if (!vis.length) return '<p class="muted">No new confirmation emails found.</p>';
  return `<h3>✉ Found in Gmail (${vis.length})</h3>` + vis.map((m, i) => `
    <div class="bk-suggest">
      <div class="bktitle">${esc(m._stub.title)}</div>
      <div class="bkmeta">${esc(m.from)} · ${prettyDate(String(m.date).slice(0, 10))}${m._stub.confirmation ? ` · conf <b>${esc(m._stub.confirmation)}</b>` : ''}</div>
      ${(m.attachments || []).map(a => `<a class="bkchip" target="_blank" rel="noopener" href="${esc(a.url)}">📎 ${esc(a.name)}</a>`).join('')}
      <div class="bk-suggest-act">
        <button data-addmail="${i}">＋ Add as booking</button>
        <button data-dismail="${i}" class="ghost">Dismiss</button>
      </div>
    </div>`).join('');
}

/* ---------- cards ---------- */

function card(b, atts) { return `<div class="bkcard" data-bid="${esc(b.id)}">${cardBody(b, atts[b.id])}</div>`; }

function cardBody(b, attachments) {
  const ll = b.location && b.location.lat != null ? [b.location.lat, b.location.lng] : null;
  return `
    <div class="bkrow">
      <span class="bkicon">${TYPE_ICON[b.type] || '📌'}</span>
      <div class="bkmain">
        <div class="bktitle">${esc(b.title)}</div>
        <div class="bkmeta">
          ${time(b.start)}${b.end ? ' → ' + time(b.end) : ''}
          ${b.provider ? ` · ${esc(b.provider)}` : ''}
          ${b.price && b.price.amount ? ` · ${fmtMoney(b.price.amount, b.price.currency + ' ')}` : ''}
        </div>
        ${b.confirmation ? `<div class="bkconf">conf <b>${esc(b.confirmation)}</b></div>` : ''}
        ${b.pax ? `<div class="bkpax muted">${b.pax.map(esc).join(' · ')}</div>` : ''}
        ${b.notes ? `<div class="bkpax muted">${esc(b.notes)}</div>` : ''}
        <div class="bkatt">
          ${(attachments || []).map(a => `<a class="bkchip" target="_blank" rel="noopener" href="${esc(a.url)}">📎 ${esc(a.name)}</a>`).join('')}
          <button class="bkattach" data-attach="${esc(b.id)}" title="Attach PDF or image">📎</button>
        </div>
        <div class="bkmsg muted"></div>
      </div>
      <span class="plinks">
        ${b.flight ? `<a target="_blank" rel="noopener" title="Flight status" href="${flightStatusUrl(b.flight)}">⚑</a>` : ''}
        ${ll ? `<a target="_blank" rel="noopener" title="Google Maps" href="${gmapsUrl(ll, b.location.name)}">G</a>
               <a target="_blank" rel="noopener" title="Apple Maps" href="${amapsUrl(ll, b.location.name)}"></a>` : ''}
        ${b.gmail_link ? `<a target="_blank" rel="noopener" title="Original email" href="${esc(b.gmail_link)}">✉</a>` : ''}
      </span>
    </div>`;
}

const time = s => { const t = String(s); return t.length > 10 ? t.slice(11, 16) : prettyDate(t); };

function prettyDate(d) {
  const x = new Date(d + (d.length === 10 ? 'T12:00' : ''));
  return x.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' });
}

function syncLabel(state) {
  const u = state.bookingsFile.updated;
  if (!u) return '';
  const ageH = (Date.now() - new Date(u)) / 36e5;
  return `Pipeline last sync: ${new Date(u).toLocaleString()}${ageH > 48 ? ' ⚠ stale' : ''}`;
}

const bkOv = state => ({ overrides: {}, manual: [], attachments: {}, emailSeen: [], ...(state.overlay.bookings || {}) });
