const PREVIEW_SW_RESET_PARAM = '_preview_sw_reset';

function safeRemoveStorageKey(key: string) {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Ignore storage access errors in restricted browser contexts.
  }
}

export function isLovablePreviewHost(hostname = window.location.hostname) {
  return hostname.includes('id-preview--') || hostname.includes('lovableproject.com');
}

export function isEmbeddedRuntime() {
  try {
    return window.self !== window.top;
  } catch {
    return true;
  }
}

export function shouldDisableServiceWorkerRuntime() {
  return isLovablePreviewHost() || isEmbeddedRuntime();
}

export function cleanupPreviewResetParam() {
  const url = new URL(window.location.href);

  if (!url.searchParams.has(PREVIEW_SW_RESET_PARAM)) return;

  url.searchParams.delete(PREVIEW_SW_RESET_PARAM);
  window.history.replaceState({}, '', url.pathname + url.search + url.hash);
}

export function reloadAfterPreviewCacheCleanup() {
  const url = new URL(window.location.href);

  if (url.searchParams.has(PREVIEW_SW_RESET_PARAM)) {
    return false;
  }

  url.searchParams.set(PREVIEW_SW_RESET_PARAM, Date.now().toString());
  window.location.replace(url.pathname + url.search + url.hash);
  return true;
}

export async function cleanupPreviewServiceWorkers() {
  let hadRegistrations = false;
  let hadController = false;
  let hadCaches = false;

  safeRemoveStorageKey('app_version');
  safeRemoveStorageKey('build_id');

  try {
    hadController = Boolean(navigator.serviceWorker?.controller);
  } catch {
    hadController = false;
  }

  try {
    if ('serviceWorker' in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      hadRegistrations = registrations.length > 0;

      await Promise.all(
        registrations.map((registration) => registration.unregister().catch(() => false))
      );
    }
  } catch (err) {
    console.warn('[PWA] Failed to unregister preview service workers', err);
  }

  try {
    if ('caches' in window) {
      const cacheKeys = await caches.keys();
      hadCaches = cacheKeys.length > 0;
      await Promise.all(cacheKeys.map((cacheKey) => caches.delete(cacheKey)));
    }
  } catch (err) {
    console.warn('[PWA] Failed to clear preview caches', err);
  }

  return hadController || hadRegistrations || hadCaches;
}