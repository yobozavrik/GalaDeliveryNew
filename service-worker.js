// Optimized Service Worker with advanced caching strategies
const CACHE_NAME = 'zakupka-app-v5';
const RUNTIME_CACHE = 'zakupka-runtime-v5';
const NETWORK_TIMEOUT = 5000;

const PRECACHE_URLS = [
    '/',
    '/index.html',
    '/styles.css',
    '/app.js',
    '/src/config.js',
    '/src/state.js',
    '/src/ui.js',
    '/src/network.js',
    '/src/pdf.js',
    '/src/validation.js',
    'https://unpkg.com/lucide@latest/dist/umd/lucide.js',
    'https://cdn.jsdelivr.net/npm/chart.js',
    'https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap'
];

function createOfflineResponse(request) {
    const baseHeaders = { 'Cache-Control': 'no-store' };

    switch (request.destination) {
        case 'script':
        case 'worker':
            return new Response('/* Offline: script unavailable */', {
                status: 503,
                headers: {
                    ...baseHeaders,
                    'Content-Type': 'application/javascript'
                }
            });
        case 'style':
            return new Response('/* Offline: styles unavailable */', {
                status: 503,
                headers: {
                    ...baseHeaders,
                    'Content-Type': 'text/css'
                }
            });
        case 'image':
            return new Response('', {
                status: 503,
                headers: {
                    ...baseHeaders,
                    'Content-Type': 'image/svg+xml'
                }
            });
        default:
            return new Response(JSON.stringify({
                error: 'Offline',
                message: 'No network connection',
                url: request.url
            }), {
                status: 503,
                headers: {
                    ...baseHeaders,
                    'Content-Type': 'application/json'
                }
            });
    }
}

async function fetchWithTimeout(request, timeout = NETWORK_TIMEOUT) {
    if (!timeout) {
        return fetch(request);
    }

    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);

    try {
        return await fetch(request, { signal: controller.signal });
    } finally {
        clearTimeout(id);
    }
}

// Precache essential resources
async function precache() {
    const cache = await caches.open(CACHE_NAME);
    try {
        await cache.addAll(PRECACHE_URLS);
        console.log('[SW] Precached resources');
    } catch (error) {
        console.error('[SW] Precache failed:', error);
    }
}

// Install event
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    event.waitUntil(precache());
    self.skipWaiting(); // Force immediate activation
});

// Activate event - Clean old caches
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    event.waitUntil((async () => {
        const cacheNames = await caches.keys();
        const cachesToDelete = cacheNames.filter(
            cacheName => cacheName !== CACHE_NAME && cacheName !== RUNTIME_CACHE
        );

        await Promise.all(cachesToDelete.map(cache => caches.delete(cache)));
        console.log('[SW] Old caches cleaned');

        await self.clients.claim(); // Take control immediately
    })());
});

// Network-first strategy (for API calls)
async function networkFirst(request) {
    const cache = await caches.open(RUNTIME_CACHE);

    try {
        const networkResponse = await fetchWithTimeout(request);

        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, using cache:', request.url);
        const cachedResponse = await cache.match(request);

        if (cachedResponse) {
            return cachedResponse;
        }

        return createOfflineResponse(request);
    }
}

// Cache-first strategy (for assets)
async function cacheFirst(request) {
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
        return cachedResponse;
    }

    try {
        const networkResponse = await fetch(request);
        const cache = await caches.open(RUNTIME_CACHE);

        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }

        return networkResponse;
    } catch (error) {
        console.error('[SW] Fetch failed:', error);
        return createOfflineResponse(request);
    }
}

// Stale-while-revalidate (for optimal performance)
async function staleWhileRevalidate(request) {
    const cache = await caches.open(RUNTIME_CACHE);
    const cachedResponse = await cache.match(request);

    const fetchPromise = fetch(request).then(networkResponse => {
        if (networkResponse && networkResponse.status === 200) {
            cache.put(request, networkResponse.clone());
        }
        return networkResponse;
    }).catch(() => cachedResponse || createOfflineResponse(request));

    return cachedResponse || fetchPromise;
}

// Network-only strategy (for POST requests)
async function networkOnly(request) {
    try {
        return await fetch(request);
    } catch (error) {
        return new Response(JSON.stringify({
            error: 'Network error',
            message: error.message
        }), {
            headers: { 'Content-Type': 'application/json' },
            status: 503
        });
    }
}

// Fetch event with routing logic
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);

    // Skip chrome-extension and other non-http requests
    if (!url.protocol.startsWith('http')) {
        return;
    }

    // POST/PUT/DELETE requests - network only
    if (request.method !== 'GET') {
        event.respondWith(networkOnly(request));
        return;
    }

    // API requests - network first
    if (url.pathname.startsWith('/api/') || url.hostname.includes('n8n.dmytrotovstytskyi.online')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // HTML navigation - network first (for updates)
    if (request.mode === 'navigate' || request.headers.get('accept')?.includes('text/html')) {
        event.respondWith(networkFirst(request));
        return;
    }

    // External CDN resources - stale while revalidate
    if (url.hostname !== self.location.hostname) {
        event.respondWith(staleWhileRevalidate(request));
        return;
    }

    // Same-origin static assets - cache first
    event.respondWith(cacheFirst(request));
});

// Message event for manual cache updates
self.addEventListener('message', (event) => {
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }

    if (event.data?.type === 'CLEAR_CACHE') {
        event.waitUntil((async () => {
            const cacheNames = await caches.keys();
            await Promise.all(cacheNames.map(cache => caches.delete(cache)));
            console.log('[SW] All caches cleared');
        })());
    }
});

// Background sync for offline submissions (future enhancement)
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-purchases') {
        event.waitUntil(syncPurchases());
    }
});

async function syncPurchases() {
    console.log('[SW] Background sync triggered');
    // Implement queue sync logic here
}

console.log('[SW] Service Worker loaded');
