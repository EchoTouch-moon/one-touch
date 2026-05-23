import type { ReviewSession, ReviewSubmit } from '../types/review';

const REVIEW_QUEUE_KEY = 'glm-words-pending-reviews';
const REVIEW_SESSION_KEY = 'glm-words-review-session-cache';
const REVIEW_SESSION_MAX_AGE_MS = 5 * 60 * 1000;

export interface PendingReview extends ReviewSubmit {
  id: string;
  created_at: string;
}

function readJson<T>(key: string, fallback: T): T {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    window.localStorage.removeItem(key);
    return fallback;
  }
}

function writeJson<T>(key: string, value: T) {
  window.localStorage.setItem(key, JSON.stringify(value));
}

export function getPendingReviews(): PendingReview[] {
  return readJson<PendingReview[]>(REVIEW_QUEUE_KEY, []);
}

export function enqueueReview(review: ReviewSubmit): PendingReview {
  const pending: PendingReview = {
    ...review,
    id: `${review.word_id}-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    created_at: new Date().toISOString(),
  };
  writeJson(REVIEW_QUEUE_KEY, [...getPendingReviews(), pending]);
  window.dispatchEvent(new Event('glm-words-review-queue-updated'));
  return pending;
}

export async function flushPendingReviews(submit: (review: ReviewSubmit) => Promise<void>) {
  const pending = getPendingReviews();
  if (pending.length === 0) return { synced: 0, remaining: 0, syncedWordIds: [] };

  const remaining: PendingReview[] = [];
  let synced = 0;
  const syncedWordIds: number[] = [];

  for (const review of pending) {
    try {
      await submit({ word_id: review.word_id, quality: review.quality });
      synced += 1;
      syncedWordIds.push(review.word_id);
    } catch {
      remaining.push(review);
    }
  }

  writeJson(REVIEW_QUEUE_KEY, remaining);
  window.dispatchEvent(new Event('glm-words-review-queue-updated'));
  return { synced, remaining: remaining.length, syncedWordIds };
}

export function cacheReviewSession(session: ReviewSession) {
  writeJson(REVIEW_SESSION_KEY, {
    ...session,
    cached_at: new Date().toISOString(),
  });
}

export function removeCardFromCachedReviewSession(wordId: number) {
  const cached = readJson<(ReviewSession & { cached_at?: string }) | null>(REVIEW_SESSION_KEY, null);
  if (!cached) return;

  const items = cached.items.filter((card) => card.word_id !== wordId);
  writeJson(REVIEW_SESSION_KEY, {
    ...cached,
    items,
    total: items.length,
    stats: {
      ...cached.stats,
      due_count: Math.max(0, cached.stats.due_count - (items.length === cached.items.length ? 0 : 1)),
    },
    cached_at: new Date().toISOString(),
  });
}

export function loadCachedReviewSession(): ReviewSession | null {
  const cached = readJson<(ReviewSession & { cached_at?: string }) | null>(REVIEW_SESSION_KEY, null);
  if (!cached) return null;
  if (cached.cached_at) {
    const age = Date.now() - new Date(cached.cached_at).getTime();
    if (Number.isFinite(age) && age > REVIEW_SESSION_MAX_AGE_MS) {
      window.localStorage.removeItem(REVIEW_SESSION_KEY);
      return null;
    }
  }
  return {
    items: cached.items,
    total: cached.total,
    stats: cached.stats,
  };
}
