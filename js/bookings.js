/* Bookings timeline: pipeline + Wanderlog-seeded + manual; unassigned inbox.
   Attachments: drag-drop / 📎 → stored locally (IndexedDB) so it works with no
   backend; also uploaded to Drive best-effort for cross-device once Code.gs is
   redeployed. Metadata (name, local id, optional Drive url) lives in the overlay.
   Fetch from Gmail: on-demand suggestions parsed by core.parseEmailStub. */
import { esc, gmapsUrl, gmapsPlaceUrl, amapsUrl, flightStatusUrl, fmtMoney, buildManualBooking, parseEmailStub, wlShareValid, bookingWarnings, coverageGaps, accommodationStrip, bookingReminders, orphanBookings, bookingRollup, tripEstimate, transportContinuity, bookingIcs, convert } from './core.js';
import { tripBookings, allBookings, refreshOverlays } from './data.js';
import { uploadAttachment, fetchMail, wlImport } from './sync.js';
import { putFile, openLocal, hasIDB } from './attachments.js';
import { rates } from './fx.js';
import { icon } from './icons.js';
import { logoImg } from './logos.js';

let fxRates = null; // {CUR: units per 1 base}, loaded once per session (shared shape with budget.js)

let attSeq = 0; // unique-per-call suffix; Date.now alone collides in a loop

const TYPES = ['flight', 'hotel', 'train', 'bus', 'car', 'activity', 'other'];
const MAX_MB = 10;
// Forward booking confirmations here; the daily pipeline sync imports them into this timeline.
const INBOUND_ADDR = 'wchongyu2001@gmail.com';

let lastMail = null;       // fetched suggestions survive rerenders
let pendingEmail = null;   // suggestion being added via the manual form
let pendingAttach = null;  // booking id awaiting file-picker result

