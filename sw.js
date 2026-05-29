// CACHE_VERSION follows LAZY_PANDA_BUILD (defined in js/version.js).
// Bump that single constant on each release; the SW cache invalidates automatically.
try { importScripts('./js/version.js'); } catch (e) { /* SW may be parsed before file ships */ }
const _BUILD = (typeof LAZY_PANDA_BUILD === 'string' && LAZY_PANDA_BUILD) ? LAZY_PANDA_BUILD : 'unversioned';
const CACHE_VERSION = 'lazy-panda-v' + _BUILD;
const CACHE_NAME = CACHE_VERSION;
const FONT_CACHE = 'lazy-panda-fonts-v1';
const MAX_CACHE_AGE = 30 * 24 * 60 * 60 * 1000; // 30 days for fonts
const APP_SHELL = [
  './',
  './index.html',
  './offline.html',
  './manifest.json',
  './icon.png',
  './panda.svg',
  './css/style.css',
  './js/version.js',
  './js/state.js',
  './js/render.js',
  './js/ai.js',
  './js/app.js',
  './js/flashcards.js',
  './js/onboarding.js',
  './js/weekly-review.js',
  './js/drag-reschedule.js',
  './js/auto-scheduler.js',
  './js/privacy-lock.js'
];

self.addEventListener('install', function(e) {
  e.waitUntil(
    caches.open(CACHE_NAME)
      .then(function(cache) {
        return cache.addAll(APP_SHELL);
      })
      .then(function() {
        return self.skipWaiting();
      })
  );
});

self.addEventListener('activate', function(e) {
  e.waitUntil(
    caches.keys()
      .then(function(keys) {
        return Promise.all(
          keys
            .filter(function(key) { return key.startsWith('lazy-panda-') && key !== CACHE_NAME && key !== FONT_CACHE; })
            .map(function(key) { return caches.delete(key); })
        );
      })
      .then(function() {
        return self.clients.claim();
      })
  );
});

function isSameOrigin(url) {
  return url.origin === self.location.origin;
}

function isAppShellAsset(url) {
  return (
    url.pathname.endsWith('.css') ||
    url.pathname.endsWith('.js') ||
    url.pathname.endsWith('.svg') ||
    url.pathname.endsWith('.json') ||
    url.pathname.endsWith('.png') ||
    url.pathname.endsWith('.jpg') ||
    url.pathname.endsWith('.jpeg') ||
    url.pathname.endsWith('.webp')
  );
}

function networkFirst(request) {
  return fetch(request)
    .then(function(response) {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(CACHE_NAME).then(function(cache) {
          cache.put(request, copy);
        });
      }
      return response;
    })
    .catch(function() {
      return caches.match(request).then(function(cached) {
        if (cached) return cached;
        if (request.mode === 'navigate') return caches.match('./offline.html');
        return Response.error();
      });
    });
}

function staleWhileRevalidate(request) {
  return caches.match(request).then(function(cached) {
    const networkFetch = fetch(request)
      .then(function(response) {
        if (response && response.ok) {
          const copy = response.clone();
          caches.open(CACHE_NAME).then(function(cache) {
            cache.put(request, copy);
          });
        }
        return response;
      })
      .catch(function() {
        return cached;
      });

    return cached || networkFetch;
  });
}

function cacheFirst(request, cacheName) {
  const cName = cacheName || CACHE_NAME;
  return caches.match(request).then(function(cached) {
    if (cached) return cached;
    return fetch(request).then(function(response) {
      if (response && response.ok) {
        const copy = response.clone();
        caches.open(cName).then(function(cache) {
          cache.put(request, copy);
        });
      }
      return response;
    }).catch(function() {
      return cached || Response.error();
    });
  });
}

self.addEventListener('fetch', function(e) {
  if (e.request.method !== 'GET') return;

  const url = new URL(e.request.url);

  // Gemini API - always pass through (never cache)
  if (url.hostname === 'generativelanguage.googleapis.com') {
    return; // browser handles it
  }

  // Google Fonts - Cache First with long TTL
  if (url.hostname === 'fonts.googleapis.com' || url.hostname === 'fonts.gstatic.com') {
    e.respondWith(cacheFirst(e.request, FONT_CACHE));
    return;
  }

  if (!isSameOrigin(url)) {
    return;
  }

  if (e.request.mode === 'navigate') {
    e.respondWith(networkFirst(e.request));
    return;
  }

  if (isAppShellAsset(url)) {
    e.respondWith(staleWhileRevalidate(e.request));
    return;
  }

  e.respondWith(networkFirst(e.request));
});

self.addEventListener('periodicsync', (event) => {
  if (event.tag === 'check-notifications') {
    event.waitUntil(checkUpcomingNotificationsBackground());
  }
  if (event.tag === 'auto-sync-cloud') {
    event.waitUntil(autoSyncCloudBackground());
  }
});

async function checkUpcomingNotificationsBackground() {
  try {
    // Try to access localStorage from service worker context
    // Note: Service Worker cannot access localStorage directly in most browsers
    // This is a fallback that would need to use IndexedDB in production
    // For now, we signal the client to check
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BACKGROUND_NOTIFICATION_CHECK'
      });
    });
    return Promise.resolve();
  } catch(e) {
    console.error('Background notification check failed:', e);
    return Promise.resolve();
  }
}

async function autoSyncCloudBackground() {
  try {
    // Signal all clients to trigger background sync
    const clients = await self.clients.matchAll();
    clients.forEach(client => {
      client.postMessage({
        type: 'BACKGROUND_CLOUD_SYNC'
      });
    });
    return Promise.resolve();
  } catch(e) {
    console.error('Background cloud sync failed:', e);
    return Promise.resolve();
  }
}
