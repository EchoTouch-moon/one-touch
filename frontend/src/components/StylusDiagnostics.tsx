import { useCallback, useMemo, useRef, useState } from 'react';

interface PointerSample {
  ts: number;
  type: string;
  isPrimary: boolean;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  tangentialPressure: number;
  width: number;
  height: number;
  button: number;
  buttons: number;
  coalesced: number;
  predicted: number;
  x: number;
  y: number;
}

interface Capabilities {
  pointerEvent: boolean;
  rawUpdate: boolean;
  coalesced: boolean;
  predicted: boolean;
  maxTouchPoints: number;
  devicePixelRatio: number;
}

function detectCapabilities(): Capabilities {
  if (typeof window === 'undefined') {
    return {
      pointerEvent: false,
      rawUpdate: false,
      coalesced: false,
      predicted: false,
      maxTouchPoints: 0,
      devicePixelRatio: 1,
    };
  }
  const hasPointerEvent = 'PointerEvent' in window;
  const proto = hasPointerEvent
    ? (window.PointerEvent.prototype as unknown as Record<string, unknown>)
    : null;
  return {
    pointerEvent: hasPointerEvent,
    rawUpdate: 'onpointerrawupdate' in window,
    coalesced: !!proto && 'getCoalescedEvents' in proto,
    predicted: !!proto && 'getPredictedEvents' in proto,
    maxTouchPoints: navigator.maxTouchPoints ?? 0,
    devicePixelRatio: window.devicePixelRatio || 1,
  };
}

function sampleFromEvent(event: React.PointerEvent<HTMLDivElement>, rect: DOMRect): PointerSample {
  const native = event.nativeEvent;
  const coalesced =
    typeof native.getCoalescedEvents === 'function' ? native.getCoalescedEvents().length : 0;
  const predicted =
    typeof native.getPredictedEvents === 'function' ? native.getPredictedEvents().length : 0;
  return {
    ts: performance.now(),
    type: event.pointerType,
    isPrimary: event.isPrimary,
    pressure: event.pressure,
    tiltX: event.tiltX,
    tiltY: event.tiltY,
    twist: event.twist,
    tangentialPressure: event.tangentialPressure,
    width: event.width,
    height: event.height,
    button: event.button,
    buttons: event.buttons,
    coalesced,
    predicted,
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  };
}

function formatNumber(value: number, digits = 3) {
  if (!Number.isFinite(value)) return '—';
  return value.toFixed(digits);
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-gray-50 px-3 py-1.5 text-sm last:border-0">
      <span className="text-xs uppercase tracking-wide text-gray-400">{label}</span>
      <span className="font-mono text-gray-800">{value}</span>
    </div>
  );
}

