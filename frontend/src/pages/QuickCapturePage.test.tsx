import { beforeEach, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { createMemoryRouter, RouterProvider } from 'react-router-dom';
import QuickCapturePage from './QuickCapturePage';
import { useSettingsStore } from '../store/settingsStore';
import { replaceCurrentAuthToken } from '../api/authSession';
import * as words from '../api/words';
import * as kaoyan from '../api/kaoyan';

vi.mock('../api/words', () => ({ createWord: vi.fn(), suggestWords: vi.fn(), addDefinition: vi.fn(), listWords: vi.fn(), MAX_PAGE_SIZE: 100 }));
vi.mock('../api/kaoyan', () => ({ lookupKaoyanWord: vi.fn() }));
vi.mock('../components/CanvasPad', () => ({ default: ({ onInkChange }: { onInkChange: (value: string) => void }) => <button onClick={() => onInkChange('test-ink')}>Draw stroke</button> }));
beforeEach(() => {
  localStorage.clear(); replaceCurrentAuthToken('test', 1);
  useSettingsStore.setState({ definitionInputMode: 'keyboard' });
  vi.mocked(words.createWord).mockResolvedValue({ id: 7, text: 'perspective', status: 'captured' } as Awaited<ReturnType<typeof words.createWord>>);
  vi.mocked(words.suggestWords).mockResolvedValue([]);
  vi.mocked(words.addDefinition).mockResolvedValue({ id: 8 });
  vi.mocked(kaoyan.lookupKaoyanWord).mockResolvedValue({ in_lexicon: true, translation: 'n. 观点', sentences: [] });
});
function open() {
  const router = createMemoryRouter([{ path: '/capture', element: <QuickCapturePage /> }, { path: '/words/:id', element: <div>Existing word</div> }], { initialEntries: ['/capture'] });
  render(<RouterProvider router={router} />); return userEvent.setup();
}
async function capture(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByRole('combobox', { name: 'Word to capture' }), 'perspective');
  await user.click(screen.getByRole('button', { name: 'Capture word' }));
  await screen.findByRole('button', { name: 'Usage' });
}
it('allows touch-style usage switching and saving without shortcuts', async () => {
  const user = open(); await capture(user);
  await user.click(screen.getByRole('button', { name: 'Usage' }));
  await user.type(await screen.findByRole('textbox', { name: 'Usage pattern' }), 'a different perspective');
  await user.click(screen.getByRole('button', { name: 'Save usage' }));
  await waitFor(() => expect(words.addDefinition).toHaveBeenCalledWith(7, expect.objectContaining({ pos: 'phr.', collocations: [{ pattern: 'a different perspective', meaning_zh: '' }] })));
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(await screen.findByRole('button', { name: 'Capture word' })).toBeDefined();
});
it('can finish after saving only the dictionary definition', async () => {
  const user = open(); await capture(user);
  await user.click(await screen.findByRole('button', { name: /Kaoyan dictionary/ }));
  await user.click(screen.getByRole('button', { name: /Save definition and examples/ }));
  await waitFor(() => expect(words.addDefinition).toHaveBeenCalledTimes(1));
  await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(await screen.findByRole('button', { name: 'Capture word' })).toBeDefined();
});
it('does not silently discard a second unsaved definition', async () => {
  const user = open(); await capture(user);
  const meaning = screen.getByRole('textbox', { name: 'Chinese meaning' });
  await user.type(meaning, 'first'); await user.click(screen.getByRole('button', { name: 'Save definition' }));
  await waitFor(() => expect((meaning as HTMLInputElement).value).toBe(''));
  await user.type(meaning, 'second'); await user.click(screen.getByRole('button', { name: 'Done' }));
  expect(await screen.findByRole('dialog')).toBeDefined();
  await user.click(screen.getByRole('button', { name: 'Keep editing' }));
  expect((meaning as HTMLInputElement).value).toBe('second');
});
it('does not save while Enter confirms an IME composition', async () => {
  const user = open(); await capture(user);
  const meaning = screen.getByRole('textbox', { name: 'Chinese meaning' });
  fireEvent.change(meaning, { target: { value: '观点' } });
  fireEvent.keyDown(meaning, { key: 'Enter', isComposing: true });
  expect(words.addDefinition).not.toHaveBeenCalled();
});
it('opens the highlighted existing word instead of submitting the prefix', async () => {
  vi.mocked(words.suggestWords).mockResolvedValue(['perspective']);
  vi.mocked(words.listWords).mockResolvedValue({ items: [{ id: 7, text: 'perspective' }], total: 1 } as Awaited<ReturnType<typeof words.listWords>>);
  const user = open();
  await user.type(screen.getByRole('combobox'), 'pers');
  await screen.findByRole('option');
  await user.keyboard('{ArrowDown}{Enter}');
  expect(await screen.findByText('Existing word')).toBeDefined();
  expect(words.createWord).not.toHaveBeenCalled();
});
it('allows retry after handwriting save fails and supports another capture', async () => {
  useSettingsStore.setState({ definitionInputMode: 'handwriting' });
  vi.mocked(words.addDefinition).mockRejectedValueOnce(new Error('offline'));
  const user = open();
  await user.type(screen.getByRole('combobox'), 'perspective');
  await user.click(screen.getByRole('button', { name: 'Capture word' }));
  await user.click(await screen.findByRole('button', { name: 'Draw stroke' }));
  await user.click(screen.getByRole('button', { name: 'Save & next' }));
  await waitFor(() => expect(words.addDefinition).toHaveBeenCalledTimes(1));
  await user.click(await screen.findByRole('button', { name: 'Save & next' }));
  expect(await screen.findByRole('button', { name: 'Capture word' })).toBeDefined();
  expect(words.addDefinition).toHaveBeenCalledTimes(2);
  await user.type(screen.getByRole('combobox'), 'again');
  await user.click(screen.getByRole('button', { name: 'Capture word' }));
  await user.click(await screen.findByRole('button', { name: 'Draw stroke' }));
  await user.click(screen.getByRole('button', { name: 'Save & next' }));
  expect(await screen.findByRole('button', { name: 'Capture word' })).toBeDefined();
  expect(words.addDefinition).toHaveBeenCalledTimes(3);
});
it('keeps a draft on exit and restores the unsaved text', async () => {
  const user = open(); await capture(user);
  await user.type(screen.getByRole('textbox', { name: 'Chinese meaning' }), 'first');
  await user.click(screen.getByRole('button', { name: 'Save definition' }));
  await user.type(screen.getByRole('textbox', { name: 'Chinese meaning' }), 'unfinished');
  await user.click(screen.getByRole('button', { name: 'Done' }));
  await user.click(await screen.findByRole('button', { name: 'Keep draft & leave' }));
  await user.click(await screen.findByRole('button', { name: /Continue your unsaved draft/ }));
  expect((screen.getByRole('textbox', { name: 'Chinese meaning' }) as HTMLInputElement).value).toBe('unfinished');
});
