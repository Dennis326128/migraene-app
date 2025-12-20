// Service Worker für Offline-Funktionalität
// NOTE: Cache-Version wird bewusst erhöht, um stale CSS/JS (z.B. falsche Farben) zu vermeiden.
const CACHE_NAME = 'migraine-app-v1.0.1';
const OFFLINE_URL = '/offline.html';

// Kritische Ressourcen für Offline-Betrieb
const CRITICAL_RESOURCES = [
  '/',
  '/auth',
  '/offline.html',
  '/manifest.json',
  // Wichtige JS/CSS werden automatisch von Vite gecacht
];

// Cache-Strategien
const CACHE_STRATEGIES = {
  // API calls - Network First mit Fallback
  API: /^https:\/\/.*\.supabase\.co\/rest\/v1\//,

  // Statische Assets - Cache First
  STATIC: /\.(png|jpg|jpeg|gif|svg|woff2?)$/,

  // HTML Pages - Stale While Revalidate
  PAGES: /^https?:\/\/[^\/]+\/?$/
};

// Install Event - Aggressive Update
self.addEventListener('install', (event) => {
  console.log('[SW] Installing new version...');
  self.skipWaiting(); // Sofort aktivieren, nicht auf alte Tabs warten
});

// Activate Event - Aggressive Cache Busting + Client Notification
self.addEventListener('activate', (event) => {
  console.log('[SW] Activating...');
  event.waitUntil(
    (async () => {
      // Alle Caches löschen (auch den vorherigen Cache-Namen), um stale CSS/JS zu vermeiden
      const keys = await caches.keys();
      await Promise.all(keys.map((k) => caches.delete(k)));

      // Alle Clients übernehmen
      await self.clients.claim();

      // Clients benachrichtigen, dass neue Version da ist
      const clients = await self.clients.matchAll({ type: 'window' });
      clients.forEach((client) => {
        client.postMessage({ type: 'NEW_VERSION_AVAILABLE' });
      });
    })()
  );
});

// Fetch Event mit intelligenten Cache-Strategien
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // WICHTIG: build-id.txt niemals cachen (immer fresh vom Server)
  if (url.pathname.endsWith('/build-id.txt')) {
    event.respondWith(fetch(request, { cache: 'no-store' }));
    return;
  }

  // Nur GET Requests cachen
  if (request.method !== 'GET') return;

  // Scripts & Styles: Network First (verhindert "alte" UI-Farben durch Cache)
  if (request.destination === 'script' || request.destination === 'style') {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // API Calls - Network First
  if (CACHE_STRATEGIES.API.test(request.url)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Statische Assets (Bilder/Fonts) - Cache First
  if (CACHE_STRATEGIES.STATIC.test(request.url)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // HTML Pages - NICHT cachen (immer fresh vom Server)
  if (request.destination === 'document') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  // Default: Network with cache fallback
  event.respondWith(networkWithCacheFallback(request));
});

// Network First Strategy (für API calls)
async function networkFirstStrategy(request) {
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    const cachedResponse = await caches.match(request);
    
    if (cachedResponse) {
      return cachedResponse;
    }
    
    // Offline fallback für wichtige API calls
    if (request.url.includes('/events') || request.url.includes('/pain_entries')) {
      return new Response(JSON.stringify([]), {
        headers: { 'Content-Type': 'application/json' },
        status: 200
      });
    }
    
    throw error;
  }
}

// Cache First Strategy (für statische Assets)
async function cacheFirstStrategy(request) {
  const cachedResponse = await caches.match(request);
  
  if (cachedResponse) {
    return cachedResponse;
  }
  
  try {
    const networkResponse = await fetch(request);
    
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    
    return networkResponse;
  } catch (error) {
    // Fallback für fehlende Assets
    return new Response('', { status: 404 });
  }
}

// Stale While Revalidate (für HTML pages)
async function staleWhileRevalidateStrategy(request) {
  const cachedResponse = await caches.match(request);
  
  const fetchPromise = fetch(request).then(networkResponse => {
    if (networkResponse.ok) {
      const cache = caches.open(CACHE_NAME);
      cache.then(c => c.put(request, networkResponse.clone()));
    }
    return networkResponse;
  }).catch(() => cachedResponse);

  return cachedResponse || fetchPromise;
}

// Network with Cache Fallback
async function networkWithCacheFallback(request) {
  try {
    return await fetch(request);
  } catch (error) {
    const cachedResponse = await caches.match(request);
    return cachedResponse || caches.match(OFFLINE_URL);
  }
}

// Background Sync für verzögerte API calls
self.addEventListener('sync', (event) => {
  if (event.tag === 'background-sync-events') {
    event.waitUntil(syncPendingData());
  }
});

// Push Notifications für Erinnerungen
self.addEventListener('push', (event) => {
  console.log('Push received:', event);
  
  const data = event.data ? event.data.json() : {};
  const title = data.title || 'Migräne Tagebuch';
  const options = {
    body: data.body || 'Zeit für deine Erinnerung',
    icon: data.icon || '/favicon.ico',
    badge: data.badge || '/favicon.ico',
    tag: data.tag || 'migraine-reminder',
    data: data.data || {},
    requireInteraction: true,
    actions: [
      {
        action: 'open',
        title: 'Öffnen'
      },
      {
        action: 'dismiss',
        title: 'Schließen'
      }
    ]
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  console.log('Notification click:', event);
  
  event.notification.close();

  if (event.action === 'dismiss') {
    return;
  }

  // Get the URL from notification data or default to home
  const urlToOpen = event.notification.data?.url || '/';

  // Open or focus the app window
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true })
      .then((windowClients) => {
        // Check if there's already a window open
        for (let client of windowClients) {
          if (client.url.includes(self.location.origin) && 'focus' in client) {
            return client.focus().then((client) => {
              // Navigate to the specific URL
              if (client.navigate) {
                return client.navigate(urlToOpen);
              }
              return client;
            });
          }
        }
        // If no window is open, open a new one
        if (clients.openWindow) {
          return clients.openWindow(urlToOpen);
        }
      })
  );
});

// Hilfsfunktion für Background Sync
async function syncPendingData() {
  // Implementierung für das Synchronisieren von offline gespeicherten Daten
  console.log('Background sync triggered');
  // Hier würden wir offline gespeicherte Einträge an die API senden
}

// Background Sync für Offline-Queue
self.addEventListener('sync', async (event) => {
  if (event.tag === 'sync-pending-entries') {
    event.waitUntil(
      (async () => {
        console.log('🔄 Background Sync triggered');
        
        // Nachricht an Client senden, um Sync auszuführen
        const clients = await self.clients.matchAll();
        clients.forEach(client => {
          client.postMessage({
            type: 'SYNC_PENDING_ENTRIES'
          });
        });
      })()
    );
  }
});

// Periodic Background Sync (wenn unterstützt)
self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'sync-weather-backfill') {
    event.waitUntil(
      (async () => {
        console.log('🌤️ Periodic weather backfill triggered');
        // Wird von Client behandelt
      })()
    );
  }
});