import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { CookieConsent } from './components/CookieConsent.tsx'
import './index.css'

// Import weather test for dev console
import './utils/weatherSystemTest.ts';

// Version Watcher für Auto-Reload bei neuen Deployments
import { initVersionWatcher } from './lib/version';

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

// Version-Check initialisieren
initVersionWatcher();

createRoot(container).render(
  <React.StrictMode>
    <App />
    <CookieConsent />
  </React.StrictMode>
);
