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

    window.addEventListener('glm-words-update-ready', handleUpdateReady);
    return () => window.removeEventListener('glm-words-update-ready', handleUpdateReady);
  }, []);

  if (!activate) return null;

  return (
    <div className="fixed inset-x-3 bottom-20 z-50 rounded-xl border border-gray-200 bg-white p-3 shadow-xl sm:bottom-4 sm:left-auto sm:right-4 sm:w-80">
      <p className="text-sm font-medium text-gray-900">A new version is ready</p>
      <p className="mt-1 text-xs text-gray-400">Update now to use the latest build.</p>
      <div className="mt-3 flex justify-end gap-2">
        <button
          type="button"
          onClick={() => setActivate(null)}
          className="rounded-lg px-3 py-1.5 text-xs font-medium text-gray-500 hover:text-gray-800"
        >
          Later
        </button>
        <button
          type="button"
          onClick={activate}
          className="rounded-lg bg-gray-900 px-3 py-1.5 text-xs font-medium text-white"
        >
          Update
        </button>
      </div>
    </div>
  );
}

