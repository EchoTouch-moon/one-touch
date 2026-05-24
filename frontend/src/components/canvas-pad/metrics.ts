export type CanvasPadExperimentKind =
  | 'baseline'
  | 'native-raf'
  | 'perfect-freehand'
  | 'ipad-prediction';

export interface CanvasPadMetricSample {
  kind: CanvasPadExperimentKind;
  event: 'pointerdown' | 'pointermove' | 'pointerup' | 'render' | 'export';
  pointerType?: string;
  coalescedCount?: number;
  predictedCount?: number;
  queuedPoints?: number;
  frameMs?: number;
  exportMs?: number;
  strokePoints?: number;
  strokeCount?: number;
  note?: string;
  at: number;
}
