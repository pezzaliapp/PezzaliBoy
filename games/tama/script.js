/* TamaPWA v4 — logica di gioco
   Riscrittura completa: salvataggio versionato, tempo reale con tetto,
   evoluzioni, economia, missioni, minigiochi con pulizia dei timer. */
'use strict';

/* ============================ utilità ============================ */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
const HOUR = 3600000, DAY = 86400000;
const dayKey = (t = Date.now()) => { const d = new Date(t); return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`; };
const nowH = () => new Date().getHours();

const ticker = $('#ticker'), toastWrap = $('#toasts');
function ticke(msg) { ticker.textContent = msg; }
function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast'; el.textContent = msg;
  toastWrap.appendChild(el);
  setTimeout(() => el.classList.add('out'), 1500);
  setTimeout(() => el.remove(), 1900);
  ticke(msg);
}
function buzz(ms = 12) { if (S.haptics && navigator.vibrate) { try { navigator.vibrate(ms); } catch (e) { } } }

/* ============================ audio ============================ */
let ac = null;
function getAC() {
  if (!ac) { const C = window.AudioContext || window.webkitAudioContext; if (!C) return null; ac = new C(); }
  return ac;
}
function beep(freq = 440, dur = 110, type = 'square', vol = .2) {
  if (!S.sound) return;                       // BUG v3: il mute non veniva mai letto
  const c = getAC(); if (!c) return;
  try {
    if (c.state === 'suspended') c.resume();
    const o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(freq, c.currentTime);
    g.gain.setValueAtTime(vol, c.currentTime);
    g.gain.exponentialRampToValueAtTime(.0001, c.currentTime + dur / 1000);
    o.connect(g).connect(c.destination);
    o.start(); o.stop(c.currentTime + dur / 1000);
    o.onended = () => { o.disconnect(); g.disconnect(); };
  } catch (e) { }
}
const sGood = () => { beep(784, 80); setTimeout(() => beep(988, 90), 85); };
const sBad = () => { beep(220, 130); setTimeout(() => beep(165, 170), 110); };
const sTick = () => beep(520, 60, 'square', .16);
const sWin = () => { beep(659, 110); setTimeout(() => beep(880, 120), 120); setTimeout(() => beep(1175, 170), 260); };
const sCoin = () => { beep(1046, 60, 'triangle', .18); setTimeout(() => beep(1318, 90, 'triangle', .18), 65); };
// iOS sospende il contesto quando l'app va in background: va risvegliato ogni volta.
['pointerdown', 'keydown'].forEach(ev => window.addEventListener(ev, () => { const c = getAC(); if (c && c.state === 'suspended') c.resume(); }, { passive: true }));
document.addEventListener('visibilitychange', () => { if (!document.hidden) { const c = getAC(); if (c && c.state === 'suspended') c.resume(); } });

/* ============================ salvataggio ============================ */
const KEY = 'tama.v4', SCHEMA = 4;
const VARIANTS = ['sportivo', 'goloso', 'pulito', 'sognatore', 'equilibrato'];
const VAR_LABEL = { sportivo: 'Sportivo', goloso: 'Goloso', pulito: 'Pulito', sognatore: 'Sognatore', equilibrato: 'Equilibrato' };

function blank(gen = 1, album = {}, wins = 0) {
  const t = Date.now();
  return {
    v: SCHEMA, gen, name: 'Tama',
    h: 65, ha: 65, e: 75, c: 75, he: 100,
    born: t, last: t, seen: t, lived: 0,
    sleep: false, sick: false, sickAt: 0, dead: false, endReason: null, endedAway: false,
    stage: 'uovo', variant: null, warm: 0,
    care: { feed: 0, clean: 0, play: 0, sleep: 0 },
    zero: {}, mistakes: 0, coins: 20, bond: 12,
    life: {},                               // tracciamento maestria per questa vita (azzerato a ogni generazione)
    cool: {},
    sound: true, haptics: true, notify: false, lastNotify: 0,
    best: { catch: 0, reflex: null, seq: 0 },
    streak: 0, lastDay: null,
    q: { day: null, list: [], prog: {}, bonus: false },
    album, wins,
    tips: {}
  };
}

// Un salvataggio può essere leggibile ma malformato: un campo-oggetto a null,
// una lista che non è un array. I default di blank() non bastano, perché
// Object.assign li sovrascrive coi valori sbagliati. Qui si ripristina la forma
// dei campi che il resto del codice dà per scontati (album, q.list, ecc.).
function repair(st) {
  const b = blank();
  for (const k of ['care', 'zero', 'cool', 'best', 'album', 'tips', 'life']) {
    if (!st[k] || typeof st[k] !== 'object') st[k] = b[k];
  }
  if (!st.q || typeof st.q !== 'object' || !Array.isArray(st.q.list)) st.q = b.q;
  return st;
}

function loadState() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) {
      const s = JSON.parse(raw);
      if (s && s.v === SCHEMA) {
        const st = repair(Object.assign(blank(s.gen, s.album, s.wins), s));
        // salvataggi v4 anteriori al "tempo vissuto": semina lived dall'età di
        // calendario di allora, così l'età non cambia di colpo all'aggiornamento;
        // solo le assenze future avranno il tetto delle 8 ore.
        if (typeof s.lived !== 'number') st.lived = Math.max(0, Date.now() - (s.born || Date.now()));
        if (typeof s.bond !== 'number') st.bond = 35;   // chi già giocava parte da una relazione avviata (fase 3)
        return st;
      }
    }
    // migrazione dal salvataggio v3 (chiave "tama")
    const old = localStorage.getItem('tama');
    if (old) {
      const o = JSON.parse(old), s = blank();
      if (typeof o.h === 'number') s.h = clamp(o.h, 0, 100);
      if (typeof o.ha === 'number') s.ha = clamp(o.ha, 0, 100);
      if (typeof o.e === 'number') s.e = clamp(o.e, 0, 100);
      if (typeof o.c === 'number') s.c = clamp(o.c, 0, 100);
      if (typeof o.he === 'number') s.he = clamp(o.he, 0, 100);
      if (typeof o.age === 'number') { s.born = Date.now() - o.age * DAY; s.lived = Math.max(0, o.age * DAY); }
      if (o.scores) s.best = { catch: o.scores.catch | 0, reflex: o.scores.reflex ?? null, seq: o.scores.sequence | 0 };
      if (typeof o.soundOn === 'boolean') s.sound = o.soundOn;
      s.bond = 20;
      s.tips.migrated = true;
      return s;
    }
  } catch (e) {
    // BUG v3: un salvataggio corrotto lanciava e uccideva tutto lo script
    console.warn('Salvataggio illeggibile, riparto da zero.', e);
  }
  return blank();
}
const S = loadState();

let saveTimer = null;
function save(now = false) {
  if (now) { saveTimer && clearTimeout(saveTimer); saveTimer = null; flush(); return; }
  if (saveTimer) return;
  saveTimer = setTimeout(() => { saveTimer = null; flush(); }, 2500);   // BUG v3: scriveva su disco ogni secondo
}
function flush() { try { S.seen = Date.now(); localStorage.setItem(KEY, JSON.stringify(S)); } catch (e) { } }
addEventListener('pagehide', () => save(true));
addEventListener('visibilitychange', () => { if (document.hidden) save(true); });

/* ============================ tempo e statistiche ============================ */
const MAX_OFFLINE = 8 * HOUR;      // oltre questo, il tempo lontano non conta
const RETIRE_DAYS = 20;
const STAGES = [
  { id: 'uovo', from: 0, label: 'Uovo' },
  { id: 'cucciolo', from: 300000 / 86400000, label: 'Cucciolo' },   // 5 minuti
  { id: 'giovane', from: 1, label: 'Giovane' },
  { id: 'adulto', from: 4, label: 'Adulto' },
  { id: 'anziano', from: 10, label: 'Anziano' }
];
// L'età è il tempo davvero vissuto (S.lived), accumulato col tetto delle 8 ore,
// non il tempo di calendario da S.born: le ore in cui l'app è chiusa non
// invecchiano il Tama più di quanto lo affamino.
const ageDays = () => ((S.lived || 0) + (S.warm || 0)) / DAY;
const HATCH = 5 * 60000;                 // l'uovo si schiude in 5 minuti di vita
const WARM_MAX = 150000;                 // le carezze possono togliere al massimo 2 min e mezzo
const WARM_PER_TAP = 6000;
const toHatch = () => Math.max(0, HATCH - (S.lived || 0) - (S.warm || 0));
function slowdown() { return 1 - Math.min(.3, (S.wins || 0) * .04); }  // eredità delle generazioni

function advance(now) {
  const raw = now - S.last;
  if (raw <= 0) { S.last = now; return { hrs: 0, skipped: 0 }; }
  if (S.dead) { S.last = now; return { hrs: 0, skipped: 0 }; }
  const used = Math.min(raw, MAX_OFFLINE);
  S.lived = (S.lived || 0) + used;   // il tempo vissuto avanza col tetto: sonno incluso, morte esclusa (early-return sopra)
  const away = raw > 30 * 60000;     // fine raggiunta dopo una vera assenza: va raccontata senza trionfi né rimproveri
  const hrs = used / HOUR * slowdown();
  const before = snapshot();

  if (S.sleep) {
    S.h = clamp(S.h - 2 * hrs, 0, 100);      // dormire non azzera la fame (exploit v3)
    S.c = clamp(S.c - 1 * hrs, 0, 100);
    S.e = clamp(S.e + 14 * hrs, 0, 100);
    if (S.e >= 100 && hrs > 0) { S.sleep = false; if (raw < 5000) toast('☀️ Si è svegliato riposato'); }
  } else {
    S.h = clamp(S.h - 4 * hrs, 0, 100);
    S.ha = clamp(S.ha - 3 * hrs, 0, 100);
    S.e = clamp(S.e - 3.5 * hrs, 0, 100);
    S.c = clamp(S.c - 2.5 * hrs, 0, 100);
  }

  // errori di cura: contati una volta per episodio
  ['h', 'ha', 'e', 'c'].forEach(k => {
    if (S[k] <= 0 && !S.zero[k]) { S.zero[k] = true; S.mistakes++; }
    else if (S[k] > 25 && S.zero[k]) { S.zero[k] = false; }
  });

  const neglect = (S.h <= 0 ? 1 : 0) + (S.c <= 8 ? 1 : 0) + (S.ha <= 0 ? 1 : 0) + (S.e <= 0 ? 1 : 0);
  if (S.sick) S.he = clamp(S.he - 4 * hrs, 0, 100);
  else if (neglect) S.he = clamp(S.he - 3 * neglect * hrs, 0, 100);
  else if (S.h > 50 && S.ha > 50 && S.c > 50 && S.e > 25) S.he = clamp(S.he + 2.5 * hrs, 0, 100);

  // il legame si raffredda solo con vera trascuratezza (una barra a zero), mai
  // per la semplice assenza, e non sotto il gradino raggiunto.
  if (neglect && (S.bond || 0) > 0) S.bond = Math.max(BOND_TIERS[bondTier()].at, (S.bond || 0) - 0.5 * neglect * hrs);

  // tracciamento maestria di questa vita: salute minima toccata, e reset del
  // "umore alto" quando scende (per contare le volte distinte a 90)
  S.life.minHe = Math.min(S.life.minHe == null ? 100 : S.life.minHe, S.he);
  if (S.ha < 82) S.life.wasHigh = false;

  if (!S.sick && (neglect >= 2 || S.he < 35) && Math.random() < 1 - Math.pow(.7, hrs)) fallIll();

  S.last = now;
  if (S.he <= 0) endLife('malattia', away);
  else if (ageDays() >= RETIRE_DAYS) endLife('anzianità', away);
  else evolve();

  return { hrs, skipped: raw - used, before };
}
const snapshot = () => ({ h: S.h, ha: S.ha, e: S.e, c: S.c, he: S.he });

function fallIll() {
  S.sick = true; S.sickAt = Date.now(); S.life.everSick = true;   // salta la maestria "Pulito" (mai malato)
  toast('🤒 Si è ammalato. Serve una medicina.');
  sBad(); notify('Il tuo Tama si è ammalato', 'Dagli una medicina prima che peggiori.');
}

function evolve() {
  const a = ageDays();
  let st = STAGES[0];
  for (const s of STAGES) if (a >= s.from) st = s;
  if (st.id === S.stage) return;
  S.stage = st.id;
  if (st.id === 'cucciolo') { toast('🥚 L\'uovo si è schiuso!'); sWin(); pop('✨'); }
  if (st.id === 'giovane' && !S.variant) {
    S.variant = pickVariant();
    S.album[S.variant] = S.album[S.variant] || { at: Date.now(), gen: S.gen };
    toast(`🌱 È diventato ${VAR_LABEL[S.variant]}!`);
    sWin(); pop('🌱');
  }
  if (st.id === 'adulto') { toast('⭐ Ora è adulto.'); sWin(); }
  if (st.id === 'anziano') toast('🕰️ Sta invecchiando. Trattalo bene.');
  save(true);
}

function pickVariant() {
  const c = S.care, tot = c.feed + c.clean + c.play + c.sleep;
  if (!tot) return 'equilibrato';
  const map = { goloso: c.feed / tot, pulito: c.clean / tot, sportivo: c.play / tot, sognatore: c.sleep / tot };
  const [id, share] = Object.entries(map).sort((a, b) => b[1] - a[1])[0];
  return share >= .42 ? id : 'equilibrato';
}

/* ============================ maestria (album) ============================ */
/* Fase 3 — pilastro "album → maestria". Ogni forma ha una sfida distinta:
   portarla a una vita piena (la pensione) rispettando una condizione. L'album
   smette di essere cinque caselle spuntate una volta e diventa dieci-e-più vite
   di gioco mirato. Completare una sfida accende la "forma migliore" (la sprite
   -happy come stato d'oro), che resta fra le generazioni. Nessuna arte nuova. */
const MASTERY = {
  goloso: { goal: 'Arriva alla pensione senza mai rimpinzarlo.', ok: L => !L.overfed, prog: L => L.overfed ? 'rimpinzato almeno una volta' : 'mai rimpinzato, per ora' },
  sportivo: { goal: 'Portalo a umore 90 cinque volte.', ok: L => (L.happy90 || 0) >= 5, prog: L => `${Math.min(5, L.happy90 || 0)}/5 volte a umore 90` },
  pulito: { goal: 'Una vita intera senza ammalarsi mai.', ok: L => !L.everSick, prog: L => L.everSick ? 'si è ammalato' : 'mai malato, per ora' },
  sognatore: { goal: 'Arriva alla pensione con la salute sempre sopra 50.', ok: L => (L.minHe == null ? 100 : L.minHe) >= 50, prog: L => `salute minima toccata: ${Math.round(L.minHe == null ? 100 : L.minHe)}` },
  equilibrato: { goal: 'Completa tutte le missioni del giorno per 5 giorni.', ok: L => (L.questDays || 0) >= 5, prog: L => `${Math.min(5, L.questDays || 0)}/5 giorni pieni` }
};
const masteredCount = () => VARIANTS.filter(v => S.album[v] && S.album[v].mastered).length;
function checkMastery() {                    // alla pensione: se ha rispettato la sfida della sua forma, sblocca
  const v = S.variant, m = MASTERY[v];
  if (!v || !m || !S.album[v] || S.album[v].mastered) return;
  if (m.ok(S.life || {})) {
    S.album[v].mastered = true;
    toast(`★ Maestria ${VAR_LABEL[v]} sbloccata!`); sWin(); pop('★');
  }
}

function endLife(reason, away = false) {
  if (S.dead) return;
  S.dead = true; S.endReason = reason; S.endedAway = !!away;
  if (reason === 'anzianità') { S.wins = (S.wins || 0) + 1; checkMastery(); }
  save(true); sBad(); render();
  showEnd(reason);
}

/* ============================ schermo ============================ */
const el = {
  sprite: $('#sprite'), egg: $('#egg'), fallback: $('#fallback'), zzz: $('#zzz'), fx: $('#fx'),
  say: $('#say'), name: $('#hudName'), coins: $('#hudCoins'), streak: $('#hudStreak'),
  gen: $('#genTag'), lampCare: $('#lampCare'), lampQuest: $('#lampQuest'),
  segs: { h: $('#sH'), ha: $('#sHa'), e: $('#sE'), c: $('#sC'), he: $('#sHe'), b: $('#sB') }
};
// etichette leggibili dai lettori di schermo: le barre a segmenti da sole non
// dicono il livello (difetto 3). Ogni barra diventa un progressbar con valore.
const SEG_LABEL = { h: 'Fame', ha: 'Umore', e: 'Energia', c: 'Pulizia', he: 'Salute', b: 'Legame' };
Object.entries(el.segs).forEach(([k, box]) => {
  for (let i = 0; i < 10; i++) { const seg = document.createElement('i'); seg.setAttribute('aria-hidden', 'true'); box.appendChild(seg); }
  box.setAttribute('role', 'progressbar');
  box.setAttribute('aria-valuemin', '0');
  box.setAttribute('aria-valuemax', '100');
  box.setAttribute('aria-label', SEG_LABEL[k]);
});

/* ============================ legame ============================ */
/* Fase 3 — pilastro "il Legame". È la posta in gioco tenera: sale SOLO con la
   cura tempestiva (chi la chiama decide se il gesto era al momento giusto),
   si raffredda SOLO per vera trascuratezza (una barra a zero) — mai per la
   semplice assenza — e non scende mai sotto il gradino già raggiunto. */
const BOND_TIERS = [
  { at: 0, name: 'Estranei' }, { at: 25, name: 'Conoscenti' }, { at: 50, name: 'Amici' },
  { at: 75, name: 'Affiatati' }, { at: 100, name: 'Inseparabili' }
];
function bondTier(b = S.bond || 0) { let i = 0; BOND_TIERS.forEach((t, k) => { if (b >= t.at) i = k; }); return i; }
function bondUp(n) {
  if (S.dead || !(n > 0)) return;
  const was = bondTier();
  S.bond = clamp((S.bond || 0) + n, 0, 100);
  if (bondTier() > was) { toast(`💗 Ora siete ${BOND_TIERS[bondTier()].name}`); sWin(); pop('💗'); }
  save(); render();
}

// se uno sprite manca, non resta un quadrato rotto: si passa alla faccina
const FACE = { happy: '◕‿◕', ok: '◕ᴗ◕', sad: '◕︵◕', sick: '◕﹏◕', sleep: '－ᴗ－' };
el.sprite.addEventListener('error', () => {
  el.sprite.hidden = true;
  el.fallback.hidden = false;
  el.fallback.textContent = FACE[mood()] || FACE.ok;
});
el.sprite.addEventListener('load', () => { el.fallback.hidden = true; });

function mood() {
  if (S.dead) return 'sad';
  if (S.sleep) return 'sleep';
  if (S.sick) return 'sick';
  const avg = (S.h + S.ha + S.e + S.c) / 4;
  if (avg >= 70 && S.ha >= 60) return 'happy';
  if (avg < 36 || S.ha < 25 || S.h < 15) return 'sad';
  return 'ok';
}

function line() {
  if (S.dead) return S.endReason === 'anzianità' ? 'Ha vissuto una vita piena.' : 'Non ce l\'ha fatta…';
  if (S.stage === 'uovo') {
    const s = Math.ceil(toHatch() / 1000);
    const mm = Math.floor(s / 60), ss = String(s % 60).padStart(2, '0');
    const cold = (S.warm || 0) >= WARM_MAX;
    // prima l'azione (col fine: farlo nascere), poi il conto alla rovescia:
    // guidare da soli il primo gesto, non far credere che basti aspettare.
    return cold
      ? `Ormai è bello caldo.\nNasce tra ${mm}:${ss}: ora tocca solo aspettare.`
      : `Tocca l'uovo per farlo nascere.\nOgni carezza lo avvicina — ora mancano ${mm}:${ss}.`;
  }
  if (S.sleep) return 'Dorme. L\'energia risale.';
  if (S.sick) return 'Sta male. Serve una medicina.';
  if (S.h < 20) return 'Ha fame sul serio.';
  if (S.c < 20) return 'C\'è bisogno di una pulita.';
  if (S.e < 20) return 'È esausto: fallo dormire.';
  if (S.ha < 25) return 'Si annoia. Una partita?';
  if (S.h < 45) return 'Mangerebbe qualcosa.';
  if (mood() === 'happy') return `Sta benissimo. ${S.variant ? VAR_LABEL[S.variant] : 'Cresce'}, ${Math.floor(ageDays())}g.`;
  return `Tutto sotto controllo. ${Math.floor(ageDays())}g di vita.`;
}

