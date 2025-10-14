import { triggerVersionCheckFromAPI } from './version';

export async function apiFetch(input: RequestInfo, init: RequestInit = {}) {
  const headers = new Headers(init.headers);
  const buildId = import.meta.env.VITE_BUILD_ID || 'dev';
  headers.set('X-Client-Version', buildId);
  
  const res = await fetch(input, { ...init, headers });
  
  // Server kann via Header mitteilen, dass Client veraltet ist
  if (res.headers.get('X-Version-Outdated') === 'true') {
    console.warn('⚠️ Server reports client is outdated');
    triggerVersionCheckFromAPI();
  }
  
  // Oder via JSON-Body
  if (!res.ok) {
    try {
      const body = await res.clone().json();
      if (body?.hint === 'CHECK_VERSION') {
        console.warn('⚠️ Server requests version check');
        triggerVersionCheckFromAPI();
      }
    } catch {
      // Body nicht JSON oder bereits consumed
    }
  }
  
  return res;
}
