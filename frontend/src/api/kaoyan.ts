import client from './client';

export interface KaoyanWordItem {
  word: string;
  translation: string;
  phonetic: string;
  frq: number;
  captured: boolean;
}

export interface KaoyanWordsResponse {
  items: KaoyanWordItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface KaoyanStats {
  total: number;
  captured: number;
  remaining: number;
}

export interface ExamSentenceItem {
  id: number;
  year: number;
  paper?: string;
  text: string;
}

export async function fetchKaoyanWords(params: {
  page: number;
  pageSize: number;
  q?: string;
  status?: 'all' | 'captured' | 'uncaptured';
}) {
  const search = new URLSearchParams({
    page: String(params.page),
    page_size: String(params.pageSize),
  });
  if (params.q) search.set('q', params.q);
  if (params.status && params.status !== 'all') search.set('status', params.status);
  const res = await client.get<KaoyanWordsResponse>('/kaoyan/words', { params: search });
  return res.data;
}

export async function fetchKaoyanStats() {
  const res = await client.get<KaoyanStats>('/kaoyan/stats');
  return res.data;
}

export async function fetchWordSentences(word: string) {
  const res = await client.get<{ word: string; sentences: ExamSentenceItem[] }>(
    `/kaoyan/words/${encodeURIComponent(word)}/sentences`,
  );
  return res.data;
}

export async function captureKaoyanWord(word: string) {
  const res = await client.post('/kaoyan/capture', { word });
  return res.data as { word_id: number; created: boolean };
}

export interface KaoyanLookup {
  in_lexicon: boolean;
  word?: string;
  translation?: string;
  phonetic?: string;
  sentences?: ExamSentenceItem[];
}

export async function lookupKaoyanWord(word: string) {
  const res = await client.get<KaoyanLookup>(`/kaoyan/words/${encodeURIComponent(word)}/lookup`);
  return res.data;
}
