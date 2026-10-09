import { getCurrentUserId } from '../api/authSession';
import { useMemo } from 'react';

import { PEN_WEIGHT_LABELS, PEN_WEIGHTS } from './canvas-pad/constants';
import type { CanvasPadExperimentKind, CanvasPadMetricSample } from './canvas-pad/metrics';
import type { StrokeRendererKind } from './canvas-pad/strokeRenderer';
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
  renderer?: StrokeRendererKind;
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
  renderer = 'outline',
  onMetric,
}: CanvasPadProps) {
  const {
    acceptTouch,
    baseCanvasRef,
    canvasRef,
    cyclePaperGuide,
    handleAddPage,
    handleClear,
    handleContextMenu,
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
    draftKey: draftKey ? `user-${getCurrentUserId()}:${draftKey}` : null,
    penOnly,
    rebuildPreviewOnLoad,
    resetKey,
    experimentKind,
    renderer,
    onMetric,
  });

  const heightClass = useMemo(
    () => (fullHeight ? 'h-full min-h-0 flex-1' : compact ? 'h-44 sm:h-52' : 'h-[calc(100dvh-13.5rem)] min-h-[28rem]'),
    [compact, fullHeight],
  );

  // Every tool in the bar is a button from the shared vocabulary, so it inherits
  // the same press feedback, focus ring and coarse-pointer sizing as the rest of
  // the app rather than inventing its own.
  const toolButton = (active: boolean) =>
    `btn btn-sm ${active ? 'btn-primary' : 'btn-ghost'} !min-w-9 !px-2.5`;

  return (
    <div className={`card overflow-hidden ${fullHeight ? 'flex min-h-0 w-full flex-1 flex-col' : ''} ${className}`}>
      {/* Ordered by editing frequency: undo/redo → tools → paper → destructive */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-surface-2 px-2 py-1.5">
        <div className="flex items-center gap-1.5">
          {penOnly ? (
            <button
              type="button"
              onClick={() => setAcceptTouch((enabled) => !enabled)}
              title={`${inputLabel}. Toggle finger drawing`}
              className={`btn btn-sm ${acceptTouch ? 'btn-primary' : 'btn-ghost'}`}
            >
              {acceptTouch ? 'Finger on' : 'Pen only'}
            </button>
          ) : (
            <span className="px-2 text-micro font-medium text-ink-mute">{inputLabel}</span>
          )}
          {Math.abs(viewport.zoom - 1) > 0.01 && (
            <button
              type="button"
              onClick={resetViewport}
              title="Reset zoom"
              className="btn btn-sm btn-ghost num"
            >
              {Math.round(viewport.zoom * 100)}%
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-end gap-1">
          <button type="button" onClick={handleUndo} disabled={history.length === 0} className={toolButton(false)}>
            Undo
          </button>
          <button type="button" onClick={handleRedo} disabled={undone.length === 0} className={toolButton(false)}>
            Redo
          </button>

          <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />

          <button type="button" onClick={() => setTool('pen')} aria-pressed={tool === 'pen'} className={toolButton(tool === 'pen')}>
            Pen
          </button>
          <div className="flex items-center gap-0.5 rounded-md border border-line bg-surface px-1 py-0.5">
            {PEN_WEIGHTS.map((w, i) => {
              const active = tool === 'pen' && Math.abs(penWeight - w) < 0.01;
              const dotSize = 4 + i * 3;
              return (
                <button
                  key={w}
                  type="button"
                  onClick={() => { setPenWeight(w); setTool('pen'); }}
                  title={`Pen ${PEN_WEIGHT_LABELS[i]}`}
                  aria-label={`Pen weight ${PEN_WEIGHT_LABELS[i]}`}
                  aria-pressed={active}
                  className={`grid h-9 min-w-9 place-items-center rounded-sm transition ${active ? 'bg-ink' : 'hover:bg-well'}`}
                >
                  <span
                    className={`block rounded-full ${active ? 'bg-[#f7f4ee]' : 'bg-ink-faint'}`}
                    style={{ width: dotSize, height: dotSize }}
                  />
                </button>
              );
            })}
          </div>
          <button type="button" onClick={() => setTool('eraser')} aria-pressed={tool === 'eraser'} className={toolButton(tool === 'eraser')}>
            Eraser
          </button>

          <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />

          <button type="button" onClick={cyclePaperGuide} title={`Paper: ${paperGuide}`} className={toolButton(false)}>
            {paperGuide === 'plain' ? 'Plain' : paperGuide === 'lines' ? 'Lines' : 'Grid'}
          </button>
          <button type="button" onClick={handleAddPage} title="Add page below" className={toolButton(false)}>
            + Page
          </button>

          <span className="mx-1 h-5 w-px bg-line" aria-hidden="true" />

          <button type="button" onClick={handleClear} className="btn btn-sm btn-danger">
            Clear
          </button>
        </div>
      </div>

      <div className={`relative ${heightClass}`}>
        <canvas
          ref={baseCanvasRef}
          className="absolute inset-0 block h-full w-full"
          /* The element's own backdrop, visible only while the canvas paints;
             the drawing surface itself keeps its own paper palette because the
             exported image must match exactly what was written. */
          style={{ backgroundColor: 'var(--color-surface)' }}
        />
        <canvas
          ref={canvasRef}
          className="relative block h-full w-full touch-none"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          onPointerLeave={handlePointerUp}
          onContextMenu={handleContextMenu}
        />
      </div>
    </div>
  );
}