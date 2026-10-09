import { useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';
import { useReviewStore } from '../store/reviewStore';
import { blocksReviewShortcut } from '../utils/keyboard';
import FlashCard from '../components/FlashCard';
import ReviewControls from '../components/ReviewControls';

function ReviewLoadingState() {
  return (
    <div className="viewport-page flex flex-col items-center px-4 py-4 sm:py-8" aria-busy="true" aria-live="polite">
      <div className="mb-4 flex w-full max-w-md items-center justify-between gap-3">
        <div className="skeleton h-4 w-16" />
        <div className="skeleton h-4 w-28" />
        <div className="skeleton h-4 w-12" />
      </div>
      <div className="skeleton mb-8 h-1.5 w-full max-w-md rounded-full" />
      <div className="card card-float mt-8 aspect-[3/4] w-full max-w-[20rem] rounded-[1.35rem]" />
      <p className="eyebrow mt-7 text-ink-mute">Preparing your cards</p>
    </div>
  );
}

/** Shared shell for the three "nothing to grade right now" screens. */
function ReviewAside({
  icon, title, body, children,
}: {
  icon: React.ReactNode;
  title: string;
  body: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="viewport-page flex flex-col items-center justify-center px-4 py-10">
      <motion.div
        initial={{ opacity: 0, y: 14 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.42, ease: [0.16, 1, 0.3, 1] }}
        className="w-full max-w-md text-center"
      >
        <motion.span
          initial={{ scale: 0.7, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ type: 'spring', stiffness: 320, damping: 22, delay: 0.06 }}
          className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full border border-line bg-surface text-brand-deep shadow-card"
        >
          {icon}
        </motion.span>
        <h1 className="font-display text-display-sm font-semibold text-ink">{title}</h1>
        <p className="mx-auto mt-3 max-w-[36ch] text-meta text-ink-mute">{body}</p>
        {children}
      </motion.div>
    </div>
  );
}

function StatTile({ value, label, accent }: { value: number | string; label: string; accent?: boolean }) {
  return (
    <div className="card card-quiet px-4 py-3.5 text-center">
      <p className={`stat-value ${accent ? 'text-brand-deep' : 'text-ink'}`}>{value}</p>
      <p className="stat-label mt-1.5">{label}</p>
    </div>
  );
}

export default function ReviewPage() {
  const {
    phase, loading, flipped, stats, error, queuePos, queue, groupIndex, groups, offline, pendingReviews,
    startSession, syncPendingReviews, flipCard, gradeCard, nextGroup, startRandom, currentCard, groupProgress,
  } = useReviewStore();

  useEffect(() => { startSession(); }, [startSession]);

  useEffect(() => {
    const handleOnline = () => { void syncPendingReviews(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncPendingReviews]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (blocksReviewShortcut(e)) return;
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      if (phase === 'reviewing' || phase === 'random') flipCard();
      return;
    }
    // Number keys grade the card while the back face is shown (1-4 → Again/Hard/Good/Easy).
    if (flipped && ['1', '2', '3', '4'].includes(e.key)) {
      e.preventDefault();
      if (phase === 'reviewing' || phase === 'random') gradeCard([1, 3, 4, 5][Number(e.key) - 1]);
    }
  }, [flipCard, flipped, gradeCard, phase]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (loading) return <ReviewLoadingState />;

  const card = currentCard();
  const gp = groupProgress();

  const syncNote = pendingReviews > 0 && (
    <p role="status" className="mb-4 text-meta text-warn">
      {pendingReviews} {pendingReviews === 1 ? 'review' : 'reviews'} waiting to sync.{' '}
      <button type="button" className="link !text-warn" onClick={() => void syncPendingReviews()}>Retry sync</button>
    </p>
  );

  if (error && groups.length === 0) {
    return (
      <ReviewAside
        icon={(
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
            <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" />
          </svg>
        )}
        title="Review is unavailable"
        body={error}
      >
        <button type="button" className="btn btn-primary mt-6" onClick={() => void startSession()}>Try again</button>
      </ReviewAside>
    );
  }

  // ── No cards ──
  if (phase !== 'random' && groups.length === 0) {
    const caughtUp = stats.total_words > 0;
    return (
      <ReviewAside
        icon={(
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 13 4 4L19 7" />
          </svg>
        )}
        title={caughtUp ? 'All caught up' : 'No cards yet'}
        body={caughtUp
          ? 'Nothing is due right now. Your saved cards stay in Words until the next interval comes round.'
          : 'Capture a word and add a definition — it becomes a review card straight away.'}
      >
        {syncNote}
        <Link to={caughtUp ? '/words' : '/capture'} className="btn btn-primary mt-6">
          {caughtUp ? 'Browse words' : 'Capture a word'}
        </Link>
      </ReviewAside>
    );
  }

  // ── Group complete ──
  if (phase === 'group-complete') {
    const isLastGroup = groupIndex >= groups.length - 1;
    return (
      <ReviewAside
        icon={(
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m5 13 4 4L19 7" />
          </svg>
        )}
        title={`Group ${gp.current} done`}
        body={`${gp.current} of ${gp.total} groups finished. Take a breath, then keep going.`}
      >
        {syncNote}
        <div className="mt-7 flex flex-wrap justify-center gap-2.5">
          {!isLastGroup && (
            <button type="button" className="btn btn-primary" onClick={nextGroup}>Next group</button>
          )}
          <button type="button" className="btn btn-secondary" onClick={startRandom}>Random review</button>
        </div>
      </ReviewAside>
    );
  }

  // ── All groups complete ──
  if (phase === 'complete') {
    return (
      <div className="viewport-page flex flex-col items-center justify-center px-4 py-10">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
          className="w-full max-w-md text-center"
        >
          <motion.span
            initial={{ scale: 0.7, rotate: -10, opacity: 0 }}
            animate={{ scale: 1, rotate: 0, opacity: 1 }}
            transition={{ type: 'spring', stiffness: 300, damping: 20, delay: 0.06 }}
            className="mx-auto mb-6 grid h-16 w-16 place-items-center rounded-full border border-good/25 bg-good-wash text-good"
          >
            <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="m5 13 4 4L19 7" />
            </svg>
          </motion.span>
          <h1 className="font-display text-display-sm font-semibold text-ink">Today is done</h1>
          <p className="mx-auto mt-3 max-w-[34ch] text-meta text-ink-mute">
            Every group is finished. The next batch comes back when the intervals say so.
          </p>

          {syncNote}

          <div className="mt-8 grid grid-cols-3 gap-2.5">
            <StatTile value={stats.reviewed_today} label="reviewed today" accent />
            <StatTile value={stats.due_count} label="left today" />
            <StatTile value={stats.estimated_due_tomorrow} label="due tomorrow" />
          </div>

          <div className="mt-7 flex flex-wrap justify-center gap-2.5">
            <button type="button" className="btn btn-primary" onClick={startRandom}>Random review</button>
            <Link to="/words" className="btn btn-secondary">Browse words</Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Reviewing / Random ──
  if (!card) return null;

  const headerLabel = phase === 'random' ? 'Random review' : `Group ${gp.current} of ${gp.total}`;
  const remainingInGroup = queue.length - queuePos;
  const progress = phase === 'random'
    ? (stats.total_words > 0 ? queuePos / stats.total_words * 100 : 0)
    : (groups[groupIndex] ? queuePos / queue.length * 100 : 0);

  return (
    <div className="review-layout mx-auto flex max-w-xl flex-col items-center px-4 pb-3 pt-4">
      <h1 className="sr-only">Review session</h1>
      {error && (
        <p role="status" className="mb-2 text-micro text-warn">
          {error} <button type="button" className="link !text-warn" onClick={() => void syncPendingReviews()}>Retry sync</button>
        </p>
      )}

      <div className="flex w-full max-w-review items-center gap-3">
        <Link to="/words" className="btn btn-ghost btn-sm -ml-2.5 shrink-0 text-ink-mute">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="m15 18-6-6 6-6" />
          </svg>
          Words
        </Link>
        <p className="min-w-0 flex-1 truncate text-center text-micro font-semibold text-ink-soft">{headerLabel}</p>
        <span className="num shrink-0 text-micro text-ink-mute">{remainingInGroup} left</span>
      </div>

      <div className="mt-3 w-full max-w-review">
        <div className="track" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label="Review progress">
          <motion.div
            className="track-fill"
            initial={false}
            animate={{ width: `${progress}%` }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
          />
        </div>
      </div>

      <div className="mx-auto mt-2.5 flex min-h-8 max-w-review flex-wrap items-center justify-center gap-2">
        {(offline || pendingReviews > 0) && (
          <span className="pill pill-warn">
            {pendingReviews > 0
              ? `${pendingReviews} waiting to sync`
              : 'Offline — reviews are queued'}
          </span>
        )}
        <Link to={`/words/${card.word_id}`} className="inline-flex min-h-11 items-center px-1 text-micro text-ink-mute transition hover:text-brand-deep">
          Open full card →
        </Link>
      </div>

      <div className="review-card-slot min-h-0 w-full flex-1 py-3">
        <FlashCard
          key={`${card.word_id}-${queuePos}`}
          cardKey={`${card.word_id}-${queuePos}`}
          text={card.text}
          phonetic={card.phonetic}
          definitions={card.definitions}
          kaoyan={card.kaoyan ?? null}
          flipped={flipped}
          onFlip={flipCard}
          onSwipe={gradeCard}
          nextText={queue[queuePos + 1]?.text}
        />
      </div>

      <div className="w-full shrink-0 pb-1">
        <AnimatePresence mode="wait" initial={false}>
          {flipped ? (
            <motion.div
              key="graded"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}
            >
              <p className="text-center text-micro text-ink-mute">
                Swipe the card, pick a grade<span className="hover-only">, or press 1–4</span>.
                {card.kaoyan ? ' Hold the card for the dictionary.' : ''}
              </p>
              <ReviewControls onGrade={gradeCard} />
            </motion.div>
          ) : (
            <motion.div
              key="tap-hint"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <button type="button" onClick={flipCard} className="btn btn-primary btn-lg btn-block mx-auto max-w-review">
                Show answer
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
