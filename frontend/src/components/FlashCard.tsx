import { useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion, useAnimationControls, useMotionValue, useTransform } from 'framer-motion';
import type { PanInfo } from 'framer-motion';

import { ExamSentenceCard, type KaoyanInfo } from './kaoyan/SentenceHighlight';

interface CardFaceProps {
  text: string;
  phonetic: string | null;
  definitions: { pos: string; meaning_zh: string; canvas_image?: string | null; is_primary?: boolean }[];
  flipped: boolean;
  onFlip: () => void;
  dragging: boolean;
  dictMode: boolean;
  setDictMode: (value: boolean) => void;
  kaoyan?: KaoyanInfo | null;
}

const DICT_PRESS_MS = 480;

function CardFace({ text, phonetic, definitions, flipped, onFlip, dragging, kaoyan, dictMode, setDictMode }: CardFaceProps) {
  const primaryDefinition = definitions.find((def) => def.is_primary) ?? null;
  const displayDefinitions = primaryDefinition
    ? [primaryDefinition, ...definitions.filter((def) => def !== primaryDefinition)]
    : definitions;
  const primaryDefinitions = displayDefinitions.slice(0, 4);
  const extraCount = Math.max(definitions.length - primaryDefinitions.length, 0);
  const primaryCanvas = primaryDefinition?.canvas_image ?? definitions.find((def) => def.canvas_image)?.canvas_image ?? null;

  const suppressClick = useRef(false);
  const shakeControls = useAnimationControls();
  const pressTimer = useRef<number | null>(null);
  const pressStart = useRef<{ x: number; y: number } | null>(null);
  useEffect(() => () => { if (pressTimer.current !== null) window.clearTimeout(pressTimer.current); }, []);

  // Derived from flip state instead of an effect: leaving the back face hides
  // the dictionary panel; returning to it restores the last mode.
  const showDict = dictMode && flipped;

  const clearPress = () => {
    if (pressTimer.current !== null) {
      window.clearTimeout(pressTimer.current);
      pressTimer.current = null;
    }
    pressStart.current = null;
  };

  const enterDictMode = () => {
    setDictMode(true);
    void shakeControls.start({ x: [0, -9, 9, -6, 6, -3, 3, 0] }, { duration: 0.42 });
  };

  const handlePointerDown = (event: React.PointerEvent) => {
    if (!flipped || !kaoyan || showDict || (event.pointerType === 'mouse' && event.button !== 0)) return;
    pressStart.current = { x: event.clientX, y: event.clientY };
    if (pressTimer.current !== null) window.clearTimeout(pressTimer.current);
    pressTimer.current = window.setTimeout(() => {
      pressTimer.current = null;
      pressStart.current = null;
      suppressClick.current = true;
      enterDictMode();
    }, DICT_PRESS_MS);
  };

  const handlePointerMove = (event: React.PointerEvent) => {
    if (pressTimer.current === null || pressStart.current === null) return;
    const dx = event.clientX - pressStart.current.x;
    const dy = event.clientY - pressStart.current.y;
    if (dx * dx + dy * dy > 144) clearPress();
  };

  const handleClick = () => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (dragging || dictMode) return;
    onFlip();
  };

  return (
    <motion.div
      animate={shakeControls}
      onClick={handleClick}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={clearPress}
      onPointerCancel={clearPress}
      className="relative h-full w-full cursor-pointer select-none"
    >
      <motion.div
        className="relative h-full w-full"
        animate={{ rotateY: flipped ? 180 : 0 }}
        transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
        style={{ transformStyle: 'preserve-3d' }}
      >
        <div
          className="card-float absolute inset-0 flex flex-col items-center rounded-[1.35rem] border border-line
                     bg-surface px-7 py-7"
          style={{ backfaceVisibility: 'hidden' }}
        >
          <p className="eyebrow shrink-0">Word</p>

          <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-4 py-4">
            <h2
              className="word max-w-full text-center text-display text-ink sm:text-word"
              style={{ overflowWrap: 'anywhere' }}
            >
              {text}
            </h2>
            {phonetic && <p className="ipa max-w-full truncate text-center">{phonetic}</p>}
          </div>

          <p className="flex shrink-0 items-center gap-1.5 text-micro text-ink-mute">
            <kbd className="kbd hidden sm:inline-flex">Space</kbd>
            <span className="hidden sm:inline">or</span>
            tap to reveal
          </p>
        </div>

        <div
          className="card-float absolute inset-0 flex flex-col rounded-[1.35rem] border border-line
                     bg-surface p-5 sm:p-6"
          style={{ backfaceVisibility: 'hidden', transform: 'rotateY(180deg)' }}
        >
          <div className="flex items-baseline gap-x-3 border-b border-line pb-3.5 pr-12">
            <p
              className="word min-w-0 text-display-sm text-ink sm:text-display-sm"
              style={{ overflowWrap: 'anywhere' }}
            >
              {text}
            </p>
            {phonetic && <p className="ipa min-w-0 truncate">{phonetic}</p>}
          </div>

          {kaoyan && (
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (dictMode) setDictMode(false);
                else enterDictMode();
              }}
              aria-label={dictMode ? 'Close dictionary' : 'Open dictionary'}
              onPointerDown={event => event.stopPropagation()}
              title={dictMode ? 'Back to your card' : 'Dictionary'}
              className={`absolute right-3 top-3 z-10 grid h-11 w-11 place-items-center rounded-full border transition ${
                dictMode
                  ? 'border-brand bg-brand text-white'
                  : 'border-line bg-surface text-ink-mute hover:border-brand-line hover:text-brand-deep'
              }`}
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
              </svg>
            </button>
          )}

          {showDict && kaoyan ? (
            <div className="mt-3 min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
              <div className="rounded-md border border-line bg-surface-2 p-3.5 text-meta leading-relaxed text-ink-soft">
                {kaoyan.translation.split('\n').map((line, i) => (
                  <p key={i}>{line}</p>
                ))}
              </div>
              {kaoyan.sentences.map((sentence) => (
                <ExamSentenceCard key={sentence.id} sentence={sentence} word={text} />
              ))}
              {kaoyan.sentences.length === 0 && (
                <p className="py-2 text-center text-micro text-ink-mute">No matching sentences in the available exam corpus.</p>
              )}
              <p className="pt-1 text-center text-micro text-ink-faint">Use the dictionary button to return to your card.</p>
            </div>
          ) : (
            <>
              {primaryCanvas && (
                <div className="mt-3.5 min-h-0 flex-1 overflow-hidden rounded-md border border-line bg-surface">
                  <img
                    src={primaryCanvas}
                    alt={`${text} handwritten definition`}
                    className="h-full w-full object-contain"
                  />
                </div>
              )}

              {!primaryCanvas && definitions.length > 0 && (
                <div className="mt-3.5 min-h-0 flex-1 overflow-y-auto pr-1">
                  <div>
                    {primaryDefinitions.map((def, i) => (
                      <div key={i} className="grid grid-cols-[3.5rem_1fr] items-start gap-3 border-b border-line py-3 first:pt-0 last:border-0 last:pb-0">
                        <span className="pill pill-brand mt-0.5 justify-center text-2xs uppercase tracking-wide">
                          {def.pos || 'def'}
                        </span>
                        <p className="text-lead leading-relaxed text-ink">{def.meaning_zh}</p>
                      </div>
                    ))}
                  </div>
                  {extraCount > 0 && (
                    <p className="num mt-3 text-micro text-ink-mute">+{extraCount} more in details</p>
                  )}
                </div>
              )}

              {definitions.length === 0 && (
                <p className="mt-6 text-center text-meta text-ink-mute">No definitions yet</p>
              )}
            </>
          )}
        </div>
      </motion.div>
    </motion.div>
  );
}

