import {
  BACKGROUND,
  GRID_SPACING,
  LINE_SPACING,
  PAPER_HEIGHT,
  PREVIEW_MIME,
  PREVIEW_QUALITY,
  PRESSURE_GAIN,
  PRESSURE_GAMMA,
  PRESSURE_REFERENCE,
  PRESSURE_SMOOTH_WINDOW,
  PRESSURE_TILT_BLEND,
  TILT_REF_DEG,
  VELOCITY_MAX,
  VELOCITY_MAX_DECAY,
  VELOCITY_MIN,
  NO_PRESSURE_BASE,
  NO_PRESSURE_SLOW_GAIN,
  NO_PRESSURE_TILT_GAIN,
} from './constants';
import type { DocSize, InkStroke, PaperGuide, Point } from './types';

function midpoint(a: Point, b: Point) {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

function smoothedPressureAt(points: Point[], idx: number, window: number = PRESSURE_SMOOTH_WINDOW) {
  if (idx < 0 || idx >= points.length) return 0;
  const start = Math.max(0, idx - window + 1);
  let sum = 0;
  let count = 0;
  for (let i = start; i <= idx; i += 1) {
    sum += points[i].pressure;
    count += 1;
  }
  return count > 0 ? sum / count : 0;
}

function computePenWidthAt(stroke: InkStroke, idx: number) {
  if (stroke.tool === 'eraser') return stroke.width;
  const points = stroke.points;
  if (idx < 1 || idx >= points.length) return stroke.width;
  const prev = points[idx - 1];
  const curr = points[idx];

  const smoothedPrev = smoothedPressureAt(points, idx - 1);
  const smoothedCurr = smoothedPressureAt(points, idx);
  const pressureRaw = (smoothedPrev + smoothedCurr) / 2;
  const hasPressure = pressureRaw > 0.001;
  let pressureCurve = 0;
  if (hasPressure) {
    const normalized = Math.max(0, Math.min(1, pressureRaw / PRESSURE_REFERENCE));
    pressureCurve = Math.pow(normalized, PRESSURE_GAMMA);
  }

  const tiltX = (prev.tiltX + curr.tiltX) / 2;
  const tiltY = (prev.tiltY + curr.tiltY) / 2;
  const tiltMag = Math.hypot(tiltX, tiltY);
  const tiltNorm = Math.max(0, Math.min(1, tiltMag / TILT_REF_DEG));

  const dt = Math.max(curr.t - prev.t, 1);
  const dist = Math.hypot(curr.x - prev.x, curr.y - prev.y);
  const velocity = dist / dt;
  const decayInput = (velocity - VELOCITY_MIN) / (VELOCITY_MAX - VELOCITY_MIN);
  const decay = Math.max(0, Math.min(1, decayInput));
  const velocityFactor = 1 - VELOCITY_MAX_DECAY * decay;

  let intensity: number;
  if (hasPressure) {
    intensity = pressureCurve + tiltNorm * PRESSURE_TILT_BLEND;
  } else {
    const slowness = 1 - decay;
    intensity = NO_PRESSURE_BASE + slowness * NO_PRESSURE_SLOW_GAIN + tiltNorm * NO_PRESSURE_TILT_GAIN;
  }

  const weight = stroke.weight ?? 1;
  return (stroke.width + intensity * PRESSURE_GAIN * velocityFactor) * weight;
}

function applyStrokeStyle(ctx: CanvasRenderingContext2D, stroke: InkStroke, width: number) {
  ctx.globalCompositeOperation = 'source-over';
  ctx.lineWidth = width;
  ctx.strokeStyle = stroke.tool === 'eraser' ? BACKGROUND : stroke.color;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

export function paintSegmentAt(ctx: CanvasRenderingContext2D, stroke: InkStroke, idx: number) {
  const points = stroke.points;
  if (idx < 1 || idx >= points.length) return;
  const prev = points[idx - 1];
  const curr = points[idx];
  applyStrokeStyle(ctx, stroke, computePenWidthAt(stroke, idx));
  ctx.beginPath();
  if (idx === 1) {
    const mid = midpoint(prev, curr);
    ctx.moveTo(prev.x, prev.y);
    ctx.lineTo(mid.x, mid.y);
  } else {
    const prev2 = points[idx - 2];
    const start = midpoint(prev2, prev);
    const end = midpoint(prev, curr);
    ctx.moveTo(start.x, start.y);
    ctx.quadraticCurveTo(prev.x, prev.y, end.x, end.y);
  }
  ctx.stroke();
}

export function paintStrokeTail(ctx: CanvasRenderingContext2D, stroke: InkStroke) {
  const points = stroke.points;
  const n = points.length;
  if (n < 2) return;
  const prev = points[n - 2];
  const last = points[n - 1];
  applyStrokeStyle(ctx, stroke, computePenWidthAt(stroke, n - 1));
  const mid = midpoint(prev, last);
  ctx.beginPath();
  ctx.moveTo(mid.x, mid.y);
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
}

export function paintFullStroke(ctx: CanvasRenderingContext2D, stroke: InkStroke) {
  const points = stroke.points;
  if (points.length === 0) return;
  if (points.length === 1) {
    const only = points[0];
    const pressure = Math.max(0, Math.min(1, only.pressure));
    const weight = stroke.weight ?? 1;
    const width = stroke.tool === 'eraser'
      ? stroke.width
      : (stroke.width + Math.pow(pressure, PRESSURE_GAMMA) * PRESSURE_GAIN) * weight;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = stroke.tool === 'eraser' ? BACKGROUND : stroke.color;
    ctx.beginPath();
    ctx.arc(only.x, only.y, width / 2, 0, Math.PI * 2);
    ctx.fill();
    return;
  }
  for (let i = 1; i < points.length; i += 1) {
    paintSegmentAt(ctx, stroke, i);
  }
  paintStrokeTail(ctx, stroke);
}

export function computeFitTransform(canvasW: number, canvasH: number, doc: DocSize | null) {
  if (!doc || doc.width <= 0 || doc.height <= 0 || canvasW <= 0 || canvasH <= 0) {
    return { scale: 1, offsetX: 0, offsetY: 0 };
  }
  const referenceHeight = Math.min(doc.height, PAPER_HEIGHT);
  const scale = Math.min(canvasW / doc.width, canvasH / referenceHeight);
  const offsetX = (canvasW - doc.width * scale) / 2;
  const offsetY = doc.height <= PAPER_HEIGHT
    ? (canvasH - doc.height * scale) / 2
    : 0;
  return { scale, offsetX, offsetY };
}

export function paintPaperGuidePage(ctx: CanvasRenderingContext2D, width: number, pageTop: number, guide: PaperGuide) {
  if (guide === 'lines') {
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#dbeafe';
    for (let y = pageTop + LINE_SPACING; y < pageTop + PAPER_HEIGHT; y += LINE_SPACING) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
  } else if (guide === 'grid') {
    ctx.lineWidth = 0.5;
    ctx.strokeStyle = '#e5e7eb';
    for (let y = pageTop + GRID_SPACING; y < pageTop + PAPER_HEIGHT; y += GRID_SPACING) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }
    for (let x = GRID_SPACING; x < width; x += GRID_SPACING) {
      ctx.beginPath();
      ctx.moveTo(x, pageTop);
      ctx.lineTo(x, pageTop + PAPER_HEIGHT);
      ctx.stroke();
    }
  }
}

export function paintPaperBackground(ctx: CanvasRenderingContext2D, width: number, height: number, guide: PaperGuide) {
  const pageCount = Math.max(1, Math.ceil(height / PAPER_HEIGHT));
  ctx.fillStyle = BACKGROUND;
  ctx.fillRect(0, 0, width, height);
  for (let p = 0; p < pageCount; p += 1) {
    paintPaperGuidePage(ctx, width, p * PAPER_HEIGHT, guide);
  }
}

export function canvasToDataUrl(
  canvas: HTMLCanvasElement,
  mime = PREVIEW_MIME,
  quality = PREVIEW_QUALITY,
): Promise<string | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob !== 'function') {
      resolve(canvas.toDataURL('image/png'));
      return;
    }
    canvas.toBlob((blob) => {
      if (!blob) {
        resolve(canvas.toDataURL('image/png'));
        return;
      }
      const reader = new FileReader();
      reader.onload = () => resolve(typeof reader.result === 'string' ? reader.result : null);
      reader.onerror = () => resolve(canvas.toDataURL('image/png'));
      reader.readAsDataURL(blob);
    }, mime, quality);
  });
}
