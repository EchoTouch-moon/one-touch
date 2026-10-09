import { create } from 'zustand';
import toast from 'react-hot-toast';
import { getCurrentUserId, getAuthSessionEpoch, sessionIsCurrent } from '../api/authSession';
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
let startSessionTask: { epoch: number; promise: Promise<void> } | null = null;

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
  stats: { due_count: number; reviewed_today: number; total_words: number; estimated_due_tomorrow: number };
  reviewedInGroup: number;
  offline: boolean;
  pendingReviews: number;
  error: string | null;
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
  const normalizedStats = {
    due_count: stats.due_count,
    reviewed_today: stats.reviewed_today,
    total_words: stats.total_words,
    estimated_due_tomorrow: stats.estimated_due_tomorrow ?? 0,
  };
  return {
    allCards: cards,
    groups,
    groupIndex: 0,
    queue: [...firstGroup],
    queuePos: 0,
    flipped: false,
    phase: groups.length > 0 ? 'reviewing' as const : 'complete' as const,
    stats: normalizedStats,
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
  stats: { due_count: 0, reviewed_today: 0, total_words: 0, estimated_due_tomorrow: 0 },
  reviewedInGroup: 0,
  offline: false,
  pendingReviews: 0,
  error: null,

  startSession: async () => {
    const userId = getCurrentUserId();
    const epoch = getAuthSessionEpoch();
    if (userId === null) return;
    if (startSessionTask?.epoch === epoch) return startSessionTask.promise;
    // Returning from details resumes this session rather than silently starting over.
    if (get().allCards.length > 0 && get().phase !== 'complete') return;
    const current = () => sessionIsCurrent(epoch, userId);
    const promise = (async () => {
      const cached = loadCachedReviewSession(userId);
      set({ loading: true, error: null, pendingReviews: getPendingReviews(userId).length });
      try {
        await get().syncPendingReviews();
        if (!current()) return;
        const response = await reviewApi.getReviewSession();
        if (!current()) return;
        const pendingIds = new Set(getPendingReviews(userId).map(r => r.word_id));
        const session = { ...response, items: response.items.filter(card => !pendingIds.has(card.word_id)) };
        cacheReviewSession(userId, session);
        set(sessionStateFromCards(session.items, session.stats, false));
      } catch {
        if (!current()) return;
        if (cached) {
          const pendingIds = new Set(getPendingReviews(userId).map(r => r.word_id));
          set(sessionStateFromCards(cached.items.filter(card => !pendingIds.has(card.word_id)), cached.stats, true));
        } else set({ loading: false, offline: !navigator.onLine, error: 'Could not load your cards. Retry when connected.' });
      }
    })().finally(() => { if (startSessionTask?.epoch === epoch) startSessionTask = null; });
    startSessionTask = { epoch, promise };
    return promise;
  },

  syncPendingReviews: async () => {
    const userId = getCurrentUserId();
    const epoch = getAuthSessionEpoch();
    if (userId === null || getPendingReviews(userId).length === 0) return;
    const current = () => sessionIsCurrent(epoch, userId);
    let result;
    do {
      result = await flushPendingReviews(userId, review => reviewApi.submitReview(review, epoch), current);
      result.syncedWordIds.forEach(id => removeCardFromCachedReviewSession(userId, id));
      if (current()) set({ pendingReviews: result.remaining, offline: !navigator.onLine, error: result.error ?? null });
    } while (current() && result.remaining > 0 && !result.error);
  },

  flipCard: () => set(s => ({ flipped: !s.flipped })),

  gradeCard: async (quality: number) => {
    const userId = getCurrentUserId();
    const epoch = getAuthSessionEpoch();
    const { queue, queuePos, flipped, phase } = get();
    const card = queue[queuePos];
    if (!card || !flipped || userId === null || !['reviewing', 'random'].includes(phase)) return;
    try {
      enqueueReview(userId, { word_id: card.word_id, quality, reviewed_at: new Date().toISOString() });
    } catch {
      toast.error('Device storage is full. Your card has not advanced; free space and retry.');
      return;
    }
    const nextQueue = quality === 1 ? [...queue, card] : queue;
    const nextPos = queuePos + 1;
    const done = nextPos >= nextQueue.length;
    set(s => ({
      queue: nextQueue, queuePos: nextPos, flipped: false,
      reviewedInGroup: s.reviewedInGroup + 1,
      pendingReviews: getPendingReviews(userId).length,
      phase: done ? (s.phase === 'random' || s.groupIndex >= s.groups.length - 1 ? 'complete' : 'group-complete') : s.phase,
      stats: { ...s.stats, reviewed_today: s.stats.reviewed_today + 1 },
    }));
    await get().syncPendingReviews();
    if (!sessionIsCurrent(epoch, userId)) return;
    if (done) {
      try {
        const stats = await reviewApi.getReviewStats();
        if (sessionIsCurrent(epoch, userId)) set({ stats });
      } catch { /* Keep the local completion state; pending events remain visible. */ }
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

window.addEventListener('glm-words-session-changed', () => {
  startSessionTask = null;
  useReviewStore.setState({ ...sessionStateFromCards([], { due_count: 0, reviewed_today: 0, total_words: 0, estimated_due_tomorrow: 0 }, false), pendingReviews: 0, error: null });
});
