import type { InkDraftRecord } from './types';

const DB_NAME = 'onetouch-ink-drafts';
const DB_VERSION = 1;
const STORE_NAME = 'drafts';
// Handwriting drafts written before the 2026-10-09 rename lived in this
// database. They are copied across once and the old database is dropped.
const LEGACY_DB_NAME = 'glm-words-ink-drafts';

let legacyMigration: Promise<void> | null = null;

function open(dbName: string): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(dbName, DB_VERSION);
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

function readAll(db: IDBDatabase): Promise<InkDraftRecord[]> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE_NAME, 'readonly');
    const request = tx.objectStore(STORE_NAME).getAll();
    request.onsuccess = () => resolve((request.result as InkDraftRecord[]) ?? []);
    request.onerror = () => reject(request.error);
  });
}

function dropDatabase(name: string): Promise<void> {
  return new Promise((resolve) => {
    const request = window.indexedDB.deleteDatabase(name);
    request.onsuccess = () => resolve();
    request.onerror = () => resolve(); // Keep going; the copy already succeeded.
    request.onblocked = () => resolve();
  });
}

/**
 * Copies drafts out of the pre-rename database and deletes it. Failures are
 * swallowed on purpose: a canvas that cannot migrate its old drafts must still
 * open, and the legacy database is left untouched for a later attempt.
 */
function migrateLegacyDrafts(): Promise<void> {
  if (!legacyMigration) {
    legacyMigration = (async () => {
      if (!('indexedDB' in window)) return;
      let source: IDBDatabase | null = null;
      try {
        source = await open(LEGACY_DB_NAME);
        const records = await readAll(source);
        source.close();
        source = null;
        if (records.length) {
          const target = await open(DB_NAME);
          await new Promise<void>((resolve, reject) => {
            const tx = target.transaction(STORE_NAME, 'readwrite');
            for (const record of records) tx.objectStore(STORE_NAME).put(record);
            tx.oncomplete = () => resolve();
            tx.onerror = () => reject(tx.error);
          });
          target.close();
        }
        await dropDatabase(LEGACY_DB_NAME);
      } catch {
        /* Leave the legacy database in place; drafts stay readable from it. */
      } finally {
        source?.close();
      }
    })();
  }
  return legacyMigration;
}

function openDraftDb(): Promise<IDBDatabase> {
  return migrateLegacyDrafts().then(() => open(DB_NAME));
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
