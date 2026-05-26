import { create } from 'zustand';
import type { ReviewCard } from '../types/review';
import * as reviewApi from '../api/review';
import {
  cacheReviewSession,
  enqueueReview,
  flushPendingReviews,
  getPendingReviews,
  loadCachedReviewSession,
  removeCardFromCachedReviewSession,
} from '../utils/offlineReviewQueue';

const GROUP_SIZE = 5;
let startSessionPromise: Promise<void> | null = null;

type Phase = 'reviewing' | 'group-complete' | 'complete' | 'random';

interface ReviewState {
  allCards: ReviewCard[];
  groups: ReviewCard[][];
  groupIndex: number;
  queue: ReviewCard[];      // current working queue (includes re-queued "Again")
  queuePos: number;
  flipped: boolean;
  loading: boolean;
  phase: Phase;
  stats: { due_count: number; reviewed_today: number; total_words: number };
  reviewedInGroup: number;
  offline: boolean;
  pendingReviews: number;
  startSession: () => Promise<void>;
  syncPendingReviews: () => Promise<void>;
  flipCard: () => void;
  gradeCard: (quality: number) => Promise<void>;
  nextGroup: () => void;
  startRandom: () => void;
  currentCard: () => ReviewCard | null;
  groupProgress: () => { current: number; total: number };
}

function shuffle<T>(arr: T[]): T[] {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function shouldQueueReview(error: unknown) {
  const status = (error as { response?: { status?: number } })?.response?.status;
  return status === undefined || status >= 500;
}

function buildGroups(cards: ReviewCard[]): ReviewCard[][] {
  const groups: ReviewCard[][] = [];
  for (let i = 0; i < cards.length; i += GROUP_SIZE) {
    groups.push(cards.slice(i, i + GROUP_SIZE));
  }
  return groups;
}

function sessionStateFromCards(cards: ReviewCard[], stats: ReviewState['stats'], offline: boolean) {
  const groups = buildGroups(cards);
  const firstGroup = groups[0] || [];
  return {
    allCards: cards,
    groups,
    groupIndex: 0,
    queue: [...firstGroup],
    queuePos: 0,
    flipped: false,
    phase: groups.length > 0 ? 'reviewing' as const : 'complete' as const,
    stats,
    loading: false,
    offline,
    reviewedInGroup: 0,
  };
}

export const useReviewStore = create<ReviewState>((set, get) => ({
  allCards: [],
  groups: [],
  groupIndex: 0,
  queue: [],
  queuePos: 0,
  flipped: false,
  loading: false,
  phase: 'reviewing',
  stats: { due_count: 0, reviewed_today: 0, total_words: 0 },
  reviewedInGroup: 0,
  offline: false,
  pendingReviews: getPendingReviews().length,

  startSession: async () => {
    if (startSessionPromise) return startSessionPromise;

    startSessionPromise = (async () => {
    const cachedSession = loadCachedReviewSession();
    if (cachedSession) {
      set(sessionStateFromCards(cachedSession.items, cachedSession.stats, !navigator.onLine));
    } else {
      set({ loading: true });
    }

    try {
      if (getPendingReviews().length > 0) {
        await get().syncPendingReviews();
      }
      const dueRes = await reviewApi.getReviewSession();
      cacheReviewSession(dueRes);
      set(sessionStateFromCards(dueRes.items, dueRes.stats, false));
    } catch {
      if (!cachedSession) {
        set({ loading: false, offline: !navigator.onLine });
        return;
      }
      set(sessionStateFromCards(cachedSession.items, cachedSession.stats, true));
    }
    })().finally(() => {
      startSessionPromise = null;
    });

    return startSessionPromise;
  },

  syncPendingReviews: async () => {
    const result = await flushPendingReviews(reviewApi.submitReview);
    result.syncedWordIds.forEach(removeCardFromCachedReviewSession);
    set({ pendingReviews: result.remaining, offline: result.remaining > 0 ? !navigator.onLine : false });
  },

  flipCard: () => set((s) => ({ flipped: !s.flipped })),

  gradeCard: async (quality: number) => {
    const { queue, queuePos } = get();
    const card = queue[queuePos];
    if (!card) return;
    const reviewedAt = new Date().toISOString();

    const newReviewed = get().reviewedInGroup + 1;
    const nextPos = queuePos + 1;
    let advancedQueue = queue;

    // "Again" — re-queue at end of current group
    if (quality === 1) {
      advancedQueue = [...queue, card];
      set({
        queuePos: nextPos,
        queue: advancedQueue,
        flipped: false,
        reviewedInGroup: newReviewed,
      });
    } else {
      set({ queuePos: nextPos, flipped: false, reviewedInGroup: newReviewed });
    }

    try {
      await reviewApi.submitReview({ word_id: card.word_id, quality, reviewed_at: reviewedAt });
      removeCardFromCachedReviewSession(card.word_id);
      set({ pendingReviews: getPendingReviews().length, offline: false });
    } catch (error) {
      if (shouldQueueReview(error)) {
        enqueueReview({ word_id: card.word_id, quality, reviewed_at: reviewedAt });
        set({ pendingReviews: getPendingReviews().length, offline: true });
      }
    }

    // Check if group is done (no more unreached items)
    if (nextPos >= advancedQueue.length) {
      // Group complete only if no re-queued items remain
      try {
        const newStats = await reviewApi.getReviewStats();
        set({ phase: 'group-complete', stats: newStats, offline: false });
      } catch {
        set((s) => ({
          phase: 'group-complete',
          offline: true,
          stats: {
            ...s.stats,
            reviewed_today: s.stats.reviewed_today + 1,
          },
        }));
      }
    }
  },

  nextGroup: () => {
    const { groups, groupIndex } = get();
    const nextIdx = groupIndex + 1;
    if (nextIdx >= groups.length) {
      set({ phase: 'complete' });
      return;
    }
    const nextGroup = groups[nextIdx];
    set({
      groupIndex: nextIdx,
      queue: [...nextGroup],
      queuePos: 0,
      flipped: false,
      phase: 'reviewing',
      reviewedInGroup: 0,
    });
  },

  startRandom: () => {
    const { allCards } = get();
    const randomized = shuffle(allCards);
    set({
      queue: randomized,
      queuePos: 0,
      flipped: false,
      phase: 'random',
      reviewedInGroup: 0,
    });
  },

  currentCard: () => {
    const { queue, queuePos } = get();
    return queue[queuePos] ?? null;
  },

  groupProgress: () => {
    const { groups, groupIndex } = get();
    return { current: groupIndex + 1, total: groups.length };
  },
}));
