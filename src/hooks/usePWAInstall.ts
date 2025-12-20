import { useState, useEffect } from 'react';

interface PWAInstallState {
  isIOS: boolean;
  isIOSSafari: boolean;
  isStandalone: boolean;
  canShowInstallPrompt: boolean;
}

export function usePWAInstall(): PWAInstallState {
  const [state, setState] = useState<PWAInstallState>({
    isIOS: false,
    isIOSSafari: false,
    isStandalone: false,
    canShowInstallPrompt: false,
  });

  useEffect(() => {
    const ua = navigator.userAgent;
    
    // iOS Detection
    const isIOS = /iPad|iPhone|iPod/.test(ua) && !(window as any).MSStream;
    
    // Safari Detection (nicht Chrome/Firefox auf iOS)
    const isIOSSafari = isIOS && 
      /Safari/.test(ua) && 
      !/CriOS/.test(ua) && // Chrome auf iOS
      !/FxiOS/.test(ua) && // Firefox auf iOS
      !/OPiOS/.test(ua) && // Opera auf iOS
      !/EdgiOS/.test(ua);  // Edge auf iOS
    
    // Standalone Mode Check (bereits installiert)
    const isStandalone = 
      (window.navigator as any).standalone === true || // iOS
      window.matchMedia('(display-mode: standalone)').matches; // Android/Desktop
    
    // Zeige Install-Prompt nur wenn iOS Safari UND nicht bereits installiert
    const canShowInstallPrompt = isIOSSafari && !isStandalone;

    setState({
      isIOS,
      isIOSSafari,
      isStandalone,
      canShowInstallPrompt,
    });
  }, []);

  return state;
}
