import { useEffect, useMemo, useState, useCallback } from 'react';
import { useWordStore } from '../store/wordStore';
import { Link } from 'react-router-dom';
import IcpRecordLink from '../components/IcpRecordLink';

const PAGE_SIZE = 20;
const PAGE_SIZE_OPTIONS = [10, 20, 50];

export default function WordListPage() {
  const { words, total, page, loading, fetchWords, removeWord } = useWordStore();
  const [search, setSearch] = useState('');
  const [pageSize, setPageSize] = useState(PAGE_SIZE);
  const totalPages = useMemo(() => Math.max(1, Math.ceil(total / pageSize)), [total, pageSize]);

  useEffect(() => {
    fetchWords(1, undefined, pageSize);
  }, [fetchWords, pageSize]);

  const handleSearch = useCallback(() => {
    fetchWords(1, search || undefined, pageSize);
  }, [search, fetchWords, pageSize]);

  const handlePageChange = useCallback(
    (nextPage: number) => {
      fetchWords(nextPage, search || undefined, pageSize);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    },
    [fetchWords, search, pageSize],
  );

  const paginationItems = useMemo<(number | 'ellipsis-start' | 'ellipsis-end')[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, index) => index + 1);
    }

    const items: (number | 'ellipsis-start' | 'ellipsis-end')[] = [1];
    const start = Math.max(2, page - 1);
    const end = Math.min(totalPages - 1, page + 1);

    if (start > 2) items.push('ellipsis-start');
    for (let current = start; current <= end; current += 1) items.push(current);
    if (end < totalPages - 1) items.push('ellipsis-end');
    items.push(totalPages);
    return items;
  }, [page, totalPages]);

  const handlePageSizeChange = useCallback(
    (nextPageSize: number) => {
      setPageSize(nextPageSize);
    },
    [],
  );

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === 'Enter') handleSearch();
    },
    [handleSearch],
  );

  return (
    <div className="max-w-5xl mx-auto px-4 py-8 lg:px-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-semibold text-gray-800">Words</h1>
        <span className="text-sm text-gray-400">{total} total</span>
      </div>

      <div className="mb-6 flex flex-wrap gap-2">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Search words..."
          className="min-w-0 flex-1 px-4 py-2 border border-gray-200 rounded-lg
                     focus:border-indigo-400 focus:outline-none"
        />
        <button
          onClick={handleSearch}
          className="px-4 py-2 bg-indigo-500 text-white rounded-lg hover:bg-indigo-600 transition"
        >
          Search
        </button>
        <select
          value={pageSize}
          onChange={(e) => handlePageSizeChange(Number(e.target.value))}
          className="rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm text-gray-600 focus:border-indigo-400 focus:outline-none"
          aria-label="Rows per page"
        >
          {PAGE_SIZE_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {option} / page
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <p className="text-center text-gray-400 py-8">Loading...</p>
      ) : words.length === 0 ? (
        <div className="mx-auto mt-14 max-w-md rounded-xl border border-dashed border-gray-200 bg-white/70 px-6 py-8 text-center">
          <p className="text-sm font-medium text-gray-600">No words yet</p>
          <p className="mt-2 text-sm text-gray-400">Capture your first word, then it will appear here for search and editing.</p>
          <Link
            to="/capture"
            className="mt-5 inline-flex rounded-lg bg-indigo-500 px-4 py-2 text-sm font-medium text-white transition hover:bg-indigo-600"
          >
            Go to Capture
          </Link>
        </div>
      ) : (
        <div className="space-y-2">
          {words.map((word) => (
            <div
              key={word.id}
              className="flex flex-col gap-2 rounded-lg border border-gray-100 bg-white px-4 py-3 transition hover:border-gray-200 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2 sm:gap-3">
                <Link
                  to={`/words/${word.id}`}
                  className="max-w-full truncate text-base font-medium text-gray-800 transition hover:text-indigo-600 sm:text-[15px]"
                >
                  {word.text}
                </Link>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    word.status === 'captured'
                      ? 'bg-yellow-50 text-yellow-600'
                      : word.status === 'enriched'
                        ? 'bg-green-50 text-green-600'
                        : 'bg-blue-50 text-blue-600'
                  }`}
                >
                  {word.status}
                </span>
                <span
                  className={`text-xs px-2 py-0.5 rounded-full ${
                    word.review_ready
                      ? 'bg-indigo-50 text-indigo-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {word.review_ready ? 'review ready' : 'needs definition'}
                </span>
              </div>
              <div className="flex items-center gap-3 sm:justify-end">
                {!word.review_ready && (
                  <Link
                    to={`/words/${word.id}`}
                    className="text-sm font-medium text-indigo-400 transition hover:text-indigo-600"
                  >
                    add definition
                  </Link>
                )}
                <button
                  onClick={() => removeWord(word.id)}
                  className="text-gray-300 hover:text-red-400 transition text-sm"
                >
                  delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {words.length > 0 && (
        <div className="mt-6 border-t border-gray-100 pt-4 text-sm text-gray-500">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <span>
              Page {page} / {totalPages}
            </span>
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={page <= 1 || loading}
                onClick={() => handlePageChange(page - 1)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Prev
              </button>
              <div className="flex items-center gap-1">
                {paginationItems.map((item) =>
                  typeof item === 'number' ? (
                    <button
                      key={item}
                      type="button"
                      disabled={loading}
                      onClick={() => handlePageChange(item)}
                      className={`min-w-9 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
                        item === page
                          ? 'border-indigo-500 bg-indigo-500 text-white'
                          : 'border-gray-200 text-gray-600 hover:border-gray-300 hover:text-gray-800'
                      } disabled:cursor-not-allowed disabled:opacity-40`}
                    >
                      {item}
                    </button>
                  ) : (
                    <span key={item} className="px-2 text-gray-300">
                      ...
                    </span>
                  ),
                )}
              </div>
              <button
                type="button"
                disabled={page >= totalPages || loading}
                onClick={() => handlePageChange(page + 1)}
                className="rounded-lg border border-gray-200 px-3 py-1.5 text-sm font-medium text-gray-600 transition hover:border-gray-300 hover:text-gray-800 disabled:cursor-not-allowed disabled:opacity-40"
              >
                Next
              </button>
            </div>
          </div>
        </div>
      )}

      <div className="mt-8 pb-6 text-center text-[10px] text-gray-300">
        <IcpRecordLink className="transition hover:text-gray-500" />
      </div>
    </div>
  );
}
