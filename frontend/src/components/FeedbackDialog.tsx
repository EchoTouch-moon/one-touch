import { Dialog, DialogPanel, DialogTitle } from '@headlessui/react';
import { useState } from 'react';
import toast from 'react-hot-toast';
import { sendFeedback } from '../api/ops';

interface FeedbackDialogProps {
  open: boolean;
  onClose: () => void;
}

const buildInfo = {
  build_version: import.meta.env.VITE_APP_VERSION || 'dev',
  build_date: import.meta.env.VITE_BUILD_DATE || '',
};

export default function FeedbackDialog({ open, onClose }: FeedbackDialogProps) {
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);

  if (!open) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = message.trim();
    if (!trimmed) return;
    setSending(true);
    try {
      await sendFeedback({
        message: trimmed,
        page_url: window.location.href,
        user_agent: navigator.userAgent,
        ...buildInfo,
      });
      toast.success('Feedback sent');
      setMessage('');
      onClose();
    } catch {
      toast.error('Failed to send feedback');
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-ink/35 backdrop-blur-[2px]" aria-hidden="true" />
      <div className="fixed inset-0 flex items-center justify-center overflow-y-auto p-4">
        <DialogPanel className="card card-float w-full max-w-lg p-5">
          <form onSubmit={handleSubmit}>
            <div className="flex items-start justify-between gap-3">
              <div>
                <DialogTitle className="font-display text-title font-semibold text-ink">Send feedback</DialogTitle>
                <p className="mt-1 text-micro text-ink-mute">
                  Tell us what broke, or what felt off. The page you are on is attached automatically.
                </p>
              </div>
              <button type="button" onClick={onClose} className="btn btn-ghost btn-sm shrink-0 text-ink-mute">
                Close
              </button>
            </div>

            <div className="mt-4">
              <label className="label" htmlFor="feedback-message">Message</label>
              <textarea
                id="feedback-message"
                aria-label="Feedback message"
                autoFocus
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                rows={6}
                placeholder="What happened, and what did you expect instead?"
                className="field"
              />
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button type="button" onClick={onClose} className="btn btn-ghost">
                Cancel
              </button>
              <button type="submit" disabled={sending || !message.trim()} className="btn btn-primary">
                {sending ? 'Sending…' : 'Send'}
              </button>
            </div>
          </form>
        </DialogPanel>
      </div>
    </Dialog>
  );
}
