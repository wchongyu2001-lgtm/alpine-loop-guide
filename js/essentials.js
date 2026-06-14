/* B14 · Country essentials — an offline reference card for the trip's destination
   country: emergency number, currency, mains plug/voltage and language basics.
   Pure static data (no API) from core.js; renders with zero network. */
import { esc, countryEssentials } from './core.js';

export function render(root, ctx) {
  const { state } = ctx;
  const e = countryEssentials(state.trip.country);

  if (!e) {
    root.innerHTML = `<p class="muted">No essentials on file for this destination yet.</p>`;
    return;
  }

  root.innerHTML = `
    <div class="ess-card">
      <h2 class="ess-title">${e.flag} ${esc(e.name)} — travel essentials</h2>
      <div class="ess-grid">
        <div class="ess-cell ess-emerg">
          <div class="ess-k">Emergency</div>
          <div class="ess-v ess-big">${esc(e.emergency)}</div>
          <div class="ess-sub">Police ${esc(e.police)} · Ambulance ${esc(e.ambulance)}</div>
        </div>
        <div class="ess-cell">
          <div class="ess-k">Currency</div>
          <div class="ess-v">${esc(e.currency)}</div>
        </div>
        <div class="ess-cell">
          <div class="ess-k">Power</div>
          <div class="ess-v">${esc(e.plugs)}</div>
          <div class="ess-sub">${esc(e.voltage)}</div>
        </div>
        <div class="ess-cell">
          <div class="ess-k">Language</div>
          <div class="ess-v">${esc(e.language)}</div>
        </div>
      </div>
      <h3 class="ess-ph-title">Language basics</h3>
      <ul class="ess-phrases">
        ${e.phrases.map(p => `
          <li><span class="ess-en">${esc(p.en)}</span><span class="ess-local">${esc(p.local)}</span></li>`).join('')}
      </ul>
    </div>`;
}