function CardPreview({ text }: { text: string }) {
  return (
    <div className="flex h-full w-full items-center justify-center rounded-[1.35rem] border border-line bg-surface/95 shadow-card backdrop-blur-sm">
      <span className="word truncate px-5 text-lg text-ink-mute">{text}</span>
    </div>
  );
}

interface FlashCardProps {
  text: string;
  phonetic: string | null;
  definitions: { pos: string; meaning_zh: string; canvas_image?: string | null; is_primary?: boolean }[];
  kaoyan?: KaoyanInfo | null;
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
  left: { quality: 4, label: 'Good', color: 'text-good' },
  right: { quality: 1, label: 'Again', color: 'text-bad' },
  up: { quality: 5, label: 'Easy', color: 'text-brand-deep' },
  down: { quality: 3, label: 'Hard', color: 'text-warn' },
};

const exitTargets: Record<SwipeDir, { x: number; y: number; rotateZ: number }> = {
  left: { x: -400, y: 0, rotateZ: -12 },
  right: { x: 400, y: 0, rotateZ: 12 },
  up: { x: 0, y: -400, rotateZ: 0 },
  down: { x: 0, y: 400, rotateZ: 0 },
};

export default function FlashCard({
  text, phonetic, definitions, kaoyan, flipped, onFlip, onSwipe,
  nextText, cardKey,
}: FlashCardProps) {
  const [dictMode, setDictMode] = useState(false);
  const x = useMotionValue(0);
  const y = useMotionValue(0);
  const [dragging, setDragging] = useState(false);
  const [swipedDir, setSwipedDir] = useState<SwipeDir | null>(null);

  const horizontalOverlay = useTransform(
    x,
    [-160, -SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD, 160],
    [
      'rgba(23,105,74,0.22)',
      'rgba(23,105,74,0.10)',
      'rgba(0,0,0,0)',
      'rgba(165,47,28,0.10)',
      'rgba(165,47,28,0.22)',
    ],
  );

  const verticalOverlay = useTransform(
    y,
    [-160, -SWIPE_THRESHOLD, 0, SWIPE_THRESHOLD, 160],
    [
      'rgba(75,68,214,0.20)',
      'rgba(75,68,214,0.10)',
      'rgba(0,0,0,0)',
      'rgba(134,83,15,0.10)',
      'rgba(134,83,15,0.22)',
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
    if (!flipped || dictMode || !onSwipe) return;

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
      className="review-swipe-zone review-card-frame relative mx-auto flex w-full max-w-review items-center justify-center overflow-visible"
      style={{ perspective: 1200 }}
    >
      {/* The stacked previews are sized from the frame's height, not an
          aspect ratio: with `aspect-[3/4]` they grew past the frame on short
          viewports, and that overflow scrolled the page under the sticky header. */}
      {nextText && (
        <motion.div
          initial={{ y: 38, scale: 0.9, opacity: 0 }}
          animate={{
            y: swipedDir ? 12 : 38,
            scale: swipedDir ? 0.96 : 0.9,
            opacity: flipped ? 0.72 : 0.48,
          }}
          transition={{ duration: 0.3 }}
          className="absolute inset-x-0 bottom-0 top-5 z-0 mx-auto w-[94%]"
          style={{ filter: 'blur(0.4px)', pointerEvents: 'none' }}
        >
          <CardPreview text={nextText} />
        </motion.div>
      )}

      <motion.div
        animate={{ y: flipped ? 48 : 38, scale: flipped ? 0.84 : 0.8, opacity: flipped ? 0.34 : 0.22 }}
        transition={{ duration: 0.25 }}
        className="absolute inset-x-0 bottom-0 top-5 z-[-1] mx-auto w-[88%] rounded-[1.35rem] border border-line/70 bg-surface"
      />

      <AnimatePresence mode="popLayout" initial={false}>
        <motion.div
          key={cardKey ?? text}
          className="relative z-10 h-full w-full"
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
            drag={flipped && !dictMode && !swipedDir}
            dragElastic={0.18}
            dragMomentum={false}
            onDragStart={() => setDragging(true)}
            onDragEnd={handleDragEnd}
            style={{ x, y, rotate, scale, touchAction: dictMode ? 'pan-y' : 'none' }}
            className="h-full w-full"
          >
            <CardFace
              text={text}
              phonetic={phonetic}
              definitions={definitions}
              kaoyan={kaoyan}
              flipped={flipped}
              onFlip={onFlip}
              dragging={dragging}
              dictMode={dictMode}
              setDictMode={setDictMode}
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
                  className={`pointer-events-none absolute left-4 top-4 z-20 text-meta font-bold ${swipeConfig.left.color}`}
                >
                  {swipeConfig.left.label}
                </motion.div>
                <motion.div
                  style={{ opacity: rightOpacity }}
                  className={`pointer-events-none absolute right-4 top-4 z-20 text-meta font-bold ${swipeConfig.right.color}`}
                >
                  {swipeConfig.right.label}
                </motion.div>
                <motion.div
                  style={{ opacity: upOpacity }}
                  className={`pointer-events-none absolute left-1/2 top-4 z-20 -translate-x-1/2 text-meta font-bold ${swipeConfig.up.color}`}
                >
                  {swipeConfig.up.label}
                </motion.div>
                <motion.div
                  style={{ opacity: downOpacity }}
                  className={`pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 text-meta font-bold ${swipeConfig.down.color}`}
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
