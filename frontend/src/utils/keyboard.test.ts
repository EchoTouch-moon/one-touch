import { expect, it } from 'vitest';
import { blocksReviewShortcut } from './keyboard';
it('allows review keys outside editable controls', () => { expect(blocksReviewShortcut(new KeyboardEvent('keydown', { key: '1' }))).toBe(false); });
it('blocks shortcuts while a dialog is open', () => {
  const dialog = document.createElement('div'); dialog.setAttribute('role', 'dialog'); document.body.append(dialog);
  expect(blocksReviewShortcut(new KeyboardEvent('keydown', { key: '1' }))).toBe(true); dialog.remove();
});
it('ignores input fields, repeated keys, and composing input', () => {
  const field = document.createElement('textarea'); document.body.append(field);
  field.addEventListener('keydown', event => expect(blocksReviewShortcut(event)).toBe(true));
  field.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' })); field.remove();
  expect(blocksReviewShortcut(new KeyboardEvent('keydown', { key: '1', repeat: true }))).toBe(true);
  expect(blocksReviewShortcut(new KeyboardEvent('keydown', { key: '1', isComposing: true }))).toBe(true);
});
