// service-worker.js — ILCUBO v0.1.4 (pacchetto pulito) — GA safe
const CACHE_VERSION = "ilcubo-v016"; // bump versione cache a ogni release
const APP_SHELL = [
  "./",
  "./index.html",
  "./styles.css",
  "./manifest.webmanifest",
  "./three.js",
  "./cube.js",
  "./ilcubo.bundle.min.js",
  "./icons/favicon.ico",
  "./icons/favicon-16x16.png",
  "./icons/favicon-32x32.png",
  "./icons/apple-touch-icon.png",
  "./icons/android-chrome-192x192.png",
  "./icons/android-chrome-512x512.png",
  "./icons/meta-image.png"
];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION).then((cache) => cache.addAll(APP_SHELL))
  );
  self.skipWaiting(); // attiva subito la nuova versione
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // 1) Abilita la navigation preload (se supportata) per velocizzare
      //    la prima navigazione gestita dal SW.
      if (self.registration.navigationPreload) {
        try { await self.registration.navigationPreload.enable(); } catch (e) {}
      }
      // 2) Elimina tutte le cache vecchie (ILCUBO precedenti + vecchia KubeApp).
      const keys = await caches.keys();
      await Promise.all(
        keys
          .filter((k) => (k.startsWith("ilcubo-") || k.startsWith("kubeapp-")) && k !== CACHE_VERSION)
          .map((k) => caches.delete(k))
      );
      // 3) Prendi il controllo delle pagine già aperte.
      await self.clients.claim();
    })()
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);

  // Gestisci solo le GET dello stesso origin: lascia passare tutto il resto
  // (Analytics, CDN, beacon, POST, ecc.) al fetch normale del browser.
  if (req.method !== "GET" || url.origin !== self.location.origin) {
    return;
  }

  const isHTML =
    req.mode === "navigate" ||
    (req.headers.get("accept") || "").includes("text/html");

  // 1) HTML: network-first con fallback cache (index offline).
  //    Così l'iPhone riceve SEMPRE l'index.html aggiornato quando è online
  //    e non resta bloccato su una pagina che referenzia file rimossi.
  if (isHTML) {
    event.respondWith(
      (async () => {
        try {
          // Usa la risposta della navigation preload se disponibile.
          const preload = await event.preloadResponse;
          const res = preload || (await fetch(req));
          // Aggiorna la copia offline solo se la risposta è valida.
          if (res && res.ok) {
            const copy = res.clone();
            const cache = await caches.open(CACHE_VERSION);
            cache.put("./index.html", copy);
          }
          return res;
        } catch (e) {
          // Offline / rete assente: ripiega sulla copia in cache.
          const cache = await caches.open(CACHE_VERSION);
          return (
            (await cache.match("./index.html")) ||
            (await cache.match("./")) ||
            Response.error()
          );
        }
      })()
    );
    return;
  }

  // 2) Statici (script, css, immagini…): cache-first con fallback rete.
  //    Il bump di CACHE_VERSION invalida automaticamente gli asset vecchi.
  event.respondWith(
    caches.match(req).then((cached) => {
      if (cached) return cached;
      return fetch(req).then((res) => {
        if (!res || res.status !== 200 || res.type === "opaque") {
          return res;
        }
        const copy = res.clone();
        caches.open(CACHE_VERSION).then((c) => c.put(req, copy));
        return res;
      });
    })
  );
});
