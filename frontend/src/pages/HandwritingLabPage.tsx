import { useMemo, useState } from 'react';

import CanvasPad from '../components/CanvasPad';
import type { CanvasPadMetricSample } from '../components/canvas-pad/metrics';

const scenarios = [
  'Slow Chinese character strokes',
  'Fast English word',
  'Long horizontal line',
  'Curved loop and S shape',
  'Dot tap and short flick',
  'Zoom, pan, then write',
  'Vector eraser over dense strokes',
  'Palm touch while stylus is active',
];

function formatMetric(sample: CanvasPadMetricSample) {
  const pieces = [
    sample.event,
    sample.pointerType,
    sample.coalescedCount !== undefined ? `coalesced ${sample.coalescedCount}` : null,
    sample.predictedCount !== undefined ? `predicted ${sample.predictedCount}` : null,
    sample.queuedPoints !== undefined ? `queued ${sample.queuedPoints}` : null,
    sample.frameMs !== undefined ? `frame ${sample.frameMs.toFixed(1)}ms` : null,
    sample.exportMs !== undefined ? `export ${sample.exportMs.toFixed(1)}ms` : null,
    sample.strokePoints !== undefined ? `points ${sample.strokePoints}` : null,
    sample.strokeCount !== undefined ? `strokes ${sample.strokeCount}` : null,
  ].filter(Boolean);
  return pieces.join(' | ');
}

export default function HandwritingLabPage() {
  const [preview, setPreview] = useState<string | null>(null);
  const [ink, setInk] = useState<string | null>(null);
  const [metrics, setMetrics] = useState<CanvasPadMetricSample[]>([]);

  const summary = useMemo(() => {
    const moves = metrics.filter((item) => item.event === 'pointermove');
    const renders = metrics.filter((item) => item.event === 'render' && item.frameMs !== undefined);
    const exports = metrics.filter((item) => item.event === 'export' && item.exportMs !== undefined);
    const coalesced = moves.reduce((sum, item) => sum + (item.coalescedCount ?? 0), 0);
    const predicted = moves.reduce((sum, item) => sum + (item.predictedCount ?? 0), 0);
    const avgFrame = renders.length
      ? renders.reduce((sum, item) => sum + (item.frameMs ?? 0), 0) / renders.length
      : 0;
    const lastExport = exports.at(-1)?.exportMs ?? 0;
    return { coalesced, predicted, avgFrame, lastExport };
  }, [metrics]);

  return (
    <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Handwriting Lab</h1>
          <p className="mt-1 text-sm text-gray-500">Shared validation surface for CanvasPad rendering experiments.</p>
        </div>
        <button
          type="button"
          onClick={() => setMetrics([])}
          className="rounded-md border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:bg-gray-50"
        >
          Clear metrics
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <section className="min-h-[34rem]">
          <CanvasPad
            value={preview}
            onChange={setPreview}
            inkValue={ink}
            onInkChange={setInk}
            draftKey="handwriting-lab"
            fullHeight
            penOnly={false}
            rebuildPreviewOnLoad
            experimentKind="baseline"
            onMetric={(sample) => setMetrics((items) => [...items.slice(-119), sample])}
          />
        </section>

        <aside className="space-y-3">
          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-gray-800">Scenarios</h2>
            <ol className="mt-2 list-decimal space-y-1 pl-4 text-xs text-gray-600">
              {scenarios.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-[11px] uppercase text-gray-400">Coalesced</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{summary.coalesced}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-[11px] uppercase text-gray-400">Predicted</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{summary.predicted}</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-[11px] uppercase text-gray-400">Avg frame</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{summary.avgFrame.toFixed(1)}ms</p>
            </div>
            <div className="rounded-lg border border-gray-200 bg-white p-3">
              <p className="text-[11px] uppercase text-gray-400">Last export</p>
              <p className="mt-1 text-lg font-semibold text-gray-900">{summary.lastExport.toFixed(1)}ms</p>
            </div>
          </div>

          <div className="rounded-lg border border-gray-200 bg-white p-3">
            <h2 className="text-sm font-semibold text-gray-800">Recent events</h2>
            <div className="mt-2 max-h-64 space-y-1 overflow-auto font-mono text-[11px] text-gray-500">
              {metrics.length === 0 ? (
                <p className="font-sans text-xs text-gray-400">Write in the pad to collect samples.</p>
              ) : metrics.slice().reverse().map((sample, index) => (
                <p key={`${sample.at}-${index}`}>{formatMetric(sample)}</p>
              ))}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}
