export interface ReviewCard {
  word_id: number;
  text: string;
  phonetic: string | null;
  definitions: { pos: string; meaning_zh: string; canvas_image: string | null; ink_data: string | null }[];
  ease_factor: number;
  interval_days: number;
  repetitions: number;
  next_review: string;
  algorithm: string;
  phase: string;
  difficulty: number | null;
  stability: number | null;
  retrievability: number | null;
  scheduled_days: number | null;
  learning_step: number;
  learning_due_at: string | null;
}

export interface ReviewStats {
  due_count: number;
  reviewed_today: number;
  total_words: number;
}

export interface ReviewSession {
  items: ReviewCard[];
  total: number;
  stats: ReviewStats;
}

export interface ReviewSubmit {
  word_id: number;
  quality: number;
  reviewed_at?: string;
}
