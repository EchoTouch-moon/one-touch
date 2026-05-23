import {
  BACKGROUND,
  DEFAULT_PAPER,
  INK_VERSION,
  PAPER_GUIDE_KEY,
  PAPER_HEIGHT,
  PAPER_GUIDE_OPTIONS,
  PAPER_WIDTH,
  PEN_WEIGHT_STORAGE_KEY,
  PEN_WEIGHTS,
} from './constants';
import { computeStrokeBounds } from './inkGeometry';
import type {
  DocSize,
  InkDocument,
  InkStroke,
  PaperGuide,
  ParsedInk,
} from './types';

const storedWeightFallback = 0.7;

export function loadStoredWeight(): number {
  if (typeof window === 'undefined') return storedWeightFallback;
  try {
    const raw = window.localStorage.getItem(PEN_WEIGHT_STORAGE_KEY);
    const parsed = raw ? Number(raw) : NaN;
    if (Number.isFinite(parsed) && PEN_WEIGHTS.includes(parsed as typeof PEN_WEIGHTS[number])) {
      return parsed;
    }
  } catch {
    // localStorage may be unavailable
  }
  return storedWeightFallback;
}

export function loadStoredGuide(): PaperGuide {
  if (typeof window === 'undefined') return 'plain';
  try {
    const raw = window.localStorage.getItem(PAPER_GUIDE_KEY);
    if (raw && (PAPER_GUIDE_OPTIONS as readonly string[]).includes(raw)) {
      return raw as PaperGuide;
    }
  } catch {
    // localStorage may be unavailable
  }
  return 'plain';
}

function normalizePoint(raw: unknown) {
  if (!raw || typeof raw !== 'object') return null;
  const p = raw as Partial<InkStroke['points'][number]>;
  if (!Number.isFinite(p.x) || !Number.isFinite(p.y)) return null;
  return {
    x: p.x as number,
    y: p.y as number,
    pressure: Number.isFinite(p.pressure) && (p.pressure as number) > 0 ? (p.pressure as number) : 0.5,
    tiltX: Number.isFinite(p.tiltX) ? (p.tiltX as number) : 0,
    tiltY: Number.isFinite(p.tiltY) ? (p.tiltY as number) : 0,
    twist: Number.isFinite(p.twist) ? (p.twist as number) : 0,
    t: Number.isFinite(p.t) ? (p.t as number) : 0,
  };
}

export function parseInkData(value: string | null | undefined): ParsedInk | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Partial<InkDocument> & { strokes?: unknown };
    const rawVersion = parsed.version;
    if (rawVersion !== 1 && rawVersion !== 2 && rawVersion !== 3) return null;
    if (!Array.isArray(parsed.strokes)) return null;
    const strokes: InkStroke[] = (parsed.strokes as InkStroke[]).map((stroke) => ({
      ...stroke,
      weight: typeof stroke.weight === 'number' && Number.isFinite(stroke.weight) ? stroke.weight : 1,
      points: (stroke.points as unknown[])
        .map(normalizePoint)
        .filter((point): point is InkStroke['points'][number] => point !== null),
    })).map((stroke) => ({
      ...stroke,
      bounds: computeStrokeBounds(stroke),
    }));

    const rawW = Number.isFinite(parsed.width) ? (parsed.width as number) : 0;
    const rawH = Number.isFinite(parsed.height) ? (parsed.height as number) : 0;
    const hasDims = rawW > 0 && rawH > 0;
    const isPaperFamily = hasDims
      && Math.abs(rawW - PAPER_WIDTH) < 1
      && Math.abs(rawH % PAPER_HEIGHT) < 1
      && rawH >= PAPER_HEIGHT;

    let finalWidth = PAPER_WIDTH;
    let finalHeight = PAPER_HEIGHT;
    let finalStrokes = strokes;

    if (hasDims && isPaperFamily) {
      finalWidth = rawW;
      finalHeight = rawH;
    } else if (hasDims) {
      const scale = Math.min(PAPER_WIDTH / rawW, PAPER_HEIGHT / rawH);
      const offsetX = (PAPER_WIDTH - rawW * scale) / 2;
      const offsetY = (PAPER_HEIGHT - rawH * scale) / 2;
      finalStrokes = strokes.map((stroke) => ({
        ...stroke,
        width: stroke.width * scale,
        points: stroke.points.map((p) => ({
          ...p,
          x: p.x * scale + offsetX,
          y: p.y * scale + offsetY,
        })),
      })).map((stroke) => ({
        ...stroke,
        bounds: computeStrokeBounds(stroke),
      }));
    }

    return {
      doc: {
        version: INK_VERSION,
        background: parsed.background ?? BACKGROUND,
        backgroundImage: parsed.backgroundImage ?? null,
        paperGuide: parsed.paperGuide && (PAPER_GUIDE_OPTIONS as readonly string[]).includes(parsed.paperGuide)
          ? parsed.paperGuide
          : undefined,
        width: finalWidth,
        height: finalHeight,
        strokes: finalStrokes,
      },
    };
  } catch {
    return null;
  }
}

export function serializeInkData(
  strokes: InkStroke[],
  width: number,
  height: number,
  backgroundImage: string | null,
  paperGuide: PaperGuide,
) {
  if (strokes.length === 0 && !backgroundImage) return null;
  const doc: InkDocument = {
    version: INK_VERSION,
    background: BACKGROUND,
    backgroundImage,
    paperGuide,
    width: Math.round(width),
    height: Math.round(height),
    strokes,
  };
  return JSON.stringify(doc);
}

export function computeDocSize(parsed: ParsedInk | null): DocSize {
  if (parsed && parsed.doc.width > 0 && parsed.doc.height > 0) {
    return { width: parsed.doc.width, height: parsed.doc.height };
  }
  return DEFAULT_PAPER;
}
