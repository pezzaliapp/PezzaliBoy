/*
 * Integrazione con l'app nativa iOS (Capacitor).
 *
 * Sul web questo modulo non fa nulla. Dentro l'app installata dall'App Store:
 *  - segnala l'ambiente nativo con la classe `is-native` su <html>;
 *  - allinea il colore del testo della barra di stato al tema effettivo
 *    (automatico, chiaro o scuro scelto dall'utente);
 *  - adegua i testi che sul web parlano di browser e aggiornamento automatico.
 */

export function isNative() {
  try {
    return Boolean(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
  } catch (_) {
    return false;
  }
}

function effectiveTheme() {
  const chosen = document.documentElement.dataset.theme;
  if (chosen === 'light' || chosen === 'dark') return chosen;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}

function syncStatusBar() {
  const bar = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.StatusBar;
  if (!bar || typeof bar.setStyle !== 'function') return;
  /* Style "DARK" = testo chiaro su sfondo scuro; "LIGHT" = testo scuro su sfondo chiaro. */
  bar.setStyle({ style: effectiveTheme() === 'dark' ? 'DARK' : 'LIGHT' }).catch(() => {});
}

export function initNative() {
  if (!isNative()) return;

  document.documentElement.classList.add('is-native');

  syncStatusBar();
  new MutationObserver(syncStatusBar).observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme']
  });
  if (window.matchMedia) {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    if (typeof mq.addEventListener === 'function') mq.addEventListener('change', syncStatusBar);
  }

  const appMeta = document.getElementById('appMetaNote');
  if (appMeta) appMeta.textContent = 'funziona offline · aggiornamenti tramite App Store.';
}
