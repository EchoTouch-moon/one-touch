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
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-gray-950/30 p-4 sm:items-center">
      <form onSubmit={handleSubmit} className="w-full max-w-lg rounded-2xl border border-gray-200 bg-white p-4 shadow-xl">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Feedback</h2>
            <p className="text-xs text-gray-400">Tell us what broke or what feels off.</p>
          </div>
          <button type="button" onClick={onClose} className="text-sm text-gray-500 hover:text-gray-800">
            Close
          </button>
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={6}
          placeholder="Describe the issue, expected behavior, or a quick idea..."
          className="mt-4 w-full resize-none rounded-xl border border-gray-200 px-3 py-2 text-sm focus:border-indigo-400 focus:outline-none"
        />
        <div className="mt-4 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-gray-200 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={sending || !message.trim()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            {sending ? 'Sending...' : 'Send'}
          </button>
        </div>
      </form>
    </div>
  );
}
