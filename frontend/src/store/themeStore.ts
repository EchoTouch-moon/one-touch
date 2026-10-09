import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type ThemeName = 'violet' | 'paper';

export interface ThemeOption {
  id: ThemeName;
  label: string;
  hint: string;
  /** Ground + accent, used for the swatch in the picker. */
  swatch: [string, string];
}

export const THEME_OPTIONS: ThemeOption[] = [
  { id: 'violet', label: 'Violet', hint: 'Minimal white and violet', swatch: ['#f7f7fa', '#4f46e5'] },
  { id: 'paper', label: 'Paper', hint: 'Warm ink on off-white stock', swatch: ['#f4f1ea', '#4b44d6'] },
];

/** Browser chrome colour per theme, so the page is not framed by a stray band. */
export const THEME_COLOR: Record<ThemeName, string> = {
  violet: '#f7f7fa',
  paper: '#f4f1ea',
};

interface ThemeState {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
}

export const useThemeStore = create<ThemeState>()(
  persist(
    (set, get) => ({
      theme: 'violet',
      setTheme: (theme) => set({ theme }),
      toggleTheme: () => set({ theme: get().theme === 'paper' ? 'violet' : 'paper' }),
    }),
    { name: 'onetouch-theme' },
  ),
);

/**
 * Reflect the theme onto <html>. The Violet set lives on `:root`, so it is the
 * attribute's absence rather than a matching value.
 *
 * This also runs from an inline script in index.html before first paint; the
 * duplicate here keeps the DOM, the store and the browser chrome in sync when
 * the user switches at runtime.
 */
export function applyTheme(theme: ThemeName) {
  const root = document.documentElement;
  if (theme === 'violet') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', theme);

  document.querySelector('meta[name="theme-color"]')?.setAttribute('content', THEME_COLOR[theme]);
}

export const otherTheme = (theme: ThemeName): ThemeName => (theme === 'paper' ? 'violet' : 'paper');
