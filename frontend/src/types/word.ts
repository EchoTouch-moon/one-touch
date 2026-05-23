export interface Word {
  id: number;
  text: string;
  phonetic: string | null;
  status: 'captured' | 'enriched' | 'mastered';
  definition_count: number;
  review_ready: boolean;
  created_at: string;
  updated_at: string;
}

export interface WordDetail extends Word {
  definitions: Definition[];
}

export interface Definition {
  id: number;
  pos: string;
  meaning_en: string;
  meaning_zh: string;
  canvas_image: string | null;
  ink_data: string | null;
  order: number;
  examples: Example[];
}

export interface Example {
  sentence_en: string;
  sentence_zh: string;
  source: string | null;
  order: number;
}

export interface WordListResponse {
  items: Word[];
  total: number;
  page: number;
  page_size: number;
}

export interface WordCreate {
  text: string;
}
