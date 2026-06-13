/* "What's New" view — features the overnight build loop shipped + verified.
   Reads data/shipped.json (the loop appends one entry per verified feature). */
import { esc } from './core.js';

const PILLARS = {
  offline: 'Offline & mobile', bookings: 'Bookings', logistics: 'Logistics',
  discovery: 'Discovery', money: 'Money', polish: 'Polish',
};

function card(f) {
  const when = (f.date || '').replace('T', ' ').replace('Z', ' UTC');
  const live = f.deploy === 'live';
  return `
    <div class="shipcard">
      <div class="shiptop">
        <span class="chip">${esc(PILLARS[f.pillar] || f.pillar || 'feature')}</span>
        ${f.verified ? '<span class="shipok">✓ verified</span>' : '<span class="muted">unverified</span>'}
        ${live ? '<span class="shiplive">● live</span>' : `<span class="muted">${esc(f.deploy || '')}</span>`}
      </div>
      <h3>${esc(f.title)}</h3>
      <p>${esc(f.what || '')}</p>
      ${f.verify_note ? `<p class="muted small">${esc(f.verify_note)}</p>` : ''}
      <div class="shipmeta muted small">
        <span>${esc(f.id || '')}</span>
        ${f.commit ? `<span>· commit ${esc(f.commit)}</span>` : ''}
        ${when ? `<span>· ${esc(when)}</span>` : ''}
      </div>
    </div>`;
}

export async function render(root, _ctx) {
  root.innerHTML = '<p class="muted">Loading what\'s new…</p>';
  let feats = [];
  try {
    const res = await fetch('data/shipped.json', { cache: 'no-cache' });
    feats = (await res.json()).features || [];
  } catch {
    root.innerHTML = '<p class="muted">Couldn\'t load the feature log (offline?). It\'ll show once you\'re back online.</p>';
    return;
  }
  // newest first
  feats = feats.slice().sort((a, b) => String(b.date).localeCompare(String(a.date)));
  const verified = feats.filter(f => f.verified).length;
  root.innerHTML = `
    <style>
      .shiphead{margin:4px 0 14px}
      .shipgrid{display:grid;gap:12px;grid-template-columns:repeat(auto-fill,minmax(280px,1fr))}
      .shipcard{border:1px solid rgba(128,128,128,.25);border-radius:12px;padding:14px 16px;background:rgba(128,128,128,.05)}
      .shipcard h3{margin:8px 0 6px;font-size:1.05rem}
      .shipcard p{margin:0 0 6px;line-height:1.45}
      .shiptop{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
      .shipok{color:#19a974;font-weight:600;font-size:.8rem}
      .shiplive{color:#19a974;font-size:.8rem}
      .shipmeta{display:flex;gap:6px;flex-wrap:wrap;margin-top:8px}
      .small{font-size:.8rem}
    </style>
    <div class="shiphead">
      <h2>✨ What's new</h2>
      <p class="muted">${feats.length} feature${feats.length === 1 ? '' : 's'} shipped by the overnight build loop · ${verified} verified.</p>
    </div>
    ${feats.length ? `<div class="shipgrid">${feats.map(card).join('')}</div>`
      : '<p class="muted">Nothing shipped yet — check back in the morning.</p>'}`;
}
