import { beforeEach, describe, expect, it, vi } from 'vitest';
import { enqueueReview, getPendingReviews, flushPendingReviews, cacheReviewSession, loadCachedReviewSession, getLegacyReviews } from './offlineReviewQueue';
import type { ReviewSession } from '../types/review';
const event = { word_id: 1, quality: 4, reviewed_at: '2026-10-01T10:00:00.000Z' };
const current = () => true;
beforeEach(() => {
  localStorage.clear();
  Object.defineProperty(navigator, 'locks', { configurable: true, value: { request: (_: string, fn: () => Promise<unknown>) => fn() } });
});
describe('offline review persistence', () => {
  it('preserves events appended while a request is in flight', async () => {
    enqueueReview(1, event);
    let finish!: () => void;
    const submit = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const syncing = flushPendingReviews(1, submit, current);
    enqueueReview(1, { ...event, word_id: 2 });
    finish(); await syncing;
    expect(getPendingReviews(1).map(r => r.word_id)).toEqual([2]);
    expect(submit).toHaveBeenCalledWith(event);
  });
  it('reuses a running sync rather than submitting the event twice', async () => {
    enqueueReview(1, event);
    let finish!: () => void;
    const submit = vi.fn(() => new Promise<void>(resolve => { finish = resolve; }));
    const first = flushPendingReviews(1, submit, current);
    const second = flushPendingReviews(1, submit, current);
    expect(first).toBe(second); finish(); await first;
    expect(submit).toHaveBeenCalledTimes(1);
  });
  it('stops on failure and retains later events in order', async () => {
    vi.useFakeTimers(); vi.setSystemTime(new Date('2026-10-01T10:00:00Z'));
    enqueueReview(1, event); vi.advanceTimersByTime(10); enqueueReview(1, { ...event, quality: 1 });
    const submit = vi.fn().mockRejectedValue(new Error('offline'));
    const result = await flushPendingReviews(1, submit, current);
    expect(submit).toHaveBeenCalledTimes(1); expect(result.remaining).toBe(2);
    expect(getPendingReviews(1).map(r => r.quality)).toEqual([4, 1]);
  });
  it('isolates accounts and stops sending when the session changes', async () => {
    enqueueReview(1, event); enqueueReview(2, { ...event, word_id: 99 });
    const submit = vi.fn(); await flushPendingReviews(1, submit, () => false);
    expect(submit).not.toHaveBeenCalled(); expect(getPendingReviews(2)[0].word_id).toBe(99);
    expect(getPendingReviews(1)).toHaveLength(1);
  });
  it('retains unknown legacy records without assigning them to a user', () => {
    localStorage.setItem('onetouch-pending-reviews', JSON.stringify([event]));
    expect(getPendingReviews(1)).toEqual([]); expect(getLegacyReviews()).toContain('2026-10-01');
  });
  it('does not share cached sessions between users', () => {
    const session = { items: [], total: 0, stats: { due_count: 0, total_words: 2, reviewed_today: 0, estimated_due_tomorrow: 0 } } as ReviewSession;
    cacheReviewSession(1, session); expect(loadCachedReviewSession(1)?.stats.total_words).toBe(2);
    expect(loadCachedReviewSession(2)).toBeNull();
  });
  it('preserves invalid timestamps and reports the problem', async () => {
    enqueueReview(1, { ...event, reviewed_at: 'invalid' });
    const submit = vi.fn(); const result = await flushPendingReviews(1, submit, current);
    expect(submit).not.toHaveBeenCalled(); expect(result.error).toMatch(/invalid date/); expect(result.remaining).toBe(1);
  });
  it('uses creation time for a legacy event without reviewed_at', async () => {
    const stored = enqueueReview(1, { word_id: 1, quality: 4 });
    const submit = vi.fn().mockResolvedValue(undefined); await flushPendingReviews(1, submit, current);
    expect(submit).toHaveBeenCalledWith({ word_id: 1, quality: 4, reviewed_at: stored.created_at });
  });
  it('retains events if cross-tab locking is unavailable', async () => {
    Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined });
    enqueueReview(1, event); const submit = vi.fn();
    expect((await flushPendingReviews(1, submit, current)).remaining).toBe(1);
    expect(submit).not.toHaveBeenCalled();
  });
});
