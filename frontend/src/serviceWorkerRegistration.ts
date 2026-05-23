export function registerServiceWorker() {
  if (!import.meta.env.PROD || !('serviceWorker' in navigator)) return;

  window.addEventListener('load', () => {
    let refreshing = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (refreshing) return;
      refreshing = true;
      window.location.reload();
    });

    navigator.serviceWorker.register('/sw.js')
      .then((registration) => {
        const activateWaitingWorker = () => {
          if (registration.waiting) {
            registration.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        };

        if (registration.waiting) {
          window.dispatchEvent(new CustomEvent('glm-words-update-ready', { detail: { activate: activateWaitingWorker } }));
          return;
        }

        registration.addEventListener('updatefound', () => {
          const installing = registration.installing;
          if (!installing) return;
          installing.addEventListener('statechange', () => {
            if (installing.state === 'installed' && navigator.serviceWorker.controller) {
              window.dispatchEvent(new CustomEvent('glm-words-update-ready', { detail: { activate: activateWaitingWorker } }));
            }
          });
        });

        void registration.update();
      })
      .catch(() => {
        // PWA support is a progressive enhancement; the app remains usable without it.
      });
  });
}
