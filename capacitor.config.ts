import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'de.migraina.app',
  appName: 'Migraina',
  webDir: 'dist',
  
  // For development: uncomment to enable hot-reload from Lovable preview
  // server: {
  //   url: 'https://cbe03472-b138-40c1-9796-1c21073e1d39.lovableproject.com?forceHideBadge=true',
  //   cleartext: true
  // },
  
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      launchAutoHide: true,
      backgroundColor: "#1C1C1E",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true
    },
    StatusBar: {
      style: 'Dark',
      backgroundColor: "#1C1C1E"
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
