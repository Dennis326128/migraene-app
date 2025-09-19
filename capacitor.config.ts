import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.painlog.zen',
  appName: 'PainLogZen',
  webDir: 'dist',
  server: {
    url: 'https://4ca02bd4-0ea3-401f-af2f-386223f9dcd0.lovableproject.com?forceHideBadge=true',
    cleartext: true
  },
  plugins: {
    SplashScreen: {
      launchShowDuration: 2000,
      backgroundColor: "#1C1C1E",
      showSpinner: false
    }
  }
};

export default config;