export function render(root, ctx) {
  pendingEmail = null; // prefilled form dies with each rerender; don't leak into a later manual add
  const { state } = ctx;
  const list = tripBookings(state, state.trip.id);
  if (!fxRates) rates(state.trip.currency || 'EUR').then(r => { fxRates = r; ctx.rerender(); });
  const unassigned = orphanBookings(allBookings(state), state.registry.trips);
  const atts = bkOv(state).attachments || {};

  const byDate = {};
  list.forEach(b => { const d = String(b.start).slice(0, 10); (byDate[d] = byDate[d] || []).push(b); });

  root.innerHTML = `
    <div class="bk-intro">
      <p>Everything booked for <b>${esc(state.trip.label)}</b> — imported from Gmail by the pipeline (or seeded from Wanderlog). <b>Drop a PDF (or image) on any booking, or tap “📎 Attach PDF”</b> — it's saved on this device right away.</p>
      <div class="bk-forward">
        <span class="bk-forward-lead">📨 Forward booking confirmations to</span>
        <code class="bk-forward-addr">${esc(INBOUND_ADDR)}</code>
        <button type="button" id="bkcopyaddr" class="bk-copy" data-addr="${esc(INBOUND_ADDR)}">Copy</button>
        <span class="bk-forward-note muted">— they appear here after the daily sync.</span>
      </div>
      <div class="lastsync">${esc(syncLabel(state))}</div>
      <div class="bkfetchbar">
        <button id="bkfetch">📥 Fetch from Gmail</button>
        <span id="bkfetcherr" class="muted"></span>
      </div>
      <div class="bkfetchbar bkwlbar">
        <input id="bkwlurl" placeholder="Paste a Wanderlog trip share link…" />
        <button id="bkwl">↧ Import from Wanderlog</button>
        <span id="bkwlmsg" class="muted"></span>
      </div>
      <details class="bkhelp"><summary>Gmail fetch &amp; cross-device sync need a one-time setup</summary>
        <p class="muted">Your dashboard is a static site — it can't read Gmail or sync edits on its own. Both run through a Google Apps Script that hasn't been redeployed yet:</p>
        <ol class="muted">
          <li>Open the Apps Script project (the old bucket-list one).</li>
          <li>Replace its code with <code>apps-script/Code.gs</code> from this repo; re-paste your Telegram token at the top.</li>
          <li>Deploy → Manage deployments → edit → <b>New version</b> (same /exec URL), and approve the new Gmail + Drive permissions.</li>
        </ol>
        <p class="muted">Until then, PDF attachments still work — they're stored locally on this device.</p>
      </details>
      <div id="bksuggest">${suggestionsHtml(state)}</div>
    </div>
    ${remindersHtml(list)}
    ${rollupHtml(state, list)}
    ${warningsHtml(state, list)}
    ${continuityHtml(list)}
    ${stripHtml(state, list)}
    ${stillToBookHtml(state, list)}
    ${Object.keys(byDate).sort().map(d => `
      <div class="bk-group">
        <div class="bk-date">${prettyDate(d)}</div>
        ${byDate[d].map(b => card(b, atts)).join('')}
      </div>`).join('') || '<p class="muted">No bookings for this trip yet.</p>'}

    ${unassigned.length ? `
    <div class="bk-unassigned">
      <h3>📥 Unassigned (${unassigned.length})</h3>
      <p class="muted">Bookings not filed to any of your trips (no match, or a trip that no longer exists) — assign them:</p>
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
        <input name="provider" placeholder="Provider (e.g. Icelandair)" />
        <label class="bkfield">Start <input name="start" type="datetime-local" required /></label>
        <label class="bkfield">End <input name="end" type="datetime-local" /></label>
        <input name="location" placeholder="Location (e.g. B&B Hotel Milano)" />
        <input name="conf" placeholder="Confirmation #" />
        <input name="amount" type="number" step="0.01" placeholder="Price" />
        <input name="currency" placeholder="EUR" size="4" />
        <input name="pax" placeholder="Travellers (comma-separated)" />
        <button>Add</button>
      </form>
    </details>
    <input type="file" id="bkfile" accept="application/pdf,image/*" multiple hidden />`;

  root.querySelectorAll('[data-dismwarn]').forEach(b => b.onclick = () => {
    const ov = bkOv(state);
    ov.warnSeen = [...new Set([...(ov.warnSeen || []), b.dataset.dismwarn])];
    ctx.save('bookings', ov); ctx.rerender();
  });

  root.querySelectorAll('[data-booknight]').forEach(el => el.onclick = () => {
    const date = el.dataset.booknight;
    const det = root.querySelector('.bk-add'); det.open = true;
    const form = root.querySelector('#bkform');
    form.elements.type.value = 'hotel';
    form.elements.start.value = date + 'T15:00';
    const next = new Date(date + 'T12:00'); next.setDate(next.getDate() + 1);
    form.elements.end.value = next.toISOString().slice(0, 10) + 'T11:00';
    form.elements.title.focus();
    det.scrollIntoView({ behavior: 'smooth' });
  });

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
    const ov = bkOv(state);
    const id = 'manual-' + Date.now();
    const booking = buildManualBooking({
      type: f.get('type'), title: f.get('title'), provider: f.get('provider'),
      start: f.get('start'), end: f.get('end'), location: f.get('location'),
      conf: f.get('conf'), amount: f.get('amount'), currency: f.get('currency'), pax: f.get('pax'),
    }, state.registry.trips, state.trip.currency, id);
    if (pendingEmail) booking.source = 'email-fetch';
    ov.manual = [...(ov.manual || []), booking];
    if (pendingEmail) {
      if (pendingEmail.attachments.length) ov.attachments = { ...(ov.attachments || {}), [id]: pendingEmail.attachments };
      ov.emailSeen = [...(ov.emailSeen || []), pendingEmail.id];
      pendingEmail = null;
    }
    ctx.save('bookings', ov); ctx.rerender();
  };

  const copyBtn = root.querySelector('#bkcopyaddr');
  if (copyBtn) copyBtn.onclick = () => {
    navigator.clipboard?.writeText(copyBtn.dataset.addr)
      .then(() => { copyBtn.textContent = '✓ Copied'; }, () => {});
  };

  wireAttachments(root, ctx, state);
  wireFetch(root, ctx, state);
  wireWanderlog(root, ctx, state);
  wireDetails(root, new Map([...list, ...unassigned].map(b => [b.id, b])));
}

// B28 — Copy confirmation # / download single-booking .ics from the detail drawer.
function wireDetails(root, lookup) {
  root.querySelectorAll('[data-copyconf]').forEach(btn => btn.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    navigator.clipboard?.writeText(btn.dataset.copyconf).then(() => { btn.textContent = '✓ Copied'; }, () => {});
  });
  root.querySelectorAll('[data-ics]').forEach(btn => btn.onclick = e => {
    e.preventDefault(); e.stopPropagation();
    const b = lookup.get(btn.dataset.ics);
    if (!b) return;
    const blob = new Blob([bookingIcs(b)], { type: 'text/calendar;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = (b.title || 'booking').replace(/[^\w]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) + '.ics';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
}

function wireWanderlog(root, ctx, state) {
  const btn = root.querySelector('#bkwl');
  if (!btn) return;
  const inp = root.querySelector('#bkwlurl'), msg = root.querySelector('#bkwlmsg');
  btn.onclick = async () => {
    const url = inp.value.trim();
    if (!wlShareValid(url)) { msg.textContent = 'Enter a wanderlog.com share link.'; return; }
    btn.disabled = true; msg.textContent = '⏳ importing…';
    try {
      const d = await wlImport(url, state.trip.id);
      msg.textContent = d.summary || (d.ok ? `✓ +${d.places} places, +${d.reservations} reservations` : 'Import failed');
      if (d.ok) { await refreshOverlays(state, () => {}); ctx.rerender(); }
    } catch (e) { msg.textContent = 'Import failed: ' + e.message; }
    btn.disabled = false;
  };
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
    input.value = '';
  };
  root.querySelectorAll('.bkcard[data-bid]').forEach(el => {
    el.ondragover = e => { e.preventDefault(); el.classList.add('dragover'); };
    el.ondragleave = () => el.classList.remove('dragover');
    el.ondrop = e => {
      e.preventDefault(); el.classList.remove('dragover');
      if (e.dataTransfer.files.length) handleFiles(root, ctx, state, el.dataset.bid, e.dataTransfer.files);
    };
  });
  root.querySelectorAll('[data-openatt]').forEach(btn => btn.onclick = async () => {
    const bid = btn.closest('.bkcard')?.dataset.bid;
    const ok = await openLocal(btn.dataset.openatt);
    if (!ok && bid) cardMsg(root, bid, '✗ saved on another device — re-attach here, or redeploy Code.gs for Drive sync');
  });
}

async function handleFiles(root, ctx, state, bid, files) {
  const ov = bkOv(state);
  let added = 0;
  for (const f of [...files]) {
    if (!/^(application\/pdf|image\/)/.test(f.type)) { cardMsg(root, bid, `✗ ${f.name}: PDFs or images only`); continue; }
    if (f.size > MAX_MB * 1024 * 1024) { cardMsg(root, bid, `✗ ${f.name}: over ${MAX_MB} MB`); continue; }
    if (!hasIDB) { cardMsg(root, bid, `✗ ${f.name}: this browser can't store attachments`); continue; }
    cardMsg(root, bid, `⏳ saving ${f.name}…`);
    const att = { id: `att-${Date.now()}-${attSeq++}`, name: f.name };
    try {
      await putFile(att.id, f);            // local-first: this alone makes the attachment usable
    } catch (err) { cardMsg(root, bid, `✗ ${f.name}: ${err.message}`); continue; }
    // Best-effort cross-device copy; only adopt a real Drive link (old backend returns ok w/o url).
    try {
      const d = await uploadAttachment(f.name, f.type, await fileB64(f));
      if (d && d.url) { att.url = d.url; att.fileId = d.fileId; }
    } catch { /* backend not redeployed — local copy still works */ }
    ov.attachments = ov.attachments || {};
    (ov.attachments[bid] = ov.attachments[bid] || []).push(att);
    added++;
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
      root.querySelector('#bkfetcherr').textContent = 'Needs setup ↓ (' + err.message + ')';
      root.querySelector('.bkhelp').open = true;
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

/* ---------- booking action reminders (B25) ---------- */

const REMIND_LABEL = { checkin: 'Check-in', cancel: 'Cancellation', 'hotel-in': 'Hotel check-in', 'hotel-out': 'Hotel check-out' };
const pad = n => String(n).padStart(2, '0');
// Naive local "now", matching how booking times are written (same basis as today.js).
const nowIso = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; };

