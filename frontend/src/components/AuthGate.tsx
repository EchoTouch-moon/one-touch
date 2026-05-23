import { lazy, Suspense, useEffect, useState } from 'react';
import toast, { Toaster } from 'react-hot-toast';
import { useAuthStore } from '../store/authStore';
import IcpRecordLink from './IcpRecordLink';

const AnimatedCharacters = lazy(() => import('./AnimatedCharacters'));
type AuthMode = 'login' | 'register' | 'reset';

export default function AuthGate({ children }: { children: React.ReactNode }) {
  const {
    token,
    loading,
    initialized,
    error,
    login,
    logout,
    init,
    register,
    sendRegistrationCode,
    resetPassword,
    sendPasswordResetCode,
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
      <div className="loading-screen">
        <p style={{ fontSize: 14, color: '#aaa' }}>Checking session...</p>
      </div>
    );
  }

  if (token) {
    return <>{children}</>;
  }

  const switchMode = (nextMode: AuthMode) => {
    setMode(nextMode);
    setRegisterCodeSent(false);
    setResetCodeSent(false);
    clearError();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'register') {
      const result = await register(
        registerForm.email.trim().toLowerCase(),
        registerForm.password,
        registerForm.code.trim(),
      );
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      switchMode('login');
      setLoginForm({ username: registerForm.email.trim().toLowerCase(), password: '' });
      setRegisterForm({ email: '', password: '', code: '' });
      return;
    }

    if (mode === 'reset') {
      const result = await resetPassword(
        resetForm.email.trim().toLowerCase(),
        resetForm.password,
        resetForm.code.trim(),
      );
      if (!result.ok) {
        toast.error(result.message);
        return;
      }
      toast.success(result.message);
      switchMode('login');
      setLoginForm({ username: resetForm.email.trim().toLowerCase(), password: '' });
      setResetForm({ email: '', password: '', code: '' });
      return;
    }

    const ok = await login(loginForm.username.trim(), loginForm.password);
    if (!ok) {
      toast.error('Login failed');
      return;
    }
    setLoginForm({ username: '', password: '' });
  };

  const handleSendCode = async () => {
    const email = (mode === 'reset' ? resetForm.email : registerForm.email).trim().toLowerCase();
    if (!email) {
      toast.error('Enter your email first');
      return;
    }
    const result = mode === 'reset'
      ? await sendPasswordResetCode(email)
      : await sendRegistrationCode(email);
    if (!result.ok) {
      toast.error(result.message);
      return;
    }
    if (mode === 'reset') {
      setResetCodeSent(true);
    } else {
      setRegisterCodeSent(true);
    }
    toast.success(result.message);
  };

  const password = mode === 'register' ? registerForm.password : mode === 'reset' ? resetForm.password : loginForm.password;
  const passwordLength = password.length;
  const formEmail = mode === 'register' ? registerForm.email : mode === 'reset' ? resetForm.email : loginForm.username;
  const verificationCode = mode === 'register' ? registerForm.code : resetForm.code;
  const codeSent = mode === 'reset' ? resetCodeSent : registerCodeSent;
  const identifierLabel = mode === 'login' ? 'Email or username' : 'Email';
  const identifierType = mode === 'login' ? 'text' : 'email';
  const identifierAutoComplete = mode === 'login' ? 'username' : 'email';
  const isActionDisabled = loading || (
    mode === 'register'
      ? !registerForm.email.trim() || registerForm.password.length < 10 || registerForm.code.trim().length < 6
      : mode === 'reset'
        ? !resetForm.email.trim() || resetForm.password.length < 10 || resetForm.code.trim().length < 6
        : !loginForm.username.trim() || !loginForm.password
  );

  return (
    <div id="login-page">
      <div className="left-panel">
        <div className="logo">
          <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2">
            <path d="M12 2L15 9H9L12 2Z" />
            <path d="M12 22L9 15H15L12 22Z" />
            <path d="M2 12L9 9V15L2 12Z" />
            <path d="M22 12L15 15V9L22 12Z" />
          </svg>
          <span>一触</span>
          <span style={{ fontSize: 10, opacity: 0.6, fontWeight: 400, letterSpacing: '0.08em', marginLeft: 2 }}>One Touch</span>
        </div>

        <div className="characters-wrapper">
          <Suspense fallback={null}>
            <AnimatedCharacters
              isTyping={isTyping}
              isPasswordFocused={isPasswordFocused}
              showPassword={showPassword}
              passwordLength={passwordLength}
            />
          </Suspense>
        </div>

        <div className="footer-links">
          <a href="#">Privacy Policy</a>
          <a href="#">Terms of Service</a>
          <IcpRecordLink />
        </div>
      </div>

      <div className="right-panel">
        <div className="form-container">
          <div className="sparkle-icon">
            <svg viewBox="0 0 24 24" fill="none">
              <circle cx="12" cy="12" r="3" fill="#4f46e5" />
              <circle cx="12" cy="12" r="7" stroke="#4f46e5" strokeWidth="1.5" opacity="0.35" />
              <circle cx="12" cy="12" r="10.5" stroke="#4f46e5" strokeWidth="1" opacity="0.15" />
            </svg>
          </div>

          <div className="form-header">
            <h1>{mode === 'login' ? 'Welcome back!' : mode === 'register' ? 'Create account' : 'Reset password'}</h1>
            <p>
              {mode === 'login'
                ? 'Please enter your details'
                : mode === 'register'
                  ? 'Use your email to join the beta'
                  : 'Verify your email and set a new password'}
            </p>
            <p style={{ fontSize: 11, color: '#bbb', marginTop: 8, letterSpacing: '0.12em' }}>一键收词 · 一笔写义 · 一卡复习</p>
          </div>

          {mode !== 'reset' && (
            <div className="auth-tabs">
              <button
                type="button"
                className={`auth-tab ${mode === 'login' ? 'active' : ''}`}
                onClick={() => switchMode('login')}
              >
                Log in
              </button>
              <button
                type="button"
                className={`auth-tab ${mode === 'register' ? 'active' : ''}`}
                onClick={() => switchMode('register')}
              >
                Register
              </button>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="username">{identifierLabel}</label>
              <div className="input-wrapper">
                <input
                  id="username"
                  type={identifierType}
                  value={formEmail}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (mode === 'register') {
                      setRegisterForm((prev) => ({ ...prev, email: value }));
                      setRegisterCodeSent(false);
                    } else if (mode === 'reset') {
                      setResetForm((prev) => ({ ...prev, email: value }));
                      setResetCodeSent(false);
                    } else {
                      setLoginForm((prev) => ({ ...prev, username: value }));
                    }
                  }}
                  onFocus={() => setIsTyping(true)}
                  onBlur={() => setIsTyping(false)}
                  placeholder={mode === 'login' ? 'local-admin or you@example.com' : 'you@example.com'}
                  autoComplete={identifierAutoComplete}
                />
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="password">Password</label>
              <div className="input-wrapper">
                <input
                  id="password"
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => {
                    const value = e.target.value;
                    if (mode === 'register') {
                      setRegisterForm((prev) => ({ ...prev, password: value }));
                    } else if (mode === 'reset') {
                      setResetForm((prev) => ({ ...prev, password: value }));
                    } else {
                      setLoginForm((prev) => ({ ...prev, password: value }));
                    }
                  }}
                  onFocus={() => setIsPasswordFocused(true)}
                  onBlur={() => setIsPasswordFocused(false)}
                  placeholder="********"
                  autoComplete="current-password"
                />
                <button
                  type="button"
                  className="toggle-password"
                  onClick={() => setShowPassword((v) => !v)}
                >
                  {!showPassword ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24" />
                      <line x1="1" y1="1" x2="23" y2="23" />
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
            </div>

            {mode !== 'login' && (
              <div className="form-group">
                <label htmlFor="verification-code">Verification code</label>
                <div className="verification-row">
                  <input
                    id="verification-code"
                    type="text"
                    value={verificationCode}
                    onChange={(e) => {
                      const value = e.target.value;
                      if (mode === 'register') {
                        setRegisterForm((prev) => ({ ...prev, code: value }));
                      } else {
                        setResetForm((prev) => ({ ...prev, code: value }));
                      }
                    }}
                    placeholder="6-digit code"
                    inputMode="numeric"
                    autoComplete="one-time-code"
                  />
                  <button
                    type="button"
                    className="btn-code"
                    disabled={loading || !formEmail.trim()}
                    onClick={() => void handleSendCode()}
                  >
                    {codeSent ? 'Resend' : 'Send'}
                  </button>
                </div>
              </div>
            )}

            {error && <div className="error-msg show">{error}</div>}

            <button
              type="submit"
              className="btn-login"
              disabled={
                isActionDisabled
              }
            >
              <span className="btn-text">{loading ? 'Working...' : mode === 'register' ? 'Create Account' : mode === 'reset' ? 'Reset Password' : 'Log In'}</span>
              <div className="btn-hover-content">
                <span>{loading ? 'Working...' : mode === 'register' ? 'Create Account' : mode === 'reset' ? 'Reset Password' : 'Log In'}</span>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                  <line x1="5" y1="12" x2="19" y2="12" />
                  <polyline points="12 5 19 12 12 19" />
                </svg>
              </div>
            </button>
          </form>

          <p className="signup-link">
            {mode === 'login' ? (
              <button type="button" className="text-link" onClick={() => switchMode('reset')}>
                Forgot password?
              </button>
            ) : (
              <button type="button" className="text-link" onClick={() => switchMode('login')}>
                Back to login
              </button>
            )}
          </p>

          <p style={{ marginTop: 24, textAlign: 'center', fontSize: 12, color: '#9ca3af' }}>
            Private beta · Registration may close when seats are full
          </p>
        </div>
      </div>
      <Toaster position="top-center" />
    </div>
  );
}
