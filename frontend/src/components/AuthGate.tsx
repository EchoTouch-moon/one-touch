import { lazy, Suspense, useEffect, useRef, useState } from 'react';
import toast from 'react-hot-toast';
import { motion } from 'framer-motion';
import { useAuthStore } from '../store/authStore';
import IcpRecordLink from './IcpRecordLink';

const AnimatedCharacters = lazy(() => import('./AnimatedCharacters'));

type AuthMode = 'login' | 'register' | 'reset';

const STAGE_WIDTH = 550;
const STAGE_HEIGHT = 400;

/**
 * Scales the fixed-size character stage to whatever box it is given, fitting
 * both axes, and anchors it to the bottom edge. Absolutely positioned so the
 * illustration never influences the height it is measured against.
 */
function CharacterStage({ children }: { children: React.ReactNode }) {
  const host = useRef<HTMLDivElement>(null);
  const [scale, setScale] = useState(1);

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const measure = () => {
      const { clientWidth: w, clientHeight: h } = el;
      if (!w || !h) return;
      setScale(Math.min(1, w / STAGE_WIDTH, h / STAGE_HEIGHT));
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={host} className="relative mt-10 min-h-0 w-full flex-1">
      <div
        className="absolute bottom-0 left-1/2"
        style={{
          width: STAGE_WIDTH,
          height: STAGE_HEIGHT,
          transform: `translateX(-50%) scale(${scale})`,
          transformOrigin: 'bottom center',
        }}
      >
        {children}
      </div>
    </div>
  );
}

function Wordmark({ compact = false }: { compact?: boolean }) {
  return (
    <div className="flex items-center gap-2.5">
      <svg width="26" height="26" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-brand">
        <circle cx="12" cy="12" r="3.2" fill="currentColor" />
        <circle cx="12" cy="12" r="7" stroke="currentColor" strokeWidth="1.4" opacity="0.38" />
        <circle cx="12" cy="12" r="10.6" stroke="currentColor" strokeWidth="0.9" opacity="0.16" />
      </svg>
      <span className="font-display text-title font-semibold tracking-tight text-ink">一触</span>
      {!compact && (
        <span className="eyebrow mt-0.5 text-ink-mute">One&nbsp;Touch</span>
      )}
    </div>
  );
}

