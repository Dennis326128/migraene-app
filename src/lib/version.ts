import { getPendingCount } from './performance/optimisticSave';

/**
 * Auto-generated build ID injected at compile time via vite.config.ts define.
 * Each build produces a unique ID — no manual bumps needed.
 */
export const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev';

// Keep APP_VERSION as alias for backwards compat (MainMenu display etc.)
export const APP_VERSION = BUILD_ID;

let isReloading = false;

function safeStorageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch (err) {
    console.warn(`[version] localStorage get failed for "${key}"`, err);
    return null;
  }
}

function safeStorageSet(key: string, value: string): boolean {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (err) {
    console.warn(`[version] localStorage set failed for "${key}"`, err);
    return false;
  }
}

function safeStorageRemove(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch (err) {
    console.warn(`[version] localStorage remove failed for "${key}"`, err);
  }
}

/**
 * Force clear all caches and reload with cache-bust redirect.
 * Fixes the race condition where location.reload() still hits the old SW.
 */
export async function forceClearCachesAndReload() {
  if (isReloading) return;
  isReloading = true;
  
  console.log('🧹 Force clearing all caches...');
  
  try {
    // 1. Clear Service Worker caches
    if ('caches' in window) {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map(name => caches.delete(name)));
      console.log('✅ Cleared', cacheNames.length, 'caches');
    }
    
    // 2. Unregister all Service Workers
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map(r => r.unregister()));
      console.log('✅ Unregistered', registrations.length, 'service workers');
    }
    
    // 3. Clear localStorage version markers
    safeStorageRemove('build_id');
    safeStorageRemove('app_version');
    
    // 4. Wait for SW cleanup to complete (300ms for reliable deactivation)
    await new Promise(r => setTimeout(r, 300));
    
    // 5. Navigate with cache-bust parameter (bypasses any lingering SW)
    window.location.replace(window.location.pathname + '?_cb=' + Date.now());
  } catch (err) {
    console.error('Cache clear failed:', err);
    window.location.replace(window.location.pathname + '?_cb=' + Date.now());
  }
}

/**
 * Check if app version changed and force refresh if needed.
 * Compares the compile-time BUILD_ID against localStorage.
 */
export function checkAppVersion() {
  try {
    const storedVersion = safeStorageGet('app_version');
    
    if (storedVersion !== BUILD_ID) {
      console.log(`🔄 App version changed: ${storedVersion} → ${BUILD_ID}`);
      const didPersistVersion = safeStorageSet('app_version', BUILD_ID);
      
      // Only force reload if there was a previous version (not first visit)
      // and BUILD_ID is not 'dev' (development mode)
      // IMPORTANT: only reload when persisting succeeded, otherwise this can loop forever.
      if (storedVersion && BUILD_ID !== 'dev' && didPersistVersion) {
        forceClearCachesAndReload();
        return true;
      }

      if (storedVersion && BUILD_ID !== 'dev' && !didPersistVersion) {
        console.warn('[version] Skipping forced reload because app_version could not be persisted.');
      }
    }
    
    // Also check if URL has stale cache-bust param and clean it
    const url = new URL(window.location.href);
    if (url.searchParams.has('_cb')) {
      url.searchParams.delete('_cb');
      window.history.replaceState({}, '', url.pathname + url.search + url.hash);
    }
  } catch (err) {
    console.error('[version] checkAppVersion failed:', err);
  }
  
  return false;
}

/**
 * Safe reload that waits for pending saves
 */
async function safeReload() {
  if (isReloading) return;
  
  const pendingCount = getPendingCount();
  
  if (pendingCount === 0) {
    console.log('✅ No pending saves, reloading now...');
    isReloading = true;
    window.location.replace(window.location.pathname + '?_cb=' + Date.now());
    return;
  }
  
  console.log(`⏳ Waiting for ${pendingCount} pending saves before reload...`);
  
  // Timeout fallback - reload after 30s even with pending saves
  const timeoutId = setTimeout(() => {
    console.warn('⚠️ Timeout reached, forcing reload despite pending saves');
    isReloading = true;
    window.location.replace(window.location.pathname + '?_cb=' + Date.now());
  }, 30000);
  
  // Check again in 1 second
  setTimeout(() => {
    if (!isReloading && getPendingCount() === 0) {
      clearTimeout(timeoutId);
      console.log('✅ All saves completed, reloading now...');
      isReloading = true;
      window.location.replace(window.location.pathname + '?_cb=' + Date.now());
    }
  }, 1000);
}

/**
 * Fetch /build-id.json from network (bypassing SW + HTTP cache)
 * and compare against the compile-time BUILD_ID.
 */
async function checkVersionFromNetwork() {
  if (isReloading || BUILD_ID === 'dev') return;

  try {
    const res = await fetch('/build-id.json', { cache: 'no-store' });
    if (!res.ok) return;

    const { id: serverId } = await res.json();
    if (serverId && serverId !== BUILD_ID) {
      console.log(`🔄 Network version mismatch: local=${BUILD_ID} server=${serverId}`);
      await forceClearCachesAndReload();
    }
  } catch {
    // Network error — skip silently (offline, etc.)
  }
}

/**
 * Initialize version watcher with network-based checks.
 */
export function initVersionWatcher() {
  // 1. Service Worker message listener
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NEW_VERSION_AVAILABLE') {
        console.log('📬 Service Worker detected new version');
        safeReload();
      }
    });
  }

  // 2. Network check after 3s (gives build time to finish)
  setTimeout(checkVersionFromNetwork, 3000);

  // 3. Periodic check every 60s
  setInterval(checkVersionFromNetwork, 60_000);

  // 4. Check when tab becomes visible again
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      checkVersionFromNetwork();
    }
  });
}

/**
 * Helper: Triggered by API response or external event
 */
export function triggerVersionCheckFromAPI() {
  console.log('🔔 API triggered version check — reloading');
  safeReload();
}

/**
 * Setup Service Worker controller change listener.
 * Call this early in app initialization (main.tsx).
 */
export function setupServiceWorkerListener() {
  if ('serviceWorker' in navigator) {
    // Force check for SW updates on every page load
    navigator.serviceWorker.ready.then((registration) => {
      registration.update().catch(console.error);
    });

    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!isReloading) {
        console.log('🔄 New Service Worker took control, reloading...');
        isReloading = true;
        window.location.replace(window.location.pathname + '?_cb=' + Date.now());
      }
    });
  }
}