export default function StylusDiagnostics() {
  const padRef = useRef<HTMLDivElement | null>(null);
  const samplesRef = useRef<PointerSample[]>([]);
  const [latest, setLatest] = useState<PointerSample | null>(null);
  const [sampleCount, setSampleCount] = useState(0);
  const [recording, setRecording] = useState(false);
  const [exportText, setExportText] = useState<string | null>(null);
  const [clipboardNote, setClipboardNote] = useState<string | null>(null);

  const capabilities = useMemo(() => detectCapabilities(), []);

  const recordSample = useCallback((sample: PointerSample) => {
    setLatest(sample);
    if (recording) {
      samplesRef.current.push(sample);
      setSampleCount(samplesRef.current.length);
    }
  }, [recording]);

  const handlePointer = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    const pad = padRef.current;
    if (!pad) return;
    const rect = pad.getBoundingClientRect();
    if (event.type === 'pointerdown') {
      try {
        pad.setPointerCapture(event.pointerId);
      } catch {
        // capture is best-effort
      }
    }
    recordSample(sampleFromEvent(event, rect));
  }, [recordSample]);

  const handleClear = useCallback(() => {
    samplesRef.current = [];
    setSampleCount(0);
    setLatest(null);
    setExportText(null);
    setClipboardNote(null);
  }, []);

  const buildPayload = useCallback(() => {
    return JSON.stringify(
      {
        capabilities,
        capturedAt: new Date().toISOString(),
        sampleCount: samplesRef.current.length,
        samples: samplesRef.current,
      },
      null,
      2,
    );
  }, [capabilities]);

  const handleExport = useCallback(() => {
    const json = buildPayload();
    setExportText(json);
    setClipboardNote(null);
    if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(json).then(
        () => setClipboardNote('copied to clipboard'),
        () => setClipboardNote('clipboard blocked — select text below to copy manually'),
      );
    } else {
      setClipboardNote('clipboard unavailable — select text below to copy manually');
    }
  }, [buildPayload]);

  const handleDownload = useCallback(() => {
    const json = buildPayload();
    setExportText(json);
    try {
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `stylus-diagnostics-${Date.now()}.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
      setClipboardNote('download triggered');
    } catch {
      setClipboardNote('download failed — select text below to copy manually');
    }
  }, [buildPayload]);

  const handleToggleRecord = useCallback(() => {
    setRecording((value) => {
      if (!value) {
        samplesRef.current = [];
        setSampleCount(0);
        setExportText(null);
        setClipboardNote(null);
      }
      return !value;
    });
  }, []);

  const handleSelectAll = useCallback((event: React.MouseEvent<HTMLTextAreaElement>) => {
    event.currentTarget.select();
  }, []);

  const buttonsText = latest ? latest.buttons.toString(2).padStart(6, '0') : '—';
  const tiltMagnitude = latest
    ? Math.hypot(latest.tiltX, latest.tiltY).toFixed(1)
    : '—';

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <p className="mb-3 text-xs uppercase tracking-wide text-gray-400">Browser capabilities</p>
        <div className="grid gap-2 text-sm sm:grid-cols-2">
          {[
            ['PointerEvent', capabilities.pointerEvent],
            ['pointerrawupdate', capabilities.rawUpdate],
            ['getCoalescedEvents', capabilities.coalesced],
            ['getPredictedEvents', capabilities.predicted],
          ].map(([label, on]) => (
            <div
              key={label as string}
              className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5"
            >
              <span className="text-gray-600">{label}</span>
              <span className={`font-mono text-xs ${on ? 'text-emerald-600' : 'text-gray-400'}`}>
                {on ? 'available' : 'not detected'}
              </span>
            </div>
          ))}
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5">
            <span className="text-gray-600">maxTouchPoints</span>
            <span className="font-mono text-xs text-gray-700">{capabilities.maxTouchPoints}</span>
          </div>
          <div className="flex items-center justify-between rounded-lg bg-gray-50 px-3 py-1.5">
            <span className="text-gray-600">devicePixelRatio</span>
            <span className="font-mono text-xs text-gray-700">
              {capabilities.devicePixelRatio.toFixed(2)}
            </span>
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="text-xs uppercase tracking-wide text-gray-400">Pointer pad</p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleRecord}
              className={`rounded-md px-2.5 py-1 text-xs font-medium transition ${
                recording
                  ? 'bg-red-100 text-red-700'
                  : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {recording ? `Recording (${sampleCount})` : 'Record'}
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-600 transition hover:bg-gray-200"
            >
              Clear
            </button>
            <button
              type="button"
              onClick={handleExport}
              disabled={sampleCount === 0}
              className="rounded-md bg-gray-900 px-2.5 py-1 text-xs font-medium text-white transition hover:bg-gray-800 disabled:opacity-40"
            >
              Export JSON
            </button>
            <button
              type="button"
              onClick={handleDownload}
              disabled={sampleCount === 0}
              className="rounded-md bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700 transition hover:bg-gray-200 disabled:opacity-40"
            >
              Download
            </button>
          </div>
        </div>
        <div
          ref={padRef}
          onPointerDown={handlePointer}
          onPointerMove={handlePointer}
          onPointerUp={handlePointer}
          onPointerCancel={handlePointer}
          onPointerLeave={handlePointer}
          onContextMenu={(e) => e.preventDefault()}
          className="relative h-44 w-full touch-none select-none rounded-lg border border-dashed border-gray-300 bg-gray-50"
        >
          <p className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-400">
            Tap or write here to read live pointer events
          </p>
          {latest && (
            <div
              className="pointer-events-none absolute h-3 w-3 rounded-full border border-indigo-400 bg-indigo-100"
              style={{
                transform: `translate(${latest.x - 6}px, ${latest.y - 6}px)`,
              }}
            />
          )}
        </div>
        <p className="mt-2 text-[11px] text-gray-400">
          Stylus barrel button typically maps to <code className="rounded bg-gray-100 px-1">buttons = 0b000010</code>.
          Eraser tip on supported pens reports <code className="rounded bg-gray-100 px-1">buttons = 0b100000</code>.
        </p>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white">
        <p className="border-b border-gray-50 px-3 py-2 text-xs uppercase tracking-wide text-gray-400">
          Latest event
        </p>
        {latest ? (
          <div>
            <Row label="pointerType" value={latest.type} />
            <Row label="isPrimary" value={latest.isPrimary ? 'true' : 'false'} />
            <Row label="pressure" value={formatNumber(latest.pressure)} />
            <Row label="tiltX / tiltY" value={`${latest.tiltX.toFixed(1)}° / ${latest.tiltY.toFixed(1)}°`} />
            <Row label="tilt magnitude" value={`${tiltMagnitude}°`} />
            <Row label="twist" value={`${latest.twist.toFixed(1)}°`} />
            <Row label="tangentialPressure" value={formatNumber(latest.tangentialPressure)} />
            <Row label="contact size" value={`${latest.width.toFixed(1)} × ${latest.height.toFixed(1)}`} />
            <Row label="button / buttons" value={`${latest.button} / 0b${buttonsText}`} />
            <Row label="coalesced / predicted" value={`${latest.coalesced} / ${latest.predicted}`} />
            <Row label="position" value={`${latest.x.toFixed(0)}, ${latest.y.toFixed(0)}`} />
          </div>
        ) : (
          <p className="px-3 py-6 text-center text-sm text-gray-400">
            No pointer events yet.
          </p>
        )}
      </div>

      {exportText && (
        <div className="rounded-xl border border-gray-200 bg-white p-4">
          <div className="mb-2 flex items-center justify-between gap-3">
            <p className="text-xs uppercase tracking-wide text-gray-400">Export</p>
            {clipboardNote && (
              <span className="text-[11px] text-gray-500">{clipboardNote}</span>
            )}
          </div>
          <textarea
            readOnly
            value={exportText}
            onClick={handleSelectAll}
            className="block h-40 w-full resize-y rounded-lg border border-gray-200 bg-gray-50 p-2 font-mono text-[11px] text-gray-700"
          />
          <p className="mt-2 text-[11px] text-gray-400">
            Tap the box to select everything, then long-press to copy. The Download button also writes a `.json` file.
          </p>
        </div>
      )}
    </div>
  );
}