function remindersHtml(list) {
  const reminders = bookingReminders(list, nowIso());
  if (!reminders.length) return '';
  const urgent = reminders.filter(r => r.urgent).length;
  return `<div class="bk-remind">
    <h3>⏰ Needs attention (${reminders.length}${urgent ? ` · ${urgent} urgent` : ''})</h3>
    ${reminders.map(r => `
      <div class="bk-remind-row${r.urgent ? ' urgent' : ''}">
        <span class="bk-remind-kind">${REMIND_LABEL[r.kind] || 'Action'}</span>
        <div class="bk-remind-main">
          <span class="bk-remind-title">${esc(r.title)}</span>
          <div class="bk-remind-detail">${esc(r.detail)}</div>
        </div>
      </div>`).join('')}
  </div>`;
}

/* ---------- committed cost rollup vs budget (B26) ---------- */

function rollupHtml(state, list) {
  const base = state.trip.currency || 'EUR';
  const cur = (state.tripData?.meta?.curSymbol) || (base + ' ');
  const toBase = (amt, c) => (!c || c === base || !fxRates || !fxRates[c]) ? amt : convert(amt, 1 / fxRates[c]);
  const roll = bookingRollup(list, toBase);
  if (!roll.count) return '';
  const mode = (state.overlay.expenses || {}).mode || 'bu';
  const est = tripEstimate(state.days, state.tripData?.budget, state.tripData?.meta, mode).total;
  const pct = est ? Math.round(roll.total / est * 100) : 0;
  return `<div class="bk-rollup">
    <h3>💶 Committed so far — ${fmtMoney(roll.total, cur)} <small class="muted">${roll.count} booking${roll.count > 1 ? 's' : ''}</small></h3>
    ${est ? `<div class="bk-rollup-vs">${pct}% of the ${fmtMoney(est, cur)} trip budget already reserved.</div>` : ''}
    <div class="bk-rollup-bars">
      ${roll.byType.map(t => `
        <div class="bk-rollup-bar"><span>${esc(t.label)}</span>
          <i style="width:${roll.total ? Math.round(t.total / roll.total * 100) : 0}%"></i>
          <b>${fmtMoney(t.total, cur)}</b></div>`).join('')}
    </div>
  </div>`;
}

