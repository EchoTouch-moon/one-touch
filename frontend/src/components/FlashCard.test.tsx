import { act, fireEvent, render, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import FlashCard from './FlashCard';
const kaoyan = { translation: 'dictionary translation', phonetic: '', sentences: [] };
it('keeps dictionary visible after long press and release, and disables drag while reading', async () => {
  vi.useFakeTimers();
  const onFlip = vi.fn();
  const { container } = render(<FlashCard text="example" phonetic={null} definitions={[{ pos:'n.', meaning_zh:'my definition' }]} flipped onFlip={onFlip} kaoyan={kaoyan} />);
  const target = screen.getByText('my definition');
  fireEvent.pointerDown(target, { pointerType: 'touch', clientX: 1, clientY: 1 });
  await act(() => vi.advanceTimersByTimeAsync(500));
  fireEvent.pointerUp(screen.getByText('dictionary translation')); fireEvent.click(screen.getByText('dictionary translation'));
  expect(screen.getByText('dictionary translation')).toBeDefined();
  expect(onFlip).not.toHaveBeenCalled();
  expect(container.querySelector('[style*="touch-action: pan-y"]')).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Close dictionary' }));
  expect(screen.queryByText('dictionary translation')).toBeNull();
});
it('cancels a pending long press on unmount', async () => {
  vi.useFakeTimers();
  const { unmount } = render(<FlashCard text="example" phonetic={null} definitions={[{ pos:'n.', meaning_zh:'mine' }]} flipped onFlip={vi.fn()} kaoyan={kaoyan} />);
  fireEvent.pointerDown(screen.getByText('mine'), { pointerType:'touch' });
  unmount(); await act(() => vi.advanceTimersByTimeAsync(500));
  expect(screen.queryByText('dictionary translation')).toBeNull();
});
