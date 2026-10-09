export function isEditingTarget(target: EventTarget | null): boolean {
  return target instanceof HTMLElement && Boolean(target.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]'));
}
export function blocksReviewShortcut(event: KeyboardEvent): boolean {
  return event.defaultPrevented || event.repeat || event.isComposing || event.ctrlKey || event.metaKey || event.altKey
    || isEditingTarget(event.target) || document.querySelector('[role="dialog"]') !== null;
}
