import { useEffect } from 'react';
import { reportClientError } from '../api/ops';

const buildInfo = {
  build_version: import.meta.env.VITE_APP_VERSION || 'dev',
  build_date: import.meta.env.VITE_BUILD_DATE || '',
};

function normalizeError(error: unknown) {
  if (error instanceof Error) {
    return {
      message: error.message,
      stack: error.stack || '',
    };
  }
  return {
    message: typeof error === 'string' ? error : 'Unknown client error',
    stack: '',
  };
}

export default function ErrorReporter() {
  useEffect(() => {
    const report = (error: unknown, source: string) => {
      const normalized = normalizeError(error);
      void reportClientError({
        ...normalized,
        source,
        url: window.location.href,
        user_agent: navigator.userAgent,
        ...buildInfo,
      }).catch(() => {
        // Error reporting should never interrupt the user.
      });
    };

    const handleError = (event: ErrorEvent) => {
      report(event.error || event.message, event.filename || 'window.onerror');
    };

    const handleRejection = (event: PromiseRejectionEvent) => {
      report(event.reason, 'unhandledrejection');
    };

    window.addEventListener('error', handleError);
    window.addEventListener('unhandledrejection', handleRejection);
    return () => {
      window.removeEventListener('error', handleError);
      window.removeEventListener('unhandledrejection', handleRejection);
    };
  }, []);

  return null;
}

