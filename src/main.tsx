import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { CookieConsent } from './components/CookieConsent.tsx'
import './index.css'

// Version Watcher für Auto-Reload bei neuen Deployments
import { initVersionWatcher } from './lib/version';
// QA Error Capture
import { initErrorCapture, loadPersistedErrors } from './lib/qa/errorCapture';

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

// Initialize QA error capture
initErrorCapture();
if (import.meta.env.DEV) {
  loadPersistedErrors();
}

// Version-Check initialisieren
initVersionWatcher();

createRoot(container).render(
  <React.StrictMode>
    <App />
    <CookieConsent />
  </React.StrictMode>
);
