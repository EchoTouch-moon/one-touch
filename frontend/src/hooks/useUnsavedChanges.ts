import { useCallback, useEffect, useState } from 'react';
import { useBlocker, useBeforeUnload } from 'react-router-dom';
import toast from 'react-hot-toast';

export function useUnsavedChanges(dirty: boolean, keep: () => Promise<void> | void, discard: () => Promise<void> | void) {
  const blocker = useBlocker(dirty);
  const [action, setAction] = useState<(() => void) | null>(null);
  useBeforeUnload(useCallback((event: BeforeUnloadEvent) => {
    if (dirty) { event.preventDefault(); event.returnValue = ''; }
  }, [dirty]));
  const requestExit = (next: () => void) => { if (dirty) setAction(() => next); else next(); };
  const stay = () => { setAction(null); if (blocker.state === 'blocked') blocker.reset(); };
  const leave = async (preserve: boolean) => {
    try {
      await (preserve ? keep() : discard());
      if (blocker.state === 'blocked') blocker.proceed();
      else action?.();
      setAction(null);
    } catch { toast.error('Could not update the draft. Your edits remain open.'); }
  };
  useEffect(() => {
    if (!dirty) return;
    const beforeLogout = (event: Event) => {
      event.preventDefault();
      setAction(() => (event as CustomEvent<() => void>).detail);
    };
    window.addEventListener('glm-words-before-logout', beforeLogout);
    return () => window.removeEventListener('glm-words-before-logout', beforeLogout);
  }, [dirty]);
  useEffect(() => {
    if (!dirty) return;
    const persist = () => { void Promise.resolve(keep()).catch(() => undefined); };
    window.addEventListener('pagehide', persist);
    return () => window.removeEventListener('pagehide', persist);
  }, [dirty, keep]);
  return { requestExit, dialog: { open: Boolean(action) || blocker.state === 'blocked', onStay: stay, onKeep: () => void leave(true), onDiscard: () => void leave(false) } };
}
