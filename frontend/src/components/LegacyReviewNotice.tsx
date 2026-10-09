import { getLegacyReviews } from '../utils/offlineReviewQueue';

export default function LegacyReviewNotice() {
  const raw = getLegacyReviews();
  if (!raw || raw === '[]') return null;

  const download = () => {
    const url = URL.createObjectURL(new Blob([raw], { type: 'application/json' }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'unassigned-review-backup.json';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  return (
    <div role="status" className="mb-4 rounded-md border border-warn/25 bg-warn-wash px-4 py-3.5">
      <p className="text-meta font-semibold text-warn">Reviews from an older version are still on this device</p>
      <p className="mt-1 text-micro leading-relaxed text-ink-soft">
        They are not linked to an account, so they will not be submitted automatically. Export them to keep a copy.
      </p>
      <button type="button" onClick={download} className="btn btn-secondary btn-sm mt-3">
        Export the preserved records
      </button>
    </div>
  );
}
