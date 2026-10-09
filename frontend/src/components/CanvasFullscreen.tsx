import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
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
  onDraftChange?: (image: string | null, ink: string | null) => void;
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
  onDraftChange,
}: CanvasFullscreenProps) {
  const [image, setImage] = useState<string | null>(initialImage);
  const [ink, setInk] = useState<string | null>(initialInk);

  useEffect(() => { if (open) onDraftChange?.(image, ink); }, [image, ink, open, onDraftChange]);

  if (!open) return null;

  const canSave = Boolean(image || ink);

  return (
    <Dialog open={open} onClose={onCancel} className="relative z-50">
      <DialogPanel className="app-canvas fixed inset-0 flex flex-col pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-between gap-3 border-b border-line bg-surface/90 px-3 py-2 backdrop-blur-xl sm:px-4">
          <button type="button" onClick={onCancel} className="btn btn-ghost btn-sm">
            Cancel
          </button>
          <DialogTitle className="min-w-0 truncate text-meta font-semibold text-ink">
            {title ?? 'Handwriting'}
          </DialogTitle>
          <button
            type="button"
            onClick={() => onSave(image, ink)}
            disabled={!canSave || saving}
            className="btn btn-primary btn-sm"
          >
            {saving ? 'Saving…' : 'Save'}
          </button>
        </div>
        <div className="flex min-h-0 flex-1 p-2.5 sm:p-3">
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
      </DialogPanel>
    </Dialog>
  );
}
