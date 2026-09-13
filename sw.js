// MCE PYQ Hub - High Performance PWA Service Worker
// Version: 1.1.0
const CACHE_NAME = 'mce-pyq-static-v1.1.0';

const PRECACHE_ASSETS = [
    '/',
    '/index.html',
    '/manifest.json',
    '/style.css?v=18.0',
    '/script.js?v=13.0',
    '/study-companion.js',
    '/mce-logo.png',
    '/icons/icon-192.png',
    '/icons/icon-512.png',
    '/icons/favicon.png'
];

// Install: Pre-cache essential static assets
self.addEventListener('install', (event) => {
    event.waitUntil(
        caches.open(CACHE_NAME).then((cache) => {
            return cache.addAll(PRECACHE_ASSETS).catch((err) => {
                console.warn('Non-critical pre-cache item failed', err);
            });
        }).then(() => self.skipWaiting())
    );
});

// Activate: Clean up any outdated caches
self.addEventListener('activate', (event) => {
    event.waitUntil(
        caches.keys().then((keys) => {
            return Promise.all(
                keys.map((key) => {
                    if (key !== CACHE_NAME) {
                        return caches.delete(key);
                    }
                })
            );
        }).then(() => self.clients.claim())
    );
});

// Fetch Handler
self.addEventListener('fetch', (event) => {
    const request = event.request;
    const url = new URL(request.url);

    // 1. ALWAYS BYPASS CACHE FOR ALL API, ADMIN, AND NON-GET REQUESTS
    // This ensures real-time question paper updates, deletions, and admin security are never cached
    if (
        request.method !== 'GET' ||
        url.pathname.startsWith('/api/') ||
        url.pathname.startsWith('/admin') ||
        url.search.includes('sample=')
    ) {
        event.respondWith(fetch(request));
        return;
    }

    // 2. HTML navigation requests: Network-First with Cache Fallback
    if (request.mode === 'navigate' || (request.headers.get('accept') && request.headers.get('accept').includes('text/html'))) {
        event.respondWith(
            fetch(request)
                .then((networkResponse) => {
                    if (networkResponse && networkResponse.status === 200) {
                        const copy = networkResponse.clone();
                        caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                    }
                    return networkResponse;
                })
                .catch(async () => {
                    const cachedResponse = await caches.match(request);
                    if (cachedResponse) return cachedResponse;
                    return caches.match('/index.html');
                })
        );
        return;
    }

    // 3. Static assets (CSS, JS, Images, Fonts): Stale-While-Revalidate
    event.respondWith(
        caches.match(request).then((cachedResponse) => {
            const fetchPromise = fetch(request).then((networkResponse) => {
                if (networkResponse && networkResponse.status === 200) {
                    const copy = networkResponse.clone();
                    caches.open(CACHE_NAME).then((cache) => cache.put(request, copy));
                }
                return networkResponse;
            }).catch(() => null);

            return cachedResponse || fetchPromise;
        })
    );
});