/* ---------- gap / conflict warnings ---------- */

const WARN_LABEL = { range: 'Outside trip dates', overlap: 'Time conflict', leg: 'Missing leg' };
const warnSig = w => `${w.kind}:${w.id}${w.otherId ? ':' + w.otherId : ''}`;

function warningsHtml(state, list) {
  const seen = new Set(bkOv(state).warnSeen || []);
  const warnings = bookingWarnings(list, state.trip).filter(w => !seen.has(warnSig(w)));
  if (!warnings.length) return '';
  return `<div class="bk-warnings">
    <h3>⚠ ${warnings.length} thing${warnings.length > 1 ? 's' : ''} to check</h3>
    ${warnings.map(w => `
      <div class="bk-warn">
        <div class="bk-warn-main">
          <span class="bk-warn-kind">${WARN_LABEL[w.kind] || 'Check'}</span>
          <span class="bk-warn-title">${esc(w.title)}</span>
          <div class="bk-warn-detail">${esc(w.detail)}</div>
        </div>
        <button class="bk-warn-x" data-dismwarn="${esc(warnSig(w))}" title="Dismiss">✕</button>
      </div>`).join('')}
  </div>`;
}

/* ---------- transport continuity check (B27) ---------- */

const CONT_LABEL = { jump: 'Same-time jump', break: 'Broken connection', noreturn: 'One-way rental' };

