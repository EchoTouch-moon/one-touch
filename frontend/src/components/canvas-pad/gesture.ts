import { MAX_ZOOM, MIN_ZOOM } from './constants';
import { computeFitTransform } from './strokeRenderer';
import type { DocSize, Viewport } from './types';

export function computePinchState(
  canvas: HTMLCanvasElement | null,
  pointers: Map<number, { clientX: number; clientY: number }>,
) {
  if (!canvas) return null;
  const rect = canvas.getBoundingClientRect();
  const points = Array.from(pointers.values()).slice(0, 2);
  if (points.length < 2) return null;
  const c1 = { x: points[0].clientX - rect.left, y: points[0].clientY - rect.top };
  const c2 = { x: points[1].clientX - rect.left, y: points[1].clientY - rect.top };
  return {
    center: { x: (c1.x + c2.x) / 2, y: (c1.y + c2.y) / 2 },
    distance: Math.hypot(c2.x - c1.x, c2.y - c1.y),
  };
}

export function computeZoomViewport(
  canvas: HTMLCanvasElement | null,
  docSize: DocSize | null,
  oldViewport: Viewport,
  lastCenter: { x: number; y: number },
  lastDistance: number,
  nextCenter: { x: number; y: number },
  nextDistance: number,
) {
  const rect = canvas?.getBoundingClientRect();
  const fit = computeFitTransform(rect?.width ?? 0, rect?.height ?? 0, docSize);
  const proposed = oldViewport.zoom * (nextDistance / lastDistance);
  const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, proposed));
  const denom = fit.scale * oldViewport.zoom;
  const docCenterX = denom !== 0
    ? (lastCenter.x - oldViewport.panX - fit.offsetX * oldViewport.zoom) / denom
    : 0;
  const docCenterY = denom !== 0
    ? (lastCenter.y - oldViewport.panY - fit.offsetY * oldViewport.zoom) / denom
    : 0;
  const newPanX = nextCenter.x - fit.scale * newZoom * docCenterX - fit.offsetX * newZoom;
  const newPanY = nextCenter.y - fit.scale * newZoom * docCenterY - fit.offsetY * newZoom;
  return { zoom: newZoom, panX: newPanX, panY: newPanY };
}
