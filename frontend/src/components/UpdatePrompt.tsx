import { useEffect, useState } from 'react';

type ActivateUpdate = () => void;

export default function UpdatePrompt() {
  const [activate, setActivate] = useState<ActivateUpdate | null>(null);

  useEffect(() => {
    const handleUpdateReady = (event: Event) => {
      const detail = (event as CustomEvent<{ activate?: ActivateUpdate }>).detail;
      if (detail?.activate) {
        setActivate(() => detail.activate || null);
      }
    };

    window.addEventListener('onetouch-update-ready', handleUpdateReady);
    return () => window.removeEventListener('onetouch-update-ready', handleUpdateReady);
  }, []);

  if (!activate) return null;

  return (
    <div
      role="status"
      className="card card-float fixed inset-x-3 bottom-[calc(var(--shell-bottom)+0.75rem)] z-50 p-4 sm:inset-x-auto sm:right-4 sm:w-80"
    >
      <p className="flex items-center gap-2 text-meta font-semibold text-ink">
        <span className="h-1.5 w-1.5 rounded-full bg-brand" aria-hidden="true" />
        A new version is ready
      </p>
      <p className="mt-1.5 text-micro leading-relaxed text-ink-mute">
        Reload to pick up the latest build. Your drafts stay on this device.
      </p>
      <div className="mt-3.5 flex justify-end gap-2">
        <button type="button" onClick={() => setActivate(null)} className="btn btn-ghost btn-sm">
          Later
        </button>
        <button type="button" onClick={activate} className="btn btn-primary btn-sm">
          Reload now
        </button>
      </div>
    </div>
  );
}
