/* TamaPWA v4 — service worker
   Strategie separate: navigazione = rete prima, statici = cache prima con
   aggiornamento in sottofondo. Si mette in cache solo ciò che è sicuro. */
'use strict';

const VERSION = 'tama-v4.4.0';
const CORE = VERSION + '-core';
const RUNTIME = VERSION + '-run';

const VARIANTS = ['sportivo', 'goloso', 'pulito', 'sognatore', 'equilibrato'];
const MOODS = ['', '-ok', '-happy', '-sad', '-sick', '-sleep'];

const CORE_ASSETS = [
  './', './index.html', './style.css', './script.js', './manifest.json',
  './icon-192.png', './icon-512.png',
  // gli sprite entrano nel precache: sono ~20 KB in tutto e servono offline al primo avvio
  ...VARIANTS.flatMap(v => MOODS.map(m => `./sprite-${v}${m}.png`))
];

self.addEventListener('install', e => {
  e.waitUntil((async () => {
    const c = await caches.open(CORE);
    // addAll fallisce in blocco se un solo file manca: qui si procede uno a uno
    await Promise.all(CORE_ASSETS.map(u => c.add(u).catch(err => console.warn('precache saltato', u, err))));
  })());
  self.skipWaiting();
});

self.addEventListener('activate', e => {
  e.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(k => k !== CORE && k !== RUNTIME).map(k => caches.delete(k)));
    if ('navigationPreload' in self.registration) {
      try { await self.registration.navigationPreload.enable(); } catch (err) { }
    }
    await self.clients.claim();
  })());
});

self.addEventListener('message', e => { if (e.data === 'SKIP_WAITING') self.skipWaiting(); });

function cacheable(res) {
  // niente risposte opache, parziali o d'errore: sporcavano la cache nella v3
  return res && res.ok && res.status === 200 && res.type === 'basic';
}

self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;

  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;   // le risorse esterne passano dritte

  // pagine: rete prima, cache come rete di salvataggio
  if (req.mode === 'navigate') {
    e.respondWith((async () => {
      try {
        const pre = await e.preloadResponse;
        if (pre) return pre;
        const net = await fetch(req);
        if (cacheable(net)) (await caches.open(CORE)).put('./index.html', net.clone());
        return net;
      } catch (err) {
        return (await caches.match('./index.html')) || new Response('Offline', { status: 503 });
      }
    })());
    return;
  }

  // statici: cache prima, aggiornamento silenzioso in sottofondo
  e.respondWith((async () => {
    const hit = await caches.match(req);
    const fresh = fetch(req).then(res => {
      if (cacheable(res)) caches.open(RUNTIME).then(c => c.put(req, res.clone()));
      return res;
    }).catch(() => null);
    return hit || (await fresh) || new Response('', { status: 504 });
  })());
});

// tocco sulla notifica: riporta l'app in primo piano invece di aprire un doppione
self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const all = await clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = all.find(c => c.url.includes(self.location.origin));
    if (open) return open.focus();
    return clients.openWindow('./');
  })());
});
