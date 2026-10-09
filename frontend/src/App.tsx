import { lazy, Suspense, useEffect, useState, type ReactNode } from 'react';
import { createBrowserRouter, RouterProvider, Routes, Route, NavLink, Navigate, useLocation } from 'react-router-dom';
import { AnimatePresence, motion, MotionConfig } from 'framer-motion';
import { Menu, MenuButton, MenuItem, MenuItems } from '@headlessui/react';
import { Toaster } from 'react-hot-toast';
import AuthGate from './components/AuthGate';
import ErrorReporter from './components/ErrorReporter';
import FeedbackDialog from './components/FeedbackDialog';
import IcpRecordLink from './components/IcpRecordLink';
import UpdatePrompt from './components/UpdatePrompt';
import { useAuthStore } from './store/authStore';
import { useReviewStore } from './store/reviewStore';
import { THEME_OPTIONS, applyTheme, otherTheme, useThemeStore } from './store/themeStore';

const QuickCapturePage = lazy(() => import('./pages/QuickCapturePage'));
const ReviewPage = lazy(() => import('./pages/ReviewPage'));
const WordListPage = lazy(() => import('./pages/WordListPage'));
const WordDetailPage = lazy(() => import('./pages/WordDetailPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const HandwritingLabPage = lazy(() => import('./pages/HandwritingLabPage'));
const KaoyanLexiconPage = lazy(() => import('./pages/KaoyanLexiconPage'));

const APP_NAME = '一触';

type NavItem = { to: string; label: string; icon: ReactNode };

const icon = (paths: ReactNode) => (
  <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    {paths}
  </svg>
);

const navItems: NavItem[] = [
  { to: '/capture', label: 'Capture', icon: icon(<><path d="M12 20h9" /><path d="M16.5 3.5a2.12 2.12 0 1 1 3 3L7 19l-4 1 1-4 12.5-12.5z" /></>) },
  { to: '/review', label: 'Review', icon: icon(<><rect x="2" y="3" width="20" height="18" rx="2.5" /><path d="M2 9h20" /><path d="M8 17H6" /></>) },
  { to: '/words', label: 'Words', icon: icon(<><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" /><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" /></>) },
  { to: '/kaoyan', label: 'Kaoyan', icon: icon(<><path d="M22 10 12 5 2 10l10 5 10-5z" /><path d="M6 12v5c0 1.7 2.7 3 6 3s6-1.3 6-3v-5" /></>) },
  { to: '/settings', label: 'Settings', icon: icon(<><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></>) },
];

const pageTransition = {
  initial: { opacity: 0, y: 10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -6 },
  transition: { duration: 0.26, ease: [0.16, 1, 0.3, 1] as const },
};

function Wordmark() {
  return (
    <NavLink to="/" className="flex min-h-11 shrink-0 items-center gap-2.5 rounded-sm" aria-label={`${APP_NAME} — home`}>
      <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-brand">
        <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.4" opacity="0.38" />
        <circle cx="12" cy="12" r="10.6" stroke="currentColor" strokeWidth="0.9" opacity="0.16" />
      </svg>
      <span className="font-display text-lg font-semibold tracking-tight text-ink sm:text-lg">{APP_NAME}</span>
    </NavLink>
  );
}

function DefaultRoute() {
  const prefersReview = window.matchMedia('(max-width: 767px), (pointer: coarse)').matches;
  return <Navigate to={prefersReview ? '/review' : '/capture'} replace />;
}

function RouteLoadingFallback() {
  const path = window.location.pathname;

  if (path.startsWith('/review')) {
    return (
      <div className="viewport-page flex flex-col items-center px-4 py-4 sm:py-8" aria-busy="true" aria-live="polite">
        <div className="mb-4 flex w-full max-w-md items-center justify-between gap-3">
          <div className="skeleton h-4 w-16" />
          <div className="skeleton h-4 w-28" />
          <div className="skeleton h-4 w-12" />
        </div>
        <div className="skeleton mb-8 h-1.5 w-full max-w-md rounded-full" />
        <div className="card card-float mt-8 aspect-[3/4] w-full max-w-[20rem] rounded-[1.35rem]" />
        <p className="eyebrow mt-7 text-ink-mute">Preparing your cards</p>
      </div>
    );
  }

  return (
    <div className="page" aria-busy="true" aria-live="polite">
      <div className="mb-8 space-y-3">
        <div className="skeleton h-3 w-24" />
        <div className="skeleton h-8 w-52" />
      </div>
      <div className="space-y-3">
        {[0, 1, 2].map((row) => (
          <div key={row} className="card h-[4.5rem]" />
        ))}
      </div>
    </div>
  );
}

/**
 * Appearance switcher. Shows the half-filled disc that conventionally means
 * "theme", and previews the target scheme in its own swatch colours.
 */
function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const theme = useThemeStore((s) => s.theme);
  const toggleTheme = useThemeStore((s) => s.toggleTheme);
  const next = THEME_OPTIONS.find((option) => option.id === otherTheme(theme))!;

  return (
    <button
      type="button"
      onClick={toggleTheme}
      title={`Switch to the ${next.label} theme`}
      aria-label={`Appearance: ${theme === 'paper' ? 'Paper' : 'Violet'}. Switch to ${next.label}.`}
      className={compact ? 'btn btn-sm btn-ghost w-full justify-start' : 'btn btn-ghost btn-sm min-w-11 !px-2'}
    >
      <span className="flex items-center gap-0.5" aria-hidden="true">
        {next.swatch.map((color, i) => (
          <span
            key={color}
            className="block h-3 w-3 rounded-full border border-line"
            style={{ backgroundColor: color, marginLeft: i ? -4 : 0 }}
          />
        ))}
      </span>
      {compact && <span className="text-meta">Switch to {next.label}</span>}
    </button>
  );
}

function AccountMenu({ username, onFeedback }: { username: string | null; onFeedback: () => void }) {
  const logout = useAuthStore((s) => s.logout);
  const initial = (username ?? '?').trim().charAt(0).toUpperCase();

  return (
    <Menu as="div" className="relative">
      <MenuButton className="btn btn-ghost !px-1.5 sm:!px-2.5" aria-label="Account menu">
        <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full border border-brand-line bg-brand-wash text-micro font-bold text-brand-deep">
          {initial}
        </span>
        <span className="hidden max-w-[9rem] truncate text-meta font-medium text-ink-soft sm:block">{username}</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="text-ink-faint">
          <path d="m6 9 6 6 6-6" />
        </svg>
      </MenuButton>
      <MenuItems
        transition
        anchor="bottom end"
        className="z-50 mt-2 w-56 origin-top-right rounded-lg border border-line bg-surface p-1.5 shadow-lift transition duration-[var(--dur-quick)] ease-out data-[closed]:scale-95 data-[closed]:opacity-0"
      >
        <div className="border-b border-line px-3 pb-2.5 pt-1.5">
          <p className="truncate text-micro text-ink-mute">{username}</p>
        </div>
        <div className="px-1 pt-1">
          <ThemeToggle compact />
        </div>
        <div className="mx-1 my-1 border-t border-line" />
        <MenuItem>
          <button
            type="button"
            onClick={onFeedback}
            className="mt-1 flex w-full items-center gap-2.5 rounded-sm px-3 py-2.5 text-left text-meta text-ink-soft transition data-[focus]:bg-well data-[focus]:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
            </svg>
            Send feedback
          </button>
        </MenuItem>
        <MenuItem>
          <button
            type="button"
            onClick={() => {
              const event = new CustomEvent('glm-words-before-logout', { cancelable: true, detail: logout });
              if (window.dispatchEvent(event)) logout();
            }}
            className="flex w-full items-center gap-2.5 rounded-sm px-3 py-2.5 text-left text-meta text-ink-soft transition data-[focus]:bg-well data-[focus]:text-ink"
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" />
            </svg>
            Log out
          </button>
        </MenuItem>
      </MenuItems>
    </Menu>
  );
}

/** Keeps a due-count honest in the chrome without turning the nav into a dashboard. */
function useDueCount() {
  return useReviewStore((s) => s.stats?.due_count ?? 0);
}

function AppShell() {
  const { username, token, userId, initialized } = useAuthStore();
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const startReviewSession = useReviewStore((s) => s.startSession);
  const dueCount = useDueCount();
  const location = useLocation();

  useEffect(() => {
    if (!initialized || !token || userId === null) return;

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
  }, [initialized, startReviewSession, token, userId]);

  // A new route starts at the top; the words list restores its own offset after load.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' as ScrollBehavior });
  }, [location.pathname]);

  return (
    <AuthGate>
      <ErrorReporter />
      <UpdatePrompt />
      <div className="app-shell app-canvas">
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:border focus:border-line focus:bg-surface focus:px-4 focus:py-2 focus:text-meta focus:shadow-lift"
        >
          Skip to content
        </a>

        <header className="sticky top-0 z-40 border-b border-line/80 bg-paper/85 backdrop-blur-xl">
          <div className="mx-auto flex h-[3.25rem] max-w-[68rem] items-center gap-4 px-4 sm:h-[3.75rem] sm:gap-7 sm:px-7">
            <Wordmark />

            <nav aria-label="Primary" className="hidden items-center gap-6 md:flex">
              {navItems.map((item) => (
                <NavLink key={item.to} to={item.to} className="navlink">
                  {item.label}
                  {item.to === '/review' && dueCount > 0 && (
                    <span className="num ml-1.5 rounded-full bg-brand-wash px-1.5 py-0.5 text-2xs font-semibold text-brand-deep" aria-label={`${dueCount} due`}>
                      {dueCount}
                    </span>
                  )}
                </NavLink>
              ))}
            </nav>

            <div className="ml-auto flex items-center gap-1.5">
              <ThemeToggle />
              <AccountMenu username={username} onFeedback={() => setFeedbackOpen(true)} />
            </div>
          </div>
        </header>

        <main id="main" className="app-main">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div key={location.pathname} className="app-route" {...pageTransition}>
              <Suspense fallback={<RouteLoadingFallback />}>
                <Routes location={location}>
                  <Route path="/" element={<DefaultRoute />} />
                  <Route path="/capture" element={<QuickCapturePage />} />
                  <Route path="/review" element={<ReviewPage />} />
                  <Route path="/words" element={<WordListPage />} />
                  <Route path="/words/:id" element={<WordDetailPage />} />
                  <Route path="/kaoyan" element={<KaoyanLexiconPage />} />
                  <Route path="/settings" element={<SettingsPage />} />
                  <Route path="/handwriting-lab" element={<HandwritingLabPage />} />
                </Routes>
              </Suspense>
            </motion.div>
          </AnimatePresence>
        </main>

        <footer className="app-footer px-4 pt-4 text-center text-micro text-ink-mute">
          <IcpRecordLink />
        </footer>

        <nav
          aria-label="Primary"
          className="app-bottom-nav fixed inset-x-0 bottom-0 z-40 border-t border-line bg-surface/95 shadow-[0_-8px_28px_-14px_rgba(46,38,24,0.28)] backdrop-blur-xl md:hidden"
        >
          <div className="grid h-[4.25rem] grid-cols-5">
            {navItems.map((item) => (
              <NavLink key={item.to} to={item.to} className="tabbar-item">
                <span className="relative">
                  {item.icon}
                  {item.to === '/review' && dueCount > 0 && (
                    <span className="absolute -right-1.5 -top-1 grid h-4 min-w-4 place-items-center rounded-full bg-brand px-1 text-2xs font-bold text-white">
                      {dueCount > 99 ? '99+' : dueCount}
                    </span>
                  )}
                </span>
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

const router = createBrowserRouter([{ path: '*', element: <AppShell /> }]);

export default function App() {
  const theme = useThemeStore((s) => s.theme);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  return (
    <MotionConfig reducedMotion="user">
      <RouterProvider router={router} />
      <Toaster
        position="top-center"
        gutter={10}
        toastOptions={{
          duration: 3200,
          style: {
            background: 'var(--color-surface)',
            color: 'var(--color-ink)',
            border: '1px solid var(--color-line)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lift)',
            fontSize: '0.8125rem',
            fontWeight: 500,
            padding: '0.7rem 0.95rem',
            maxWidth: '26rem',
            lineHeight: 1.45,
          },
          success: { iconTheme: { primary: 'var(--color-good)', secondary: 'var(--color-surface)' } },
          error: { iconTheme: { primary: 'var(--color-bad)', secondary: 'var(--color-surface)' } },
        }}
      />
    </MotionConfig>
  );
}
