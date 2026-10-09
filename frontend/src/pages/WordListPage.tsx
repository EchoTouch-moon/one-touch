import { useEffect, useCallback, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { useWordStore } from '../store/wordStore';
import { getCurrentUserId } from '../api/authSession';

const PAGE_SIZES = [10, 20, 50];

export default function WordListPage() {
  const { words, total, loading, error, fetchWords, removeWord } = useWordStore();
  const [params, setParams] = useSearchParams();
  const search = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page')) || 1);
  const pageSize = PAGE_SIZES.includes(Number(params.get('size'))) ? Number(params.get('size')) : 20;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const input = useRef<HTMLInputElement>(null);
  const scrollKey = `words-scroll:${getCurrentUserId()}:${params.toString()}`;

  const change = (updates: Record<string, string>) => setParams((previous) => {
    const next = new URLSearchParams(previous);
    Object.entries(updates).forEach(([key, value]) => (value ? next.set(key, value) : next.delete(key)));
    return next;
  }, { replace: true });

  const load = useCallback(() => void fetchWords(page, search || undefined, pageSize), [fetchWords, page, search, pageSize]);

  useEffect(() => {
    const timer = window.setTimeout(load, 250);
    return () => window.clearTimeout(timer);
  }, [load]);

  useEffect(() => {
    if (loading) return;
    const frame = requestAnimationFrame(() => window.scrollTo(0, Number(sessionStorage.getItem(scrollKey)) || 0));
    return () => cancelAnimationFrame(frame);
  }, [loading, scrollKey]);

  // `/` jumps to search, the way a reference tool should.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.ctrlKey || event.metaKey || event.altKey) return;
      if ((event.target as HTMLElement)?.closest('input,textarea,select,[contenteditable="true"],[role="dialog"]')) return;
      event.preventDefault();
      input.current?.focus();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const firstOnPage = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const lastOnPage = Math.min(page * pageSize, total);

  return (
    <div className="page">
      <div className="page-head">
        <div className="page-head-text">
          <p className="eyebrow">Library</p>
          <h1 className="page-title">Words</h1>
          <p className="page-lede">
            Everything you have captured. A card becomes reviewable once it carries a definition.
          </p>
        </div>
        <p className="num shrink-0 text-meta text-ink-mute">
          <span className="text-title font-semibold text-ink">{total}</span> total
        </p>
      </div>

      <form
        className="mb-4 flex max-w-[30rem] gap-2"
        role="search"
        onSubmit={(event) => { event.preventDefault(); load(); }}
      >
        <div className="relative min-w-0 flex-1">
          <svg
            width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9"
            strokeLinecap="round" className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-faint"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={input}
            aria-label="Search your words"
            value={search}
            onChange={(event) => change({ q: event.target.value, page: '1' })}
            placeholder="Search words…"
            className="field pl-10 pr-16"
          />
          {!search && (
            <span className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 items-center gap-1 text-micro text-ink-mute sm:flex">
              <kbd className="kbd">/</kbd> to focus
            </span>
          )}
          {search && (
            <button
              type="button"
              onClick={() => { change({ q: '', page: '1' }); input.current?.focus(); }}
              aria-label="Clear search"
              className="absolute right-1.5 top-1/2 grid h-9 w-9 -translate-y-1/2 place-items-center rounded-sm text-ink-mute transition hover:bg-well hover:text-ink"
            >
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </button>
          )}
        </div>
      </form>

      {error && (
        <p role="alert" className="mb-4 flex flex-wrap items-center gap-2 rounded-md border border-bad/25 bg-bad-wash px-3.5 py-3 text-meta text-bad">
          {error}.
          <button type="button" className="link !text-bad" onClick={load}>Retry</button>
        </p>
      )}

      {loading && words.length === 0 ? (
        <div className="card divide-y divide-line overflow-hidden" aria-busy="true">
          {Array.from({ length: 6 }, (_, row) => (
            <div key={row} className="flex items-center gap-4 px-4 py-4 sm:px-5">
              <div className="min-w-0 flex-1 space-y-2">
                <div className="skeleton h-5 w-32" />
                <div className="skeleton h-3 w-40" />
              </div>
              <div className="skeleton h-8 w-8 rounded-md" />
            </div>
          ))}
        </div>
      ) : words.length === 0 ? (
        <div className="empty">
          <span className="grid h-11 w-11 place-items-center rounded-full border border-line-strong bg-surface text-ink-mute">
            <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
              <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
            </svg>
          </span>
          <p className="text-lead font-semibold text-ink">
            {search ? 'No matches' : error ? 'Words are unavailable' : 'Your library is empty'}
          </p>
          <p className="max-w-[38ch] text-meta text-ink-mute">
            {search
              ? `Nothing in your library matches “${search}”.`
              : error
                ? 'Reconnect and try again — nothing has been lost.'
                : 'Capture your first word and write its meaning by hand.'}
          </p>
          {search ? (
            <button type="button" className="btn btn-secondary btn-sm mt-1" onClick={() => change({ q: '', page: '1' })}>
              Clear search
            </button>
          ) : !error && (
            <Link to="/capture" className="btn btn-primary btn-sm mt-1">Capture a word</Link>
          )}
        </div>
      ) : (
        <ul className="card divide-y divide-line overflow-hidden">
          {words.map((word) => (
            <li
              key={word.id}
              className="group flex items-center gap-1 px-4 transition-colors duration-[var(--dur-quick)] hover:bg-surface-2 sm:px-5"
            >
              <Link
                to={`/words/${word.id}`}
                onClick={() => sessionStorage.setItem(scrollKey, String(window.scrollY))}
                className="flex min-w-0 flex-1 items-center gap-4 py-3.5"
              >
                <span className="min-w-0 flex-1">
                  <span className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                    <span className="word text-title text-ink transition-colors duration-[var(--dur-quick)] group-hover:text-brand-deep">
                      {word.text}
                    </span>
                    {word.phonetic && <span className="ipa truncate">{word.phonetic}</span>}
                  </span>
                  <span className="mt-1.5 block">
                    <span className={word.review_ready ? 'pill pill-good' : 'pill pill-warn'}>
                      {word.review_ready ? 'Ready to review' : 'Needs a definition'}
                    </span>
                  </span>
                </span>

                {/* Right-aligned so the row has two edges instead of one and a void. */}
                <span className="num hidden shrink-0 text-micro text-ink-mute sm:block">
                  {word.definition_count} {word.definition_count === 1 ? 'definition' : 'definitions'}
                </span>
              </Link>

              <Menu as="div" className="shrink-0">
                <MenuButton
                  aria-label={`Actions for ${word.text}`}
                  className="grid h-11 w-11 place-items-center rounded-sm text-ink-mute opacity-60 transition hover:bg-well hover:text-ink focus-visible:opacity-100 group-hover:opacity-100"
                >
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                    <circle cx="12" cy="5" r="1.6" /><circle cx="12" cy="12" r="1.6" /><circle cx="12" cy="19" r="1.6" />
                  </svg>
                </MenuButton>
                <MenuItems
                  transition
                  anchor="bottom end"
                  className="z-50 w-44 origin-top-right rounded-md border border-line bg-surface p-1 shadow-lift transition duration-150 ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
                >
                  <MenuItem>
                    <Link
                      to={`/words/${word.id}`}
                      className="flex w-full items-center rounded-sm px-3 py-2 text-left text-meta text-ink-soft transition data-[focus]:bg-well data-[focus]:text-ink"
                    >
                      Open card
                    </Link>
                  </MenuItem>
                  <MenuItem>
                    <button
                      type="button"
                      onClick={async () => {
                        if (!window.confirm(`Delete "${word.text}" and its definitions and review history? This cannot be undone.`)) return;
                        if (!await removeWord(word.id)) return;
                        const target = Math.min(page, Math.max(1, Math.ceil(useWordStore.getState().total / pageSize)));
                        if (target !== page) change({ page: String(target) }); else load();
                      }}
                      className="flex w-full items-center rounded-sm px-3 py-2 text-left text-meta text-bad transition data-[focus]:bg-bad-wash"
                    >
                      Delete word
                    </button>
                  </MenuItem>
                </MenuItems>
              </Menu>
            </li>
          ))}
        </ul>
      )}

      {words.length > 0 && (
        <div className="mt-5 flex flex-wrap items-center justify-between gap-3">
          <label className="flex items-center gap-2 text-micro text-ink-mute">
            Rows
            <select
              aria-label="Rows per page"
              value={pageSize}
              onChange={(event) => change({ size: event.target.value, page: '1' })}
              className="field !w-auto !py-1.5 !pl-2.5 !pr-8 !text-micro"
            >
              {PAGE_SIZES.map((size) => <option key={size} value={size}>{size}</option>)}
            </select>
          </label>

          <div className="flex items-center gap-3">
            <span className="num text-micro text-ink-mute">{firstOnPage}–{lastOnPage} of {total}</span>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => change({ page: String(page - 1) })}
                className="btn btn-secondary btn-sm"
              >
                Prev
              </button>
              <span className="num px-1.5 text-micro text-ink-soft" aria-live="polite">{page} / {pages}</span>
              <button
                type="button"
                disabled={page >= pages || loading}
                onClick={() => change({ page: String(page + 1) })}
                className="btn btn-secondary btn-sm"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
