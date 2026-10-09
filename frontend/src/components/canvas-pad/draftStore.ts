import type { InkDraftRecord } from './types';

const DB_NAME = 'glm-words-ink-drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';

function openDraftDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME, { keyPath: 'key' });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function readDraftRecord(key: string): Promise<InkDraftRecord | null> {
  if (!('indexedDB' in window)) return null;
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).get(key);
    request.onsuccess = () => resolve((request.result as InkDraftRecord | undefined) ?? null);
    request.onerror = () => reject(request.error);
    tx.oncomplete = () => db.close();
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function writeRecord(record: InkDraftRecord): Promise<void> {
  if (!('indexedDB' in window)) return;
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).put(record);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

async function deleteRecord(key: string): Promise<void> {
  if (!('indexedDB' in window)) return;
  const db = await openDraftDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readwrite');
    tx.objectStore(STORE_NAME).delete(key);
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onerror = () => {
      db.close();
      reject(tx.error);
    };
  });
}

const writes = new Map<string, Promise<void>>();
function serialize(key: string, work: () => Promise<void>) {
  const next = (writes.get(key) ?? Promise.resolve()).catch(() => undefined).then(work);
  writes.set(key, next);
  void next.finally(() => { if (writes.get(key) === next) writes.delete(key); }).catch(() => undefined);
  return next;
}
export function writeDraftRecord(record: InkDraftRecord) { return serialize(record.key, () => writeRecord(record)); }
export function deleteDraftRecord(key: string) { return serialize(key, () => deleteRecord(key)); }
export function flushDraftWrites() { return Promise.all([...writes.values()]); }
