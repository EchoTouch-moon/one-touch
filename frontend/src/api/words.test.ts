import { beforeEach, expect, it, vi } from 'vitest';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));

vi.mock('./client', () => ({
  default: { get, post: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

import { listWords, MAX_PAGE_SIZE } from './words';

beforeEach(() => {
  get.mockReset().mockResolvedValue({ data: { items: [], total: 0, page: 1, page_size: MAX_PAGE_SIZE } });
});

it('clamps page_size to what the API accepts', async () => {
  await listWords({ q: 'ephemeral', page_size: 200 });
  expect(get).toHaveBeenCalledWith('/words', { params: { q: 'ephemeral', page_size: MAX_PAGE_SIZE } });
});

it('clamps a non-positive page_size up to 1', async () => {
  await listWords({ page_size: 0 });
  expect(get).toHaveBeenCalledWith('/words', { params: { page_size: 1 } });
});

it('passes params through untouched when no page_size is given', async () => {
  await listWords({ page: 2, q: 'a' });
  expect(get).toHaveBeenCalledWith('/words', { params: { page: 2, q: 'a' } });
});
