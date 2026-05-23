export type DrawingTool = 'pen' | 'eraser';

export type Point = {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  t: number;
};

export interface StrokeBounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export interface InkStroke {
  id: string;
  tool: DrawingTool;
  color: string;
  width: number;
  weight?: number;
  bounds?: StrokeBounds;
  pointerType: string;
  points: Point[];
}

export type InkVersion = 1 | 2 | 3;

export type PaperGuide = 'plain' | 'lines' | 'grid';

export interface InkDocument {
  version: InkVersion;
  background: string;
  backgroundImage?: string | null;
  paperGuide?: PaperGuide;
  width: number;
  height: number;
  strokes: InkStroke[];
}

export interface DocSize {
  width: number;
  height: number;
}

export interface ParsedInk {
  doc: InkDocument;
}

export interface RemovedStroke {
  stroke: InkStroke;
  index: number;
}

export type HistoryAction =
  | { type: 'add'; stroke: InkStroke }
  | { type: 'remove'; removed: RemovedStroke[] };

export interface Viewport {
  zoom: number;
  panX: number;
  panY: number;
}

export interface InkDraftRecord {
  key: string;
  inkData: string | null;
  preview: string | null;
  updatedAt: string;
  strokeCount: number;
}
