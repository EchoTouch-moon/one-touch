import type { DocSize, PaperGuide, Viewport } from './types';

export const BACKGROUND = '#ffffff';
export const MAX_EXPORT_EDGE = 1600;
export const PREVIEW_MIME = 'image/webp';
export const PREVIEW_QUALITY = 0.82;
export const PREVIEW_DEBOUNCE_MS = 250;
export const PEN_WIDTH = 1.0;
export const ERASER_WIDTH = 28;
export const ERASER_RADIUS = ERASER_WIDTH / 2;

export const PRESSURE_GAMMA = 0.5;
export const PRESSURE_GAIN = 4.5;
export const PRESSURE_SMOOTH_WINDOW = 5;
export const PRESSURE_REFERENCE = 0.7;
export const VELOCITY_MIN = 0.3;
export const VELOCITY_MAX = 2.5;
export const VELOCITY_MAX_DECAY = 0.55;
export const TILT_REF_DEG = 60;
export const NO_PRESSURE_BASE = 0.15;
export const NO_PRESSURE_SLOW_GAIN = 0.4;
export const NO_PRESSURE_TILT_GAIN = 0.15;
export const PRESSURE_TILT_BLEND = 0.1;

export const PEN_WEIGHTS = [0.4, 0.7, 1.0] as const;
export const PEN_WEIGHT_LABELS = ['fine', 'standard', 'bold'] as const;
export const PEN_WEIGHT_STORAGE_KEY = 'glm-words-pen-weight';

export const MIN_ZOOM = 0.5;
export const MAX_ZOOM = 4;
export const INITIAL_VIEWPORT: Viewport = { zoom: 1, panX: 0, panY: 0 };

export const PAPER_WIDTH = 600;
export const PAPER_HEIGHT = 800;
export const DEFAULT_PAPER: DocSize = { width: PAPER_WIDTH, height: PAPER_HEIGHT };

export const PAPER_GUIDE_KEY = 'glm-words-paper-guide';
export const PAPER_GUIDE_OPTIONS: readonly PaperGuide[] = ['plain', 'lines', 'grid'];
export const LINE_SPACING = 50;
export const GRID_SPACING = 40;

export const INK_VERSION = 3;
