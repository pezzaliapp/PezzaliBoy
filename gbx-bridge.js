/* PezzaliBoy bridge — caricato come primo script dentro ogni gioco.
   Permette alla console (stessa origine) di:
   - inviare tasti virtuali (D-pad, A, B, START, SELECT)
   - premere i pulsanti DOM del gioco (Gioca, Pausa, ...)
   - mostrare solo l'area di gioco sullo "schermo" della console
   - sbloccare l'audio dei giochi al primo tocco
   Fuori dalla console il gioco funziona come sempre. */
(function () {
  'use strict';
  var inConsole = false;
  try { inConsole = window.parent !== window && !!window.parent.PEZZALIBOY; } catch (e) {}

  // I service worker dei singoli giochi non servono dentro la console
  // (la console ha il suo): evitiamo cache doppie e conflitti.
  if (inConsole) {
    try {
      if (navigator.serviceWorker) {
        Object.defineProperty(navigator.serviceWorker, 'register', {
          configurable: true,
          value: function () { return new Promise(function () {}); }
        });
      }
    } catch (e) {}
  }

  // Tracciamo gli AudioContext creati dal gioco per poterli sbloccare.
  var ctxs = [];
  ['AudioContext', 'webkitAudioContext'].forEach(function (name) {
    var AC = window[name];
    if (!AC || AC.__gbx) return;
    function Wrapped(opts) {
      var c = opts === undefined ? new AC() : new AC(opts);
      ctxs.push(c);
      return c;
    }
    Wrapped.prototype = AC.prototype;
    Wrapped.__gbx = true;
    try { window[name] = Wrapped; } catch (e) {}
  });

  var KC = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, ' ': 32, Enter: 13,
             Escape: 27, Backspace: 8, Shift: 16, Tab: 9 };

  function codeFor(key) {
    if (key === ' ') return 'Space';
    if (/^[a-z]$/i.test(key)) return 'Key' + key.toUpperCase();
    if (/^[0-9]$/.test(key)) return 'Digit' + key;
    if (key === 'Shift') return 'ShiftLeft';
    return key;
  }

  function sendKey(type, spec) {
    var key = spec.key, code = spec.code || codeFor(key);
    var kc = spec.keyCode || KC[key] || (key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0);
    var ev;
    try {
      ev = new KeyboardEvent(type, { key: key, code: code, bubbles: true, cancelable: true, composed: true });
    } catch (e) { return; }
    try {
      Object.defineProperty(ev, 'keyCode', { get: function () { return kc; } });
      Object.defineProperty(ev, 'which', { get: function () { return kc; } });
      Object.defineProperty(ev, 'charCode', { get: function () { return type === 'keypress' ? kc : 0; } });
    } catch (e) {}
    var t = document.activeElement;
    var tag = t && t.tagName ? t.tagName.toLowerCase() : '';
    if (!t || t === document.documentElement || tag === 'select' || tag === 'input' || tag === 'iframe') {
      t = document.body || document.documentElement;
    }
    t.dispatchEvent(ev);
  }

  // Un elemento è "visibile" per il gioco se nessun antenato è nascosto dal gioco stesso
  // (ignoriamo ciò che nasconde la console in modalità schermo).
  function gameVisible(el) {
    if (!el || el.disabled) return false;
    for (var n = el; n && n.nodeType === 1; n = n.parentElement) {
      if (n.hidden) return false;
      if (n.classList.contains('gbx-hide')) continue;
      var cs = getComputedStyle(n);
      if (cs.display === 'none' || cs.visibility === 'hidden') {
        if (!n.classList.contains('gbx-hide')) return false;
      }
    }
    return true;
  }

  function clickFirst(selectors) {
    for (var i = 0; i < selectors.length; i++) {
      var list = document.querySelectorAll(selectors[i]);
      for (var j = 0; j < list.length; j++) {
        if (gameVisible(list[j])) { list[j].click(); return true; }
      }
    }
    return false;
  }

  function resolve(sel) {
    if (!sel) return null;
    if (sel.indexOf('parent:') === 0) {
      var c = document.querySelector(sel.slice(7));
      return c ? c.parentElement : null;
    }
    return document.querySelector(sel);
  }

  var STYLE_ID = 'gbx-style';
  var CSS =
    'html.gbx-on,html.gbx-on body{overflow:hidden!important;}' +
    '.gbx-stage{position:fixed!important;inset:0!important;z-index:2147483000!important;margin:0!important;' +
    'width:100vw!important;height:100vh!important;max-width:none!important;max-height:none!important;min-height:0!important;' +
    'display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;' +
    'gap:4px!important;padding:4px!important;box-sizing:border-box!important;border:0!important;border-radius:0!important;' +
    'box-shadow:none!important;overflow:hidden!important;transform:none!important;grid-template:none!important;}' +
    '.gbx-grow{flex:1 1 0!important;min-height:0!important;width:100%!important;max-width:none!important;height:auto!important;' +
    'display:flex!important;flex-direction:column!important;align-items:center!important;justify-content:center!important;' +
    'margin:0!important;padding:0!important;border:0!important;box-shadow:none!important;}' +
    'canvas.gbx-main{flex:1 1 0!important;min-height:0!important;width:100%!important;height:auto!important;' +
    'max-width:100%!important;max-height:100%!important;object-fit:contain!important;margin:0!important;border:0!important;' +
    'border-radius:0!important;box-shadow:none!important;image-rendering:pixelated;}' +
    '.gbx-pre{flex:0 0 auto!important;width:100%!important;margin:0!important;flex-wrap:wrap!important;}' +
    '.gbx-hide{display:none!important;}';

  var focusState = null;

  function focus(cfg) {
    unfocus();
    var stage = resolve(cfg.stage);
    if (!stage) return false;
    if (!document.getElementById(STYLE_ID)) {
      var s = document.createElement('style');
      s.id = STYLE_ID; s.textContent = CSS;
      (document.head || document.documentElement).appendChild(s);
    }
    var st = { stage: stage, moved: [], marked: [] };
    function mark(el, cls) { el.classList.add(cls); st.marked.push([el, cls]); }

    var bg = cfg.bg;
    if (!bg) {
      var probe = [stage, document.body, document.documentElement];
      for (var i = 0; i < probe.length && !bg; i++) {
        var c = probe[i] && getComputedStyle(probe[i]).backgroundColor;
        if (c && c !== 'transparent' && c !== 'rgba(0, 0, 0, 0)') bg = c;
      }
    }
    stage.style.setProperty('background', bg || '#000', 'important');
    mark(stage, 'gbx-stage');

    var canvas = cfg.canvas ? document.querySelector(cfg.canvas) : stage.querySelector('canvas');
    if (canvas) {
      mark(canvas, 'gbx-main');
      for (var p = canvas.parentElement; p && p !== stage; p = p.parentElement) mark(p, 'gbx-grow');
    }
    (cfg.hide || []).forEach(function (sel) {
      document.querySelectorAll(sel).forEach(function (el) { mark(el, 'gbx-hide'); });
    });
    (cfg.pre || []).slice().reverse().forEach(function (sel) {
      var el = document.querySelector(sel);
      if (!el || stage.contains(el)) return;
      st.moved.push([el, el.parentNode, el.nextSibling]);
      stage.insertBefore(el, stage.firstChild);
      mark(el, 'gbx-pre');
    });
    document.documentElement.classList.add('gbx-on');
    focusState = st;
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
    return true;
  }

  function unfocus() {
    var st = focusState;
    if (!st) return;
    st.marked.forEach(function (m) { m[0].classList.remove(m[1]); });
    st.moved.reverse().forEach(function (m) {
      try { m[1].insertBefore(m[0], m[2]); } catch (e) {}
    });
    st.stage.style.removeProperty('background');
    document.documentElement.classList.remove('gbx-on');
    focusState = null;
    try { window.dispatchEvent(new Event('resize')); } catch (e) {}
  }

  function unlock() {
    ctxs.forEach(function (c) {
      try { if (c.state !== 'running' && c.state !== 'closed') c.resume(); } catch (e) {}
    });
  }

  function mute(on) {
    ctxs.forEach(function (c) {
      try {
        if (on) { c.suspend(); } else if (c.state !== 'closed') { c.resume(); }
      } catch (e) {}
    });
    document.querySelectorAll('audio,video').forEach(function (m) { m.muted = !!on; });
  }

  window.gbx = {
    version: 1,
    key: sendKey,
    click: clickFirst,
    focus: focus,
    unfocus: unfocus,
    unlock: unlock,
    mute: mute,
    audioContexts: ctxs
  };
})();
