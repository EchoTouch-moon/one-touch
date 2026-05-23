import api from './client';
import type { Word, WordDetail, WordListResponse, WordCreate } from '../types/word';

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
  const res = await api.get<WordListResponse>('/words', { params });
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
