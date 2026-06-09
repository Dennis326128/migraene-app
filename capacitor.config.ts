import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.miary.app',
  appName: 'Miary',
  webDir: 'dist',
  
  // For development: uncomment to enable hot-reload from Lovable preview
  // server: {
  //   url: 'https://cbe03472-b138-40c1-9796-1c21073e1d39.lovableproject.com?forceHideBadge=true',
  //   cleartext: true
  // },
  
  plugins: {
    SplashScreen: {
      // Splash bleibt sichtbar, bis wir ihn aus main.tsx manuell ausblenden.
      // Verhindert zu frühes Verschwinden und damit White-Flash.
      launchAutoHide: false,
      launchShowDuration: 3000, // Fallback, falls hide() nie aufgerufen wird
      backgroundColor: "#14171C", // muss zu html/body Background passen
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      androidScaleType: "CENTER_CROP",
      androidSplashResourceName: "splash",
      useDialog: false,
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: "#14171C"
    },
    Keyboard: {
      resize: 'body',
      resizeOnFullScreen: true
    }
  },
  
  ios: {
    contentInset: 'automatic',
    preferredContentMode: 'mobile',
    scrollEnabled: true,
    allowsLinkPreview: false,
    handleApplicationNotifications: false
  }
};

export default config;
