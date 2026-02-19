import { useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface PWAUpdateState {
  offlineReady: boolean;
  needRefresh: boolean;
  updateServiceWorker: () => Promise<void>;
}

/**
 * PWA Update hook for autoUpdate mode.
 * The new SW activates automatically via skipWaiting + clientsClaim.
 * The controllerchange listener in main.tsx triggers the reload.
 */
export function usePWAUpdate(): PWAUpdateState {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true,
    onRegisteredSW(swUrl, registration) {
      console.log('[PWA] Service Worker registered:', swUrl);
      
      // Periodic update check every 60 seconds
      if (registration) {
        setInterval(() => {
          registration.update().catch(console.error);
        }, 60 * 1000);
      }
    },
    onRegisterError(error) {
      console.error('[PWA] Service Worker registration error:', error);
    },
    onNeedRefresh() {
      console.log('[PWA] New content available — auto-update will apply via controllerchange');
    },
    onOfflineReady() {
      console.log('[PWA] App ready to work offline');
    },
  });

  const handleUpdate = useCallback(async () => {
    await updateServiceWorker(true);
  }, [updateServiceWorker]);

  return {
    needRefresh,
    offlineReady,
    updateServiceWorker: handleUpdate,
  };
}