function needCount() {
  if (S.dead) return 0;
  return (S.h < 20 ? 1 : 0) + (S.c < 20 ? 1 : 0) + (S.e < 15 ? 1 : 0) + (S.ha < 25 ? 1 : 0) + (S.sick ? 1 : 0);
}

let painted = '';
function render() {
  const m = mood(), v = S.variant || 'equilibrato';
  const sig = [S.h | 0, S.ha | 0, S.e | 0, S.c | 0, S.he | 0, m, S.stage, v, S.coins, S.streak, S.gen, S.dead, S.bond | 0].join('|');
  if (sig === painted) { el.say.textContent = line(); return; }   // BUG v3: ridisegnava tutto ogni secondo
  painted = sig;

  const isEgg = S.stage === 'uovo' && !S.dead;
  el.egg.hidden = !isEgg;
  el.egg.classList.toggle('warm', (S.warm || 0) > WARM_MAX * .4);
  // richiamo "toccami" finché non è arrivato il primo tocco: poi via, non insiste
  el.egg.classList.toggle('cta', isEgg && (S.warm || 0) === 0);
  $('#stage').classList.toggle('hatching', isEgg);
  el.sprite.hidden = isEgg;
  if (!isEgg) {
    const src = m === 'ok' ? `sprite-${v}.png` : `sprite-${v}-${m}.png`;
    if (!el.sprite.src.endsWith(src)) el.sprite.src = src;
    el.sprite.alt = `Il tuo Tama ${VAR_LABEL[v].toLowerCase()}, umore ${m}`;
    el.sprite.classList.toggle('sleeping', m === 'sleep');
    el.sprite.classList.toggle('poorly', m === 'sick' || S.dead);
  }
  el.zzz.hidden = !S.sleep || S.dead;

  const bars = { h: S.h, ha: S.ha, e: S.e, c: S.c, he: S.he };
  for (const k in bars) {
    const box = el.segs[k], val = Math.round(bars[k]), on = Math.round(bars[k] / 10);
    [...box.children].forEach((i, idx) => i.classList.toggle('on', idx < on));
    box.classList.toggle('low', bars[k] < 25);
    box.classList.toggle('mid', bars[k] >= 25 && bars[k] < 50);
    box.setAttribute('aria-valuenow', String(val));
    box.setAttribute('aria-valuetext', `${SEG_LABEL[k]}: ${val} su 100`);
  }
  // il Legame: barra a sé, non un bisogno che cala (niente low/mid)
  { const bb = el.segs.b, bt = bondTier(), bv = Math.round(S.bond || 0), bon = Math.round((S.bond || 0) / 10);
    [...bb.children].forEach((i, idx) => i.classList.toggle('on', idx < bon));
    bb.setAttribute('aria-valuenow', String(bv));
    bb.setAttribute('aria-valuetext', `Legame ${BOND_TIERS[bt].name}, ${bv} su 100`); }

  el.name.textContent = S.name;
  el.coins.textContent = S.coins;
  el.streak.textContent = S.streak;
  el.gen.textContent = `gen ${S.gen} · ${STAGES.find(s => s.id === S.stage)?.label || ''}`;
  el.say.textContent = line();

  const need = needCount();
  el.lampCare.classList.toggle('on', need > 0);
  el.lampQuest.classList.toggle('on', questsPending() > 0);
  $('#bCare').classList.toggle('alert', S.sick);
  $('#bSleep').querySelector('span').textContent = S.sleep ? 'Sveglia' : 'Dormi';
  $('#bSleep').querySelector('b').textContent = S.sleep ? '☀️' : '😴';
  updateBadge(need);
}

