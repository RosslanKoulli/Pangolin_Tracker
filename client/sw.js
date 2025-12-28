/**
 * ZAP - Pangolin Tracker
 * Service Worker
 * 
 * This Service Worker provides:
 * - App shell caching (install-time)
 * - Runtime caching strategies
 * - Offline fallback
 * - Background sync (when supported)
 * 
 * Caching Strategy:
 * - Static assets: Cache-first (fast load, update in background)
 * - API requests: Network-first (fresh data, fallback to cache)
 * - Images: Cache-first with network fallback
 */

const CACHE_VERSION = 'v1';
const CACHE_NAME = `zap-cache-${CACHE_VERSION}`;

// Assets to cache on install (app shell) - use relative paths
const STATIC_ASSETS = [
    './',
    './index.html',
    './css/main.css',
    './js/config.js',
    './js/db.js',
    './js/api.js',
    './js/location.js',
    './js/camera.js',
    './js/ui.js',
    './js/app.js',
    './manifest.json',
    './icons/icon-192x192.png',
    './icons/icon-512x512.png'
];

// External resources to cache
const EXTERNAL_ASSETS = [
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css',
    'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js'
];

// ============================================
// Install Event
// ============================================
self.addEventListener('install', (event) => {
    console.log('[SW] Installing...');
    
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then((cache) => {
                console.log('[SW] Caching app shell');
                
                // Cache static assets
                const staticPromises = STATIC_ASSETS.map(url => {
                    return cache.add(url).catch(err => {
                        console.warn(`[SW] Failed to cache: ${url}`, err);
                    });
                });
                
                // Cache external assets
                const externalPromises = EXTERNAL_ASSETS.map(url => {
                    return fetch(url, { mode: 'cors' })
                        .then(response => {
                            if (response.ok) {
                                return cache.put(url, response);
                            }
                        })
                        .catch(err => {
                            console.warn(`[SW] Failed to cache external: ${url}`, err);
                        });
                });
                
                return Promise.all([...staticPromises, ...externalPromises]);
            })
            .then(() => {
                console.log('[SW] App shell cached');
                // Skip waiting to activate immediately
                return self.skipWaiting();
            })
    );
});

// ============================================
// Activate Event
// ============================================
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating...');
    
    event.waitUntil(
        caches.keys()
            .then((cacheNames) => {
                // Delete old caches
                return Promise.all(
                    cacheNames
                        .filter(name => name.startsWith('zap-cache-') && name !== CACHE_NAME)
                        .map(name => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => {
                console.log('[SW] Activated');
                // Take control of all pages immediately
                return self.clients.claim();
            })
    );
});

// ============================================
// Fetch Event
// ============================================
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') {
        return;
    }
    
    // Skip chrome-extension and other protocols
    if (!url.protocol.startsWith('http')) {
        return;
    }
    
    // Determine caching strategy based on request type
    if (isApiRequest(url)) {
        // API requests: Network-first
        event.respondWith(networkFirst(request));
    } else if (isImageRequest(request)) {
        // Images: Cache-first
        event.respondWith(cacheFirst(request));
    } else {
        // Static assets: Cache-first with network fallback
        event.respondWith(cacheFirst(request));
    }
});

/**
 * Network-first strategy
 * Try network, fall back to cache
 */
async function networkFirst(request) {
    try {
        const response = await fetch(request);
        
        // Cache successful responses
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        // Network failed, try cache
        const cached = await caches.match(request);
        
        if (cached) {
            console.log('[SW] Serving from cache:', request.url);
            return cached;
        }
        
        // Return error response for API
        return new Response(JSON.stringify({
            error: 'You are offline and this data is not cached'
        }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' }
        });
    }
}

/**
 * Cache-first strategy
 * Try cache, fall back to network
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    
    if (cached) {
        // Return cached response, update cache in background
        updateCache(request);
        return cached;
    }
    
    // Not in cache, fetch from network
    try {
        const response = await fetch(request);
        
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        
        return response;
    } catch (error) {
        // Return offline fallback for navigation requests
        if (request.mode === 'navigate') {
            return caches.match('/index.html');
        }
        
        throw error;
    }
}

/**
 * Update cache in background
 */
async function updateCache(request) {
    try {
        const response = await fetch(request);
        
        if (response.ok) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response);
        }
    } catch (error) {
        // Silently fail - we already served from cache
    }
}

/**
 * Check if request is to API
 */
function isApiRequest(url) {
    return url.pathname.startsWith('/server/api') || 
           url.pathname.includes('/api/');
}

/**
 * Check if request is for an image
 */
function isImageRequest(request) {
    const accept = request.headers.get('Accept') || '';
    return accept.includes('image') || 
           /\.(jpg|jpeg|png|gif|webp|svg)$/i.test(request.url);
}

// ============================================
// Background Sync
// ============================================
self.addEventListener('sync', (event) => {
    console.log('[SW] Sync event:', event.tag);
    
    if (event.tag === 'zap-sync-sightings') {
        event.waitUntil(syncPendingSightings());
    }
});

/**
 * Sync pending sightings to server
 * This is triggered by the Background Sync API when connectivity is restored
 */
async function syncPendingSightings() {
    console.log('[SW] Syncing pending sightings...');
    
    // Notify all clients to trigger sync
    const clients = await self.clients.matchAll();
    
    for (const client of clients) {
        client.postMessage({
            type: 'SYNC_REQUESTED',
            tag: 'zap-sync-sightings'
        });
    }
}

// ============================================
// Push Notifications (future enhancement)
// ============================================
self.addEventListener('push', (event) => {
    console.log('[SW] Push received:', event);
    
    if (!event.data) return;
    
    const data = event.data.json();
    
    const options = {
        body: data.body || 'New notification',
        icon: '/icons/icon-192x192.png',
        badge: '/icons/badge-72x72.png',
        vibrate: [100, 50, 100],
        data: {
            url: data.url || '/'
        }
    };
    
    event.waitUntil(
        self.registration.showNotification(data.title || 'ZAP', options)
    );
});

self.addEventListener('notificationclick', (event) => {
    console.log('[SW] Notification clicked');
    
    event.notification.close();
    
    const url = event.notification.data?.url || '/';
    
    event.waitUntil(
        self.clients.matchAll({ type: 'window' })
            .then((clients) => {
                // Focus existing window if available
                for (const client of clients) {
                    if (client.url === url && 'focus' in client) {
                        return client.focus();
                    }
                }
                
                // Open new window
                if (self.clients.openWindow) {
                    return self.clients.openWindow(url);
                }
            })
    );
});

// ============================================
// Message Handler
// ============================================
self.addEventListener('message', (event) => {
    console.log('[SW] Message received:', event.data);
    
    if (event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
    
    if (event.data.type === 'CACHE_URLS') {
        event.waitUntil(
            caches.open(CACHE_NAME)
                .then(cache => cache.addAll(event.data.urls))
        );
    }
});

console.log('[SW] Service Worker loaded');
