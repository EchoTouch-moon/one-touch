import { useCallback, useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

import {
  BACKGROUND,
  DEFAULT_PAPER,
  ERASER_WIDTH,
  INITIAL_VIEWPORT,
  MAX_EXPORT_EDGE,
  MAX_POINT_JUMP,
  MIN_POINT_DISTANCE,
  PAPER_GUIDE_KEY,
  PAPER_GUIDE_OPTIONS,
  PAPER_HEIGHT,
  PAPER_WIDTH,
  PEN_WEIGHT_STORAGE_KEY,
  PEN_WIDTH,
  PREVIEW_AFTER_STROKE_DELAY_MS,
  PREVIEW_DEBOUNCE_MS,
} from './constants';
import { deleteDraftRecord, readDraftRecord, writeDraftRecord } from './draftStore';
import { computePinchState, computeZoomViewport } from './gesture';
import { loadStoredGuide, loadStoredWeight, parseInkData, serializeInkData } from './inkDocument';
import {
  computeStrokeBounds,
  emptyBounds,
  includePoint,
  makeId,
  removeActionStrokes,
  restoreRemovedStrokes,
  strokeIntersectsEraser,
} from './inkGeometry';
import {
  canvasToDataUrl,
  computeFitTransform,
  paintFullStroke,
  paintPaperBackground,
  paintPaperGuidePage,
  paintSegmentAt,
  paintStrokeTail,
} from './strokeRenderer';
import type {
  CanvasPadExperimentKind,
  CanvasPadMetricSample,
} from './metrics';
import type {
  DocSize,
  DrawingTool,
  HistoryAction,
  InkDraftRecord,
  InkStroke,
  PaperGuide,
  Point,
  RemovedStroke,
  Viewport,
} from './types';

interface UseCanvasPadControllerOptions {
  value: string | null;
  onChange: (value: string | null) => void;
  inkValue?: string | null;
  onInkChange?: (value: string | null) => void;
  resetKey?: string | number;
  draftKey?: string | null;
  penOnly?: boolean;
  rebuildPreviewOnLoad?: boolean;
  experimentKind?: CanvasPadExperimentKind;
  onMetric?: (sample: CanvasPadMetricSample) => void;
}

export function useCanvasPadController({
  value,
  onChange,
  inkValue = null,
  onInkChange,
  resetKey = 0,
  draftKey = null,
  penOnly = true,
  rebuildPreviewOnLoad = false,
  experimentKind = 'baseline',
  onMetric,
}: UseCanvasPadControllerOptions) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawing = useRef(false);
  const activePointerId = useRef<number | null>(null);
  const activePointerType = useRef<string>('');
  const currentStroke = useRef<InkStroke | null>(null);
  const latestValue = useRef(value);
  const latestInkValue = useRef(inkValue);
  const strokesRef = useRef<InkStroke[]>([]);
  const backgroundImageRef = useRef<string | null>(null);
  const historyRef = useRef<HistoryAction[]>([]);
  const removedDuringErase = useRef<RemovedStroke[]>([]);
  const eraseStartIndex = useRef<Map<string, number>>(new Map());
  const previewTimerRef = useRef<number | null>(null);
  const pointFlushFrameRef = useRef<number | null>(null);
  const queuedEventsRef = useRef<PointerEvent[]>([]);
  const commitSeqRef = useRef(0);
  const onChangeRef = useRef(onChange);
  const onInkChangeRef = useRef(onInkChange);
  const onMetricRef = useRef(onMetric);

  const [strokes, setStrokes] = useState<InkStroke[]>([]);
  const [history, setHistory] = useState<HistoryAction[]>([]);
  const [undone, setUndone] = useState<HistoryAction[]>([]);
  const [tool, setTool] = useState<DrawingTool>('pen');
  const [penWeight, setPenWeight] = useState<number>(() => loadStoredWeight());
  const [paperGuide, setPaperGuide] = useState<PaperGuide>(() => loadStoredGuide());
  const paperGuideRef = useRef<PaperGuide>(paperGuide);
  const [acceptTouch, setAcceptTouch] = useState(!penOnly);
  const [inputLabel, setInputLabel] = useState('Stylus ready');
  const [viewport, setViewportState] = useState<Viewport>(INITIAL_VIEWPORT);
  const viewportRef = useRef<Viewport>(INITIAL_VIEWPORT);
  const docSizeRef = useRef<DocSize | null>(null);
  const gesturePointersRef = useRef<Map<number, { clientX: number; clientY: number }>>(new Map());
  const lastTouchTapRef = useRef<{ ts: number; x: number; y: number } | null>(null);
  const gestureRef = useRef<{
    active: boolean;
    lastCenter: { x: number; y: number } | null;
    lastDistance: number | null;
  }>({ active: false, lastCenter: null, lastDistance: null });

  const setViewport = useCallback((next: Viewport) => {
    viewportRef.current = next;
    setViewportState(next);
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PEN_WEIGHT_STORAGE_KEY, String(penWeight));
    } catch {
      // localStorage may be unavailable
    }
  }, [penWeight]);

  useEffect(() => {
    paperGuideRef.current = paperGuide;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(PAPER_GUIDE_KEY, paperGuide);
    } catch {
      // localStorage may be unavailable
    }
  }, [paperGuide]);

  const draftStorageKey = draftKey ? `glm-words-ink-draft:${draftKey}` : null;

  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  useEffect(() => {
    onInkChangeRef.current = onInkChange;
  }, [onInkChange]);

  useEffect(() => {
    onMetricRef.current = onMetric;
  }, [onMetric]);

  const reportMetric = useCallback((sample: Omit<CanvasPadMetricSample, 'kind' | 'at'>) => {
    onMetricRef.current?.({
      ...sample,
      kind: experimentKind,
      at: performance.now(),
    });
  }, [experimentKind]);

  const getContext = useCallback(() => (
    canvasRef.current?.getContext('2d') ?? null
  ), []);

  const getCanvasSize = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return { width: 0, height: 0 };
    const rect = canvas.getBoundingClientRect();
    return { width: rect.width, height: rect.height };
  }, []);

  const setCommittedStrokes = useCallback((nextStrokes: InkStroke[]) => {
    strokesRef.current = nextStrokes;
    setStrokes(nextStrokes);
  }, []);

  const pushHistory = useCallback((action: HistoryAction) => {
    const nextHistory = [...historyRef.current, action];
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setUndone([]);
  }, []);

  const renderStrokes = useCallback((
    sourceStrokes: InkStroke[],
    backgroundImage: string | null,
    afterRender?: () => void,
  ) => {
    const renderStartedAt = performance.now();
    const canvas = canvasRef.current;
    const ctx = getContext();
    if (!canvas || !ctx) return;

    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.round(rect.width * ratio));
    canvas.height = Math.max(1, Math.round(rect.height * ratio));

    const doc = docSizeRef.current;
    const fit = computeFitTransform(rect.width, rect.height, doc);
    const vp = viewportRef.current;

    const applyScreenTransform = (target: CanvasRenderingContext2D) => {
      target.setTransform(ratio, 0, 0, ratio, 0, 0);
    };
    const applyDocTransform = (target: CanvasRenderingContext2D) => {
      const a = fit.scale * vp.zoom * ratio;
      const e = (fit.offsetX * vp.zoom + vp.panX) * ratio;
      const f = (fit.offsetY * vp.zoom + vp.panY) * ratio;
      target.setTransform(a, 0, 0, a, e, f);
    };

    const paintBackdrop = (target: CanvasRenderingContext2D, box: { width: number; height: number }) => {
      applyScreenTransform(target);
      target.fillStyle = doc ? '#f4f4f5' : BACKGROUND;
      target.fillRect(0, 0, box.width, box.height);
      if (!doc) return;
      applyDocTransform(target);
      const guide = paperGuideRef.current;
      const lineW = 1 / (fit.scale * vp.zoom);
      for (let p = 0; p < Math.max(1, Math.round(doc.height / PAPER_HEIGHT)); p += 1) {
        const py = p * PAPER_HEIGHT;
        target.save();
        target.shadowColor = 'rgba(15, 23, 42, 0.18)';
        target.shadowBlur = 18 / (fit.scale * vp.zoom);
        target.shadowOffsetY = 4 / (fit.scale * vp.zoom);
        target.fillStyle = BACKGROUND;
        target.fillRect(0, py, PAPER_WIDTH, PAPER_HEIGHT);
        target.restore();

        paintPaperGuidePage(target, PAPER_WIDTH, py, guide);

        target.lineWidth = lineW;
        target.strokeStyle = '#d4d4d8';
        target.strokeRect(0, py, PAPER_WIDTH, PAPER_HEIGHT);
      }
    };

    const drawClippedInk = (target: CanvasRenderingContext2D) => {
      target.save();
      if (doc) {
        target.beginPath();
        target.rect(0, 0, doc.width, doc.height);
        target.clip();
      }
      for (const stroke of sourceStrokes) {
        paintFullStroke(target, stroke);
      }
      target.restore();
      afterRender?.();
      reportMetric({
        event: 'render',
        frameMs: performance.now() - renderStartedAt,
        strokeCount: sourceStrokes.length,
      });
    };

    paintBackdrop(ctx, rect);

    if (backgroundImage) {
      const img = new Image();
      img.onload = () => {
        const fresh = getContext();
        const currentCanvas = canvasRef.current;
        if (!fresh || !currentCanvas) return;
        const box = currentCanvas.getBoundingClientRect();
        paintBackdrop(fresh, box);
        applyDocTransform(fresh);
        fresh.save();
        if (doc) {
          fresh.beginPath();
          fresh.rect(0, 0, doc.width, doc.height);
          fresh.clip();
        }
        fresh.drawImage(img, 0, 0, doc ? doc.width : box.width, doc ? doc.height : box.height);
        fresh.restore();
        drawClippedInk(fresh);
      };
      img.src = backgroundImage;
      return;
    }

    applyDocTransform(ctx);
    drawClippedInk(ctx);
  }, [getContext, reportMetric]);

  const exportPreview = useCallback(async () => {
    const doc = docSizeRef.current;
    if (!doc || doc.width <= 0 || doc.height <= 0) {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      const maxEdge = Math.max(canvas.width, canvas.height);
      if (maxEdge <= MAX_EXPORT_EDGE) return canvasToDataUrl(canvas);
      const scale = MAX_EXPORT_EDGE / maxEdge;
      const exportCanvas = document.createElement('canvas');
      exportCanvas.width = Math.max(1, Math.round(canvas.width * scale));
      exportCanvas.height = Math.max(1, Math.round(canvas.height * scale));
      const ctx = exportCanvas.getContext('2d');
      if (!ctx) return canvasToDataUrl(canvas);
      ctx.fillStyle = BACKGROUND;
      ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
      ctx.drawImage(canvas, 0, 0, exportCanvas.width, exportCanvas.height);
      return canvasToDataUrl(exportCanvas);
    }

    const ratio = window.devicePixelRatio || 1;
    const previewH = Math.min(doc.height, PAPER_HEIGHT);
    const longestEdge = Math.max(doc.width, previewH) * ratio;
    const scale = longestEdge > MAX_EXPORT_EDGE ? MAX_EXPORT_EDGE / longestEdge : 1;
    const renderScale = ratio * scale;
    const exportW = Math.max(1, Math.round(doc.width * renderScale));
    const exportH = Math.max(1, Math.round(previewH * renderScale));
    const off = document.createElement('canvas');
    off.width = exportW;
    off.height = exportH;
    const ctx = off.getContext('2d');
    if (!ctx) return null;
    ctx.setTransform(renderScale, 0, 0, renderScale, 0, 0);
    paintPaperBackground(ctx, doc.width, previewH, paperGuideRef.current);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, doc.width, previewH);
    ctx.clip();
    for (const stroke of strokesRef.current) {
      paintFullStroke(ctx, stroke);
    }
    ctx.restore();
    return canvasToDataUrl(off);
  }, []);

  const persistDraft = useCallback((nextStrokes: InkStroke[], preview: string | null, inkData: string | null) => {
    if (!draftStorageKey) return;
    if (!inkData && !preview) {
      void deleteDraftRecord(draftStorageKey).catch(() => undefined);
      try {
        window.localStorage.removeItem(draftStorageKey);
      } catch {
        // localStorage can fail in private mode.
      }
      return;
    }

    const record: InkDraftRecord = {
      key: draftStorageKey,
      inkData,
      preview,
      updatedAt: new Date().toISOString(),
      strokeCount: nextStrokes.length,
    };
    void writeDraftRecord(record).catch(() => {
      try {
        const size = (inkData?.length ?? 0) + (preview?.length ?? 0);
        window.localStorage.setItem(draftStorageKey, JSON.stringify({
          inkData: size < 3_000_000 ? inkData : null,
          preview: size < 3_000_000 ? preview : null,
          updatedAt: record.updatedAt,
          strokeCount: nextStrokes.length,
          indexedDb: false,
        }));
      } catch {
        // localStorage can fail in private mode or when quota is full.
      }
    });

    try {
      window.localStorage.setItem(draftStorageKey, JSON.stringify({
        key: draftStorageKey,
        updatedAt: record.updatedAt,
        strokeCount: nextStrokes.length,
        migrated: true,
      }));
    } catch {
      // localStorage is only a small compatibility index.
    }
  }, [draftStorageKey]);

  const commit = useCallback((nextStrokes: InkStroke[], options: { preview?: boolean } = {}) => {
    const seq = commitSeqRef.current + 1;
    commitSeqRef.current = seq;
    const shouldBuildPreview = options.preview ?? false;
    if (previewTimerRef.current !== null) {
      window.clearTimeout(previewTimerRef.current);
      previewTimerRef.current = null;
    }

    if (nextStrokes.length === 0 && !backgroundImageRef.current) {
      onChangeRef.current(null);
      onInkChangeRef.current?.(null);
      persistDraft([], null, null);
      return;
    }

    const doc = docSizeRef.current ?? getCanvasSize();
    const inkData = serializeInkData(nextStrokes, doc.width, doc.height, backgroundImageRef.current, paperGuideRef.current);
    onInkChangeRef.current?.(inkData);
    persistDraft(nextStrokes, latestValue.current, inkData);

    const buildPreview = () => {
      const exportStartedAt = performance.now();
      void exportPreview().then((preview) => {
        if (seq !== commitSeqRef.current) return;
        if (!preview) return;
        reportMetric({
          event: 'export',
          exportMs: performance.now() - exportStartedAt,
          strokeCount: strokesRef.current.length,
        });
        latestValue.current = preview;
        onChangeRef.current(preview);
        persistDraft(strokesRef.current, preview, serializeInkData(
          strokesRef.current,
          docSizeRef.current?.width ?? doc.width,
          docSizeRef.current?.height ?? doc.height,
          backgroundImageRef.current,
          paperGuideRef.current,
        ));
      });
    };

    if (shouldBuildPreview) {
      buildPreview();
      return;
    }

    previewTimerRef.current = window.setTimeout(() => {
      previewTimerRef.current = null;
      buildPreview();
    }, PREVIEW_DEBOUNCE_MS);
  }, [exportPreview, getCanvasSize, persistDraft, reportMetric]);

  useEffect(() => {
    latestValue.current = value;
  }, [value]);

  useEffect(() => {
    latestInkValue.current = inkValue;
  }, [inkValue]);

  useEffect(() => {
    strokesRef.current = strokes;
  }, [strokes]);

  useEffect(() => {
    viewportRef.current = { ...INITIAL_VIEWPORT };
    window.requestAnimationFrame(() => setViewportState({ ...INITIAL_VIEWPORT }));
    let canceled = false;

    const load = async () => {
      let sourceInk = latestInkValue.current;
      let sourcePreview = latestValue.current;

      if (draftStorageKey) {
        try {
          const indexedDraft = await readDraftRecord(draftStorageKey);
          if (indexedDraft) {
            sourceInk = indexedDraft.inkData ?? sourceInk;
            sourcePreview = indexedDraft.preview ?? sourcePreview;
          } else {
            const raw = window.localStorage.getItem(draftStorageKey);
            if (raw) {
              const draft = JSON.parse(raw) as { inkData?: string | null; preview?: string | null };
              sourceInk = draft.inkData ?? sourceInk;
              sourcePreview = draft.preview ?? sourcePreview;
            }
          }
          if (sourceInk && sourceInk !== latestInkValue.current) onInkChangeRef.current?.(sourceInk);
          if (sourcePreview && sourcePreview !== latestValue.current) onChangeRef.current(sourcePreview);
        } catch {
          try {
            window.localStorage.removeItem(draftStorageKey);
          } catch {
            // best-effort cleanup
          }
          await deleteDraftRecord(draftStorageKey).catch(() => undefined);
        }
      }

      if (canceled) return;

      const parsed = parseInkData(sourceInk);
      const nextStrokes = parsed ? parsed.doc.strokes : [];
      let nextDocSize: DocSize = DEFAULT_PAPER;
      if (parsed && parsed.doc.width > 0 && parsed.doc.height > 0) {
        nextDocSize = { width: parsed.doc.width, height: parsed.doc.height };
      }
      docSizeRef.current = nextDocSize;
      const nextGuide = parsed?.doc.paperGuide ?? loadStoredGuide();
      paperGuideRef.current = nextGuide;
      setPaperGuide(nextGuide);
      const backgroundImage = parsed?.doc.backgroundImage ?? (!parsed ? sourcePreview ?? null : null);
      setStrokes(nextStrokes);
      setHistory([]);
      setUndone([]);
      strokesRef.current = nextStrokes;
      historyRef.current = [];
      backgroundImageRef.current = backgroundImage;
      latestValue.current = sourcePreview ?? null;
      renderStrokes(nextStrokes, backgroundImage, () => {
        if ((parsed && rebuildPreviewOnLoad) || (parsed && !sourcePreview)) {
          window.requestAnimationFrame(() => {
            void exportPreview().then((preview) => {
              if (preview) {
                latestValue.current = preview;
                onChangeRef.current(preview);
                persistDraft(nextStrokes, preview, sourceInk ?? serializeInkData(
                  nextStrokes,
                  nextDocSize.width,
                  nextDocSize.height,
                  backgroundImage,
                  nextGuide,
                ));
              }
            });
          });
        }
      });
    };

    void load();
    return () => {
      canceled = true;
    };
  }, [draftStorageKey, exportPreview, persistDraft, rebuildPreviewOnLoad, renderStrokes, resetKey]);

  useEffect(() => {
    const handleResize = () => {
      if (!drawing.current) renderStrokes(strokesRef.current, backgroundImageRef.current);
    };
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [renderStrokes]);

  const getPoint = (
    event: Pick<
      PointerEvent | ReactPointerEvent<HTMLCanvasElement>,
      'clientX' | 'clientY' | 'pressure' | 'tiltX' | 'tiltY' | 'twist' | 'timeStamp'
    >,
  ): Point | null => {
    const canvas = canvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    const vp = viewportRef.current;
    const fit = computeFitTransform(rect.width, rect.height, docSizeRef.current);
    const localX = event.clientX - rect.left;
    const localY = event.clientY - rect.top;
    return {
      x: (localX - vp.panX - fit.offsetX * vp.zoom) / (vp.zoom * fit.scale),
      y: (localY - vp.panY - fit.offsetY * vp.zoom) / (vp.zoom * fit.scale),
      pressure: Number.isFinite(event.pressure) && event.pressure > 0 ? event.pressure : 0.5,
      tiltX: Number.isFinite(event.tiltX) ? event.tiltX : 0,
      tiltY: Number.isFinite(event.tiltY) ? event.tiltY : 0,
      twist: Number.isFinite(event.twist) ? event.twist : 0,
      t: Number.isFinite(event.timeStamp) ? event.timeStamp : performance.now(),
    };
  };

  const shouldAcceptPoint = (stroke: InkStroke, point: Point) => {
    const prev = stroke.points.at(-1);
    if (!prev) return true;
    const dist = Math.hypot(point.x - prev.x, point.y - prev.y);
    if (dist < MIN_POINT_DISTANCE) return false;
    return dist <= MAX_POINT_JUMP;
  };

  const smoothPoint = (stroke: InkStroke, point: Point): Point => {
    const prev = stroke.points.at(-1);
    const prev2 = stroke.points.at(-2);
    if (!prev || !prev2 || stroke.points.length > 4) return point;
    return {
      ...point,
      x: point.x * 0.65 + prev.x * 0.25 + prev2.x * 0.1,
      y: point.y * 0.65 + prev.y * 0.25 + prev2.y * 0.1,
    };
  };

  const canDrawWithPointer = (event: ReactPointerEvent<HTMLCanvasElement> | PointerEvent) => {
    if (!penOnly || acceptTouch) return true;
    return event.pointerType === 'pen';
  };

  const eventTool = (event: ReactPointerEvent<HTMLCanvasElement> | PointerEvent): DrawingTool => {
    const buttons = event.buttons || 0;
    const button = event.button;
    const hasBarrelButton = button === 2 || (buttons & 2) === 2;
    const hasEraserButton = button === 5 || (buttons & 32) === 32;
    if (event.pointerType === 'pen' && (hasBarrelButton || hasEraserButton)) {
      return 'eraser';
    }
    return tool;
  };

  const eraseAtPoint = useCallback((point: Point) => {
    const nextStrokes: InkStroke[] = [];
    const removed: RemovedStroke[] = [];

    for (const stroke of strokesRef.current) {
      if (strokeIntersectsEraser(stroke, point)) {
        removed.push({
          stroke,
          index: eraseStartIndex.current.get(stroke.id) ?? nextStrokes.length,
        });
      } else {
        nextStrokes.push(stroke);
      }
    }

    if (removed.length === 0) return;
    removedDuringErase.current = [...removedDuringErase.current, ...removed];
    setCommittedStrokes(nextStrokes);
    renderStrokes(nextStrokes, backgroundImageRef.current);
  }, [renderStrokes, setCommittedStrokes]);

  const processQueuedPoints = useCallback(() => {
    pointFlushFrameRef.current = null;
    const startedAt = performance.now();
    const events = queuedEventsRef.current;
    queuedEventsRef.current = [];
    const stroke = currentStroke.current;
    if (!drawing.current || !stroke || events.length === 0) return;

    const ctx = getContext();
    if (!ctx) return;

    const doc = docSizeRef.current;
    if (doc) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, doc.width, doc.height);
      ctx.clip();
    }

    let accepted = 0;
    for (const item of events) {
      const rawPoint = getPoint(item);
      if (!rawPoint) continue;
      if (doc && (rawPoint.x < 0 || rawPoint.y < 0 || rawPoint.x > doc.width || rawPoint.y > doc.height)) continue;
      if (!shouldAcceptPoint(stroke, rawPoint)) continue;
      const point = stroke.tool === 'eraser' ? rawPoint : smoothPoint(stroke, rawPoint);
      stroke.points.push(point);
      stroke.bounds = stroke.bounds ? includePoint(stroke.bounds, point) : emptyBounds(point);
      accepted += 1;
      if (stroke.tool === 'eraser') {
        eraseAtPoint(point);
        continue;
      }
      paintSegmentAt(ctx, stroke, stroke.points.length - 1);
    }
    if (doc) {
      ctx.restore();
    }
    reportMetric({
      event: 'render',
      frameMs: performance.now() - startedAt,
      queuedPoints: accepted,
      strokePoints: stroke.points.length,
    });
  }, [eraseAtPoint, getContext, reportMetric]);

  const schedulePointFlush = useCallback(() => {
    if (pointFlushFrameRef.current !== null) return;
    pointFlushFrameRef.current = window.requestAnimationFrame(processQueuedPoints);
  }, [processQueuedPoints]);

  const enterGesture = useCallback(() => {
    if (drawing.current && currentStroke.current && activePointerId.current !== null) {
      const canvas = canvasRef.current;
      if (canvas && canvas.hasPointerCapture(activePointerId.current)) {
        try {
          canvas.releasePointerCapture(activePointerId.current);
        } catch {
          // capture release best-effort
        }
      }
    }
    drawing.current = false;
    currentStroke.current = null;
    activePointerId.current = null;
    activePointerType.current = '';
    removedDuringErase.current = [];
    queuedEventsRef.current = [];
    if (pointFlushFrameRef.current !== null) {
      window.cancelAnimationFrame(pointFlushFrameRef.current);
      pointFlushFrameRef.current = null;
    }
    gestureRef.current.active = true;
    renderStrokes(strokesRef.current, backgroundImageRef.current);
    setInputLabel('Pinch to zoom');
  }, [renderStrokes]);

  const exitGesture = useCallback(() => {
    gestureRef.current.active = false;
    gestureRef.current.lastCenter = null;
    gestureRef.current.lastDistance = null;
    setInputLabel('Stylus ready');
  }, []);

  const resetViewport = () => {
    setViewport({ ...INITIAL_VIEWPORT });
    renderStrokes(strokesRef.current, backgroundImageRef.current);
  };

  const handlePointerDown = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (event.pointerType === 'touch') {
      const wasEmpty = gesturePointersRef.current.size === 0;
      gesturePointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
      if (gesturePointersRef.current.size >= 2) {
        lastTouchTapRef.current = null;
        enterGesture();
        const state = computePinchState(canvasRef.current, gesturePointersRef.current);
        if (state) {
          gestureRef.current.lastCenter = state.center;
          gestureRef.current.lastDistance = state.distance;
        }
        return;
      }
      if (wasEmpty) {
        const now = Date.now();
        const last = lastTouchTapRef.current;
        const dx = last ? event.clientX - last.x : 0;
        const dy = last ? event.clientY - last.y : 0;
        if (last && now - last.ts < 350 && dx * dx + dy * dy < 900) {
          lastTouchTapRef.current = null;
          gesturePointersRef.current.delete(event.pointerId);
          resetViewport();
          setInputLabel('Zoom reset');
          return;
        }
        lastTouchTapRef.current = { ts: now, x: event.clientX, y: event.clientY };
      }
    }

    const point = getPoint(event);
    if (!point) return;
    if (!canDrawWithPointer(event)) {
      setInputLabel(event.pointerType === 'touch' ? 'Finger ignored. Use stylus.' : 'Use stylus to write.');
      return;
    }

    const paper = docSizeRef.current;
    if (paper && (point.x < 0 || point.y < 0 || point.x > paper.width || point.y > paper.height)) {
      setInputLabel('Tap inside paper');
      return;
    }

    const strokeTool = eventTool(event);
    const stroke: InkStroke = {
      id: makeId(),
      tool: strokeTool,
      color: '#111827',
      width: strokeTool === 'eraser' ? ERASER_WIDTH : PEN_WIDTH,
      weight: strokeTool === 'eraser' ? 1 : penWeight,
      pointerType: event.pointerType,
      points: [point],
      bounds: emptyBounds(point),
    };

    reportMetric({
      event: 'pointerdown',
      pointerType: event.pointerType,
      strokePoints: 1,
      strokeCount: strokesRef.current.length,
    });

    canvas.setPointerCapture(event.pointerId);
    activePointerId.current = event.pointerId;
    activePointerType.current = event.pointerType;
    currentStroke.current = stroke;
    drawing.current = true;
    if (strokeTool === 'eraser') {
      removedDuringErase.current = [];
      eraseStartIndex.current = new Map(strokesRef.current.map((item, index) => [item.id, index]));
      eraseAtPoint(point);
      setInputLabel('Vector eraser active');
    } else {
      setInputLabel(event.pointerType === 'pen' ? 'Stylus active' : 'Drawing');
    }
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (gesturePointersRef.current.has(event.pointerId)) {
      gesturePointersRef.current.set(event.pointerId, {
        clientX: event.clientX,
        clientY: event.clientY,
      });
    }
    if (gestureRef.current.active) {
      if (gesturePointersRef.current.size >= 2) {
        const state = computePinchState(canvasRef.current, gesturePointersRef.current);
        const lastCenter = gestureRef.current.lastCenter;
        const lastDistance = gestureRef.current.lastDistance;
        if (state && lastCenter && lastDistance && lastDistance > 0) {
          setViewport(computeZoomViewport(
            canvasRef.current,
            docSizeRef.current,
            viewportRef.current,
            lastCenter,
            lastDistance,
            state.center,
            state.distance,
          ));
          renderStrokes(strokesRef.current, backgroundImageRef.current);
        }
        if (state) {
          gestureRef.current.lastCenter = state.center;
          gestureRef.current.lastDistance = state.distance;
        }
      }
      return;
    }

    const stroke = currentStroke.current;
    if (!drawing.current || !stroke || activePointerId.current !== event.pointerId) return;
    if (!canDrawWithPointer(event)) return;

    const native = event.nativeEvent;
    const events = typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents() : [native];
    const predictedCount = typeof native.getPredictedEvents === 'function'
      ? native.getPredictedEvents().length
      : 0;

    reportMetric({
      event: 'pointermove',
      pointerType: event.pointerType,
      coalescedCount: events.length,
      predictedCount,
      queuedPoints: events.length,
    });
    queuedEventsRef.current.push(...events);
    schedulePointFlush();
  };

  const handlePointerUp = (event: ReactPointerEvent<HTMLCanvasElement>) => {
    if (gesturePointersRef.current.has(event.pointerId)) {
      gesturePointersRef.current.delete(event.pointerId);
      if (gesturePointersRef.current.size < 2 && gestureRef.current.active) {
        exitGesture();
      }
      return;
    }

    const canvas = canvasRef.current;
    if (canvas && canvas.hasPointerCapture(event.pointerId)) {
      canvas.releasePointerCapture(event.pointerId);
    }
    if (activePointerId.current !== event.pointerId) return;

    const stroke = currentStroke.current;
    if (pointFlushFrameRef.current !== null) {
      window.cancelAnimationFrame(pointFlushFrameRef.current);
      pointFlushFrameRef.current = null;
    }
    processQueuedPoints();
    drawing.current = false;
    activePointerId.current = null;
    currentStroke.current = null;
    queuedEventsRef.current = [];
    setInputLabel(activePointerType.current === 'pen' ? 'Stylus ready' : 'Ready');
    activePointerType.current = '';

    if (!stroke) return;
    reportMetric({
      event: 'pointerup',
      pointerType: event.pointerType,
      strokePoints: stroke.points.length,
      strokeCount: strokesRef.current.length,
    });
    if (stroke.tool === 'eraser') {
      const removed = removedDuringErase.current;
      removedDuringErase.current = [];
      eraseStartIndex.current = new Map();
      if (removed.length > 0) {
        pushHistory({ type: 'remove', removed });
        window.setTimeout(() => commit(strokesRef.current), PREVIEW_AFTER_STROKE_DELAY_MS);
      }
      return;
    }
    if (stroke.points.length < 2) return;
    const ctx = getContext();
    if (ctx) {
      const doc = docSizeRef.current;
      if (doc) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(0, 0, doc.width, doc.height);
        ctx.clip();
      }
      paintStrokeTail(ctx, stroke);
      if (doc) ctx.restore();
    }
    const nextStrokes = [...strokesRef.current, stroke];
    stroke.bounds = computeStrokeBounds(stroke);
    setCommittedStrokes(nextStrokes);
    pushHistory({ type: 'add', stroke });
    window.setTimeout(() => commit(nextStrokes), PREVIEW_AFTER_STROKE_DELAY_MS);
  };

  const handleUndo = () => {
    const action = historyRef.current.at(-1);
    if (!action) return;

    const nextHistory = historyRef.current.slice(0, -1);
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setUndone((items) => [action, ...items]);

    const nextStrokes = action.type === 'add'
      ? strokesRef.current.filter((stroke) => stroke.id !== action.stroke.id)
      : restoreRemovedStrokes(strokesRef.current, action.removed);
    setCommittedStrokes(nextStrokes);
    renderStrokes(nextStrokes, backgroundImageRef.current);
    window.requestAnimationFrame(() => commit(nextStrokes));
  };

  const handleRedo = () => {
    const [action, ...rest] = undone;
    if (!action) return;
    const nextStrokes = action.type === 'add'
      ? [...strokesRef.current, action.stroke]
      : removeActionStrokes(strokesRef.current, action.removed);
    setCommittedStrokes(nextStrokes);
    const nextHistory = [...historyRef.current, action];
    historyRef.current = nextHistory;
    setHistory(nextHistory);
    setUndone(rest);
    renderStrokes(nextStrokes, backgroundImageRef.current);
    window.requestAnimationFrame(() => commit(nextStrokes));
  };

  const handleClear = () => {
    setCommittedStrokes([]);
    backgroundImageRef.current = null;
    historyRef.current = [];
    setHistory([]);
    setUndone([]);
    docSizeRef.current = DEFAULT_PAPER;
    viewportRef.current = { ...INITIAL_VIEWPORT };
    setViewportState({ ...INITIAL_VIEWPORT });
    renderStrokes([], null);
    latestValue.current = null;
    onChangeRef.current(null);
    onInkChangeRef.current?.(null);
    persistDraft([], null, null);
  };

  const handleAddPage = () => {
    const cur = docSizeRef.current ?? DEFAULT_PAPER;
    const pageCount = Math.max(1, Math.round(cur.height / PAPER_HEIGHT));
    const nextHeight = (pageCount + 1) * PAPER_HEIGHT;
    docSizeRef.current = { width: PAPER_WIDTH, height: nextHeight };
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const fit = computeFitTransform(rect.width, rect.height, docSizeRef.current);
      const vp = viewportRef.current;
      const newPageTopDocY = pageCount * PAPER_HEIGHT;
      const newPanY = -(fit.scale * vp.zoom * newPageTopDocY + fit.offsetY * vp.zoom);
      setViewport({ zoom: vp.zoom, panX: vp.panX, panY: newPanY });
    }
    renderStrokes(strokesRef.current, backgroundImageRef.current);
    if (strokesRef.current.length > 0 || backgroundImageRef.current) {
      window.requestAnimationFrame(() => commit(strokesRef.current, { preview: true }));
    }
  };

  const cyclePaperGuide = () => {
    const idx = PAPER_GUIDE_OPTIONS.indexOf(paperGuideRef.current);
    const next = PAPER_GUIDE_OPTIONS[(idx + 1) % PAPER_GUIDE_OPTIONS.length];
    paperGuideRef.current = next;
    setPaperGuide(next);
    renderStrokes(strokesRef.current, backgroundImageRef.current);
    if (strokesRef.current.length > 0 || backgroundImageRef.current) {
      window.requestAnimationFrame(() => commit(strokesRef.current, { preview: true }));
    }
  };

  return {
    acceptTouch,
    canvasRef,
    cyclePaperGuide,
    handleAddPage,
    handleClear,
    handlePointerDown,
    handlePointerMove,
    handlePointerUp,
    handleRedo,
    handleUndo,
    history,
    inputLabel,
    paperGuide,
    penWeight,
    resetViewport,
    setAcceptTouch,
    setPenWeight,
    setTool,
    tool,
    undone,
    viewport,
  };
}
