/* Ideas browser + shared bucket list (synced to the Sheet, Telegram ping server-side). */
import { esc } from './core.js';

export function render(root, ctx) {
  const { state } = ctx;
  const ideas = state.tripData.ideas || [];
  const cats = state.taxonomy.cats || {};
  const bucket = (state.overlay.bucket && state.overlay.bucket.items) || [];
  const ui = (render._ui = render._ui || { cat: '', q: '' });

  const visible = ideas.filter(i =>
    (!ui.cat || i.cat === ui.cat) &&
    (!ui.q || (i.title + ' ' + i.area + ' ' + i.desc).toLowerCase().includes(ui.q)));

  root.innerHTML = `
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
