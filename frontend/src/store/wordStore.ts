import { getAuthSessionEpoch } from '../api/authSession';
import { create } from 'zustand';
import type { Word } from '../types/word';
import * as wordsApi from '../api/words';

interface WordState {
  words: Word[];
  total: number;
  page: number;
  loading: boolean;
  error: string | null;
  captureWord: (text: string) => Promise<Word | null>;
  fetchWords: (page?: number, q?: string, pageSize?: number) => Promise<void>;
  removeWord: (id: number) => Promise<boolean>;
}

let requestSequence = 0;

export const useWordStore = create<WordState>((set) => ({
  words: [],
  total: 0,
  page: 1,
  loading: false,
  error: null,

  captureWord: async (text: string) => {
    const epoch = getAuthSessionEpoch();
    try {
      set({ error: null });
      const word = await wordsApi.createWord({ text });
      if (epoch !== getAuthSessionEpoch()) return null;
      set((state) => ({
        words: [word, ...state.words],
        total: state.total + 1,
      }));
      return word;
    } catch (err: unknown) {
      if (epoch !== getAuthSessionEpoch()) return null;
      const message = err instanceof Error ? err.message : 'Failed to capture word';
      set({ error: message });
      return null;
    }
  },

  fetchWords: async (page = 1, q?: string, pageSize = 20) => {
    const epoch = getAuthSessionEpoch();
    const request = ++requestSequence;
    set({ loading: true, error: null });
    try {
      const res = await wordsApi.listWords({ page, q, page_size: pageSize });
      if (epoch !== getAuthSessionEpoch() || request !== requestSequence) return;
      set({ words: res.items, total: res.total, page, loading: false });
    } catch (err: unknown) {
      if (epoch !== getAuthSessionEpoch() || request !== requestSequence) return;
      const message = err instanceof Error ? err.message : 'Failed to fetch words';
      set({ error: message, loading: false });
    }
  },

  removeWord: async (id: number) => {
    const epoch = getAuthSessionEpoch();
    try {
      await wordsApi.deleteWord(id);
      if (epoch !== getAuthSessionEpoch()) return false;
      set((state) => ({
        words: state.words.filter((w) => w.id !== id),
        total: state.total - 1,
      }));
      return true;
    } catch {
      if (epoch !== getAuthSessionEpoch()) return false;
      set({ error: 'Failed to delete word' });
      return false;
    }
  },
}));

window.addEventListener('glm-words-session-changed', () => {
  requestSequence += 1;
  useWordStore.setState({ words: [], total: 0, page: 1, loading: false, error: null });
});