function pop(sym) {
  el.fx.textContent = sym; el.fx.classList.remove('pop');
  void el.fx.offsetWidth; el.fx.classList.add('pop');
}

function updateBadge(n) {
  try {
    if ('setAppBadge' in navigator) n ? navigator.setAppBadge(n) : navigator.clearAppBadge();
  } catch (e) { }
}

/* ============================ azioni ============================ */
function cooling(k, ms) {
  const t = Date.now();
  if (S.cool[k] && t < S.cool[k]) { toast(`Aspetta ancora ${Math.ceil((S.cool[k] - t) / 1000)}s`); return true; }
  S.cool[k] = t + ms; return false;
}
function apply(d, msg, sym) {
  for (const k of ['h', 'ha', 'e', 'c', 'he']) if (d[k]) S[k] = clamp(S[k] + d[k], 0, 100);
  if (d.coins) S.coins = Math.max(0, S.coins + d.coins);
  save(); render();
  if (sym) pop(sym);
  if (msg) toast(msg);
  // la missione "umore 90" vale da qualunque via (giocattolo, bagno, banchetto…),
  // non solo dai minigiochi (difetto 9)
  if (d.ha > 0 && S.ha >= 90) {
    questBump('happy');
    if (!S.life.wasHigh) { S.life.happy90 = (S.life.happy90 || 0) + 1; S.life.wasHigh = true; }   // maestria "Sportivo"
  }
}
function guardAlive(action) {
  if (S.dead) { showEnd(S.endReason); return false; }
  if (S.stage === 'uovo' && action !== 'egg') {
    toast('È ancora un uovo: toccalo sullo schermo per scaldarlo.');
    return false;
  }
  return true;
}

