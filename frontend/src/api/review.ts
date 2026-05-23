import api from './client';
import type { ReviewCard, ReviewSession, ReviewStats, ReviewSubmit } from '../types/review';

export async function getDueWords(): Promise<{ items: ReviewCard[]; total: number }> {
  const res = await api.get('/review/due');
  return res.data;
}

export async function getReviewSession(): Promise<ReviewSession> {
  const res = await api.get('/review/session');
  return res.data;
}

export async function submitReview(data: ReviewSubmit): Promise<void> {
  await api.post('/review/submit', data);
}

export async function getReviewStats(): Promise<ReviewStats> {
  const res = await api.get('/review/stats');
  return res.data;
}
