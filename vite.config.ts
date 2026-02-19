import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // Auto-generate unique build ID at compile time
  const buildId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  return {
  server: {
    host: "::",
    port: 8080,
  },
  define: {
    'import.meta.env.VITE_BUILD_ID': JSON.stringify(buildId),
  },
  plugins: [
    react(),
    mode === 'development' && componentTagger(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['apple-touch-icon.png', 'pwa-icons/*.png', 'offline.html'],
      manifest: false,
      workbox: {
        maximumFileSizeToCacheInBytes: 3 * 1024 * 1024,
        // NO html in precache — index.html must always come from network
        globPatterns: ['**/*.{js,css,ico,png,svg,woff,woff2}'],
        runtimeCaching: [
          // Navigation requests (index.html) — NetworkFirst with offline fallback
          {
            urlPattern: ({ request }) => request.mode === 'navigate',
            handler: 'NetworkFirst',
            options: {
              cacheName: 'html-cache',
              networkTimeoutSeconds: 3,
              expiration: {
                maxAgeSeconds: 86400,
              },
            },
          },
          // Supabase API - NetworkOnly (no caching of user data!)
          {
            urlPattern: /^https:\/\/.*\.supabase\.co\/.*/i,
            handler: 'NetworkOnly',
            options: {
              cacheName: 'supabase-api',
            },
          },
          // Fonts
          {
            urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-stylesheets',
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
            },
          },
          {
            urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'google-fonts-webfonts',
              expiration: {
                maxEntries: 30,
                maxAgeSeconds: 60 * 60 * 24 * 365,
              },
              cacheableResponse: {
                statuses: [0, 200],
              },
            },
          },
          // External images
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/i,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images-cache',
              expiration: {
                maxEntries: 100,
                maxAgeSeconds: 60 * 60 * 24 * 30,
              },
            },
          },
        ],
        // No navigateFallback — NetworkFirst handles it above
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/auth\/callback/,
          /^\/~oauth/,
        ],
        cleanupOutdatedCaches: true,
        skipWaiting: true,
        clientsClaim: true,
      },
      devOptions: {
        enabled: false,
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  optimizeDeps: {
    exclude: ["@tanstack/react-query", "@tanstack/react-query-devtools"],
  },
  };
});