$('#bFeed').onclick = () => {
  if (!guardAlive() || cooling('feed', 40000)) return;
  if (S.sleep) { toast('Sta dormendo. Svegliarlo ora gli toglie energia.'); return; }
  if (S.h > 88) {                                    // rimpinzarlo non è gratis
    S.mistakes++; S.life.overfed = true;             // salta la maestria "Goloso" (mai rimpinzato)
    apply({ h: +4, ha: -8, c: -4 }, '🤢 Troppo pieno: umore giù', '🤢'); sBad(); return;
  }
  const wasHungry = S.h < 55;                        // il legame sale solo se il pasto serviva davvero
  S.care.feed++; questBump('feed');
  apply({ h: +18, c: -3 }, '🍎 Pasto servito', '🍎'); sGood(); buzz();
  if (wasHungry) bondUp(3);
};

$('#bClean').onclick = () => {
  if (!guardAlive() || cooling('clean', 45000)) return;
  const wasDirty = S.c < 55;                         // idem: pulire quando era davvero sporco
  S.care.clean++; questBump('clean');
  apply({ c: +34, ha: +2 }, '🧼 Tutto pulito', '✨'); sGood(); buzz();
  if (wasDirty) bondUp(3);
};

$('#bSleep').onclick = () => {
  if (!guardAlive()) return;
  if (!S.sleep && S.e > 85) { toast('Non ha sonno: è troppo carico.'); return; }
  S.sleep = !S.sleep;
  if (S.sleep) { S.care.sleep++; questBump('sleep'); if (S.e < 40) bondUp(2); toast(nowH() >= 22 || nowH() < 7 ? '😴 Buonanotte' : '😴 Pisolino'); }
  else toast('☀️ Sveglio');
  save(true); render(); buzz();
};

$('#bCare').onclick = () => {
  if (!guardAlive()) return;
  if (!S.sick) { toast('Sta bene, niente medicine.'); return; }
  if (S.coins < 20) { toast('Servono 20 monete. Gioca per guadagnarle.'); return; }
  S.sick = false;
  apply({ coins: -20, he: +30, ha: +4 }, '💊 Guarito', '💗'); sWin(); bondUp(6);   // salvarlo dalla malattia lega parecchio
};

/* --- uovo: scaldarlo è un'azione vera, non solo una frase --- */
el.egg.addEventListener('pointerdown', e => {
  e.preventDefault();
  if (S.stage !== 'uovo' || S.dead) return;
  if ((S.warm || 0) >= WARM_MAX) { toast('Più caldo di così non si può.'); return; }
  S.warm = Math.min(WARM_MAX, (S.warm || 0) + WARM_PER_TAP);
  el.egg.classList.remove('cta');   // primo tocco arrivato: via il richiamo (render() salta qui, warm non è nella firma)
  el.egg.classList.remove('nudge'); void el.egg.offsetWidth; el.egg.classList.add('nudge');
  beep(300 + Math.random() * 120, 70, 'sine', .16); buzz(10);
  if (Math.random() < .25) pop('🔥');
  save(); evolve(); render();
}, { passive: false });

/* ============================ negozio ============================ */
const SHOP = [
  { id: 'snack', name: 'Merenda', cost: 6, desc: '+22 fame, subito', run: () => apply({ h: +22 }, '🍪 Che bontà', '🍪') },
  { id: 'banquet', name: 'Banchetto', cost: 16, desc: '+45 fame, +6 umore, −8 pulizia', run: () => apply({ h: +45, ha: +6, c: -8 }, '🍗 Banchetto!', '🍗') },
  { id: 'bath', name: 'Bagno caldo', cost: 10, desc: 'pulizia al massimo, +8 umore', run: () => apply({ c: +100, ha: +8 }, '🛁 Splendente', '🫧') },
  { id: 'toy', name: 'Giocattolo', cost: 14, desc: '+26 umore senza spendere energia', run: () => apply({ ha: +26 }, '🧸 Adorato', '🧸') },
  { id: 'med', name: 'Medicina', cost: 20, desc: 'cura la malattia, +30 salute', run: () => { if (!S.sick) { toast('Sta bene, niente medicine.'); return false; } S.sick = false; apply({ he: +30 }, '💊 Guarito', '💗'); bondUp(6); } },
  { id: 'coffee', name: 'Caffè', cost: 12, desc: '+30 energia, −4 umore', run: () => apply({ e: +30, ha: -4 }, '☕ Sveglio!', '☕') }
];
function openShop() {
  $('#shopCoins').textContent = S.coins;
  const box = $('#shopList'); box.textContent = '';
  SHOP.forEach(it => {
    const b = document.createElement('button');
    b.className = 'opt'; b.disabled = S.coins < it.cost;
    b.innerHTML = `<b>${it.name} · ${it.cost} ¤</b><span></span>`;
    b.querySelector('span').textContent = it.desc;
    b.onclick = () => {
      if (S.coins < it.cost) return;
      const r = it.run();
      if (r === false) return;
      S.coins -= it.cost; sCoin(); save(true); render(); openShop();
    };
    box.appendChild(b);
  });
}

