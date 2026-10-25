/*
 * SUDOKU — service worker
 *
 * Aggiornamento automatico:
 *  - CACHE_NAME contiene la versione: ogni release usa una cache nuova;
 *  - install effettua skipWaiting, activate esegue clients.claim
 *    e rimuove tutte le cache di versioni precedenti;
 *  - i documenti di navigazione usano network-first (l'HTML non resta
 *    bloccato in cache), gli asset statici stale-while-revalidate;
 *  - il file del service worker non viene mai messo in cache.
 */

/* Allineata automaticamente da `npm run release`: non modificare a mano. */
const APP_VERSION = '3.0.0';
const CACHE_NAME = `sudoku-v${APP_VERSION}`;
const OFFLINE_URL = './index.html';

const PRECACHE = [
  './',
  './index.html',
  './manifest.webmanifest',
  './assets/css/style.css',
  './assets/js/app.js',
  './assets/js/engine.js',
  './assets/js/pwa.js',
  './assets/js/native.js',
  './assets/js/version.js',
  './icons/icon.svg',
  './icons/icon-192.png',
  './icons/icon-512.png',
  './icons/icon-maskable-512.png',
  './icons/apple-touch-icon.png'
];

self.addEventListener('install', (event) => {
  self.skipWaiting();
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) =>
      Promise.all(
        PRECACHE.map((url) =>
          cache.add(new Request(url, { cache: 'reload' })).catch(() => null)
        )
      )
    )
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'SKIP_WAITING') self.skipWaiting();
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  /* Il worker stesso non va mai servito dalla cache. */
  if (url.pathname.endsWith('/sw.js')) return;

  if (request.mode === 'navigate') {
    event.respondWith(networkFirst(request));
    return;
  }

  event.respondWith(staleWhileRevalidate(request));
});

async function networkFirst(request) {
  const cache = await caches.open(CACHE_NAME);
  try {
    const response = await fetch(request);
    if (response && response.ok) cache.put(request, response.clone());
    return response;
  } catch (_) {
    return (
      (await cache.match(request)) ||
      (await cache.match(OFFLINE_URL)) ||
      (await cache.match('./')) ||
      new Response('Contenuto non disponibile offline.', {
        status: 503,
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      })
    );
  }
}

async function staleWhileRevalidate(request) {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);

  const network = fetch(request)
    .then((response) => {
      if (response && response.ok) cache.put(request, response.clone());
      return response;
    })
    .catch(() => null);

  if (cached) return cached;

  const response = await network;
  return (
    response ||
    new Response('Contenuto non disponibile offline.', {
      status: 503,
      headers: { 'Content-Type': 'text/plain; charset=utf-8' }
    })
  );
}
