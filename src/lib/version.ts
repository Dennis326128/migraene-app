import { getPendingCount } from './performance/optimisticSave';

export const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev';
export const APP_VERSION = '4.1.0'; // Increment on significant UI changes

let isReloading = false;
let reloadTimeoutId: ReturnType<typeof setTimeout> | null = null;

/**
 * Force clear all caches and reload
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
    localStorage.removeItem('build_id');
    localStorage.removeItem('app_version');
    
    // 4. Set new version
    localStorage.setItem('app_version', APP_VERSION);
    
    // 5. Hard reload
    location.reload();
  } catch (err) {
    console.error('Cache clear failed:', err);
    location.reload();
  }
}

/**
 * Check if app version changed and force refresh if needed
 */
export function checkAppVersion() {
  const storedVersion = localStorage.getItem('app_version');
  
  if (storedVersion !== APP_VERSION) {
    console.log(`🔄 App version changed: ${storedVersion} → ${APP_VERSION}`);
    localStorage.setItem('app_version', APP_VERSION);
    
    // Only force reload if there was a previous version (not first visit)
    if (storedVersion) {
      forceClearCachesAndReload();
      return true;
    }
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
    location.reload();
    return;
  }
  
  console.log(`⏳ Waiting for ${pendingCount} pending saves before reload...`);
  
  // Set a timeout fallback - reload after 30s even with pending saves
  if (!reloadTimeoutId) {
    reloadTimeoutId = setTimeout(() => {
      console.warn('⚠️ Timeout reached, forcing reload despite pending saves');
      isReloading = true;
      location.reload();
    }, 30000);
  }
  
  // Check again in 1 second
  setTimeout(() => {
    if (!isReloading && getPendingCount() === 0) {
      if (reloadTimeoutId) {
        clearTimeout(reloadTimeoutId);
        reloadTimeoutId = null;
      }
      console.log('✅ All saves completed, reloading now...');
      isReloading = true;
      location.reload();
    }
  }, 1000);
}

/**
 * Check for new version and reload if needed
 * Called on every tab focus - no cooldown
 */
export async function checkForNewVersionAndReload() {
  if (isReloading) return;
  if (!navigator.onLine) return; // Skip if offline
  
  try {
    const res = await fetch('/build-id.txt', { 
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const remote = (await res.text()).trim();
    const local = localStorage.getItem('build_id') || '';

    // Neue Version erkannt
    if (remote && local && remote !== local) {
      console.log(`🔄 New version detected: ${remote} (current: ${local})`);
      localStorage.setItem('build_id', remote);
      
      // Safe reload with pending saves check
      await safeReload();
      return;
    }

    // Erste Initialisierung
    if (remote && !local) {
      localStorage.setItem('build_id', remote);
    }

  } catch (err) {
    console.warn('Version check failed:', err);
  }
}

/**
 * Initialize version watcher with aggressive strategy
 */
export function initVersionWatcher() {
  // 1. Check on app start
  checkForNewVersionAndReload();

  // 2. Check on EVERY tab focus (no cooldown)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      console.log('👁️ Tab visible, checking for updates...');
      checkForNewVersionAndReload();
    }
  });

  // 3. Service Worker message listener
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NEW_VERSION_AVAILABLE') {
        console.log('📬 Service Worker detected new version');
        safeReload();
      }
    });
  }
  
  // 4. Periodic check every 5 minutes while tab is active
  setInterval(() => {
    if (document.visibilityState === 'visible' && navigator.onLine) {
      checkForNewVersionAndReload();
    }
  }, 5 * 60 * 1000);
}

/**
 * Helper: Triggered by API response or external event
 */
export function triggerVersionCheckFromAPI() {
  console.log('🔔 API requested version check');
  checkForNewVersionAndReload();
}

/**
 * Setup Service Worker controller change listener
 * Call this early in app initialization (main.tsx)
 */
export function setupServiceWorkerListener() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (!isReloading) {
        console.log('🔄 New Service Worker took control, reloading...');
        isReloading = true;
        location.reload();
      }
    });
  }
}
