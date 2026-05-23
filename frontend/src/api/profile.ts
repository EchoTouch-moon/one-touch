import api from './client';

export interface ActivityDay {
  date: string;
  captured: number;
  reviewed: number;
}

export interface ActivitySummary {
  total_words: number;
  enriched_words: number;
  due_count: number;
  streak_days: number;
}

export interface ActivityResponse {
  days: ActivityDay[];
  summary: ActivitySummary;
}

export async function getActivity(days = 365): Promise<ActivityResponse> {
  const res = await api.get<ActivityResponse>('/profile/activity', { params: { days } });
  return res.data;
}
