/* Local attachment store (IndexedDB). Files live on this device only;
   the bookings overlay carries metadata + an optional Drive URL for cross-device. */

const DB = 'trips-attachments', STORE = 'files';
export const hasIDB = typeof indexedDB !== 'undefined';

function openDb() {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () => { if (!r.result.objectStoreNames.contains(STORE)) r.result.createObjectStore(STORE); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}

export async function putFile(id, blob) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(blob, id);
    tx.oncomplete = () => res();
    tx.onerror = () => rej(tx.error);
  });
}

async function getFile(id) {
  const db = await openDb();
  return new Promise((res, rej) => {
    const tx = db.transaction(STORE, 'readonly');
    const g = tx.objectStore(STORE).get(id);
    g.onsuccess = () => res(g.result || null);
    g.onerror = () => rej(g.error);
  });
}

// Open a locally-stored file in a new tab; returns false if it's not on this device.
export async function openLocal(id) {
  const blob = await getFile(id);
  if (!blob) return false;
  const url = URL.createObjectURL(blob);
  window.open(url, '_blank');
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  return true;
}
