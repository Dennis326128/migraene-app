import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import './index.css'

// Initialize i18n before app renders
import '@/lib/i18n/i18n';

// Version Watcher für Auto-Reload bei neuen Deployments
import { initVersionWatcher, checkAppVersion, setupServiceWorkerListener } from './lib/version';
// QA Error Capture
import { initErrorCapture, loadPersistedErrors } from './lib/qa/errorCapture';

// CRITICAL: Setup SW listener FIRST - catches controller changes early
setupServiceWorkerListener();

// CRITICAL: Check app version - this may trigger reload
if (checkAppVersion()) {
  // Reload triggered, skip rendering - page will reload
  console.log('App version changed, reload in progress...');
} else {

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

// Initialize QA error capture
initErrorCapture();
if (import.meta.env.DEV) {
  loadPersistedErrors();
}

// Version-Check initialisieren (aggressive checks on tab focus)
initVersionWatcher();

createRoot(container).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
}