/* ============================ missioni giornaliere ============================ */
const QUEST_POOL = [
  { id: 'feed', label: 'Dai da mangiare 4 volte', goal: 4, reward: 12 },
  { id: 'clean', label: 'Pulisci 3 volte', goal: 3, reward: 10 },
  { id: 'play', label: 'Gioca 3 partite', goal: 3, reward: 14 },
  { id: 'seq', label: 'Supera 4 round a Sequenza', goal: 4, reward: 16 },
  { id: 'catch', label: 'Prendi 20 bersagli ad Acchiappa', goal: 20, reward: 16 },
  { id: 'reflex', label: 'Completa una serie di Riflessi', goal: 1, reward: 12 },
  { id: 'sleep', label: 'Mandalo a dormire una volta', goal: 1, reward: 8 },
  { id: 'happy', label: 'Portalo a umore 90', goal: 1, reward: 14 }
];
function rollQuests() {
  const k = dayKey();
  if (S.q.day === k && S.q.list.length) return;
  const pool = [...QUEST_POOL].sort(() => Math.random() - .5).slice(0, 3);
  S.q = { day: k, list: pool.map(q => ({ ...q, prog: 0, done: false })), prog: {}, bonus: false };
  save(true);
}
function questBump(id, n = 1) {
  let changed = false;
  S.q.list.forEach(q => {
    if (q.id !== id || q.done) return;
    q.prog = Math.min(q.goal, q.prog + n);
    if (q.prog >= q.goal) {
      q.done = true; changed = true;
      S.coins += q.reward; sCoin();
      toast(`🎯 Missione completata: ${q.label} · +${q.reward} ¤`);
    }
  });
  if (S.q.list.every(q => q.done) && !S.q.bonus) {
    S.q.bonus = true; S.coins += 25; sWin(); S.life.questDays = (S.life.questDays || 0) + 1;   // maestria "Equilibrato"
    toast('🏅 Tutte le missioni di oggi: +25 ¤');
  }
  if (changed) { save(true); render(); }
}
const questsPending = () => S.q.list.filter(q => !q.done).length;

function openQuests() {
  rollQuests();
  const box = $('#questList'); box.textContent = '';
  S.q.list.forEach(q => {
    const d = document.createElement('div');
    d.className = 'quest' + (q.done ? ' done' : '');
    d.innerHTML = `<div class="top"><span></span><i>${q.done ? 'fatto' : q.prog + '/' + q.goal} · ${q.reward} ¤</i></div><div class="track"><u style="width:${Math.round(q.prog / q.goal * 100)}%"></u></div>`;
    d.querySelector('.top span').textContent = q.label;
    box.appendChild(d);
  });
  // la sfida di maestria della forma attuale, con il progresso di questa vita
  const hint = $('#albHint');
  if (hint) {
    const v = S.variant, m = MASTERY[v];
    if (m) hint.textContent = (S.album[v] && S.album[v].mastered)
      ? `Maestria ${VAR_LABEL[v]} già sbloccata ★`
      : `Sfida ${VAR_LABEL[v]}: ${m.goal} — ${m.prog(S.life || {})}`;
    else hint.textContent = 'Ogni forma ha la sua sfida di maestria: la scopri quando prende forma.';
  }
  const alb = $('#album'); alb.textContent = '';
  VARIANTS.forEach(v => {
    const got = !!S.album[v], mastered = got && S.album[v].mastered;
    const f = document.createElement('figure');
    f.className = mastered ? 'mastered' : got ? '' : 'locked';
    f.innerHTML = `<img src="sprite-${v}-happy.png" alt=""><figcaption></figcaption>`;
    f.querySelector('figcaption').textContent = got ? (mastered ? '★ ' + VAR_LABEL[v] : VAR_LABEL[v]) : '???';
    alb.appendChild(f);
  });
}

/* ============================ streak giornaliera ============================ */
function checkStreak() {
  const today = dayKey(), y = dayKey(Date.now() - DAY);
  if (S.lastDay === today) return null;
  const cont = S.lastDay === y;
  S.streak = cont ? S.streak + 1 : 1;
  S.lastDay = today;
  const bonus = Math.min(40, 6 + S.streak * 2);
  S.coins += bonus;
  save(true);
  return { streak: S.streak, bonus, cont };
}

/* ============================ minigiochi ============================ */
/* Ogni gioco espone stop(): viene chiamato alla chiusura del dialogo,
   così nessun timer resta vivo dietro le quinte (bug grosso della v3). */
function payEnergy() {
  if (S.e < 10) { toast('Troppo stanco per giocare. Fallo dormire.'); return false; }
  S.e = clamp(S.e - 10, 0, 100); return true;
}
function reward(coins, happy, msg) {
  S.coins += coins;
  apply({ ha: happy, coins: 0 }, `${msg} · +${coins} ¤`, '🎉');
  sCoin(); questBump('play'); bondUp(2);   // giocare insieme lega (l'energia limita lo spam)
}

/* --- Acchiappa --- */
const dCatch = $('#dCatch'), area = $('#catchArea'), target = $('#target');
let cState = null;
function catchStop() {
  if (!cState) return;
  cancelAnimationFrame(cState.raf); clearInterval(cState.timer);
  cState = null;
}
$('#startCatch').onclick = () => {
  if (!guardAlive()) return;
  if (cState) return;
  if (!payEnergy()) return;
  const w = area.clientWidth - 64, h = area.clientHeight - 64;
  cState = { pts: 0, left: 15, x: Math.random() * w, y: Math.random() * h, vx: 150, vy: 120, t: performance.now(), raf: 0, timer: 0 };
  $('#cPts').textContent = '0'; $('#cTime').textContent = '15';
  target.textContent = '+';
  cState.timer = setInterval(() => {
    if (!cState) return;
    cState.left--; $('#cTime').textContent = String(cState.left);
    if (cState.left <= 3) sTick();
    if (cState.left <= 0) catchEnd();
  }, 1000);
  const step = (t) => {
    if (!cState) return;
    const dt = Math.min(.05, (t - cState.t) / 1000); cState.t = t;
    const mx = area.clientWidth - 64, my = area.clientHeight - 64;
    cState.x += cState.vx * dt; cState.y += cState.vy * dt;
    if (cState.x < 0) { cState.x = 0; cState.vx = Math.abs(cState.vx); }
    if (cState.x > mx) { cState.x = mx; cState.vx = -Math.abs(cState.vx); }
    if (cState.y < 0) { cState.y = 0; cState.vy = Math.abs(cState.vy); }
    if (cState.y > my) { cState.y = my; cState.vy = -Math.abs(cState.vy); }
    target.style.transform = `translate(${cState.x}px,${cState.y}px)`;
    cState.raf = requestAnimationFrame(step);
  };
  cState.raf = requestAnimationFrame(step);
};
target.addEventListener('pointerdown', e => {
  if (!cState) return;
  e.preventDefault();
  cState.pts++; $('#cPts').textContent = String(cState.pts);
  // velocità con tetto: nella v3 cresceva all'infinito e il bersaglio "bucava" i bordi
  const sp = Math.min(520, Math.hypot(cState.vx, cState.vy) * 1.08);
  const ang = Math.random() * Math.PI * 2;
  cState.vx = Math.cos(ang) * sp; cState.vy = Math.sin(ang) * sp;
  target.textContent = cState.pts % 5 === 0 ? '★' : '+';
  beep(700 + cState.pts * 8, 60); buzz(8);
}, { passive: false });
function catchEnd() {
  const pts = cState ? cState.pts : 0;
  catchStop();
  if (pts > S.best.catch) { S.best.catch = pts; toast(`🏆 Nuovo record: ${pts}`); }
  questBump('catch', pts);
  reward(Math.min(30, 2 + Math.floor(pts * .8)), Math.min(14, 3 + Math.floor(pts / 3)), `🎯 ${pts} punti`);
  sWin(); dCatch.close();
}
dCatch.addEventListener('close', catchStop);

