import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { BrowserRouter, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import AuthGate from './components/AuthGate';
import ErrorReporter from './components/ErrorReporter';
import FeedbackDialog from './components/FeedbackDialog';
import IcpRecordLink from './components/IcpRecordLink';
import UpdatePrompt from './components/UpdatePrompt';
import { useAuthStore } from './store/authStore';
import { useReviewStore } from './store/reviewStore';

const QuickCapturePage = lazy(() => import('./pages/QuickCapturePage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const WordListPage = lazy(() => import('./pages/WordListPage'));
const WordDetailPage = lazy(() => import('./pages/WordDetailPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const HandwritingLabPage = lazy(() => import('./pages/HandwritingLabPage'));

const navItems = [
  { to: '/capture', label: 'Capture' },
  { to: '/review', label: 'Review' },
  { to: '/words', label: 'Words' },
  { to: '/settings', label: 'Settings' },
];

const APP_NAME = '一触';

const navIcons: Record<string, ReactNode> = {
  capture: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 1 1 3 3L7 19l-4 1 1-4L16.5 3.5z" />
    </svg>
  ),
  review: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="3" width="20" height="18" rx="2" /><path d="M2 9h20" /><path d="M9 17H7" />
    </svg>
  ),
  words: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
    </svg>
  ),
  settings: (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
    </svg>
  ),
};

function DefaultRoute() {
  const prefersReview = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  return <Navigate to={prefersReview ? '/review' : '/capture'} replace />;
}

function RouteLoadingFallback() {
  const path = window.location.pathname;

  if (path.startsWith('/review')) {
    return (
      <div className="flex min-h-[calc(100dvh-3rem)] flex-col items-center px-3 py-3 sm:min-h-[calc(100dvh-3.5rem)] sm:px-4 sm:py-8">
        <div className="mb-3 flex w-full max-w-md items-center justify-between gap-3 sm:mb-4">
          <div className="h-4 w-14 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-28 animate-pulse rounded bg-gray-100" />
          <div className="h-4 w-12 animate-pulse rounded bg-gray-100" />
        </div>
        <div className="mb-8 h-1.5 w-full max-w-md overflow-hidden rounded-full bg-gray-100" />
        <div className="mt-10 aspect-[3/4] w-full max-w-[20rem] animate-pulse rounded-[1.35rem] border border-gray-100 bg-white shadow-[0_22px_70px_rgba(15,23,42,0.08)]" />
      </div>
    );
  }

  if (path.startsWith('/settings')) {
    return (
      <div className="mx-auto max-w-4xl px-4 py-8">
        <div className="mb-6">
          <div className="h-8 w-28 animate-pulse rounded bg-gray-100" />
          <div className="mt-3 h-4 w-64 max-w-full animate-pulse rounded bg-gray-100" />
        </div>
        <div className="grid gap-3 sm:grid-cols-4">
          {[0, 1, 2, 3].map((item) => (
            <div key={item} className="rounded-xl border border-gray-200 bg-white p-4">
              <div className="h-3 w-20 animate-pulse rounded bg-gray-100" />
              <div className="mt-4 h-7 w-12 animate-pulse rounded bg-gray-100" />
            </div>
          ))}
        </div>
        <div className="mt-8 rounded-xl border border-gray-200 bg-white p-4">
          <div className="h-28 animate-pulse rounded-lg bg-gray-50" />
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-8">
      <div className="h-7 w-32 animate-pulse rounded bg-gray-100" />
      <div className="mt-4 space-y-3">
        {[0, 1, 2].map((item) => (
          <div key={item} className="h-16 animate-pulse rounded-xl border border-gray-200 bg-white" />
        ))}
      </div>
    </div>
  );
}

function AppShell() {
  const { username, token, logout } = useAuthStore();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const startReviewSession = useReviewStore((s) => s.startSession);
  const location = useLocation();

  useEffect(() => {
    if (!token) return;

    const warmReview = () => {
      void import('./pages/ReviewPage');
      void startReviewSession();
    };

    const requestIdle = window.requestIdleCallback;
    const cancelIdle = window.cancelIdleCallback;
    if (requestIdle && cancelIdle) {
      const id = requestIdle(warmReview, { timeout: 2500 });
      return () => cancelIdle(id);
    }

    const timer = window.setTimeout(warmReview, 1500);
    return () => window.clearTimeout(timer);
  }, [startReviewSession, token]);

  return (
    <AuthGate>
      <ErrorReporter />
      <UpdatePrompt />
      <Toaster position="top-center" />
      <div className="min-h-dvh bg-gray-50 overscroll-x-contain">
          <nav className="bg-white border-b border-gray-100">
            <div className="max-w-4xl mx-auto px-3 sm:px-4 flex items-center h-12 sm:h-14 gap-3 sm:gap-6">
              <div className="flex items-center gap-1.5 whitespace-nowrap">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="text-indigo-600">
                  <circle cx="12" cy="12" r="3" fill="currentColor" />
                  <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.5" opacity="0.35" />
                  <circle cx="12" cy="12" r="10.5" stroke="currentColor" strokeWidth="1" opacity="0.15" />
                </svg>
                <span className="font-bold text-gray-800 text-sm sm:text-lg tracking-wide">{APP_NAME}</span>
              </div>
              <div className="hidden gap-2 sm:flex sm:gap-4">
                {navItems.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    className={({ isActive }) =>
                      `text-xs sm:text-sm font-medium transition ${
                        isActive ? 'text-indigo-600' : 'text-gray-500 hover:text-gray-700'
                      }`
                    }
                  >
                    {item.label}
                  </NavLink>
                ))}
              </div>
              <div className="ml-auto flex items-center gap-3 text-xs text-gray-400">
                <span className="hidden sm:inline truncate max-w-32">{username}</span>
                <button
                  type="button"
                  onClick={() => setFeedbackOpen(true)}
                  className="font-medium text-gray-500 transition hover:text-gray-800"
                >
                  Feedback
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="font-medium text-gray-500 hover:text-gray-800 transition"
                >
                  Log out
                </button>
              </div>
            </div>
          </nav>

          <main className="pb-24 sm:pb-8">
            <Suspense fallback={<RouteLoadingFallback />}>
              <Routes>
                <Route path="/" element={<DefaultRoute />} />
                <Route path="/capture" element={<QuickCapturePage />} />
                <Route path="/review" element={<ReviewPage />} />
                <Route path="/words" element={<WordListPage />} />
                <Route path="/words/:id" element={<WordDetailPage />} />
                <Route path="/settings" element={<SettingsPage />} />
                <Route path="/handwriting-lab" element={<HandwritingLabPage />} />
              </Routes>
            </Suspense>
          </main>

          {location.pathname !== '/words' && (
            <footer className="fixed inset-x-0 bottom-[4.35rem] z-30 px-4 py-1 text-center text-[10px] text-gray-300/80 sm:left-auto sm:right-4 sm:bottom-3 sm:w-auto sm:px-0 sm:text-right sm:text-[10px]">
              <IcpRecordLink className="transition hover:text-gray-500" />
            </footer>
          )}

          <nav className="fixed inset-x-0 bottom-0 z-40 border-t border-gray-100 bg-white/95 shadow-[0_-10px_30px_rgba(15,23,42,0.06)] backdrop-blur sm:hidden">
            <div className="grid h-16 grid-cols-4">
              {navItems.map((item) => (
                <NavLink
                  key={item.to}
                  to={item.to}
                  className={({ isActive }) =>
                    `flex flex-col items-center justify-center gap-0.5 text-[10px] font-semibold transition ${
                      isActive ? 'text-indigo-600' : 'text-gray-400'
                    }`
                  }
                >
                  {navIcons[item.to.slice(1)]}
                  {item.label}
                </NavLink>
              ))}
            </div>
          </nav>
          <FeedbackDialog open={feedbackOpen} onClose={() => setFeedbackOpen(false)} />
      </div>
    </AuthGate>
  );
}

export default function App() {
  return (
    <BrowserRouter>
      <AppShell />
    </BrowserRouter>
  );
}
