import { useEffect, useState } from 'react';
import { AnimatePresence, motion, useMotionValue, useTransform } from 'framer-motion';
import type { PanInfo } from 'framer-motion';

interface CardFaceProps {
  text: string;
  phonetic: string | null;
  definitions: { pos: string; meaning_zh: string; canvas_image?: string | null }[];
  flipped: boolean;
  onFlip: () => void;
  dragging: boolean;
}

function CardFace({ text, phonetic, definitions, flipped, onFlip, dragging }: CardFaceProps) {
  const primaryDefinitions = definitions.slice(0, 4);
  const extraCount = Math.max(definitions.length - primaryDefinitions.length, 0);
  const primaryCanvas = definitions.find((def) => def.canvas_image)?.canvas_image ?? null;

  return (
    <div
      onClick={() => {
        if (!dragging) onFlip();
      }}
      className="relative w-full h-full cursor-pointer select-none"
    >
      <motion.div
        className="relative h-full w-full"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className="absolute inset-0 flex flex-col items-center justify-center rounded-[1.35rem]
                     border border-gray-100 bg-white p-7 shadow-[0_22px_70px_rgba(15,23,42,0.12)]"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <p className="mb-4 rounded-full border border-gray-100 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-gray-300">
            Review
          </p>
          <h2
            className="max-w-full text-center text-4xl font-semibold leading-tight text-gray-950 sm:text-5xl"
            style={{ overflowWrap: 'anywhere' }}
          >
            {text}
          </h2>
          {phonetic && <p className="mt-3 max-w-full truncate text-sm text-gray-400">{phonetic}</p>}
        </div>

        <div
          className="absolute inset-0 flex flex-col rounded-[1.35rem] border border-indigo-100
                     bg-[linear-gradient(180deg,#ffffff_0%,#f8f9ff_100%)] p-5 shadow-[0_22px_70px_rgba(79,70,229,0.14)] sm:p-6"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="border-b border-indigo-50 pb-4">
            <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-indigo-300">
              Meaning
            </p>
            <p
              className="mt-1 max-w-full text-2xl font-semibold leading-tight text-gray-950 sm:text-3xl"
              style={{ overflowWrap: 'anywhere' }}
            >
              {text}
            </p>
            <div className="mt-2 min-h-[1.75rem] max-w-full overflow-hidden">
              {phonetic && (
                <p className="inline-block max-w-full truncate rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-500">
                  {phonetic}
                </p>
              )}
            </div>
          </div>

          {primaryCanvas && (
            <div className="mt-4 min-h-0 flex-1 overflow-hidden rounded-xl border border-gray-100 bg-white">
              <img
                src={primaryCanvas}
                alt={`${text} handwritten definition`}
                className="h-full w-full object-contain"
              />
            </div>
          )}

          {!primaryCanvas && definitions.length > 0 && (
            <div className="mt-4 min-h-0 flex-1 overflow-hidden pr-1">
              <div className="space-y-3">
                {primaryDefinitions.map((def, i) => (
                  <div key={i} className="grid grid-cols-[3.5rem_1fr] items-start gap-3 border-b border-gray-100 pb-3 last:border-0">
                    <span className="mt-0.5 w-fit rounded-md bg-white px-2 py-1 text-[11px] font-semibold uppercase text-indigo-500 shadow-sm ring-1 ring-indigo-50">
                      {def.pos || 'def'}
                    </span>
                    <p className="text-base leading-relaxed text-gray-800">{def.meaning_zh}</p>
                  </div>
                ))}
              </div>
              {extraCount > 0 && (
                <p className="mt-2 text-xs font-medium text-gray-400">+ {extraCount} more in details</p>
              )}
            </div>
          )}

          {definitions.length === 0 && (
            <p className="mt-6 text-center text-sm text-gray-400">No definitions</p>
          )}
        </div>
      </motion.div>
    </div>
  );
}

function CardPreview({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-[1.35rem] border border-gray-200 bg-white/90 shadow-lg backdrop-blur-sm">
      <span className="truncate px-5 text-lg font-semibold text-gray-300">{text}</span>
    </div>
  );
}

interface FlashCardProps {
  text: string;
  phonetic: string | null;
  definitions: { pos: string; meaning_zh: string }[];
  flipped: boolean;
  onFlip: () => void;
  onSwipe?: (quality: number) => void;
  prevText?: string;
  nextText?: string;
  cardKey?: string | number;
}

const SWIPE_THRESHOLD = 56;
const SWIPE_VELOCITY_THRESHOLD = 420;
type SwipeDir = 'left' | 'right' | 'up' | 'down';

const swipeConfig: Record<SwipeDir, { quality: number; label: string; color: string }> = {
  left: { quality: 4, label: 'Remember', color: 'text-green-600' },
  right: { quality: 1, label: 'Again', color: 'text-red-500' },
  up: { quality: 5, label: 'Easy', color: 'text-blue-500' },
  down: { quality: 3, label: 'Hard', color: 'text-yellow-600' },
};

const exitTargets: Record<SwipeDir, { x: number; y: number; rotateZ: number }> = {
  left: { x: -400, y: 0, rotateZ: -12 },
  right: { x: 400, y: 0, rotateZ: 12 },
  up: { x: 0, y: -400, rotateZ: 0 },
  down: { x: 0, y: 400, rotateZ: 0 },
};

export default function FlashCard({
  text, phonetic, definitions, flipped, onFlip, onSwipe,
  nextText, cardKey,
}: FlashCardProps) {
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [dragging, setDragging] = useState(false);
  const [swipedDir, setSwipedDir] = useState<SwipeDir | null>(null);

  const horizontalOverlay = useTransform(
    x,
    [-160, -SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD, 160],
    [
      'rgba(34,197,94,0.25)',
      'rgba(34,197,94,0.12)',
      'rgba(0,0,0,0)',
      'rgba(239,68,68,0.12)',
      'rgba(239,68,68,0.25)',
    ],
  );

  const verticalOverlay = useTransform(
    y,
    [-160, -SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD, 160],
    [
      'rgba(59,130,246,0.24)',
      'rgba(59,130,246,0.12)',
      'rgba(0,0,0,0)',
      'rgba(234,179,8,0.12)',
      'rgba(234,179,8,0.24)',
    ],
  );

  const leftOpacity = useTransform(x, [-SWIPE_THRESHOLD, -30, 0], [1, 0.35, 0]);
  const rightOpacity = useTransform(x, [0, 30, SWIPE_THRESHOLD], [0, 0.35, 1]);
  const upOpacity = useTransform(y, [-SWIPE_THRESHOLD, -30, 0], [1, 0.35, 0]);
  const downOpacity = useTransform(y, [0, 30, SWIPE_THRESHOLD], [0, 0.35, 1]);
  const rotate = useTransform(x, [-140, 0, 140], [-6, 0, 6]);
  const scale = useTransform(y, [-160, 0, 160], [0.97, 1, 0.97]);

  const handleDragEnd = (_: MouseEvent | TouchEvent | PointerEvent, info: PanInfo) => {
    setDragging(false);
    if (!flipped || !onSwipe) return;

    const { x: offsetX, y: offsetY } = info.offset;
    const { x: velocityX, y: velocityY } = info.velocity;
    const absX = Math.abs(offsetX);
    const absY = Math.abs(offsetY);
    const absVelocityX = Math.abs(velocityX);
    const absVelocityY = Math.abs(velocityY);
    const horizontalIntent = absX > SWIPE_THRESHOLD || absVelocityX > SWIPE_VELOCITY_THRESHOLD;
    const verticalIntent = absY > SWIPE_THRESHOLD || absVelocityY > SWIPE_VELOCITY_THRESHOLD;
    if (!horizontalIntent && !verticalIntent) return;

    const dir: SwipeDir = (horizontalIntent && absX + absVelocityX * 0.08 >= absY + absVelocityY * 0.08)
      ? (offsetX < 0 ? 'left' : 'right')
      : (offsetY < 0 ? 'up' : 'down');

    setSwipedDir(dir);
  };

  useEffect(() => {
    if (!swipedDir) return;
    const timer = window.setTimeout(() => {
      onSwipe?.(swipeConfig[swipedDir].quality);
    }, 280);
    return () => clearTimeout(timer);
  }, [swipedDir, onSwipe]);

  return (
    <div
      className="review-swipe-zone relative mx-auto flex w-full max-w-[20rem] items-center justify-center overflow-visible"
      style={{ perspective: 1200 }}
    >
      {nextText && (
        <motion.div
          initial={{ y: 34, scale: 0.9, opacity: 0 }}
          animate={{
            y: swipedDir ? 10 : 34,
            scale: swipedDir ? 0.96 : 0.9,
            opacity: flipped ? 0.58 : 0.34,
          }}
          transition={{ duration: 0.3 }}
          className="absolute top-5 z-0 aspect-[3/4] w-[94%]"
          style={{ filter: 'blur(0.4px)', pointerEvents: 'none' }}
        >
          <CardPreview text={nextText} />
        </motion.div>
      )}

      <motion.div
        animate={{ y: flipped ? 44 : 34, scale: flipped ? 0.84 : 0.8, opacity: flipped ? 0.28 : 0.16 }}
        transition={{ duration: 0.25 }}
        className="absolute top-5 z-[-1] aspect-[3/4] w-[88%] rounded-[1.35rem] border border-gray-200 bg-white shadow-md"
      />

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={cardKey ?? text}
          className="relative z-10 aspect-[3/4] w-full"
          initial={{ y: 22, scale: 0.96, opacity: 0 }}
          animate={swipedDir
            ? { ...exitTargets[swipedDir], opacity: 0 }
            : { x: 0, y: 0, opacity: 1, rotateZ: 0, scale: 1 }
          }
          exit={{ y: -18, scale: 0.98, opacity: 0 }}
          transition={swipedDir
            ? { duration: 0.26, ease: [0.4, 0, 0.2, 1] }
            : { duration: 0.25, ease: 'easeOut' }
          }
        >
          <motion.div
            drag={flipped && !swipedDir}
            dragElastic={0.18}
            dragMomentum={false}
            onDragStart={() => setDragging(true)}
            onDragEnd={handleDragEnd}
            style={{ x, y, rotate, scale, touchAction: 'none' }}
            className="h-full w-full"
          >
            <CardFace
              text={text}
              phonetic={phonetic}
              definitions={definitions}
              flipped={flipped}
              onFlip={onFlip}
              dragging={dragging}
            />

            {flipped && !swipedDir && (
              <>
                <motion.div
                  style={{ backgroundColor: horizontalOverlay }}
                  className="pointer-events-none absolute inset-0 z-10 rounded-[1.35rem]"
                />
                <motion.div
                  style={{ backgroundColor: verticalOverlay }}
                  className="pointer-events-none absolute inset-0 z-10 rounded-[1.35rem]"
                />
                <motion.div
                  style={{ opacity: leftOpacity }}
                  className={`pointer-events-none absolute left-4 top-4 z-20 text-xs font-bold ${swipeConfig.left.color}`}
                >
                  {swipeConfig.left.label}
                </motion.div>
                <motion.div
                  style={{ opacity: rightOpacity }}
                  className={`pointer-events-none absolute right-4 top-4 z-20 text-xs font-bold ${swipeConfig.right.color}`}
                >
                  {swipeConfig.right.label}
                </motion.div>
                <motion.div
                  style={{ opacity: upOpacity }}
                  className={`pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 text-xs font-bold ${swipeConfig.up.color}`}
                >
                  {swipeConfig.up.label}
                </motion.div>
                <motion.div
                  style={{ opacity: downOpacity }}
                  className={`pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 text-xs font-bold ${swipeConfig.down.color}`}
                >
                  {swipeConfig.down.label}
                </motion.div>
              </>
            )}
          </motion.div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
