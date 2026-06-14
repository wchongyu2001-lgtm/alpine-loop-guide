/* Ideas browser + shared bucket list + F5 capture inbox.
   F5 · Ideas 2.0 — paste/share a link (Instagram/TikTok/web) into a capture
   inbox, give it a title + note, then drop it into a trip day. Captured ideas
   live in the 'ideas' overlay (localStorage cache-first via ctx.save, synced
   like the bucket). The curated idea browser + shared bucket below are unchanged. */
import { esc, buildIdea } from './core.js';

// Insert a captured idea into a day's itinerary plan as a stop, reusing the
// itinerary overlay's dayPlans shape ({preset,dayPlans:{dayId:[{id,n,t,ll,time,d}]}}).
function addIdeaToDay(ctx, idea, dayId) {
  const state = ctx.state;
  const ovIt = { preset: state.preset, dayPlans: {}, ...(state.overlay.itinerary || {}) };
  const day = state.days.find(d => d.id === dayId);
  const base = (ovIt.dayPlans && ovIt.dayPlans[dayId]) || (day && day.plan) || [];
  const stop = { id: 'p' + Math.random().toString(36).slice(2, 8), n: idea.title, t: 'idea', ll: null, time: '', d: idea.note || idea.url };
  ovIt.dayPlans = { ...(ovIt.dayPlans || {}), [dayId]: [...base, stop] };
  ctx.save('itinerary', ovIt); // decorateDays runs in ctx.save for itinerary
}

