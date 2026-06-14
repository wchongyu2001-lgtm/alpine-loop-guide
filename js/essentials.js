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
    ${offlineCardHtml()}
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

  wireOffline(root);
}

/* F4 · Offline road-pack — a one-tap "Download trip for offline" control. Tells the
   service worker to pre-cache the app shell + every trip's JSON so the whole companion
   opens with no Alpine signal. Map tiles cache as you pan the map (separate tile cache);
   this pass refreshes the shell/data. Degrades gracefully where there's no SW. */
function offlineCardHtml() {
  const supported = 'serviceWorker' in navigator;
  return `
    <div class="ess-card ess-offline">
      <h2 class="ess-title">📥 Offline road-pack</h2>
      <p class="muted">Cache the whole companion on this device so it works with no Alpine signal — app, your itinerary, bookings and reference. Tiles you've panned over on the map stay cached too. Do this on Wi-Fi before you leave.</p>
      <div class="ess-offrow">
        <button id="essoffdl" type="button"${supported ? '' : ' disabled'}>Download trip for offline</button>
        <span id="essoffstatus" class="ess-offstatus muted">${supported ? 'Ready.' : 'Offline caching not supported in this browser.'}</span>
      </div>
    </div>`;
}

function wireOffline(root) {
  const btn = root.querySelector('#essoffdl');
  const status = root.querySelector('#essoffstatus');
  if (!btn || !('serviceWorker' in navigator)) return;
  btn.onclick = async () => {
    const reg = await navigator.serviceWorker.ready.catch(() => null);
    const sw = reg && (reg.active || navigator.serviceWorker.controller);
    if (!sw) { status.textContent = 'Service worker not active yet — reload and try again.'; return; }
    btn.disabled = true;
    status.textContent = '⏳ Starting…';
    const onMsg = e => {
      const d = e.data || {};
      if (d.type === 'CACHE_TRIP_PROGRESS') {
        status.textContent = `⏳ Caching ${d.done}/${d.total}…`;
      } else if (d.type === 'CACHE_TRIP_DONE') {
        navigator.serviceWorker.removeEventListener('message', onMsg);
        btn.disabled = false;
        status.textContent = d.ok
          ? `✓ Saved for offline — ${d.cached} files cached. Open this trip with no signal.`
          : `✓ Saved ${d.cached}/${d.total} (${d.failed} unreachable — works offline anyway).`;
      }
    };
    navigator.serviceWorker.addEventListener('message', onMsg);
    sw.postMessage({ type: 'CACHE_TRIP' });
  };
}
