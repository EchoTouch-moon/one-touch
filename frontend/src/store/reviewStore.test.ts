import { beforeEach, expect, it, vi } from 'vitest';
import { replaceCurrentAuthToken } from '../api/authSession';
import { useReviewStore } from './reviewStore';
import * as api from '../api/review';
import { getPendingReviews } from '../utils/offlineReviewQueue';
import type { ReviewSession } from '../types/review';
vi.mock('../api/review', () => ({ getReviewSession: vi.fn(), submitReview: vi.fn(), getReviewStats: vi.fn() }));
const response = { items: [{ word_id: 1, text: 'test', definitions: [], phonetic: null, ease_factor: 2.5, interval_days: 0, repetitions: 0, next_review: '', algorithm: 'sm2', phase: 'new', difficulty: null, stability: null, retrievability: null, scheduled_days: null, learning_step: 0, learning_due_at: null }], total: 1, stats: { due_count: 1, total_words: 1, reviewed_today: 0, estimated_due_tomorrow: 0 } } as ReviewSession;
beforeEach(() => {
  localStorage.clear(); replaceCurrentAuthToken('user-a', 1);
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, fn: () => Promise<unknown>) => fn() } });
  vi.mocked(api.getReviewSession).mockResolvedValue(response);
  vi.mocked(api.submitReview).mockResolvedValue(undefined);
  vi.mocked(api.getReviewStats).mockResolvedValue(response.stats);
});
it('ignores a late session response after account switch', async () => {
  let resolve!: (r: ReviewSession) => void;
  vi.mocked(api.getReviewSession).mockImplementation(() => new Promise(r => { resolve = r; }));
  const task = useReviewStore.getState().startSession();
  await vi.waitFor(() => expect(api.getReviewSession).toHaveBeenCalled());
  replaceCurrentAuthToken('user-b', 2); resolve(response); await task;
  expect(useReviewStore.getState().allCards).toEqual([]);
});
it('grades once per revealed card and preserves failed submissions', async () => {
  await useReviewStore.getState().startSession();
  vi.mocked(api.submitReview).mockRejectedValue(new Error('offline'));
  useReviewStore.getState().flipCard();
  await Promise.all([useReviewStore.getState().gradeCard(4), useReviewStore.getState().gradeCard(4)]);
  expect(getPendingReviews(1)).toHaveLength(1);
  expect(api.submitReview).toHaveBeenCalledTimes(1);
  expect(useReviewStore.getState().phase).toBe('complete');
});
it('resumes a session when returning from details without resetting the card', async () => {
  await useReviewStore.getState().startSession();
  useReviewStore.getState().flipCard();
  await useReviewStore.getState().startSession();
  expect(api.getReviewSession).toHaveBeenCalledTimes(1);
  expect(useReviewStore.getState().flipped).toBe(true);
});
