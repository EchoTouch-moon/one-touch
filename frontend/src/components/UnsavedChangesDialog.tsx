import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';

export default function UnsavedChangesDialog({ open, onStay, onKeep, onDiscard }: {
  open: boolean; onStay: () => void; onKeep: () => void; onDiscard: () => void;
}) {
  return (
    <Dialog open={open} onClose={onStay} className="relative z-[70]">
      <div className="fixed inset-0 bg-ink/40 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="card card-float w-full max-w-md p-6">
          <DialogTitle className="font-display text-title font-semibold text-ink">Unsaved changes</DialogTitle>
          <p className="mt-2.5 text-meta leading-relaxed text-ink-mute">
            Keep a draft on this device and finish later, or discard these edits. Definitions you already saved are not affected.
          </p>
          <div className="mt-6 flex flex-wrap gap-2">
            <button autoFocus onClick={onStay} className="btn btn-primary">Keep editing</button>
            <button onClick={onKeep} className="btn btn-secondary">Keep draft &amp; leave</button>
            <button onClick={onDiscard} className="btn btn-danger">Discard edits</button>
          </div>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
