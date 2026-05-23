import { useEffect, useState } from 'react';
import CanvasPad from './CanvasPad';

interface CanvasFullscreenProps {
  open: boolean;
  title?: string;
  initialImage: string | null;
  initialInk: string | null;
  draftKey?: string | null;
  resetKey?: string | number;
  saving?: boolean;
  onSave: (image: string | null, ink: string | null) => void;
  onCancel: () => void;
}

export default function CanvasFullscreen({
  open,
  title,
  initialImage,
  initialInk,
  draftKey,
  resetKey,
  saving = false,
  onSave,
  onCancel,
}: CanvasFullscreenProps) {
  const [image, setImage] = useState<string | null>(initialImage);
  const [ink, setInk] = useState<string | null>(initialInk);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      setImage(initialImage);
      setInk(initialInk);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [open, initialImage, initialInk]);

  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onCancel]);

  if (!open) return null;

  const canSave = Boolean(image || ink);

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-gray-100">
      <div className="flex items-center justify-between gap-3 border-b border-gray-200 bg-white px-4 py-2">
        <button
          type="button"
          onClick={onCancel}
          className="rounded-md px-3 py-1.5 text-sm font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
        >
          Cancel
        </button>
        <span className="truncate text-sm font-medium text-gray-500">{title ?? 'Handwriting'}</span>
        <button
          type="button"
          onClick={() => onSave(image, ink)}
          disabled={!canSave || saving}
          className="rounded-md bg-indigo-500 px-4 py-1.5 text-sm font-medium text-white transition hover:bg-indigo-600 disabled:opacity-40"
        >
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
      <div className="flex min-h-0 flex-1 p-3">
        <CanvasPad
          value={image}
          onChange={setImage}
          inkValue={ink}
          onInkChange={setInk}
          fullHeight
          resetKey={resetKey}
          draftKey={draftKey ?? null}
          rebuildPreviewOnLoad
        />
      </div>
    </div>
  );
}
