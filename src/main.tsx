import React from 'react'
import { createRoot } from 'react-dom/client'
import App from './App.tsx'
import { CookieConsent } from './components/CookieConsent.tsx'
import './index.css'

// Import weather test for dev console
import './utils/weatherSystemTest.ts';

const container = document.getElementById("root");
if (!container) throw new Error("Root element not found");

createRoot(container).render(
  <React.StrictMode>
    <App />
    <CookieConsent />
  </React.StrictMode>
);
