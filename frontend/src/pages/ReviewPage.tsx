import { useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useReviewStore } from '../store/reviewStore';
import FlashCard from '../components/FlashCard';
import ReviewControls from '../components/ReviewControls';

function ReviewLoadingState() {
  return (
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col items-center px-3 py-3 sm:min-h-[calc(100dvh-3.5rem)] sm:px-4 sm:py-8">
      <div className="mb-3 flex w-full max-w-md items-center justify-between gap-3 sm:mb-4">
        <div className="h-4 w-14 rounded bg-gray-100" />
        <div className="h-4 w-28 rounded bg-gray-100" />
        <div className="h-4 w-12 rounded bg-gray-100" />
      </div>
      <div className="mb-8 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-gray-100">
        <motion.div
          className="h-full w-1/3 rounded-full bg-indigo-100"
          animate={{ x: ['-100%', '300%'] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      </div>
      <div className="mt-10 aspect-[3/4] w-full max-w-[20rem] rounded-[1.35rem] border border-gray-100 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.08)]">
        <div className="flex h-full flex-col items-center justify-center p-7">
          <div className="mb-4 h-6 w-20 rounded-full bg-gray-100" />
          <div className="h-10 w-44 rounded bg-gray-100" />
          <div className="mt-4 h-4 w-24 rounded bg-gray-100" />
        </div>
      </div>
      <p className="mt-6 text-center text-xs text-gray-400">Preparing your review cards...</p>
    </div>
  );
}

export default function ReviewPage() {
  const {
    phase, loading, flipped, stats, queuePos, queue, groupIndex, groups, offline, pendingReviews,
    startSession, syncPendingReviews, flipCard, gradeCard, nextGroup, startRandom, currentCard, groupProgress,
  } = useReviewStore();

  useEffect(() => { startSession(); }, [startSession]);

  useEffect(() => {
    const handleOnline = () => { void syncPendingReviews(); };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [syncPendingReviews]);

  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    if (e.key === ' ' || e.key === 'Spacebar') {
      e.preventDefault();
      if (phase === 'reviewing' || phase === 'random') flipCard();
    }
  }, [flipCard, phase]);

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return <ReviewLoadingState />;
  }

  const card = currentCard();
  const gp = groupProgress();

  // ── No cards ──
  if (phase !== 'random' && groups.length === 0) {
    return (
      <div className="mx-auto max-w-5xl px-4 py-8 lg:px-6">
        <h1 className="text-2xl font-semibold text-gray-800">Review</h1>
        <div className="mx-auto mt-14 max-w-md rounded-xl border border-dashed border-gray-200 bg-white/70 px-6 py-8 text-center">
          <p className="text-sm font-medium text-gray-600">No review cards yet</p>
          <p className="mt-2 text-sm text-gray-400">Capture words and add definitions first. Review will start once cards are ready.</p>
          <Link
            to="/capture"
            className="mt-5 inline-flex rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600"
          >
            Go to Capture
          </Link>
        </div>
      </div>
    );
  }

  // ── Group complete ──
  if (phase === 'group-complete') {
    const isLastGroup = groupIndex >= groups.length - 1;
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: 'spring', stiffness: 200 }}
          className="text-center"
        >
          <div className="text-5xl mb-4">&#10003;</div>
          <h2 className="text-2xl font-bold text-gray-800 mb-2">Group {gp.current} Complete</h2>
          <p className="text-gray-500 mb-8">
            {gp.current} of {gp.total} groups done
          </p>

          <div className="flex gap-3 justify-center">
            {!isLastGroup && (
              <button
                onClick={nextGroup}
                className="px-5 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition font-medium"
              >
                Next Group
              </button>
            )}
            <button
              onClick={startRandom}
              className="px-5 py-2.5 bg-white text-indigo-600 border border-indigo-200 rounded-lg
                         hover:bg-indigo-50 transition font-medium"
            >
              Random Review
            </button>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── All groups complete ──
  if (phase === 'complete') {
    return (
      <div className="flex flex-col items-center justify-center min-h-[80vh] px-4">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center"
        >
          <h2 className="text-3xl font-bold text-gray-800 mb-2">All Groups Done!</h2>
          <div className="flex gap-8 justify-center my-6 text-center">
            <div>
              <p className="text-2xl font-bold text-indigo-600">{stats.reviewed_today}</p>
              <p className="text-sm text-gray-400">reviewed today</p>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-600">{stats.total_words}</p>
              <p className="text-sm text-gray-400">total words</p>
            </div>
          </div>
          <div className="flex gap-3 justify-center">
            <button
              onClick={startRandom}
              className="px-5 py-2.5 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition font-medium"
            >
              Random Review
            </button>
            <Link
              to="/words"
              className="px-5 py-2.5 bg-white text-gray-600 border border-gray-200 rounded-lg
                         hover:bg-gray-50 transition font-medium"
            >
              Back to Words
            </Link>
          </div>
        </motion.div>
      </div>
    );
  }

  // ── Reviewing / Random ──
  if (!card) return null;

  const headerLabel = phase === 'random' ? 'Random Review' : `Group ${gp.current} of ${gp.total}`;
  const remainingInGroup = queue.length - queuePos;

  return (
    <div className="flex min-h-[calc(100dvh-3rem)] flex-col items-center overflow-hidden px-3 py-3 sm:min-h-[calc(100dvh-3.5rem)] sm:px-4 sm:py-8">
      {/* Header */}
      <div className="w-full max-w-md flex items-center justify-between gap-3 mb-3 sm:mb-4">
        <Link to="/words" className="text-sm text-indigo-500 hover:underline">
          &larr; Words
        </Link>
        <h1 className="min-w-0 flex-1 text-center text-sm font-semibold text-gray-600 truncate">{headerLabel}</h1>
        <span className="text-sm text-gray-400 whitespace-nowrap">{remainingInGroup} left</span>
      </div>

      {/* Progress bar */}
      <div className="w-full max-w-md mb-2">
        <div className="w-full h-1.5 bg-gray-100 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-indigo-500 rounded-full"
            animate={{ width: phase === 'random'
              ? `${stats.total_words > 0 ? (queuePos / stats.total_words * 100) : 0}%`
              : `${groups[groupIndex] ? (queuePos / queue.length * 100) : 0}%`
            }}
            transition={{ duration: 0.3 }}
          />
        </div>
      </div>

      {/* Detail link */}
      <Link
        to={`/words/${card.word_id}`}
        className="text-xs text-indigo-400 hover:text-indigo-600 mb-3 transition sm:mb-4"
      >
        View details &rarr;
      </Link>

      {(offline || pendingReviews > 0) && (
        <div className="mb-2 rounded-full border border-amber-200 bg-amber-50 px-3 py-1 text-xs font-medium text-amber-700">
          {pendingReviews > 0 ? `${pendingReviews} review${pendingReviews > 1 ? 's' : ''} waiting to sync` : 'Offline review mode'}
        </div>
      )}

      <div className="flex w-full max-w-[22rem] flex-1 touch-none items-start justify-center overflow-visible px-2 pb-1 pt-10 sm:px-0 sm:pt-12">
        <FlashCard
          key={`${card.word_id}-${queuePos}`}
          cardKey={`${card.word_id}-${queuePos}`}
          text={card.text}
          phonetic={card.phonetic}
          definitions={card.definitions}
          flipped={flipped}
          onFlip={flipCard}
          onSwipe={gradeCard}
          nextText={queue[queuePos + 1]?.text}
        />
      </div>

      <motion.div
        animate={{ opacity: flipped ? 1 : 0, y: flipped ? 0 : 8 }}
        transition={{ duration: 0.16, ease: 'easeOut' }}
        className={`min-h-[6.75rem] w-full ${flipped ? 'pointer-events-auto' : 'pointer-events-none'}`}
        aria-hidden={!flipped}
      >
        <p className="mt-3 text-center text-xs text-gray-400">Swipe the card or use the buttons below.</p>
        <ReviewControls onGrade={gradeCard} />
      </motion.div>
    </div>
  );
}
