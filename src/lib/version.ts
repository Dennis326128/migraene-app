export const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev';

let hasCheckedOnce = false;
let isReloading = false;

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