const MODE_COPY: Record<AuthMode, { eyebrow: string; title: string; lede: string }> = {
  login: { eyebrow: 'Welcome back', title: 'Pick up where you left off', lede: 'Your cards, your handwriting, your streak.' },
  register: { eyebrow: 'Private beta', title: 'Start your ink library', lede: 'Seats are limited while the beta is running.' },
  reset: { eyebrow: 'Account recovery', title: 'Set a new password', lede: 'We will email you a six-digit code first.' },
};

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const {
    token, loading, initialized, error,
    login, logout, init,
    register, sendRegistrationCode,
    resetPassword, sendPasswordResetCode,
    clearError,
  } = useAuthStore();

  const [mode, setMode] = useState<AuthMode>('login');
  const [loginForm, setLoginForm] = useState({ username: '', password: '' });
  const [registerForm, setRegisterForm] = useState({ email: '', password: '', code: '' });
  const [resetForm, setResetForm] = useState({ email: '', password: '', code: '' });
  const [registerCodeSent, setRegisterCodeSent] = useState(false);
  const [resetCodeSent, setResetCodeSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [isPasswordFocused, setIsPasswordFocused] = useState(false);

  useEffect(() => {
    void init();
  }, [init]);

  useEffect(() => {
    const handleExpired = () => {
      logout();
      toast.error('Session expired. Please log in again.');
    };
    window.addEventListener('glm-words-auth-expired', handleExpired);
    return () => window.removeEventListener('glm-words-auth-expired', handleExpired);
  }, [logout]);

  if (!initialized) {
    return (
      <div className="app-canvas grid min-h-dvh place-items-center">
        <p className="eyebrow animate-pulse text-ink-mute">Checking session…</p>
      </div>
    );
  }

  if (token) return <>{children}</>;

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setRegisterCodeSent(false);
    setResetCodeSent(false);
    setShowPassword(false);
    clearError();
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    if (mode === 'register') {
      const result = await register(registerForm.email.trim().toLowerCase(), registerForm.password, registerForm.code.trim());
      if (!result.ok) { toast.error(result.message); return; }
      toast.success(result.message);
      switchMode('login');
      setLoginForm({ username: registerForm.email.trim().toLowerCase(), password: '' });
      setRegisterForm({ email: '', password: '', code: '' });
      return;
    }

    if (mode === 'reset') {
      const result = await resetPassword(resetForm.email.trim().toLowerCase(), resetForm.password, resetForm.code.trim());
      if (!result.ok) { toast.error(result.message); return; }
      toast.success(result.message);
      switchMode('login');
      setLoginForm({ username: resetForm.email.trim().toLowerCase(), password: '' });
      setResetForm({ email: '', password: '', code: '' });
      return;
    }

    const ok = await login(loginForm.username.trim(), loginForm.password);
    if (!ok) { toast.error('Login failed'); return; }
    setLoginForm({ username: '', password: '' });
  };

  const handleSendCode = async () => {
    const email = (mode === 'reset' ? resetForm.email : registerForm.email).trim().toLowerCase();
    if (!email) { toast.error('Enter your email first'); return; }
    const result = mode === 'reset' ? await sendPasswordResetCode(email) : await sendRegistrationCode(email);
    if (!result.ok) { toast.error(result.message); return; }
    if (mode === 'reset') setResetCodeSent(true); else setRegisterCodeSent(true);
    toast.success(result.message);
  };

  const isRegisterKind = mode !== 'login';
  const email = mode === 'register' ? registerForm.email : resetForm.email;
  const password = mode === 'register' ? registerForm.password : mode === 'reset' ? resetForm.password : loginForm.password;
  const verificationCode = mode === 'register' ? registerForm.code : resetForm.code;
  const codeSent = mode === 'reset' ? resetCodeSent : registerCodeSent;
  const passwordTooShort = isRegisterKind && password.length > 0 && password.length < 10;
  const passwordReady = password.length >= 10;

  const actionDisabled = loading || (
    mode === 'register'
      ? !registerForm.email.trim() || !passwordReady || registerForm.code.trim().length < 6
      : mode === 'reset'
        ? !resetForm.email.trim() || !passwordReady || resetForm.code.trim().length < 6
        : !loginForm.username.trim() || !loginForm.password
  );

  const submitLabel = loading
    ? 'Working…'
    : mode === 'register' ? 'Create account' : mode === 'reset' ? 'Reset password' : 'Log in';

  const copy = MODE_COPY[mode];
  const year = new Date().getFullYear();

  return (
    <div className="app-canvas min-h-dvh lg:grid lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)]">
      {/* ── Form panel ── */}
      <section className="order-1 flex min-h-dvh flex-col px-5 py-8 sm:px-8 lg:order-2 lg:min-h-0 lg:justify-center lg:px-12 xl:px-16">
        <div className="mx-auto w-full max-w-[26rem]">
          <div className="mb-8 lg:hidden">
            <Wordmark compact />
          </div>

          <p className="eyebrow">{copy.eyebrow}</p>
          <h1 className="mt-2.5 font-display text-display-sm font-semibold text-ink">{copy.title}</h1>
          <p className="mt-2 text-meta text-ink-mute">{copy.lede}</p>

          {mode !== 'reset' && (
            <div className="relative mt-7 grid grid-cols-2 gap-1 rounded-lg bg-well p-1">
              {(['login', 'register'] as const).map((value) => {
                const active = mode === value;
                return (
                  <button
                    key={value}
                    type="button"
                    aria-pressed={active}
                    onClick={() => switchMode(value)}
                    className={`relative z-10 h-11 rounded-md text-meta font-semibold transition-colors duration-[var(--dur-base)] ${
                      active ? 'text-ink' : 'text-ink-mute hover:text-ink-soft'
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="auth-tab"
                        transition={{ type: 'spring', stiffness: 480, damping: 38 }}
                        className="absolute inset-0 -z-10 rounded-md border border-line bg-surface shadow-hair"
                      />
                    )}
                    {value === 'login' ? 'Log in' : 'Register'}
                  </button>
                );
              })}
            </div>
          )}

          <form onSubmit={handleSubmit} noValidate={mode === 'login'} className="mt-6 space-y-4">
            <div>
              <label className="label" htmlFor="auth-identifier">
                {mode === 'login' ? 'Email or username' : 'Email'}
              </label>
              <input
                id="auth-identifier"
                className="field"
                type={mode === 'login' ? 'text' : 'email'}
                value={mode === 'register' ? registerForm.email : mode === 'reset' ? resetForm.email : loginForm.username}
                onChange={(event) => {
                  const value = event.target.value;
                  if (mode === 'register') { setRegisterForm((prev) => ({ ...prev, email: value })); setRegisterCodeSent(false); }
                  else if (mode === 'reset') { setResetForm((prev) => ({ ...prev, email: value })); setResetCodeSent(false); }
                  else setLoginForm((prev) => ({ ...prev, username: value }));
                }}
                onFocus={() => setIsTyping(true)}
                onBlur={() => setIsTyping(false)}
                placeholder={mode === 'login' ? 'username or you@example.com' : 'you@example.com'}
                autoComplete={mode === 'login' ? 'username' : 'email'}
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                name={mode === 'login' ? 'username' : 'email'}
              />
            </div>

            <div>
              <div className="flex items-baseline justify-between gap-3">
                <label className="label" htmlFor="auth-password">Password</label>
                {mode === 'login' && (
                  <button type="button" className="mb-1.5 inline-flex min-h-11 items-center text-micro font-semibold text-brand-deep transition hover:text-brand" onClick={() => switchMode('reset')}>
                    Forgot password?
                  </button>
                )}
              </div>
              <div className="relative">
                <input
                  id="auth-password"
                  className="field pr-12"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(event) => {
                    const value = event.target.value;
                    if (mode === 'register') setRegisterForm((prev) => ({ ...prev, password: value }));
                    else if (mode === 'reset') setResetForm((prev) => ({ ...prev, password: value }));
                    else setLoginForm((prev) => ({ ...prev, password: value }));
                  }}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  placeholder="Your password"
                  autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                  aria-pressed={showPassword}
                  className="absolute right-1 top-1/2 grid h-11 w-11 -translate-y-1/2 place-items-center rounded-sm text-ink-mute transition hover:bg-well hover:text-ink"
                >
                  <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    {showPassword ? (
                      <><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></>
                    ) : (
                      <><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" /><line x1="1" y1="1" x2="23" y2="23" /></>
                    )}
                  </svg>
                </button>
              </div>
              {isRegisterKind && (
                <p className={`mt-2 text-micro transition-colors ${passwordTooShort ? 'text-warn' : 'text-ink-mute'}`}>
                  At least 10 characters{passwordReady ? ' — good to go.' : '.'}
                </p>
              )}
            </div>

            {isRegisterKind && (
              <div>
                <label className="label" htmlFor="auth-code">Verification code</label>
                <div className="flex gap-2">
                  <input
                    id="auth-code"
                    className="field num min-w-0 flex-1 tracking-[0.3em]"
                    type="text"
                    value={verificationCode}
                    onChange={(event) => {
                      const value = event.target.value;
                      if (mode === 'register') setRegisterForm((prev) => ({ ...prev, code: value }));
                      else setResetForm((prev) => ({ ...prev, code: value }));
                    }}
                    placeholder="000000"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                  />
                  <button
                    type="button"
                    className="btn btn-secondary shrink-0"
                    disabled={loading || !email.trim()}
                    onClick={() => void handleSendCode()}
                  >
                    {codeSent ? 'Resend' : 'Send code'}
                  </button>
                </div>
              </div>
            )}

            {error && (
              <div role="alert" className="flex items-start gap-2.5 rounded-md border border-bad/30 bg-bad-wash px-3.5 py-3 text-meta text-bad">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="mt-0.5 shrink-0" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" /><path d="M12 8v5M12 16.5v.01" />
                </svg>
                <span>{error}</span>
              </div>
            )}

            <button type="submit" className="btn btn-primary btn-lg btn-block mt-2" disabled={actionDisabled}>
              {loading && (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                  <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2.5" opacity="0.25" />
                  <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
              )}
              {submitLabel}
            </button>
          </form>

          {mode !== 'login' && (
            <p className="mt-5 text-center text-meta">
              <button type="button" className="link" onClick={() => switchMode('login')}>
                ← Back to log in
              </button>
            </p>
          )}

          <p className="mt-6 text-center text-micro text-ink-mute">
            Private beta · registration may close when seats fill
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-x-5 gap-y-2 border-t border-line pt-5 text-micro text-ink-mute lg:hidden">
            <a href="#" className="inline-flex min-h-11 items-center px-2 transition hover:text-ink">Privacy</a>
            <a href="#" className="inline-flex min-h-11 items-center px-2 transition hover:text-ink">Terms</a>
            <IcpRecordLink />
          </div>

          <p className="mt-8 hidden text-center text-micro text-ink-mute lg:block">© {year} 一触</p>
        </div>

        <div className="mx-auto mt-8 hidden w-full max-w-[26rem] items-center justify-center gap-x-5 text-micro text-ink-mute lg:flex">
          <a href="#" className="inline-flex min-h-11 items-center px-2 transition hover:text-ink">Privacy Policy</a>
          <a href="#" className="inline-flex min-h-11 items-center px-2 transition hover:text-ink">Terms of Service</a>
          <IcpRecordLink />
        </div>
      </section>

      {/* ── Brand panel: the product's argument, made visible ── */}
      <section className="relative hidden overflow-hidden border-r border-line bg-paper-deep px-10 py-9 lg:order-1 lg:flex lg:h-dvh lg:flex-col xl:px-16">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-40 -top-24 h-80 w-80 rounded-full bg-brand/[0.06] blur-3xl"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -left-28 bottom-1/3 h-72 w-72 rounded-full bg-accent/[0.05] blur-3xl"
        />

        <div className="relative shrink-0">
          <Wordmark />
        </div>

        <div className="relative mt-10 max-w-[34rem] shrink-0">
          <h2 className="font-display text-display font-semibold text-ink xl:text-word">
            Write it once.
            <br />
            <span className="text-brand-deep">Remember it for good.</span>
          </h2>
          <p className="mt-5 max-w-[32ch] text-lead text-ink-soft">
            一触 turns a word into a handwritten card, then brings it back exactly when your memory is about to let go.
          </p>

          <ul className="mt-8 space-y-3.5">
            {[
              ['Capture in one tap', 'Type the word, keep the definition you wrote.'],
              ['Review by writing', 'Your own ink comes back as the card.'],
              ['Spaced repetition', 'SM-2 or FSRS, tuned to your recall.'],
            ].map(([title, detail], index) => (
              <li key={title} className="flex gap-3.5">
                <span className="num mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full border border-line-strong bg-surface text-xs font-semibold text-brand-deep">
                  {index + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-meta font-semibold text-ink">{title}</span>
                  <span className="block text-meta text-ink-mute">{detail}</span>
                </span>
              </li>
            ))}
          </ul>
        </div>

        <Suspense fallback={null}>
          <CharacterStage>
            <AnimatedCharacters
              isTyping={isTyping}
              isPasswordFocused={isPasswordFocused}
              showPassword={showPassword}
              passwordLength={password.length}
            />
          </CharacterStage>
        </Suspense>
      </section>

    </div>
  );
}
