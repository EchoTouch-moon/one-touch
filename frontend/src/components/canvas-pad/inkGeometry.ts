import { ERASER_RADIUS } from './constants';
import type { InkStroke, Point, RemovedStroke, StrokeBounds } from './types';

export function makeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function emptyBounds(point: Point): StrokeBounds {
  return { minX: point.x, minY: point.y, maxX: point.x, maxY: point.y };
}

export function includePoint(bounds: StrokeBounds, point: Point): StrokeBounds {
  return {
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  };
}

export function computeStrokeBounds(stroke: Pick<InkStroke, 'points'>): StrokeBounds | undefined {
  const first = stroke.points[0];
  if (!first) return undefined;
  return stroke.points.slice(1).reduce(includePoint, emptyBounds(first));
}

function boundsIntersectsCircle(bounds: StrokeBounds | undefined, point: Point, radius: number) {
  if (!bounds) return true;
  return (
    point.x >= bounds.minX - radius
    && point.x <= bounds.maxX + radius
    && point.y >= bounds.minY - radius
    && point.y <= bounds.maxY + radius
  );
}

function pointToSegmentDistanceSquared(point: Point, start: Point, end: Point) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) {
    const px = point.x - start.x;
    const py = point.y - start.y;
    return px * px + py * py;
  }

  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  const closestX = start.x + t * dx;
  const closestY = start.y + t * dy;
  const px = point.x - closestX;
  const py = point.y - closestY;
  return px * px + py * py;
}

export function strokeIntersectsEraser(stroke: InkStroke, point: Point) {
  if (stroke.tool !== 'pen') return false;
  const strokeRadius = stroke.width / 2 + 2;
  const threshold = ERASER_RADIUS + strokeRadius;
  const thresholdSquared = threshold * threshold;
  if (!boundsIntersectsCircle(stroke.bounds, point, threshold)) return false;

  if (stroke.points.length === 1) {
    const only = stroke.points[0];
    const dx = point.x - only.x;
    const dy = point.y - only.y;
    return dx * dx + dy * dy <= thresholdSquared;
  }

  for (let i = 1; i < stroke.points.length; i += 1) {
    if (pointToSegmentDistanceSquared(point, stroke.points[i - 1], stroke.points[i]) <= thresholdSquared) {
      return true;
    }
  }
  return false;
}

export function restoreRemovedStrokes(sourceStrokes: InkStroke[], removed: RemovedStroke[]) {
  const next = [...sourceStrokes];
  for (const item of [...removed].sort((a, b) => a.index - b.index)) {
    next.splice(Math.min(item.index, next.length), 0, item.stroke);
  }
  return next;
}

export function removeActionStrokes(sourceStrokes: InkStroke[], removed: RemovedStroke[]) {
  const ids = new Set(removed.map((item) => item.stroke.id));
  return sourceStrokes.filter((stroke) => !ids.has(stroke.id));
}
