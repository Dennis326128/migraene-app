import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Initialize i18n before app renders
import '@/lib/i18n/i18n';

// Version management
import { initVersionWatcher, checkAppVersion, setupServiceWorkerListener } from './lib/version';
// QA Error Capture
import { initErrorCapture, loadPersistedErrors } from './lib/qa/errorCapture';

const container = document.getElementById('root');
if (!container) throw new Error('Root element not found');

function renderBootstrapFallback(message: string) {
  container.innerHTML = `
    <div class="min-h-screen flex items-center justify-center bg-background text-foreground px-4">
      <p class="text-sm text-muted-foreground">${message}</p>
    </div>
  `;
}

// CRITICAL: Setup SW listener FIRST - catches controller changes early
setupServiceWorkerListener();

// CRITICAL: Check app version - this may trigger reload
if (checkAppVersion()) {
  console.log('App version changed, reload in progress...');
  renderBootstrapFallback('Neue Version wird geladen...');
} else {
// Initialize QA error capture
initErrorCapture();
if (import.meta.env.DEV) {
  loadPersistedErrors();
}

// Version watcher (SW message listener)
initVersionWatcher();

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
}
