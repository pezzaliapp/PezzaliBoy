/*
 * Registrazione del service worker e aggiornamento automatico.
 *
 * Strategia:
 *  - il worker viene registrato con la versione in query string, così ogni
 *    release produce un URL diverso e il browser rileva sempre la novità;
 *  - registration.update() viene richiamato all'avvio, al ritorno in primo
 *    piano, al rientro online e a intervalli regolari;
 *  - il nuovo worker si attiva subito (skipWaiting + clients.claim);
 *  - al cambio di controller la pagina si ricarica una sola volta, con una
 *    guardia temporale che impedisce cicli di refresh.
 */

import { APP_VERSION } from './version.js';
import { isNative } from './native.js';

const RELOAD_KEY = 'sudoku.lastReload';
const RELOAD_GUARD_MS = 12000;
const UPDATE_INTERVAL_MS = 30 * 60 * 1000;

export function initPwa(onUpdateReady) {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;
  /* Nell'app iOS i file sono già nel pacchetto: nessun service worker. */
  if (isNative()) return;

  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloading = false;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    /* Prima installazione: la pagina è già aggiornata, nessun reload. */
    if (!hadController || reloading) return;

    let last = 0;
    try { last = Number(sessionStorage.getItem(RELOAD_KEY)) || 0; } catch (_) { last = 0; }
    if (Date.now() - last < RELOAD_GUARD_MS) return;

    reloading = true;
    try { sessionStorage.setItem(RELOAD_KEY, String(Date.now())); } catch (_) { /* ignorato */ }
    location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker
      .register(`./sw.js?v=${APP_VERSION}`, { scope: './' })
      .then((registration) => {
        const check = () => { registration.update().catch(() => {}); };

        check();
        document.addEventListener('visibilitychange', () => {
          if (document.visibilityState === 'visible') check();
        });
        window.addEventListener('online', check);
        setInterval(check, UPDATE_INTERVAL_MS);

        registration.addEventListener('updatefound', () => {
          const incoming = registration.installing;
          if (!incoming) return;
          incoming.addEventListener('statechange', () => {
            if (incoming.state !== 'installed') return;
            /* Chiede al worker di prendere il controllo immediatamente. */
            incoming.postMessage({ type: 'SKIP_WAITING' });
            if (navigator.serviceWorker.controller && typeof onUpdateReady === 'function') {
              onUpdateReady();
            }
          });
        });
      })
      .catch(() => { /* l'applicazione funziona anche senza service worker */ });
  });
}