export function render(root, ctx) {
  const { state } = ctx;
  const ideas = state.tripData.ideas || [];
  const cats = state.taxonomy.cats || {};
  const bucket = (state.overlay.bucket && state.overlay.bucket.items) || [];
  const inbox = (state.overlay.ideas && state.overlay.ideas.items) || [];
  const ui = (render._ui = render._ui || { cat: '', q: '' });

  const visible = ideas.filter(i =>
    (!ui.cat || i.cat === ui.cat) &&
    (!ui.q || (i.title + ' ' + i.area + ' ' + i.desc).toLowerCase().includes(ui.q)));

  const dayOpts = state.days.map(d => `<option value="${esc(d.id)}">Day ${d._n} · ${esc(d._label || d.date || '')}</option>`).join('');

  const inboxCard = (it, i) => `
    <div class="inboxcard ${it.placed ? 'placed' : ''}">
      <div class="inboxtop">
        ${it.thumb ? `<img class="inboxthumb" src="${esc(it.thumb)}" alt="" loading="lazy" />`
          : `<span class="inboxthumb ph">🔗</span>`}
        <div class="inboxmeta">
          <input class="inboxtitle" data-ititle="${i}" value="${esc(it.title || '')}" placeholder="Title" />
          <a class="inboxlink" href="${esc(it.url)}" target="_blank" rel="noopener">${esc(it.domain || it.url)}</a>
        </div>
        <button class="mini" data-idel="${i}" title="Remove">✕</button>
      </div>
      <textarea class="inboxnote" data-inote="${i}" rows="1" placeholder="📝 note">${esc(it.note || '')}</textarea>
      <div class="inboxact">
        ${it.placed
          ? `<span class="muted">✓ added to Day ${it.placedN || ''}</span>`
          : `<select class="inboxday" data-iday="${i}"><option value="">＋ add to day…</option>${dayOpts}</select>`}
      </div>
    </div>`;

  root.innerHTML = `
    <div class="inboxpanel">
      <h3>📥 Capture inbox <span class="muted">(${inbox.length})</span></h3>
      <form id="captureform" class="captureform">
        <input id="capurl" placeholder="📎 paste a link (Instagram / TikTok / web)…" />
        <input id="capnote" placeholder="optional note" />
        <button type="submit" class="mini">＋ add</button>
      </form>
      ${inbox.length
        ? `<div class="inboxgrid">${inbox.map(inboxCard).join('')}</div>`
        : '<p class="muted">Paste a link above, or Share → Travel Companion from your phone, to drop trip ideas here.</p>'}
    </div>

    <div class="ideabar">
      <input id="ideaq" placeholder="🔍 search ideas…" value="${esc(ui.q)}" />
      <div class="chips">
        <button class="chip ${!ui.cat ? 'on' : ''}" data-cat="">All</button>
        ${Object.entries(cats).map(([k, v]) => `
          <button class="chip ${ui.cat === k ? 'on' : ''}" data-cat="${k}">${esc(v)}</button>`).join('')}
      </div>
    </div>

    <div class="bucketpanel">
      <h3>🪣 Shared bucket list <span class="muted">(${bucket.length})</span></h3>
      ${bucket.length ? `<ul>${bucket.map((b, i) => `
        <li><span>${esc(b.title)}${b.who ? ` <small class="muted">· ${esc(b.who)}</small>` : ''}</span>
        <button class="mini" data-unbucket="${i}">✕</button></li>`).join('')}</ul>`
      : '<p class="muted">Tap ＋ on any idea to save it here — synced between both phones.</p>'}
      <form id="bucketform"><input placeholder="+ add your own idea" /></form>
    </div>

    <div class="ideagrid">
      ${visible.map(i => `
        <div class="ideacard">
          <div class="ideatop">
            <span class="chip">${esc(cats[i.cat] || i.cat)}</span>
            <button class="mini ${bucket.some(b => b.id === i.id) ? 'on' : ''}" data-bucket="${esc(i.id)}">
              ${bucket.some(b => b.id === i.id) ? '✓ saved' : '＋ save'}</button>
          </div>
          <h4>${esc(i.title)}</h4>
          <div class="muted">${esc(i.area || '')}</div>
          <p>${esc(i.desc || '')}</p>
        </div>`).join('') || '<p class="muted">No ideas match.</p>'}
    </div>`;

  const commit = items => { ctx.save('bucket', { items }); ctx.rerender(); };
  const commitInbox = items => { ctx.save('ideas', { items }); ctx.rerender(); };

  // ---- capture inbox wiring ----
  root.querySelector('#captureform').onsubmit = e => {
    e.preventDefault();
    const url = root.querySelector('#capurl').value.trim();
    const note = root.querySelector('#capnote').value.trim();
    const idea = buildIdea({ url, note });
    if (!idea) { root.querySelector('#capurl').focus(); return; }
    commitInbox([idea, ...inbox]);
  };
  root.querySelectorAll('[data-idel]').forEach(b => b.onclick = () => {
    inbox.splice(+b.dataset.idel, 1); commitInbox(inbox);
  });
  root.querySelectorAll('[data-ititle]').forEach(inp => inp.onchange = () => {
    inbox[+inp.dataset.ititle].title = inp.value.trim(); commitInbox(inbox);
  });
  root.querySelectorAll('[data-inote]').forEach(t => t.onchange = () => {
    inbox[+t.dataset.inote].note = t.value.trim(); commitInbox(inbox);
  });
  root.querySelectorAll('[data-iday]').forEach(sel => sel.onchange = () => {
    const dayId = sel.value; if (!dayId) return;
    const it = inbox[+sel.dataset.iday]; if (!it) return;
    addIdeaToDay(ctx, it, dayId);
    const day = state.days.find(d => d.id === dayId);
    it.placed = true; it.placedN = day ? day._n : '';
    commitInbox(inbox);
  });

  // ---- curated browser + shared bucket (unchanged) ----
  root.querySelector('#ideaq').oninput = e => { ui.q = e.target.value.toLowerCase(); ctx.rerender(); };
  root.querySelectorAll('[data-cat]').forEach(b => b.onclick = () => { ui.cat = b.dataset.cat; ctx.rerender(); });

  root.querySelectorAll('[data-bucket]').forEach(b => b.onclick = () => {
    const idea = ideas.find(i => i.id === b.dataset.bucket); if (!idea) return;
    const i = bucket.findIndex(x => x.id === idea.id);
    if (i >= 0) bucket.splice(i, 1);
    else bucket.push({ id: idea.id, title: idea.title, area: idea.area, who: state.travellers[0] });
    commit(bucket);
  });
  root.querySelectorAll('[data-unbucket]').forEach(b => b.onclick = () => {
    bucket.splice(+b.dataset.unbucket, 1); commit(bucket);
  });
  root.querySelector('#bucketform').onsubmit = e => {
    e.preventDefault();
    const v = e.target.querySelector('input').value.trim(); if (!v) return;
    bucket.push({ id: 'own-' + Date.now(), title: v, who: state.travellers[0] });
    commit(bucket);
  };
}
