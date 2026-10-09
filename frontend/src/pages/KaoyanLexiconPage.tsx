import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import toast from 'react-hot-toast';

import {
  captureKaoyanWord,
  fetchKaoyanStats,
  fetchKaoyanWords,
  fetchWordSentences,
  type ExamSentenceItem,
  type KaoyanStats,
  type KaoyanWordItem,
} from '../api/kaoyan';

type StatusFilter = 'all' | 'captured' | 'uncaptured';
const PAGE_SIZE = 50;

const STATUS_FILTERS: ReadonlyArray<{ value: StatusFilter; label: string }> = [
  { value: 'all', label: 'All' },
  { value: 'uncaptured', label: 'Not captured' },
  { value: 'captured', label: 'Captured' },
];

function inflections(word: string) {
  const forms = new Set([word]);
  if (word.endsWith('y') && word.length > 3) {
    forms.add(`${word.slice(0, -1)}ies`);
    forms.add(`${word.slice(0, -1)}ied`);
  }
  forms.add(`${word}s`);
  forms.add(`${word}es`);
  forms.add(`${word}ed`);
  forms.add(`${word}ing`);
  return [...forms].join('|');
}

function HighlightedSentence({ text, word }: { text: string; word: string }) {
  const parts = useMemo(() => {
    try {
      return text.split(new RegExp(`\\b(${inflections(word)})\\b`, 'gi'));
    } catch {
      return [text];
    }
  }, [text, word]);
  return (
    <p className="text-meta leading-relaxed text-ink-soft">
      {parts.map((part, i) => (
        <span
          key={i}
          className={part.toLowerCase() === word.toLowerCase() || inflections(word).split('|').includes(part.toLowerCase())
            ? 'rounded-xs bg-brand-wash px-0.5 font-semibold text-brand-deep'
            : ''}
        >
          {part}
        </span>
      ))}
    </p>
  );
}

