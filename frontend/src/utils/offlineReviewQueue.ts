import type { ReviewSession, ReviewSubmit } from '../types/review';

const LEGACY_QUEUE_KEY = 'onetouch-pending-reviews';
const sessionKey = (userId: number) => `onetouch-v2:${userId}:session`;
const queuePrefix = (userId: number) => `onetouch-v2:${userId}:review:`;
const REVIEW_SESSION_MAX_AGE_MS = 5 * 60 * 1000;
export interface PendingReview extends ReviewSubmit { id: string; created_at: string }
const running = new Map<number, Promise<SyncResult>>();
type SyncResult = { synced: number; remaining: number; syncedWordIds: number[]; error?: string };

function readJson<T>(key: string, fallback: T): T {
  try { return JSON.parse(window.localStorage.getItem(key) ?? 'null') ?? fallback; }
  catch { return fallback; } // Never erase unidentified or damaged learning data.
}
function changed() { window.dispatchEvent(new Event('onetouch-review-queue-updated')); }
export function getLegacyReviews(): string | null { return window.localStorage.getItem(LEGACY_QUEUE_KEY); }
export function getPendingReviews(userId: number): PendingReview[] {
  const prefix = queuePrefix(userId);
  return Object.keys(window.localStorage).filter(key => key.startsWith(prefix))
    .map(key => readJson<PendingReview | null>(key, null))
    .filter((r): r is PendingReview => r !== null)
    .sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
}
export function enqueueReview(userId: number, review: ReviewSubmit): PendingReview {
  const pending = { ...review, id: crypto.randomUUID(), created_at: new Date().toISOString() };
  // Each event has its own key: a concurrent append cannot be overwritten by a flush.
  window.localStorage.setItem(queuePrefix(userId) + pending.id, JSON.stringify(pending));
  changed();
  return pending;
}
export function flushPendingReviews(userId: number, submit: (review: ReviewSubmit) => Promise<void>, isCurrent: () => boolean) {
  const existing = running.get(userId);
  if (existing) return existing;
  const work = async (): Promise<SyncResult> => {
    const syncedWordIds: number[] = [];
    let error: string | undefined;
    for (const review of getPendingReviews(userId)) {
      if (!isCurrent()) break;
      const reviewedAt = review.reviewed_at ?? review.created_at;
      if (!Number.isFinite(Date.parse(reviewedAt))) { error = 'A saved review has an invalid date. It has been preserved.'; break; }
      try {
        await submit({ word_id: review.word_id, quality: review.quality, reviewed_at: reviewedAt });
        // Removing only the acknowledged event also preserves new events from other tabs.
        window.localStorage.removeItem(queuePrefix(userId) + review.id);
        syncedWordIds.push(review.word_id);
      } catch {
        error = 'Reviews are saved on this device. Sync stopped; retry when connected and signed in.';
        break; // Preserve order, including subsequent reviews of the same word.
      }
    }
    changed();
    return { synced: syncedWordIds.length, remaining: getPendingReviews(userId).length, syncedWordIds, error };
  };
  // Web Locks serialize synchronization across tabs. Without them, retain data safely.
  const promise = (navigator.locks
    ? navigator.locks.request(`onetouch-review-sync:${userId}`, work)
    : Promise.resolve({ synced: 0, remaining: getPendingReviews(userId).length, syncedWordIds: [], error: 'This browser cannot safely sync offline reviews. Use a browser with Web Locks support.' }))
    .finally(() => { if (running.get(userId) === promise) running.delete(userId); });
  running.set(userId, promise);
  return promise;
}
export function cacheReviewSession(userId: number, session: ReviewSession) {
  try { window.localStorage.setItem(sessionKey(userId), JSON.stringify({ ...session, cached_at: new Date().toISOString() })); }
  catch { /* A large handwriting preview must not prevent an online review session. */ }
}
export function removeCardFromCachedReviewSession(userId: number, wordId: number) {
  const cached = readJson<(ReviewSession & { cached_at?: string }) | null>(sessionKey(userId), null);
  if (!cached) return;
  const items = cached.items.filter(card => card.word_id !== wordId);
  cacheReviewSession(userId, { ...cached, items, total: items.length, stats: { ...cached.stats, due_count: Math.max(0, cached.stats.due_count - (items.length === cached.items.length ? 0 : 1)) } });
}
export function loadCachedReviewSession(userId: number): ReviewSession | null {
  const cached = readJson<(ReviewSession & { cached_at?: string }) | null>(sessionKey(userId), null);
  if (!cached?.cached_at || !Array.isArray(cached.items)) return null;
  const age = Date.now() - Date.parse(cached.cached_at);
  if (!Number.isFinite(age) || age > REVIEW_SESSION_MAX_AGE_MS) return null;
  return cached;
}
