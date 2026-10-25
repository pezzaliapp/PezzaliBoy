#!/usr/bin/env python3
"""Rigenera sw.js con l'elenco di tutti i file da mettere in cache (gioco offline).
Uso: python3 tools/build-sw.py   (dalla cartella del progetto)"""
import hashlib
import json
import os

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SKIP_DIRS = {'.git', 'tools', 'node_modules', '.github'}
SKIP_FILES = {'sw.js', 'README.md', '.nojekyll', 'pezzaliboy-artifact.html'}
SKIP_EXT = {'.pdf', '.map', '.md'}

files, h = [], hashlib.sha1()
for dirpath, dirnames, filenames in os.walk(ROOT):
    dirnames[:] = sorted(d for d in dirnames if d not in SKIP_DIRS)
    for name in sorted(filenames):
        rel = os.path.relpath(os.path.join(dirpath, name), ROOT).replace(os.sep, '/')
        if name in SKIP_FILES and '/' not in rel:
            continue
        if os.path.splitext(name)[1].lower() in SKIP_EXT:
            continue
        files.append('./' + rel)
        with open(os.path.join(dirpath, name), 'rb') as f:
            h.update(rel.encode() + f.read())

version = h.hexdigest()[:10]
sw = """/* PezzaliBoy service worker (generato da tools/build-sw.py) */
const CACHE = 'pezzaliboy-%s';
const FILES = %s;
self.addEventListener('install', e => {
  // cache:'reload' ignora la cache HTTP: dopo un push si scaricano sempre i file nuovi
  e.waitUntil(caches.open(CACHE)
    .then(c => Promise.all(['./', ...FILES].map(u => fetch(new Request(u, { cache: 'reload' }))
      .then(r => r.ok ? c.put(u, r) : null).catch(() => null))))
    .then(() => self.skipWaiting()));
});
self.addEventListener('activate', e => {
  e.waitUntil(caches.keys().then(keys => Promise.all(keys.filter(k => k !== CACHE).map(k => caches.delete(k))))
    .then(() => self.clients.claim()));
});
function fresh(req) {
  // rete prima, cache solo se offline
  return fetch(req, { cache: 'no-cache' }).then(r => {
    if (r.ok) { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); }
    return r;
  }).catch(() => caches.match(req, { ignoreSearch: true }));
}
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) {
    e.respondWith(fetch(req).then(r => { const cp = r.clone(); caches.open(CACHE).then(c => c.put(req, cp)); return r; })
      .catch(() => caches.match(req)));
    return;
  }
  const isCode = req.mode === 'navigate' || /\\.(html|js|css|json|webmanifest)$/.test(url.pathname) || url.pathname.endsWith('/');
  if (isCode) { e.respondWith(fresh(req)); return; }
  // immagini e altri file: cache prima, poi rete
  e.respondWith(caches.match(req, { ignoreSearch: true }).then(hit => hit || fresh(req)));
});
""" % (version, json.dumps(files, indent=0))

with open(os.path.join(ROOT, 'sw.js'), 'w', encoding='utf-8') as f:
    f.write(sw)
print(f'sw.js: {len(files)} file, versione {version}')
