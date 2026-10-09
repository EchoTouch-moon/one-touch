import api from './client';
import type { Word, WordDetail, WordListResponse, WordCreate } from '../types/word';

/**
 * The server rejects `page_size > 100` with a 422. Callers that want "all of
 * them" (looking up whether a word already exists) used to ask for 200 and get
 * a validation error back, which broke the duplicate-capture recovery path.
 * Clamping here means no caller can send an out-of-range value again.
 */
export const MAX_PAGE_SIZE = 100;

export async function createWord(data: WordCreate): Promise<Word> {
  const res = await api.post<Word>('/words', data);
  return res.data;
}

export async function listWords(params?: {
  page?: number;
  page_size?: number;
  status?: string;
  q?: string;
}): Promise<WordListResponse> {
  const query = params && params.page_size !== undefined
    ? { ...params, page_size: Math.min(Math.max(1, params.page_size), MAX_PAGE_SIZE) }
    : params;
  const res = await api.get<WordListResponse>('/words', { params: query });
  return res.data;
}

export async function getWord(id: number): Promise<WordDetail> {
  const res = await api.get<WordDetail>(`/words/${id}`);
  return res.data;
}

export async function deleteWord(id: number): Promise<void> {
  await api.delete(`/words/${id}`);
}

export async function suggestWords(q: string, limit = 8): Promise<string[]> {
  const res = await api.get<string[]>('/words/suggest', { params: { q, limit } });
  return res.data;
}

export async function addDefinition(
  wordId: number,
  data: {
    pos: string;
    meaning_en?: string;
    meaning_zh: string;
    canvas_image?: string | null;
    ink_data?: string | null;
    examples?: { sentence_en: string; sentence_zh?: string }[];
    collocations?: { pattern: string; meaning_zh?: string }[];
  },
): Promise<{ id: number }> {
  const res = await api.post<{ id: number }>(`/words/${wordId}/definitions`, data);
  return res.data;
}

export async function updateDefinition(
  wordId: number,
  defId: number,
  data: {
    pos?: string;
    meaning_en?: string;
    meaning_zh?: string;
    canvas_image?: string | null;
    ink_data?: string | null;
    is_primary?: boolean;
  },
): Promise<{ id: number }> {
  const res = await api.patch<{ id: number }>(`/words/${wordId}/definitions/${defId}`, data);
  return res.data;
}

export async function deleteDefinition(wordId: number, defId: number): Promise<void> {
  await api.delete(`/words/${wordId}/definitions/${defId}`);
}

export async function updateWord(wordId: number, data: { phonetic?: string }): Promise<Word> {
  const res = await api.patch<Word>(`/words/${wordId}`, data);
  return res.data;
}
