/**
 * Game Randomizer - Service Worker
 * Handles caching, offline support, and background sync
 */

const CACHE_VERSION = 'v2';
const STATIC_CACHE = `gamerandom-static-${CACHE_VERSION}`;
const DYNAMIC_CACHE = `gamerandom-dynamic-${CACHE_VERSION}`;

// Assets to cache immediately on install
const STATIC_ASSETS = [
    '/',
    '/index.html',
    '/dashboard.html',
    '/styles.css',
    '/app.js',
    '/manifest.json',
    '/icons/icon-192.png',
    '/icons/icon-512.png'
];

// ===== INSTALL EVENT =====
self.addEventListener('install', (event) => {
    console.log('[SW] Installing service worker...');
    
    event.waitUntil(
        caches.open(STATIC_CACHE)
            .then(cache => {
                console.log('[SW] Pre-caching static assets');
                return cache.addAll(STATIC_ASSETS);
            })
            .then(() => self.skipWaiting())
    );
});

// ===== ACTIVATE EVENT =====
self.addEventListener('activate', (event) => {
    console.log('[SW] Activating service worker...');
    
    event.waitUntil(
        caches.keys()
            .then(cacheNames => {
                return Promise.all(
                    cacheNames
                        .filter(name => !name.includes(CACHE_VERSION))
                        .map(name => {
                            console.log('[SW] Deleting old cache:', name);
                            return caches.delete(name);
                        })
                );
            })
            .then(() => self.clients.claim())
    );
});

// ===== FETCH EVENT - Smart Caching Strategy =====
self.addEventListener('fetch', (event) => {
    const { request } = event;
    const url = new URL(request.url);
    
    // Skip non-GET requests
    if (request.method !== 'GET') return;
    
    // Skip cross-origin requests
    if (url.origin !== self.location.origin) return;
    
    // Skip auth/API routes - never cache these
    if (url.pathname.startsWith('/api/') || url.pathname.startsWith('/auth/')) {
        return networkFirst(request);
    }
    
    // Cache-first for static assets
    if (url.pathname === '/styles.css' || 
        url.pathname.startsWith('/icons/') ||
        url.pathname.startsWith('/screenshots/')) {
        event.respondWith(cacheFirst(request));
        return;
    }
    
    // Network-first for HTML pages
    event.respondWith(networkFirst(request));
});

/**
 * Cache-first strategy: Try cache, fall back to network
 */
async function cacheFirst(request) {
    const cached = await caches.match(request);
    return cached || fetch(request);
}

/**
 * Network-first strategy: Try network, fall back to cache
 */
async function networkFirst(request) {
    try {
        const networkResponse = await fetch(request);
        
        // Only cache successful responses
        if (networkResponse && networkResponse.ok) {
            const cache = await caches.open(DYNAMIC_CACHE);
            cache.put(request, networkResponse.clone());
        }
        
        return networkResponse;
    } catch (error) {
        console.log('[SW] Network failed, trying cache:', request.url);
        const cached = await caches.match(request);
        
        if (cached) return cached;
        
        // If navigating to a page and offline, serve cached dashboard
        if (request.mode === 'navigate') {
            return caches.match('/dashboard.html');
        }
        
        throw error;
    }
}

// ===== MESSAGE HANDLER =====
self.addEventListener('message', (event) => {
    if (event.data && event.data.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});