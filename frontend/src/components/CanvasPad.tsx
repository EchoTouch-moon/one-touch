import { useMemo } from 'react';

import { PEN_WEIGHT_LABELS, PEN_WEIGHTS } from './canvas-pad/constants';
import type { CanvasPadExperimentKind, CanvasPadMetricSample } from './canvas-pad/metrics';
import { useCanvasPadController } from './canvas-pad/useCanvasPadController';

interface CanvasPadProps {
  value: string | null;
  onChange: (value: string | null) => void;
  inkValue?: string | null;
  onInkChange?: (value: string | null) => void;
  className?: string;
  compact?: boolean;
  fullHeight?: boolean;
  resetKey?: string | number;
  draftKey?: string | null;
  penOnly?: boolean;
  rebuildPreviewOnLoad?: boolean;
  experimentKind?: CanvasPadExperimentKind;
  onMetric?: (sample: CanvasPadMetricSample) => void;
}

export default function CanvasPad({
  value,
  onChange,
  inkValue = null,
  onInkChange,
  className = '',
  compact = false,
  fullHeight = false,
  resetKey = 0,
  draftKey = null,
  penOnly = true,
  rebuildPreviewOnLoad = false,
  experimentKind = 'baseline',
  onMetric,
}: CanvasPadProps) {
  const {
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
  } = useCanvasPadController({
    value,
    onChange,
    inkValue,
    onInkChange,
    draftKey,
    penOnly,
    rebuildPreviewOnLoad,
    resetKey,
    experimentKind,
    onMetric,
  });

  const heightClass = useMemo(
    () => (fullHeight ? 'h-full min-h-0 flex-1' : compact ? 'h-44 sm:h-52' : 'h-[calc(100dvh-13.5rem)] min-h-[28rem]'),
    [compact, fullHeight],
  );

  return (
    <div className={`rounded-xl border border-gray-200 bg-white ${fullHeight ? 'flex h-full min-h-0 flex-col' : ''} ${className}`}>
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-100 px-3 py-2">
        <div className="flex items-center gap-2">
          <span className="text-xs font-medium text-gray-400">{inputLabel}</span>
          {Math.abs(viewport.zoom - 1) > 0.01 && (
            <button
              type="button"
              onClick={resetViewport}
              className="rounded-md bg-gray-100 px-2 py-0.5 font-mono text-[11px] text-gray-600 transition hover:bg-gray-200"
              title="Reset zoom"
            >
              {Math.round(viewport.zoom * 100)}%
            </button>
          )}
        </div>
        <div className="flex flex-wrap items-center justify-end gap-1">
          {penOnly && (
            <button
              type="button"
              onClick={() => setAcceptTouch((enabled) => !enabled)}
              className={`rounded-md px-2 py-1 text-xs font-medium transition ${
                acceptTouch ? 'bg-amber-100 text-amber-700' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
              }`}
            >
              Touch
            </button>
          )}
          <button
            type="button"
            onClick={() => setTool('pen')}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              tool === 'pen' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            Pen
          </button>
          <div className="ml-0.5 flex items-center gap-0.5 rounded-md border border-gray-200 px-1 py-0.5">
            {PEN_WEIGHTS.map((w, i) => {
              const active = tool === 'pen' && Math.abs(penWeight - w) < 0.01;
              const dotSize = 4 + i * 3;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => { setPenWeight(w); setTool('pen'); }}
                  title={`Pen ${PEN_WEIGHT_LABELS[i]}`}
                  className={`flex h-6 w-6 items-center justify-center rounded transition ${
                    active ? 'bg-gray-900' : 'hover:bg-gray-100'
                  }`}
                >
                  <span
                    className={`block rounded-full ${active ? 'bg-white' : 'bg-gray-400'}`}
                    style={{ width: dotSize, height: dotSize }}
                  />
                </button>
              );
            })}
          </div>
          <button
            type="button"
            onClick={() => setTool('eraser')}
            className={`rounded-md px-2 py-1 text-xs font-medium transition ${
              tool === 'eraser' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            Eraser
          </button>
          <button
            type="button"
            onClick={handleUndo}
            disabled={history.length === 0}
            className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-35"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={handleRedo}
            disabled={undone.length === 0}
            className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800 disabled:opacity-35"
          >
            Redo
          </button>
          <button
            type="button"
            onClick={cyclePaperGuide}
            title={`Paper: ${paperGuide}`}
            className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            {paperGuide === 'plain' ? 'Plain' : paperGuide === 'lines' ? 'Lines' : 'Grid'}
          </button>
          <button
            type="button"
            onClick={handleAddPage}
            title="Add page below"
            className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            + Page
          </button>
          <button
            type="button"
            onClick={handleClear}
            className="rounded-md px-2 py-1 text-xs font-medium text-gray-500 transition hover:bg-gray-100 hover:text-gray-800"
          >
            Clear
          </button>
        </div>
      </div>
      <canvas
        ref={canvasRef}
        className={`block w-full ${heightClass} touch-none rounded-b-xl bg-white`}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        onPointerLeave={handlePointerUp}
      />
    </div>
  );
}
