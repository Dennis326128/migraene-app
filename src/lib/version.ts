export const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev';
export const APP_VERSION = '4.0.1'; // Increment on significant UI changes

let hasCheckedOnce = false;
let isReloading = false;

/**
 * Force clear all caches and reload
 */
export async function forceClearCachesAndReload() {
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
 * Check for new version and reload if needed
 * @param force - Force check even if already checked
 */
export async function checkForNewVersionAndReload(force = false) {
  // Nur einmal checken, außer force=true
  if (!force && hasCheckedOnce) return;
  if (isReloading) return; // Prevent double-reload

  try {
    const res = await fetch('/build-id.txt', { 
      cache: 'no-store',
      headers: { 'Cache-Control': 'no-cache' }
    });
    
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    
    const remote = (await res.text()).trim();
    const local = localStorage.getItem('build_id') || '';

    hasCheckedOnce = true;

    // Neue Version erkannt
    if (remote && local && remote !== local) {
      console.log(`🔄 New version detected: ${remote} (current: ${local})`);
      isReloading = true;

      // Service Worker updaten
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.update().catch(() => {})));

        // If a new SW is waiting (vite-plugin-pwa registerType: 'prompt'),
        // explicitly activate it so we don't reload into the old cached UI.
        try {
          const reg = await navigator.serviceWorker.getRegistration();
          if (reg?.waiting) {
            reg.waiting.postMessage({ type: 'SKIP_WAITING' });
          }
        } catch {
          // ignore
        }
      }

      // localStorage updaten VOR Reload
      localStorage.setItem('build_id', remote);
      
      // Reload
      location.reload();
      return;
    }

    // Nur speichern, wenn noch nicht gesetzt oder neu
    if (remote && remote !== local) {
      localStorage.setItem('build_id', remote);
    }

  } catch (err) {
    console.warn('Version check failed:', err);
  }
}

/**
 * Initialize version watcher with efficient strategy
 */
export function initVersionWatcher() {
  // 1. Beim App-Start einmal checken
  checkForNewVersionAndReload();

  // 2. Bei Tab-Visibility-Change (User kehrt zurück)
  let lastCheck = Date.now();
  const MIN_CHECK_INTERVAL = 5 * 60 * 1000; // 5 Min Cooldown

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      const now = Date.now();
      // Nur checken, wenn mindestens 5 Min seit letztem Check
      if (now - lastCheck > MIN_CHECK_INTERVAL) {
        console.log('👁️ Tab visible again, checking for updates...');
        lastCheck = now;
        checkForNewVersionAndReload(true); // force=true
      }
    }
  });

  // 3. Service Worker Message Listener
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'NEW_VERSION_AVAILABLE') {
        console.log('📬 Service Worker detected new version');
        checkForNewVersionAndReload(true);
      }
    });
  }
}

/**
 * Helper: Manuell triggered durch API-Response (optional)
 */
export function triggerVersionCheckFromAPI() {
  console.log('🔔 API requested version check');
  checkForNewVersionAndReload(true);
}