/* --- Riflessi --- */
const dReflex = $('#dReflex'), rArea = $('#reflexArea');
let rState = null;
function reflexStop() { if (rState) { clearTimeout(rState.to); rState = null; } rArea.className = 'idle'; }
$('#startReflex').onclick = () => {
  if (!guardAlive() || rState) return;
  if (!payEnergy()) return;
  rState = { round: 0, phase: 'idle', to: 0, at: 0, times: [] };
  $('#rTime').textContent = '—';
  nextReflex();
};
function nextReflex() {
  if (!rState) return;
  rState.round++;
  $('#rRound').textContent = String(rState.round);
  if (rState.round > 5) return reflexEnd();
  rState.phase = 'wait';
  rArea.className = 'wait'; rArea.textContent = 'Aspetta…';
  rState.to = setTimeout(() => {
    if (!rState) return;
    rState.phase = 'go'; rState.at = performance.now();
    rArea.className = 'go'; rArea.textContent = 'ORA!'; sTick(); buzz(20);
  }, 800 + Math.random() * 2200);
}
function reflexHit() {
  if (!rState) return;
  if (rState.phase === 'wait') {                       // BUG v3: si potevano accodare più nextReflex
    clearTimeout(rState.to); rState.phase = 'cool';
    rArea.className = 'early'; rArea.textContent = 'Troppo presto';
    sBad(); S.ha = clamp(S.ha - 1, 0, 100);
    rState.to = setTimeout(nextReflex, 900);
  } else if (rState.phase === 'go') {
    const t = Math.round(performance.now() - rState.at);
    rState.phase = 'cool'; rState.times.push(t);
    $('#rTime').textContent = String(t);
    if (S.best.reflex == null || t < S.best.reflex) { S.best.reflex = t; toast(`🏆 Record: ${t} ms`); }
    rArea.className = 'idle'; rArea.textContent = `${t} ms`;
    sGood(); buzz(10);
    rState.to = setTimeout(nextReflex, 850);
  }
}
rArea.addEventListener('pointerdown', e => { e.preventDefault(); reflexHit(); }, { passive: false });
// giocabile anche da tastiera: invio o spazio sul <button> valgono come un tocco (difetto 3)
rArea.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); reflexHit(); } });
function reflexEnd() {
  const ts = rState.times;
  reflexStop();
  if (!ts.length) { dReflex.close(); return; }
  const avg = Math.round(ts.reduce((a, b) => a + b, 0) / ts.length);
  questBump('reflex');
  reward(clamp(Math.round(34 - avg / 25), 4, 30), 10, `⚡ media ${avg} ms`);
  sWin(); dReflex.close();
}
dReflex.addEventListener('close', reflexStop);

/* --- Sequenza --- */
const dSeq = $('#dSeq'), board = $('#seqBoard'), pads = $$('.q', board);
const TONES = [392, 494, 587, 740];
let qState = null;
function seqStop() {
  if (qState) { qState.timers.forEach(clearTimeout); qState = null; }
  pads.forEach(p => p.classList.remove('active', 'off'));
}
function padsOff(v) { pads.forEach(p => p.classList.toggle('off', v)); }
$('#startSeq').onclick = () => {
  if (!guardAlive()) return;
  if (qState) seqStop();
  if (!payEnergy()) return;
  qState = { seq: [], idx: 0, round: 0, phase: 'idle', timers: [], lastTap: 0 };
  $('#seqStatus').textContent = '—';
  seqNext();
};
function later(fn, ms) { const t = setTimeout(() => { if (qState) fn(); }, ms); qState.timers.push(t); return t; }
function seqNext() {
  if (!qState) return;
  qState.round++; qState.idx = 0;
  $('#seqRound').textContent = String(qState.round);
  qState.seq.push(1 + (Math.random() * 4 | 0));
  seqPlay();
}
function seqPlay() {
  if (!qState) return;
  qState.timers.forEach(clearTimeout); qState.timers = [];
  qState.phase = 'show'; padsOff(true);
  $('#seqStatus').textContent = 'Guarda';
  const ON = 460, GAP = 220;
  qState.seq.forEach((v, i) => {
    later(() => {
      const p = pads[v - 1];
      p.classList.add('active'); beep(TONES[v - 1], 240, 'triangle', .2);
      later(() => p.classList.remove('active'), ON);
    }, i * (ON + GAP) + 350);
  });
  later(() => {
    if (!qState) return;
    qState.phase = 'input'; padsOff(false);
    $('#seqStatus').textContent = `Ripeti (${qState.seq.length})`;
  }, qState.seq.length * (ON + GAP) + 400);
}
function tapPad(v) {
  if (!qState || qState.phase !== 'input') return;
  const now = performance.now();
  if (now - qState.lastTap < 120) return;
  qState.lastTap = now;
  const p = pads[v - 1];
  p.classList.add('active'); setTimeout(() => p.classList.remove('active'), 150);
  beep(TONES[v - 1], 200, 'triangle', .2); buzz(8);
  if (v === qState.seq[qState.idx]) {
    qState.idx++;
    if (qState.idx < qState.seq.length) { $('#seqStatus').textContent = `${qState.idx}/${qState.seq.length}`; }
    else {
      padsOff(true); qState.phase = 'won';
      $('#seqStatus').textContent = 'Round superato';
      sWin(); questBump('seq');
      if (qState.round > S.best.seq) { S.best.seq = qState.round; }
      later(seqNext, 900);
    }
  } else {
    qState.phase = 'lost'; padsOff(true); sBad();
    $('#seqStatus').textContent = 'Sbagliato';
    later(seqEnd, 900);
  }
}
pads.forEach(p => {
  p.addEventListener('pointerup', e => { e.preventDefault(); tapPad(+p.dataset.q); }, { passive: false });
  p.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); tapPad(+p.dataset.q); } });
});
addEventListener('keydown', e => {
  if (!dSeq.open) return;
  const n = +e.key;
  if (n >= 1 && n <= 4) tapPad(n);
});
function seqEnd() {
  const r = qState ? qState.round : 0;
  seqStop();
  if (r > 1) reward(Math.min(30, r * 3), Math.min(16, 4 + r * 2), `🔷 ${r - 1} round`);
  else toast('🔷 Ritenta, la sequenza cresce in fretta');
  dSeq.close();
}
dSeq.addEventListener('close', seqStop);

/* ============================ apertura dialoghi ============================ */
$('#bPlay').onclick = () => {
  if (!guardAlive()) return;
  $('#recCatch').textContent = S.best.catch;
  $('#recReflex').textContent = S.best.reflex ?? '—';
  $('#recSeq').textContent = S.best.seq;
  $('#dPlay').showModal();
};
$$('#dPlay [data-game]').forEach(b => b.onclick = () => {
  $('#dPlay').close();
  const g = b.dataset.game;
  if (g === 'catch') dCatch.showModal();
  else if (g === 'reflex') dReflex.showModal();
  else dSeq.showModal();
});
$('#bShop').onclick = () => { openShop(); $('#dShop').showModal(); };
$('#bQuests').onclick = () => { openQuests(); $('#dQuests').showModal(); };
$('#bMenu').onclick = () => { openMenu(); $('#dMenu').showModal(); };

