// Service Worker für Offline-Funktionalität
const CACHE_NAME = 'migraine-app-v1.0.0';
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
  STATIC: /\.(js|css|png|jpg|jpeg|gif|svg|woff2?)$/,
  
  // HTML Pages - Stale While Revalidate
  PAGES: /^https?:\/\/[^\/]+\/?$/
};

// Install Event
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => cache.addAll(CRITICAL_RESOURCES))
      .then(() => self.skipWaiting())
  );
});

// Activate Event
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(cacheName => cacheName !== CACHE_NAME)
            .map(cacheName => caches.delete(cacheName))
        );
      })
      .then(() => self.clients.claim())
  );
});

// Fetch Event mit intelligenten Cache-Strategien
self.addEventListener('fetch', (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Nur GET Requests cachen
  if (request.method !== 'GET') return;

  // API Calls - Network First
  if (CACHE_STRATEGIES.API.test(request.url)) {
    event.respondWith(networkFirstStrategy(request));
    return;
  }

  // Statische Assets - Cache First
  if (CACHE_STRATEGIES.STATIC.test(request.url)) {
    event.respondWith(cacheFirstStrategy(request));
    return;
  }

  // HTML Pages - Stale While Revalidate
  if (request.destination === 'document') {
    event.respondWith(staleWhileRevalidateStrategy(request));
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
  if (event.data) {
    const data = event.data.json();
    
    const options = {
      body: data.body || 'Vergessen Sie nicht Ihren Migräne-Eintrag!',
      icon: '/favicon.ico',
      badge: '/favicon.ico',
      actions: [
        {
          action: 'open-app',
          title: 'App öffnen'
        },
        {
          action: 'dismiss',
          title: 'Später'
        }
      ],
      requireInteraction: true,
      tag: 'migraine-reminder'
    };

    event.waitUntil(
      self.registration.showNotification(data.title || 'Migräne-App', options)
    );
  }
});

// Notification Click Handler
self.addEventListener('notificationclick', (event) => {
  event.notification.close();

  if (event.action === 'open-app') {
    event.waitUntil(
      clients.matchAll({ type: 'window' }).then(clientList => {
        if (clientList.length > 0) {
          return clientList[0].focus();
        }
        return clients.openWindow('/');
      })
    );
  }
});

// Hilfsfunktion für Background Sync
async function syncPendingData() {
  // Implementierung für das Synchronisieren von offline gespeicherten Daten
  console.log('Background sync triggered');
  // Hier würden wir offline gespeicherte Einträge an die API senden
}