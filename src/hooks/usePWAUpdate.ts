import { useEffect, useCallback } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';

interface PWAUpdateState {
  offlineReady: boolean;
  needRefresh: boolean;
  updateServiceWorker: () => Promise<void>;
}

/**
 * PWA Update hook for autoUpdate mode
 * In autoUpdate mode, the new SW activates automatically.
 * This hook provides status info and a manual trigger if needed.
 */
export function usePWAUpdate(): PWAUpdateState {
  const {
    needRefresh: [needRefresh],
    offlineReady: [offlineReady],
    updateServiceWorker,
  } = useRegisterSW({
    immediate: true, // Register SW immediately
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
      console.log('[PWA] New content available - will auto-update');
      // In autoUpdate mode, the SW will skipWaiting automatically
      // The controllerchange listener in main.tsx will trigger reload
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
