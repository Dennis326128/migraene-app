import { checkForNewVersionAndReload } from './version';

export async function apiFetch(input: RequestInfo, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const buildId = import.meta.env.VITE_BUILD_ID || 'dev';
  const clientVersion = localStorage.getItem('clientVersion') ?? buildId;
  headers.set('X-Client-Version', clientVersion);
  
  const res = await fetch(input, { ...init, headers });
  
  if (!res.ok) {
    try {
      const body = await res.clone().json();
      if (body?.hint === 'CHECK_VERSION') {
        console.warn('⚠️ Server requests version check');
        await checkForNewVersionAndReload();
      }
    } catch {
      // Body nicht JSON oder bereits consumed
    }
  }
  
  return res;
}
