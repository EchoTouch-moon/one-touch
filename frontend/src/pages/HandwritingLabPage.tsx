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
  const [renderer, setRenderer] = useState<'outline' | 'legacy'>('outline');

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
    <div className="page max-w-6xl space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="eyebrow">Internal tool</p>
          <h1 className="page-title mt-1.5">Handwriting Lab</h1>
          <p className="page-lede mt-1.5">Shared validation surface for CanvasPad rendering experiments.</p>
        </div>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 rounded-md bg-well p-1" role="tablist" aria-label="Stroke renderer">
            {(['outline', 'legacy'] as const).map((kind) => (
              <button
                key={kind}
                type="button"
                onClick={() => setRenderer(kind)}
                role="tab"
                aria-selected={renderer === kind}
                className={`btn btn-sm ${renderer === kind ? 'btn-primary' : 'btn-ghost'}`}
              >
                {kind === 'outline' ? 'Outline (new)' : 'Legacy'}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setMetrics([])}
            className="btn btn-sm btn-secondary"
          >
            Clear metrics
          </button>
        </div>
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
            renderer={renderer}
            onMetric={(sample) => setMetrics((items) => [...items.slice(-119), sample])}
          />
        </section>

        <aside className="space-y-3">
          <div className="card p-4">
            <h2 className="text-meta font-semibold text-ink">Scenarios</h2>
            <ol className="mt-2.5 list-decimal space-y-1 pl-4 text-micro text-ink-soft">
              {scenarios.map((item) => <li key={item}>{item}</li>)}
            </ol>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <div className="card p-4">
              <p className="eyebrow">Coalesced</p>
              <p className="stat-value mt-2 text-xl">{summary.coalesced}</p>
            </div>
            <div className="card p-4">
              <p className="eyebrow">Predicted</p>
              <p className="stat-value mt-2 text-xl">{summary.predicted}</p>
            </div>
            <div className="card p-4">
              <p className="eyebrow">Avg frame</p>
              <p className="stat-value mt-2 text-xl">{summary.avgFrame.toFixed(1)}ms</p>
            </div>
            <div className="card p-4">
              <p className="eyebrow">Last export</p>
              <p className="stat-value mt-2 text-xl">{summary.lastExport.toFixed(1)}ms</p>
            </div>
          </div>

          <div className="card p-4">
            <h2 className="text-meta font-semibold text-ink">Recent events</h2>
            <div className="mt-2.5 max-h-64 space-y-1 overflow-auto font-mono text-micro text-ink-mute">
              {metrics.length === 0 ? (
                <p className="font-sans text-micro text-ink-mute">Write in the pad to collect samples.</p>
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
