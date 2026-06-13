/* Apps Script + localStorage sync.
   Base data lives in repo JSON; user edits live in the Sheet, mirrored locally.
   POSTs are fire-and-forget (no-cors); failed sends queue and retry on load. */

const SAVE_URL = 'https://script.google.com/macros/s/AKfycbzNFRxTK7BrEqpV_-ImugOUgaiqoKDLYbhjwN8JJ7UspF26n5saVPCrIhuCHRCjUhyMFg/exec';
const LS = (trip, kind) => `v2:${trip}:${kind}`;
const QUEUE_KEY = 'v2:queue';

export function cached(trip, kind) {
  try { return JSON.parse(localStorage.getItem(LS(trip, kind)) || 'null'); }
  catch { return null; }
}

function cacheSet(trip, kind, payload) {
  localStorage.setItem(LS(trip, kind), JSON.stringify(payload));
}

// Remote pull; falls back to local cache. v2 protocol: ?trip=&kind= → {ok, payload}.
export async function pull(trip, kind) {
  try {
    const r = await fetch(`${SAVE_URL}?trip=${encodeURIComponent(trip)}&kind=${encodeURIComponent(kind)}&t=${Date.now()}`);
    const d = await r.json();
    if (d && d.ok && d.payload != null) { cacheSet(trip, kind, d.payload); return d.payload; }
  } catch { /* offline or old deployment — fall through */ }
  return cached(trip, kind);
}

export function save(trip, kind, payload) {
  cacheSet(trip, kind, payload);
  send({ trip, kind, payload, updated: new Date().toISOString() });
}

function send(msg) {
  try {
    fetch(SAVE_URL, {
      method: 'POST', mode: 'no-cors',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(msg),
    }).catch(() => queuePush(msg));
  } catch { queuePush(msg); }
}

function queuePush(msg) {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  q.push(msg);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-50)));
}

// Upload a file (base64) to the Drive folder via Apps Script. Needs the
// redeployed backend; throws with a readable message otherwise.
export async function uploadAttachment(filename, mimeType, dataB64) {
  const r = await fetch(SAVE_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ action: 'upload', filename, mimeType, dataB64 }),
  });
  const d = await r.json().catch(() => null);
  if (!d || !d.ok) throw new Error((d && d.error) || 'upload failed — redeploy apps-script/Code.gs');
  return d; // {ok, fileId, url}
}

// Recent confirmation-looking Gmail messages (backend searches as the user).
export async function fetchMail() {
  const r = await fetch(`${SAVE_URL}?action=fetchmail&t=${Date.now()}`);
  const d = await r.json().catch(() => null);
  if (!d || !d.ok || !Array.isArray(d.messages)) {
    throw new Error((d && d.error) || 'fetch failed — redeploy apps-script/Code.gs');
  }
  return d.messages;
}

export function retryQueue() {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (!q.length) return;
  localStorage.setItem(QUEUE_KEY, '[]');
  q.forEach(send);
}