function continuityHtml(list) {
  const issues = transportContinuity(list);
  if (!issues.length) return '';
  return `<div class="bk-cont">
    <h3>🔗 Transport continuity — ${issues.length} to check</h3>
    ${issues.map(c => `
      <div class="bk-cont-row">
        <span class="bk-cont-kind">${CONT_LABEL[c.kind] || 'Check'}</span>
        <div class="bk-cont-main">
          <span class="bk-cont-title">${esc(c.title)}</span>
          <div class="bk-cont-detail">${esc(c.detail)}</div>
        </div>
      </div>`).join('')}
  </div>`;
}

/* ---------- accommodation coverage strip (B24) ---------- */

function stripHtml(state, list) {
  const nights = accommodationStrip(state.days, list);
  if (!nights.length) return '';
  const covered = nights.filter(n => n.covered).length;
  return `<div class="bk-strip">
    <h3>🛏 Where you sleep — ${covered}/${nights.length} nights covered</h3>
    <div class="bk-strip-row">
      ${nights.map(n => `
        <div class="bk-night ${n.covered ? 'covered' : 'gap'}"${n.covered ? '' : ` data-booknight="${esc(n.date)}"`}
             title="${esc(n.covered ? n.name : 'Tap to book a stay for ' + n.date)}">
          <span class="bk-night-date">${stripDate(n.date)}</span>
          <span class="bk-night-name">${n.covered ? esc(n.name) : (n.sleep ? esc(n.sleep) : 'No stay')}</span>
        </div>`).join('')}
    </div>
  </div>`;
}

const stripDate = d => new Date(d + 'T12:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' });

/* ---------- "still to book" coverage gaps (B22) ---------- */

const TOBOOK_LABEL = { lodging: 'No stay', transport: 'No transport' };