/* ============================ menu ============================ */
function openMenu() {
  $('#inName').value = S.name;
  $('#vSound').textContent = S.sound ? 'acceso' : 'spento';
  $('#vHaptic').textContent = S.haptics ? 'accesa' : 'spenta';
  const perm = ('Notification' in window) ? Notification.permission : 'unsupported';
  $('#vNotify').textContent = perm === 'granted' && S.notify ? 'attivo' : perm === 'denied' ? 'bloccato dal browser' : 'spento';
  $('#menuInfo').textContent = `Generazione ${S.gen} · ${Math.floor(ageDays())} giorni · Legame ${BOND_TIERS[bondTier()].name} · ${S.mistakes} errori di cura · ${Object.keys(S.album).length}/5 evoluzioni trovate`;
}
$('#inName').addEventListener('change', e => {
  const v = e.target.value.trim().slice(0, 12);
  S.name = v || 'Tama'; save(true); render();
});
$('#bHelp').onclick = () => { $('#dMenu').close(); $('#dHelp').showModal(); };
$('#tSound').onclick = () => { S.sound = !S.sound; save(true); openMenu(); if (S.sound) sGood(); };
$('#tHaptic').onclick = () => { S.haptics = !S.haptics; save(true); openMenu(); buzz(20); };
$('#tNotify').onclick = async () => {
  if (!('Notification' in window)) { toast('Il tuo browser non supporta i promemoria.'); return; }
  if (Notification.permission === 'granted') { S.notify = !S.notify; save(true); openMenu(); return; }
  const p = await Notification.requestPermission();
  S.notify = p === 'granted'; save(true); openMenu();
  toast(S.notify ? '🔔 Ti avviserò quando ha bisogno' : 'Promemoria non attivati');
};
$('#bUpdate').onclick = async () => {
  try {
    const r = await navigator.serviceWorker.getRegistration();
    if (r) { await r.update(); toast('Controllo aggiornamenti…'); }
    setTimeout(() => location.reload(), 900);
  } catch (e) { location.reload(); }
};
$('#bReset').onclick = async () => {
  if (!confirm('Cancello salvataggio, album e cache. Sicuro?')) return;
  try {
    localStorage.removeItem(KEY); localStorage.removeItem('tama');
    if ('serviceWorker' in navigator) {
      const rs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(rs.map(r => r.unregister()));
    }
    if ('caches' in window) {
      const ks = await caches.keys();
      await Promise.all(ks.map(k => caches.delete(k)));
    }
  } catch (e) { console.warn(e); }
  location.replace(location.pathname);   // reload(true) è deprecato e ignorato
};

/* ============================ promemoria ============================ */
function notify(title, body) {
  if (!S.notify || !('Notification' in window) || Notification.permission !== 'granted') return;
  if (!document.hidden) return;
  if (Date.now() - S.lastNotify < 3 * HOUR) return;
  S.lastNotify = Date.now(); save();
  try {
    navigator.serviceWorker.getRegistration().then(r => {
      const opt = { body, icon: 'icon-192.png', badge: 'icon-192.png', tag: 'tama-care' };
      r ? r.showNotification(title, opt) : new Notification(title, opt);
    });
  } catch (e) { }
}

/* ============================ fine ciclo ============================ */
function showEnd(reason) {
  const good = reason === 'anzianità';
  const days = Math.floor(ageDays());
  if (S.endedAway) {
    // fine raggiunta mentre l'utente era via: né rimproveri né celebrazioni
    $('#endTitle').textContent = 'È arrivato alla fine';
    $('#endBody').textContent = `Mentre eri via, ${S.name} è arrivato alla fine del suo tempo, dopo ${days} giorni passati con te. Nessuna colpa e niente da festeggiare: certe volte capita lontano dagli occhi.`;
  } else if (good) {
    $('#endTitle').textContent = 'Una vita intera';
    $('#endBody').textContent = `${S.name} ha passato con te ${days} giorni ed è andato in pensione. La prossima generazione crescerà più serena grazie a lui.`;
  } else {
    $('#endTitle').textContent = 'Addio';
    $('#endBody').textContent = `${S.name} non ce l'ha fatta. Succede: da domani ci riprovi, e la memoria di questa vita resta nell'album.`;
  }
  const ul = $('#endRecap'); ul.textContent = '';
  [
    `Forma raggiunta: ${S.variant ? VAR_LABEL[S.variant] : 'nessuna'}`,
    `Errori di cura: ${S.mistakes}`,
    `Legame raggiunto: ${BOND_TIERS[bondTier()].name}`,
    `Record: ${S.best.catch} punti · ${S.best.reflex ?? '—'} ms · ${S.best.seq} round`,
    `Evoluzioni nell'album: ${Object.keys(S.album).length}/5`,
    `Maestrie sbloccate: ${masteredCount()}/5`
  ].forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
  if (!$('#dEnd').open) $('#dEnd').showModal();
}
$('#bNewGen').onclick = () => {
  const fresh = blank(S.gen + 1, S.album, S.wins || 0);
  fresh.coins = S.coins; fresh.best = S.best; fresh.streak = S.streak; fresh.lastDay = S.lastDay;
  fresh.sound = S.sound; fresh.haptics = S.haptics; fresh.notify = S.notify; fresh.name = S.name;
  Object.keys(S).forEach(k => delete S[k]);
  Object.assign(S, fresh);
  save(true); painted = ''; render();
  $('#dEnd').close();
  toast(`🥚 Generazione ${S.gen}: un nuovo uovo`);
};

/* ============================ bentornato ============================ */
/* ============================ diario del ritorno ============================ */
/* Fase 3 — pilastro "diario del ritorno". Al rientro dopo qualche ora, una riga
   su cosa ha fatto il Tama mentre eri via. Dipende da COME l'hai lasciato:
   lasciarlo sazio e contento dà giornate belle, a secco giornate storte. È il
   motivo per riaprire — trovare una piccola storia, non un bilancio di barre. */
const DIARY = {
  good: [
    { t: 'Ha sonnecchiato al calduccio e si è svegliato di ottimo umore.', ha: 4 },
    { t: 'Ha giocato da solo e ha trovato una monetina.', coins: 2 },
    { t: 'Si è tenuto in ordine da sé, tutto fiero.' },
    { t: 'Ti ha aspettato di buon umore, sicuro che tornavi.', ha: 3 },
    { t: 'Ha fatto amicizia con un raggio di sole.' }
  ],
  ok: [
    { t: 'Ha oziato in attesa che tornassi.' },
    { t: 'Ha guardato fuori un po\', poi un pisolino.' },
    { t: 'Giornata tranquilla, niente di che.' }
  ],
  bad: [
    { t: 'Ti ha aspettato alla finestra: si annoiava.' },
    { t: 'Aveva fame e ha rosicchiato le sue scorte.' },
    { t: 'Non è stata una gran giornata: si sentiva solo.' },
    { t: 'Ha fatto il broncio per un po\'.' }
  ]
};
// un tocco di colore per variante (giornata buona / storta), usato ~metà delle volte
const DIARY_VAR = {
  goloso: { good: 'Ha sognato un banchetto e si è leccato i baffi.', bad: 'Ha frugato invano in cerca di qualcosa da sgranocchiare.' },
  sportivo: { good: 'Ha fatto una corsa attorno allo schermo, tutto solo.', bad: 'Troppa poca energia per muoversi: ha solo aspettato.' },
  pulito: { good: 'Si è dato una spazzolata: brilla.', bad: 'Si è sentito trascurato e un po\' impolverato.' },
  sognatore: { good: 'Ha fatto un sogno lungo e sereno.', bad: 'Sonni agitati: non ha riposato bene.' },
  equilibrato: { good: 'Ha passato una giornata in equilibrio, senza strafare.', bad: 'Una giornata sottotono, un po\' spenta.' }
};
const DIARY_MIN = 2 * HOUR;                 // sotto le due ore non è "una parte di giornata via"
function returnDiary(gap, before) {
  if (!before || gap < DIARY_MIN) return null;
  const leftWell = before.h > 55 && before.ha > 50 && before.c > 45 && before.he > 40;
  const leftBad = before.h < 25 || before.c < 20 || before.ha < 25;
  const mood = (S.sick || leftBad) ? 'bad' : leftWell ? 'good' : 'ok';
  const flavor = DIARY_VAR[S.variant || 'equilibrato'];
  let pick;
  if (flavor && (mood === 'good' || mood === 'bad') && Math.random() < .5) {
    pick = { t: flavor[mood] };
  } else {
    const pool = DIARY[mood];
    pick = pool[(Math.random() * pool.length) | 0];
    if (pick.t === S.lastDiary && pool.length > 1) pick = pool[(pool.indexOf(pick) + 1) % pool.length];
  }
  S.lastDiary = pick.t;
  return pick;                              // il premio (se c'è) lo applica welcome(), dopo il conteggio delle perdite
}

