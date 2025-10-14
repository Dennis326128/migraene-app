export const BUILD_ID = import.meta.env.VITE_BUILD_ID || 'dev';

export async function checkForNewVersionAndReload() {
  try {
    const res = await fetch('/build-id.txt', { cache: 'no-store' });
    const remote = (await res.text()).trim();
    const local = localStorage.getItem('build_id') || '';
    if (remote && local && remote !== local) {
      console.log(`🔄 New version detected: ${remote} (current: ${local})`);
      if ('serviceWorker' in navigator) {
        const regs = await navigator.serviceWorker.getRegistrations();
        await Promise.all(regs.map(r => r.update().catch(() => {})));
      }
      location.reload();
    }
    if (remote) localStorage.setItem('build_id', remote);
  } catch (err) {
    console.warn('Version check failed:', err);
  }
}

export function initVersionWatcher() {
  // beim App-Start und dann alle 10 Minuten checken
  checkForNewVersionAndReload();
  setInterval(checkForNewVersionAndReload, 10 * 60 * 1000);
}
