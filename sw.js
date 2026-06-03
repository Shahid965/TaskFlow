// ================================================================
// sw.js — TaskFlow OS Service Worker
// Enables: Offline support, fast loading, PWA installability
// Strategy: Cache-first for static assets, Network-first for data
// ================================================================

const CACHE_NAME    = 'taskflow-v2.0';
const OFFLINE_URL   = './offline.html';

// Files to cache immediately when SW installs
// These make the app load instantly on repeat visits
const PRECACHE_ASSETS = [
  './index.html',
  './styles.css',
  './app.js',
  './auth.js',
  './firebase-config.js',
  './manifest.json',
  './offline.html',
  './assets/icons/icon-192.png',
  './assets/icons/icon-512.png',
  // Google Fonts (cached after first load)
  'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap'
];

// ----------------------------------------------------------------
// INSTALL — Cache all static assets
// ----------------------------------------------------------------
self.addEventListener('install', event => {
  console.log('[SW] Installing TaskFlow OS Service Worker...');

  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('[SW] Pre-caching assets');
        // Cache what we can; don't fail install if some assets miss
        return Promise.allSettled(
          PRECACHE_ASSETS.map(url =>
            cache.add(url).catch(err => console.warn('[SW] Could not cache:', url, err))
          )
        );
      })
      .then(() => {
        console.log('[SW] Installation complete');
        // Activate immediately without waiting
        return self.skipWaiting();
      })
  );
});

// ----------------------------------------------------------------
// ACTIVATE — Clean up old caches from previous versions
// ----------------------------------------------------------------
self.addEventListener('activate', event => {
  console.log('[SW] Activating TaskFlow OS Service Worker...');

  event.waitUntil(
    caches.keys()
      .then(cacheNames => {
        return Promise.all(
          cacheNames
            .filter(name => name !== CACHE_NAME)
            .map(name => {
              console.log('[SW] Deleting old cache:', name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log('[SW] Now controlling all pages');
        return self.clients.claim();
      })
  );
});

// ----------------------------------------------------------------
// FETCH — Intercept all network requests
// Strategy:
//   Firebase requests  → Network only (always needs fresh auth data)
//   Google Fonts       → Cache first, then network
//   Our app files      → Cache first, update in background
//   Everything else    → Network first, fall back to cache
// ----------------------------------------------------------------
self.addEventListener('fetch', event => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests (POST, etc.)
  if (request.method !== 'GET') return;

  // Skip Firebase API calls — always need fresh auth/data
  if (
    url.hostname.includes('firebaseio.com') ||
    url.hostname.includes('firestore.googleapis.com') ||
    url.hostname.includes('identitytoolkit.googleapis.com') ||
    url.hostname.includes('securetoken.googleapis.com') ||
    url.hostname.includes('firebase.googleapis.com')
  ) {
    // Let Firebase handle its own requests
    return;
  }

  // Google Fonts → Cache first
  if (url.hostname.includes('fonts.googleapis.com') || url.hostname.includes('fonts.gstatic.com')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Our own app files → Cache first, update in background
  if (url.origin === self.location.origin) {
    event.respondWith(staleWhileRevalidate(request));
    return;
  }

  // Firebase JS SDKs → Cache first
  if (url.hostname.includes('gstatic.com') || url.hostname.includes('googleapis.com')) {
    event.respondWith(cacheFirst(request));
    return;
  }

  // Default → Network first, fallback to cache
  event.respondWith(networkFirst(request));
});

// ----------------------------------------------------------------
// CACHING STRATEGIES
// ----------------------------------------------------------------

/**
 * Cache First: Return cached version immediately.
 * If not cached, fetch from network and cache it.
 */
async function cacheFirst(request) {
  const cached = await caches.match(request);
  if (cached) return cached;

  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    return offlineFallback(request);
  }
}

/**
 * Stale While Revalidate: Return cached version immediately,
 * then update cache in background for next visit.
 * Best for app shell files — feels instant, stays up to date.
 */
async function staleWhileRevalidate(request) {
  const cached = await caches.match(request);

  // Update cache in the background
  const fetchPromise = fetch(request)
    .then(networkResponse => {
      if (networkResponse.ok) {
        caches.open(CACHE_NAME).then(cache => cache.put(request, networkResponse.clone()));
      }
      return networkResponse;
    })
    .catch(() => null);

  // Return cached immediately, or wait for network if not cached
  return cached || fetchPromise || offlineFallback(request);
}

/**
 * Network First: Try network, fall back to cache.
 * If both fail, show offline page.
 */
async function networkFirst(request) {
  try {
    const networkResponse = await fetch(request);
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }
    return networkResponse;
  } catch {
    const cached = await caches.match(request);
    return cached || offlineFallback(request);
  }
}

/**
 * Return offline.html for navigation requests when offline,
 * or a simple offline response for other requests.
 */
async function offlineFallback(request) {
  if (request.destination === 'document') {
    const offlinePage = await caches.match(OFFLINE_URL);
    if (offlinePage) return offlinePage;
  }
  return new Response('Offline', { status: 503, statusText: 'Service Unavailable' });
}

// ----------------------------------------------------------------
// PUSH NOTIFICATIONS (future use)
// ----------------------------------------------------------------
self.addEventListener('push', event => {
  if (!event.data) return;

  const data = event.data.json();
  event.waitUntil(
    self.registration.showNotification(data.title || 'TaskFlow OS', {
      body:  data.body  || 'You have a task update',
      icon:  './assets/icons/icon-192.png',
      badge: './assets/icons/icon-192.png',
      tag:   'taskflow-notification',
      data:  { url: data.url || './' }
    })
  );
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url || './')
  );
});
