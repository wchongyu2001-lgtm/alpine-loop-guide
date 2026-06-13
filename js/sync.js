/* VPS sync backend (FastAPI on Hetzner) + localStorage cache.
   Base data lives in repo JSON; user edits sync through the trips-sync service
   so they follow you across devices. Saves cache locally first, then POST;
   failed sends queue and retry on next load. See server/ for the backend. */

export const BASE = 'https://markets-dashboard.duckdns.org/trips-sync';
// Soft guard against anonymous writes. Public by design (static client) — the
// real protections are the CORS origin allow-list + accepted-public-data choice.
const TOKEN = '7b96af2a24b67e9da2b95c1283460314a4fe5469014e593a';
const LS = (trip, kind) => `v2:${trip}:${kind}`;
const QUEUE_KEY = 'v2:queue';

export function cached(trip, kind) {
  try { return JSON.parse(localStorage.getItem(LS(trip, kind)) || 'null'); }
  catch { return null; }
}

function cacheSet(trip, kind, payload) {
  localStorage.setItem(LS(trip, kind), JSON.stringify(payload));
}

// Remote pull; falls back to local cache. Protocol: ?trip=&kind= → {ok, payload}.
export async function pull(trip, kind) {
  try {
    const r = await fetch(`${BASE}/load?trip=${encodeURIComponent(trip)}&kind=${encodeURIComponent(kind)}&t=${Date.now()}`);
    const d = await r.json();
    if (d && d.ok && d.payload != null) { cacheSet(trip, kind, d.payload); return d.payload; }
  } catch { /* offline — fall through to cache */ }
  return cached(trip, kind);
}

export function save(trip, kind, payload) {
  cacheSet(trip, kind, payload);
  send({ trip, kind, payload, updated: new Date().toISOString() });
}

function send(msg) {
  try {
    fetch(`${BASE}/save`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Trips-Token': TOKEN },
      body: JSON.stringify(msg),
    }).then(r => { if (!r.ok) queuePush(msg); }).catch(() => queuePush(msg));
  } catch { queuePush(msg); }
}

function queuePush(msg) {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  q.push(msg);
  localStorage.setItem(QUEUE_KEY, JSON.stringify(q.slice(-50)));
}

// Upload a booking attachment; backend stores it and returns a public URL.
export async function uploadAttachment(filename, mimeType, dataB64) {
  const r = await fetch(`${BASE}/upload`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Trips-Token': TOKEN },
    body: JSON.stringify({ filename, mimeType, dataB64 }),
  });
  const d = await r.json().catch(() => null);
  if (!d || !d.ok) throw new Error((d && d.error) || 'upload failed');
  return d; // {ok, fileId, url}
}

// Recent confirmation-looking Gmail messages (wired in phase 2 on the VPS).
export async function fetchMail() {
  const r = await fetch(`${BASE}/fetchmail?t=${Date.now()}`);
  const d = await r.json().catch(() => null);
  if (!d || !d.ok || !Array.isArray(d.messages)) {
    throw new Error((d && d.error) || 'fetch failed');
  }
  return d.messages;
}

export function retryQueue() {
  const q = JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
  if (!q.length) return;
  localStorage.setItem(QUEUE_KEY, '[]');
  q.forEach(send);
}