function stillToBookHtml(state, list) {
  const gaps = coverageGaps(state.days, list);
  if (!gaps.length) return '';
  const byDate = {};
  gaps.forEach(g => { (byDate[g.date] = byDate[g.date] || []).push(g); });
  return `<div class="bk-tobook">
    <h3>🧳 Still to book (${gaps.length})</h3>
    ${Object.keys(byDate).sort().map(d => `
      <div class="bk-tobook-day">
        <div class="bk-tobook-date">${prettyDate(d)}</div>
        ${byDate[d].map(g => `
          <div class="bk-tobook-row">
            <span class="bk-tobook-kind">${TOBOOK_LABEL[g.kind] || 'Missing'}</span>
            <span class="bk-tobook-detail">${esc(g.detail)}</span>
          </div>`).join('')}
      </div>`).join('')}
  </div>`;
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

// Drive-backed attachments are links (cross-device); local-only ones are buttons that open from IndexedDB.
function attChip(a) {
  return a.url
    ? `<a class="bkchip" target="_blank" rel="noopener" href="${esc(a.url)}">📎 ${esc(a.name)}</a>`
    : `<button class="bkchip" data-openatt="${esc(a.id)}">📎 ${esc(a.name)}</button>`;
}

function cardBody(b, attachments) {
  const ll = b.location && b.location.lat != null ? [b.location.lat, b.location.lng] : null;
  return `
    <div class="bkrow">
      <span class="bkicon">${icon(b.type, 22)}</span>
      <div class="bkmain">
        <div class="bktitle">${esc(b.title)}${logoImg(b)}</div>
        <div class="bkmeta">
          ${time(b.start)}${b.end ? ' → ' + time(b.end) : ''}
          ${b.provider ? ` · ${esc(b.provider)}` : ''}
          ${b.price && b.price.amount ? ` · ${fmtMoney(b.price.amount, b.price.currency + ' ')}` : ''}
        </div>
        ${b.location && b.location.name && !ll ? `<div class="bkpax muted">📍 ${esc(b.location.name)}</div>` : ''}
        ${b.confirmation ? `<div class="bkconf">conf <b>${esc(b.confirmation)}</b></div>` : ''}
        ${b.pax ? `<div class="bkpax muted">${b.pax.map(esc).join(' · ')}</div>` : ''}
        ${b.notes ? `<div class="bkpax muted">${esc(b.notes)}</div>` : ''}
        <div class="bkatt">
          ${(attachments || []).map(a => attChip(a)).join('')}
          <button class="bkattach" data-attach="${esc(b.id)}">📎 Attach PDF</button>
        </div>
        <div class="bkmsg muted"></div>
      </div>
      <span class="plinks">
        ${b.flight ? `<a target="_blank" rel="noopener" title="Flight status" href="${flightStatusUrl(b.flight)}">⚑</a>` : ''}
        ${ll ? `<a target="_blank" rel="noopener" title="Google Maps" href="${gmapsUrl(ll, b.location.name)}">G</a>
               <a target="_blank" rel="noopener" title="Apple Maps" href="${amapsUrl(ll, b.location.name)}"></a>` : ''}
        ${b.gmail_link ? `<a target="_blank" rel="noopener" title="Original email" href="${esc(b.gmail_link)}">✉</a>` : ''}
      </span>
    </div>
    ${detailHtml(b)}`;
}

// B28 — tap a booking to expand its full details, with one-tap Copy of the
// confirmation #, a map link, and an add-to-calendar (.ics) download.
function fullTime(s) {
  const t = String(s);
  return t.length > 10
    ? new Date(t).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : prettyDate(t);
}

function detailHtml(b) {
  const ll = b.location && b.location.lat != null ? [b.location.lat, b.location.lng] : null;
  const rows = [['Type', b.type]];
  if (b.provider) rows.push(['Provider', b.provider]);
  rows.push(['Start', fullTime(b.start)]);
  if (b.end) rows.push(['End', fullTime(b.end)]);
  if (b.location && b.location.name) rows.push(['Location', b.location.name]);
  if (b.pax) rows.push(['Travellers', b.pax.join(', ')]);
  if (b.price && b.price.amount) rows.push(['Price', fmtMoney(b.price.amount, b.price.currency + ' ')]);
  if (b.notes) rows.push(['Notes', b.notes]);
  const mapUrl = b.location && b.location.name ? (ll ? gmapsUrl(ll, b.location.name) : gmapsPlaceUrl(b.location.name)) : null;
  return `<details class="bkdetail"><summary>Details</summary>
    <dl class="bkdl">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(String(v))}</dd>`).join('')}</dl>
    ${b.confirmation ? `<div class="bkdetail-conf">conf <b>${esc(b.confirmation)}</b>
      <button type="button" class="bkmini" data-copyconf="${esc(b.confirmation)}">Copy</button></div>` : ''}
    <div class="bkdetail-act">
      ${mapUrl ? `<a class="bkmini" target="_blank" rel="noopener" href="${mapUrl}">📍 Map</a>` : ''}
      <button type="button" class="bkmini" data-ics="${esc(b.id)}">📅 Add to calendar</button>
    </div>
  </details>`;
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

const bkOv = state => ({ overrides: {}, manual: [], attachments: {}, emailSeen: [], warnSeen: [], ...(state.overlay.bookings || {}) });
