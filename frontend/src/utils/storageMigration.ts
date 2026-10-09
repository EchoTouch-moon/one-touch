/**
 * One-time migration of client-side state written before the rename from
 * "glm-words" to "onetouch".
 *
 * Renaming storage keys is invisible to users until it is not: without this,
 * every signed-in user would be logged out, lose their theme and pen settings,
 * and find their handwriting drafts and offline review queue gone. This runs
 * once per browser, guarded by a flag, and must run before any store hydrates
 * (see main.tsx).
 *
 * Values already present under a new name always win: they were written by the
 * current version and are therefore newer than the legacy copy.
 */

const MIGRATION_FLAG = 'onetouch-storage-migrated-v1';

// Ordered explicitly: a prefix must never swallow a longer key, so the v1
// queue key comes before the v2 prefixes and 'onetouch-auth' comes last.
const KEY_RENAMES: ReadonlyArray<readonly [string, string]> = [
  ['glm-words-pending-reviews', 'onetouch-pending-reviews'],
  ['glm-words-v2:', 'onetouch-v2:'],
  ['glm-words-ink-draft:', 'onetouch-ink-draft:'],
  ['glm-detail-editor-v2:', 'onetouch-detail-editor-v2:'],
  ['glm-capture-editor-v2:', 'onetouch-capture-editor-v2:'],
  ['glm-words-settings', 'onetouch-settings'],
  ['glm-words-auth', 'onetouch-auth'],
  ['glm-words-theme', 'onetouch-theme'],
  ['glm-words-pen-weight', 'onetouch-pen-weight'],
  ['glm-words-paper-guide', 'onetouch-paper-guide'],
];

export function migrateLegacyLocalStorage(): void {
  try {
    const storage = window.localStorage;
    if (storage.getItem(MIGRATION_FLAG) !== null) return;

    for (const key of Object.keys(storage)) {
      for (const [from, to] of KEY_RENAMES) {
        if (key !== from && !key.startsWith(from)) continue;
        const target = to + key.slice(from.length);
        if (storage.getItem(target) === null && storage.getItem(key) !== null) {
          storage.setItem(target, storage.getItem(key) as string);
        }
        storage.removeItem(key);
        break;
      }
    }
    storage.setItem(MIGRATION_FLAG, '1');
  } catch {
    // Storage disabled or full: there is nothing to migrate, and the app must
    // still start.
  }
}