/* ============================ bentornato ============================ */
function welcome(gap, before) {
  const ul = $('#backRecap'); ul.textContent = '';
  const st = checkStreak();                 // assegna sempre il bonus del giorno, anche se poi non mostriamo il riepilogo
  const newDay = !!st;                      // primo accesso di oggi
  const away = gap > 20 * 60000;            // vera assenza, non un semplice reload
  if (!newDay && !away) return;             // reload rapido nello stesso giorno: niente riepilogo (difetto 4)
  const diary = returnDiary(gap, before);   // la storia di com'è andata mentre eri via
  const rows = [];
  if (diary) rows.push(diary.t);            // in cima: è il motivo per cui sei tornato
  if (st) rows.push(st.cont ? `Giorno ${st.streak} di fila · +${st.bonus} ¤` : `Nuova serie di giorni · +${st.bonus} ¤`);
  if (gap > 20 * 60000 && before) {
    const d = k => Math.round(before[k] - S[k]);
    const loss = [['fame', d('h')], ['umore', d('ha')], ['energia', d('e')], ['pulizia', d('c')]].filter(x => x[1] > 2);
    if (loss.length) rows.push('Mentre eri via: ' + loss.map(x => `${x[0]} −${x[1]}`).join(', '));
    if (gap > MAX_OFFLINE) rows.push('Oltre 8 ore lontano non contano: il tuo Tama ti ha aspettato.');
  }
  if (S.sick) rows.push('Si è ammalato: serve una medicina.');
  if (questsPending()) rows.push(`Missioni di oggi da fare: ${questsPending()}`);
  if (!rows.length) return;
  // il piccolo premio del diario si applica ORA, dopo il conteggio delle perdite (che resta onesto)
  if (diary && diary.coins) S.coins = Math.max(0, S.coins + diary.coins);
  if (diary && diary.ha) S.ha = clamp(S.ha + diary.ha, 0, 100);
  if (diary && (diary.coins || diary.ha)) { save(); render(); }
  $('#backTitle').textContent = gap > 6 * HOUR ? 'Bentornato' : 'Ciao';
  $('#backBody').textContent = `${S.name}, generazione ${S.gen}, ${Math.floor(ageDays())} giorni.`;
  rows.forEach(t => { const li = document.createElement('li'); li.textContent = t; ul.appendChild(li); });
  $('#dBack').showModal();
}

/* ============================ PWA ============================ */
let deferredPrompt = null;
addEventListener('beforeinstallprompt', e => {   // v3: il tasto "Installa" non installava nulla
  e.preventDefault(); deferredPrompt = e;
  $('#bInstall').hidden = false;
});
$('#bInstall').onclick = async () => {
  if (!deferredPrompt) { toast('Su iPhone: Condividi → Aggiungi a Home.'); return; }
  deferredPrompt.prompt();
  const { outcome } = await deferredPrompt.userChoice;
  deferredPrompt = null; $('#bInstall').hidden = true;
  if (outcome === 'accepted') toast('App installata');
};
addEventListener('appinstalled', () => { $('#bInstall').hidden = true; toast('Ci vediamo dalla schermata home'); });

// Safari iOS non emette mai beforeinstallprompt: senza questo il tasto "Installa"
// resterebbe nascosto per sempre e le istruzioni "Condividi → Aggiungi a Home"
// (già nella sua onclick qui sopra) sarebbero irraggiungibili (difetto 7).
// Lo riveliamo quando siamo su iOS e non siamo già in modalità standalone.
{
  const iOS = /iphone|ipad|ipod/i.test(navigator.userAgent) ||
    (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);   // iPadOS si dichiara come Mac
  const standalone = navigator.standalone === true || matchMedia('(display-mode: standalone)').matches;
  if (iOS && !standalone) $('#bInstall').hidden = false;
}

if ('serviceWorker' in navigator) {
  // Niente reload automatico su controllerchange: alla prima visita
  // clients.claim() dà il controllo alla pagina appena caricata, e a ogni
  // aggiornamento lo SKIP_WAITING attiva il nuovo SW — in entrambi i casi un
  // location.reload() qui ricaricherebbe la pagina mentre il boot ha appena
  // aperto un dialogo, che sparisce all'istante (il "lampeggio" all'avvio).
  // La nuova versione entra al prossimo avvio; l'utente è avvisato dal toast.
  addEventListener('load', () => {
    navigator.serviceWorker.register('service-worker.js').then(reg => {
      reg.addEventListener('updatefound', () => {
        const sw = reg.installing;
        if (!sw) return;
        sw.addEventListener('statechange', () => {
          if (sw.state === 'installed' && navigator.serviceWorker.controller) {
            toast('Nuova versione pronta');
            sw.postMessage('SKIP_WAITING');
          }
        });
      });
    }).catch(e => console.warn('SW non registrato', e));
  });
}

/* ============================ avvio ============================ */
function boot() {
  const gap = Date.now() - (S.seen || S.last);
  const before = snapshot();
  advance(Date.now());
  rollQuests();
  painted = ''; render();
  if (!S.tips.intro) {
    // Niente riquadro delle regole in faccia al primo avvio: sei regole non le
    // legge nessuno, e la schermata dell'uovo dice già cosa fare ("Tocca l'uovo
    // per scaldarlo"). Le regole restano in Menu → Come si gioca. Il tutorial
    // vero è materia della fase 3. Segniamo solo che il primo avvio è passato.
    S.tips.intro = true; save(true);
  } else if (!S.dead) welcome(gap, before);
  else showEnd(S.endReason);
  if (S.tips.migrated) { S.tips.migrated = false; toast('Salvataggio precedente recuperato'); save(true); }

  // scorciatoie del manifest: ?a=play / ?a=quests
  const a = new URLSearchParams(location.search).get('a');
  if (a === 'play' && !S.dead) $('#bPlay').click();
  if (a === 'quests') $('#bQuests').click();

  setInterval(() => { advance(Date.now()); render(); save(); }, 1000);

  // controllo separato per i promemoria, indipendente dal tick di gioco
  setInterval(() => {
    if (S.dead || !document.hidden) return;
    if (S.sick) notify(`${S.name} sta male`, 'Una medicina lo rimetterebbe in sesto.');
    else if (S.h < 12) notify(`${S.name} ha fame`, 'Un pasto e torna sereno.');
    else if (S.c < 12) notify(`${S.name} ha bisogno di una pulita`, 'Bastano pochi secondi.');
  }, 5 * 60000);

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) return;
    const g = Date.now() - S.seen;
    const b = snapshot();
    advance(Date.now()); render();
    if (g > 30 * 60000) welcome(g, b);
  });
}
boot();
