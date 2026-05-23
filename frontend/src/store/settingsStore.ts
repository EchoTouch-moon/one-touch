import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface LLMSettings {
  provider: 'openai' | 'ollama' | 'anthropic' | 'doubao';
  model: string;
  baseUrl: string;
}

export type DefinitionInputMode = 'keyboard' | 'handwriting';

interface SettingsState {
  llm: LLMSettings;
  definitionInputMode: DefinitionInputMode | null;
  setLlm: (settings: Partial<LLMSettings>) => void;
  setDefinitionInputMode: (mode: DefinitionInputMode) => void;
}

export const useSettingsStore = create<SettingsState>()(
  persist(
    (set) => ({
      llm: {
        provider: 'ollama',
        model: 'llama3',
        baseUrl: '',
      },
      definitionInputMode: null,
      setLlm: (partial) =>
        set((state) => ({
          llm: { ...state.llm, ...partial },
        })),
      setDefinitionInputMode: (mode) => set({ definitionInputMode: mode }),
    }),
    { name: 'glm-words-settings' },
  ),
);