function WordRow({
  item,
  onCaptured,
}: {
  item: KaoyanWordItem;
  onCaptured: (word: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [sentences, setSentences] = useState<ExamSentenceItem[] | null>(null);
  const [loadingSentences, setLoadingSentences] = useState(false);
  const [justCaptured, setJustCaptured] = useState(false);
  const [sentenceError, setSentenceError] = useState(false);
  const captureLock = useRef(false);
  const [capturing, setCapturing] = useState(false);
  const captured = item.captured || justCaptured;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (next && sentences === null) {
      setLoadingSentences(true);
      setSentenceError(false);
      try {
        const data = await fetchWordSentences(item.word);
        setSentences(data.sentences);
      } catch {
        setSentenceError(true);
      } finally {
        setLoadingSentences(false);
      }
    }
  };

  const capture = async () => {
    if (captureLock.current) return;
    captureLock.current = true;
    setCapturing(true);
    try {
      await captureKaoyanWord(item.word);
      setJustCaptured(true);
      onCaptured(item.word);
      toast.success(`"${item.word}" captured`);
    } catch (err) {
      const status = (err as { response?: { status?: number } })?.response?.status;
      if (status === 409) {
        setJustCaptured(true);
        onCaptured(item.word);
        toast.success(`"${item.word}" already in your library`);
      }
      else toast.error('Failed to capture word');
    } finally {
      captureLock.current = false;
      setCapturing(false);
    }
  };

  return (
    <div>
      <div className="flex items-center gap-3 px-4 py-3.5 transition-colors duration-[var(--dur-quick)] hover:bg-surface-2 sm:px-5">
        <button type="button" onClick={toggle} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
            <span className="word text-title text-ink">{item.word}</span>
            {item.phonetic && <span className="ipa">{item.phonetic}</span>}
          </span>
          <span className="mt-1 line-clamp-2 break-words text-meta text-ink-soft">
            {item.translation.split('\n')[0]}
          </span>
        </button>
        {captured ? (
          <span className="pill pill-good shrink-0">Captured</span>
        ) : (
          <button
            type="button"
            onClick={capture}
            disabled={capturing}
            aria-label={`Capture ${item.word} with definition`}
            className="btn btn-sm btn-ghost shrink-0 border-line hover:border-ink-faint"
          >
            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" aria-hidden="true">
              <path d="M12 5v14M5 12h14" />
            </svg>
            {capturing ? 'Saving…' : 'Capture'}
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t border-line bg-well px-4 py-4 sm:px-5">
          <p className="text-micro text-ink-mute">
            General frequency rank
            {' '}
            <span className="num text-ink-soft">{item.frq || 'Unavailable'}</span>
            <span className="mx-1">{' · '}</span>
            not exam frequency
          </p>

          <div className="space-y-1 text-meta leading-relaxed text-ink-soft">
            {item.translation.split('\n').map((line, i) => (
              <p key={i} className="break-words">{line}</p>
            ))}
          </div>

          <div>
            <p className="eyebrow mb-2">Exam sentences</p>
            {loadingSentences ? (
              <div className="card space-y-2 p-3">
                <div className="skeleton h-5 w-24" />
                <div className="skeleton h-3 w-full" />
                <div className="skeleton h-3 w-5/6" />
              </div>
            ) : sentences && sentences.length > 0 ? (
              <div className="space-y-2">
                {sentences.slice(0, 5).map((sentence) => (
                  <div key={sentence.id} className="card p-3">
                    <div className="mb-2 flex">
                      <span className="pill pill-accent">
                        {sentence.year}
                        {' · '}
                        {sentence.paper}
                      </span>
                    </div>
                    <HighlightedSentence text={sentence.text} word={item.word} />
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-meta text-ink-mute">
                {sentenceError ? 'Could not load sentences. Close and reopen to retry.' : 'No matching sentences in the available exam corpus.'}
              </p>
            )}
          </div>

          {!captured && (
            <button type="button" onClick={capture} disabled={capturing} className="btn btn-primary">
              {capturing ? 'Capturing…' : 'Capture with definition'}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export default function KaoyanLexiconPage() {
  const sequence = useRef(0);
  const [loadError, setLoadError] = useState(false);
  const [stats, setStats] = useState<KaoyanStats | null>(null);
  const [items, setItems] = useState<KaoyanWordItem[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [loading, setLoading] = useState(true);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebounced(query.trim());
      setPage(1);
    }, 250);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query]);

  const load = useCallback(async () => {
    const request = ++sequence.current;
    setLoading(true);
    setLoadError(false);
    try {
      const [wordsRes, statsRes] = await Promise.all([
        fetchKaoyanWords({ page, pageSize: PAGE_SIZE, q: debounced || undefined, status }),
        fetchKaoyanStats(),
      ]);
      if (request !== sequence.current) return;
      const lastPage = Math.max(1, Math.ceil(wordsRes.total / PAGE_SIZE));
      if (page > lastPage) { setPage(lastPage); return; }
      setItems(wordsRes.items);
      setTotal(wordsRes.total);
      setStats(statsRes);
    } catch {
      if (request === sequence.current) setLoadError(true);
    } finally {
      if (request === sequence.current) setLoading(false);
    }
  }, [page, debounced, status]);

  useEffect(() => {
    const timer = setTimeout(() => void load(), 0);
    return () => { clearTimeout(timer); sequence.current += 1; };
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const progress = stats && stats.total > 0 ? Math.round((stats.captured / stats.total) * 100) : 0;

  const onCaptured = useCallback(() => {
    void load();
  }, [load]);

  const pageButtons = useMemo(() => {
    const buttons: (number | '…')[] = [];
    const window = 2;
    for (let i = 1; i <= totalPages; i += 1) {
      if (i === 1 || i === totalPages || Math.abs(i - page) <= window) buttons.push(i);
      else if (buttons.at(-1) !== '…') buttons.push('…');
    }
    return buttons;
  }, [page, totalPages]);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <p className="eyebrow">Kaoyan</p>
          <h1 className="page-title">Kaoyan lexicon</h1>
          <p className="page-lede">
            {stats?.total ?? '—'} words in general frequency order, with English I / II exam
            sentences as evidence.
          </p>
        </div>
        {stats && (
          <div className="min-w-44 shrink-0">
            <div className="flex items-baseline gap-1.5">
              <span className="stat-value">{stats.captured}</span>
              <span className="num text-meta text-ink-mute">/ {stats.total}</span>
            </div>
            <p className="stat-label mt-1">words captured</p>
            <div className="track mt-2">
              <div className="track-fill" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-0 flex-1 basis-56">
          <svg
            width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
            strokeLinecap="round" aria-hidden="true"
            className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
          >
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="Search kaoyan words"
            placeholder="Search word…"
            className="field pl-10"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATUS_FILTERS.map(({ value, label }) => (
            <button
              key={value}
              type="button"
              onClick={() => {
                setStatus(value);
                setPage(1);
              }}
              className={`btn ${status === value ? 'btn-brand' : 'btn-secondary'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {loadError && (
        <p
          role="alert"
          className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-warn/25 bg-warn-wash px-3.5 py-3 text-meta text-warn"
        >
          Could not refresh the lexicon.
          <button
            type="button"
            className="link !text-warn -mx-1 -my-2 inline-flex min-h-11 items-center px-2"
            onClick={() => void load()}
          >
            Retry
          </button>
        </p>
      )}

      {loading ? (
        <>
          <p className="sr-only">Loading…</p>
          <div className="card divide-y divide-line overflow-hidden">
            {Array.from({ length: 6 }, (_, row) => (
              <div key={row} className="flex items-center gap-4 px-4 py-4 sm:px-5">
                <div className="min-w-0 flex-1 space-y-2">
                  <div className="skeleton h-6 w-32" />
                  <div className="skeleton h-3 w-48" />
                </div>
                <div className="skeleton h-11 w-24" />
              </div>
            ))}
          </div>
        </>
      ) : items.length === 0 ? (
        <div className="empty">
          <span className="grid h-11 w-11 place-items-center rounded-full border border-line-strong bg-surface text-ink-mute">
            <svg
              width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7"
              strokeLinecap="round" aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
            </svg>
          </span>
          <p className="text-lead font-semibold text-ink">No words match.</p>
          <p className="max-w-[38ch] text-meta text-ink-mute">
            Try a different spelling, or widen the status filter.
          </p>
        </div>
      ) : (
        <div className="card divide-y divide-line overflow-hidden">
          {items.map((item) => <WordRow key={item.word} item={item} onCaptured={onCaptured} />)}
        </div>
      )}

      <div className="mt-5 flex flex-wrap items-center justify-center gap-1.5">
        <button
          type="button"
          onClick={() => setPage((p) => Math.max(1, p - 1))}
          disabled={page <= 1}
          className="btn btn-ghost"
        >
          Prev
        </button>
        {pageButtons.map((button, i) =>
          button === '…' ? (
            <span key={`gap-${i}`} className="num px-1.5 text-meta text-ink-mute">…</span>
          ) : (
            <button
              key={button}
              type="button"
              onClick={() => setPage(button)}
              className={`btn btn-icon num ${button === page ? 'btn-brand' : 'btn-ghost'}`}
            >
              {button}
            </button>
          ),
        )}
        <button
          type="button"
          onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
          disabled={page >= totalPages}
          className="btn btn-ghost"
        >
          Next
        </button>
      </div>
    </div>
  );
}
