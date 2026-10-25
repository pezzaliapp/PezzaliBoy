/*
 * SUDOKU — interfaccia di gioco
 * Tutto avviene nel browser: nessuna rete, nessun account, nessun tracciamento.
 */

import {
  CELLS,
  SIZE,
  LEVELS,
  LEVEL_LABELS,
  ROW_OF,
  COL_OF,
  BOX_OF,
  PEERS,
  generatePuzzle,
  createRng,
  randomSeed,
  findConflicts,
  candidatesFor,
  digitCounts
} from './engine.js';

import { APP_VERSION } from './version.js';
import { initPwa } from './pwa.js';
import { initNative } from './native.js';

const STORAGE_KEY = 'sudoku.game.v2';
const PREFS_KEY = 'sudoku.prefs.v2';
const STATE_VERSION = 2;

/* ------------------------------------------------------------------ */
/* Archiviazione locale tollerante ai contesti senza localStorage      */
/* ------------------------------------------------------------------ */

const store = {
  read(key) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : null;
    } catch (_) {
      return null;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (_) {
      /* spazio non disponibile: la partita resta comunque giocabile */
    }
  },
  remove(key) {
    try {
      localStorage.removeItem(key);
    } catch (_) { /* ignorato */ }
  }
};

/* ------------------------------------------------------------------ */
/* Riferimenti al DOM                                                  */
/* ------------------------------------------------------------------ */

const el = {
  board: document.getElementById('board'),
  busy: document.getElementById('busy'),
  live: document.getElementById('live'),
  statLevel: document.getElementById('statLevel'),
  statTime: document.getElementById('statTime'),
  statErrors: document.getElementById('statErrors'),
  statHints: document.getElementById('statHints'),
  levelSelect: document.getElementById('levelSelect'),
  newGameBtn: document.getElementById('newGameBtn'),
  notesBtn: document.getElementById('notesBtn'),
  eraseBtn: document.getElementById('eraseBtn'),
  undoBtn: document.getElementById('undoBtn'),
  hintBtn: document.getElementById('hintBtn'),
  checkBtn: document.getElementById('checkBtn'),
  pad: document.getElementById('pad'),
  themeBtn: document.getElementById('themeBtn'),
  themeIcon: document.getElementById('themeIcon'),
  infoBtn: document.getElementById('infoBtn'),
  infoLink: document.getElementById('infoLink'),
  infoDialog: document.getElementById('infoDialog'),
  winDialog: document.getElementById('winDialog'),
  confirmDialog: document.getElementById('confirmDialog'),
  winLevel: document.getElementById('winLevel'),
  winTime: document.getElementById('winTime'),
  winErrors: document.getElementById('winErrors'),
  winHints: document.getElementById('winHints'),
  winLead: document.getElementById('winLead'),
  winNewBtn: document.getElementById('winNewBtn'),
  resetDataBtn: document.getElementById('resetDataBtn'),
  versionTag: document.getElementById('versionTag'),
  dialogVersion: document.getElementById('dialogVersion')
};

const themeMeta = {
  light: document.querySelector('meta[name="theme-color"][media*="light"]'),
  dark: document.querySelector('meta[name="theme-color"][media*="dark"]')
};

/* ------------------------------------------------------------------ */
/* Stato                                                               */
/* ------------------------------------------------------------------ */

const game = {
  level: 'medio',
  puzzle: new Uint8Array(CELLS),
  solution: new Uint8Array(CELLS),
  board: new Uint8Array(CELLS),
  notes: new Int16Array(CELLS),
  hinted: new Uint8Array(CELLS),
  selected: -1,
  notesMode: false,
  errors: 0,
  hints: 0,
  elapsed: 0,
  completed: false,
  ready: false,
  undo: []
};

let checkMarks = new Set();
let checkTimer = 0;
let tickTimer = 0;
let lastTick = 0;
let saveTimer = 0;
let liveTimer = 0;
let pendingLevel = null;

const cellEls = [];
const keyEls = [];

/* ------------------------------------------------------------------ */
/* Costruzione della griglia e del tastierino                          */
/* ------------------------------------------------------------------ */

function buildBoard() {
  const fragment = document.createDocumentFragment();
  for (let r = 0; r < SIZE; r++) {
    const row = document.createElement('div');
    row.className = 'board__row';
    row.setAttribute('role', 'row');
    for (let c = 0; c < SIZE; c++) {
      const index = r * SIZE + c;
      const cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.index = String(index);
      cell.tabIndex = -1;

      const value = document.createElement('span');
      value.className = 'cell__value';
      cell.appendChild(value);

      const notes = document.createElement('span');
      notes.className = 'cell__notes';
      notes.hidden = true;
      for (let n = 0; n < SIZE; n++) {
        const note = document.createElement('span');
        note.className = 'cell__note';
        notes.appendChild(note);
      }
      cell.appendChild(notes);

      cellEls.push(cell);
      row.appendChild(cell);
    }
    fragment.appendChild(row);
  }
  el.board.appendChild(fragment);

  el.board.addEventListener('click', (event) => {
    const target = event.target.closest('.cell');
    if (!target) return;
    selectCell(Number(target.dataset.index));
  });
}

function buildPad() {
  const fragment = document.createDocumentFragment();
  for (let v = 1; v <= SIZE; v++) {
    const key = document.createElement('button');
    key.type = 'button';
    key.className = 'key';
    key.dataset.value = String(v);
    key.setAttribute('aria-label', `Inserisci ${v}`);

    key.textContent = String(v);

    keyEls.push(key);
    fragment.appendChild(key);
  }
  el.pad.appendChild(fragment);

  el.pad.addEventListener('click', (event) => {
    const target = event.target.closest('.key');
    if (!target) return;
    enterValue(Number(target.dataset.value));
  });
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function render() {
  const selected = game.selected;
  const selValue = selected >= 0 ? game.board[selected] : 0;
  const conflicts = findConflicts(game.board);

  for (let i = 0; i < CELLS; i++) {
    const cell = cellEls[i];
    const value = game.board[i];
    const given = game.puzzle[i] !== 0;

    const valueEl = cell.firstChild;
    const notesEl = cell.lastChild;

    if (value) {
      valueEl.textContent = String(value);
      clearNotes(notesEl);
    } else {
      valueEl.textContent = '';
      const mask = game.notes[i];
      if (mask) {
        for (let n = 0; n < SIZE; n++) {
          notesEl.children[n].textContent = mask & (1 << n) ? String(n + 1) : '';
        }
        notesEl.hidden = false;
      } else {
        clearNotes(notesEl);
      }
    }

    const isSelected = i === selected;
    const isPeer =
      selected >= 0 &&
      !isSelected &&
      (ROW_OF[i] === ROW_OF[selected] || COL_OF[i] === COL_OF[selected] || BOX_OF[i] === BOX_OF[selected]);
    const isSame = selValue > 0 && value === selValue && !isSelected;
    const isError = conflicts.has(i) || checkMarks.has(i);

    cell.classList.toggle('is-given', given);
    cell.classList.toggle('is-hint', !given && game.hinted[i] === 1 && value !== 0);
    cell.classList.toggle('is-peer', isPeer && !isSame);
    cell.classList.toggle('is-same', isSame);
    cell.classList.toggle('is-selected', isSelected);
    cell.classList.toggle('is-error', isError);

    cell.tabIndex = isSelected ? 0 : -1;
    cell.setAttribute('aria-selected', isSelected ? 'true' : 'false');
    cell.setAttribute('aria-readonly', given ? 'true' : 'false');
    cell.setAttribute(
      'aria-label',
      `Riga ${ROW_OF[i] + 1}, colonna ${COL_OF[i] + 1}: ${
        value ? `${value}${given ? ', cella iniziale' : ''}` : 'vuota'
      }`
    );
  }

  if (selected < 0 && cellEls.length) cellEls[0].tabIndex = 0;

  renderPad();
  renderStatus();
}

function clearNotes(notesEl) {
  if (notesEl.hidden) return;
  notesEl.hidden = true;
  for (let n = 0; n < SIZE; n++) notesEl.children[n].textContent = '';
}

function renderPad() {
  const counts = digitCounts(game.board);
  for (let v = 1; v <= SIZE; v++) {
    const key = keyEls[v - 1];
    const done = counts[v] >= SIZE;
    key.classList.toggle('is-done', done);
    key.setAttribute('aria-label', done ? `Inserisci ${v} — già completato` : `Inserisci ${v}`);
    key.disabled = game.completed;
  }
}

function renderStatus() {
  el.statLevel.textContent = LEVEL_LABELS[game.level] || '—';
  el.statTime.textContent = formatTime(game.elapsed);
  el.statErrors.textContent = String(game.errors);
  el.statHints.textContent = String(game.hints);
  el.statErrors.classList.toggle('status__value--alert', game.errors > 0);
  el.undoBtn.disabled = game.undo.length === 0 || game.completed;
  el.hintBtn.disabled = game.completed;
  el.checkBtn.disabled = game.completed;
  el.eraseBtn.disabled = game.completed;
  el.notesBtn.disabled = game.completed;
  el.notesBtn.setAttribute('aria-pressed', game.notesMode ? 'true' : 'false');
  el.notesBtn.querySelector('.tool__text').textContent = game.notesMode ? 'Note ON' : 'Note';
  el.notesBtn.title = game.notesMode ? 'Modalità note attiva (N)' : 'Modalità note (N)';
}

function say(message) {
  el.live.textContent = message;
  clearTimeout(liveTimer);
  if (message) liveTimer = setTimeout(() => { el.live.textContent = ''; }, 4000);
}

function formatTime(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, '0');
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}

/* ------------------------------------------------------------------ */
/* Timer                                                               */
/* ------------------------------------------------------------------ */

function startTimer() {
  stopTimer();
  if (game.completed || !game.ready) return;
  lastTick = Date.now();
  tickTimer = setInterval(() => {
    const now = Date.now();
    game.elapsed += (now - lastTick) / 1000;
    lastTick = now;
    el.statTime.textContent = formatTime(game.elapsed);
    scheduleSave();
  }, 1000);
}

function stopTimer() {
  if (!tickTimer) return;
  const now = Date.now();
  game.elapsed += (now - lastTick) / 1000;
  clearInterval(tickTimer);
  tickTimer = 0;
  el.statTime.textContent = formatTime(game.elapsed);
}

/* ------------------------------------------------------------------ */
/* Partita                                                             */
/* ------------------------------------------------------------------ */

function newGame(level) {
  const chosen = LEVELS.includes(level) ? level : 'medio';
  el.busy.hidden = false;
  el.newGameBtn.disabled = true;
  stopTimer();

  /* Un frame di respiro per mostrare l'indicatore prima del calcolo. */
  requestAnimationFrame(() => {
    setTimeout(() => {
      const rng = createRng(randomSeed());
      const result = generatePuzzle(chosen, rng);

      game.level = chosen;
      game.puzzle = Uint8Array.from(result.puzzle);
      game.solution = Uint8Array.from(result.solution);
      game.board = Uint8Array.from(result.puzzle);
      game.notes = new Int16Array(CELLS);
      game.hinted = new Uint8Array(CELLS);
      game.selected = firstEmptyCell();
      game.notesMode = false;
      game.errors = 0;
      game.hints = 0;
      game.elapsed = 0;
      game.completed = false;
      game.ready = true;
      game.undo = [];
      checkMarks = new Set();

      el.levelSelect.value = chosen;
      el.busy.hidden = true;
      el.newGameBtn.disabled = false;

      render();
      focusSelected();
      startTimer();
      save();
      say(`${LEVEL_LABELS[chosen]} · ${result.clues} numeri iniziali`);
    }, 20);
  });
}

/** Vero se la partita in corso contiene mosse dell'utente da salvaguardare. */
function hasProgress() {
  if (!game.ready || game.completed) return false;
  for (let i = 0; i < CELLS; i++) {
    if (game.puzzle[i]) continue;
    if (game.board[i] || game.notes[i]) return true;
  }
  return false;
}

/**
 * Avvia una nuova partita, chiedendo conferma solo se c'è davvero
 * qualcosa da perdere: su una griglia intatta la conferma sarebbe inutile.
 */
function requestNewGame(level) {
  if (!hasProgress()) {
    newGame(level);
    return;
  }
  pendingLevel = level;
  el.confirmDialog.returnValue = '';
  openDialog(el.confirmDialog);
}

function firstEmptyCell() {
  for (let i = 0; i < CELLS; i++) if (!game.board[i]) return i;
  return 0;
}

function selectCell(index) {
  if (index < 0 || index >= CELLS) return;
  game.selected = index;
  render();
  focusSelected();
}

function focusSelected() {
  if (game.selected < 0) return;
  const cell = cellEls[game.selected];
  if (cell && document.activeElement !== cell && el.board.contains(document.activeElement)) cell.focus();
}

function pushUndo(index) {
  game.undo.push({
    index,
    value: game.board[index],
    notes: game.notes[index],
    hinted: game.hinted[index],
    errors: game.errors,
    hints: game.hints
  });
  if (game.undo.length > 120) game.undo.shift();
}

function enterValue(value) {
  const index = game.selected;
  if (game.completed || index < 0) return;
  if (game.puzzle[index] !== 0) {
    say('Le celle iniziali non si possono modificare.');
    return;
  }

  if (game.notesMode) {
    pushUndo(index);
    if (game.board[index]) game.board[index] = 0;
    game.notes[index] ^= 1 << (value - 1);
    game.hinted[index] = 0;
    afterChange();
    return;
  }

  if (game.board[index] === value) {
    /* Premere di nuovo la stessa cifra cancella la cella. */
    eraseCell();
    return;
  }

  pushUndo(index);
  game.board[index] = value;
  game.notes[index] = 0;
  game.hinted[index] = 0;

  if (value !== game.solution[index]) {
    game.errors++;
  } else {
    removeNoteFromPeers(index, value);
  }

  afterChange();
  checkCompletion();
}

function eraseCell() {
  const index = game.selected;
  if (game.completed || index < 0) return;
  if (game.puzzle[index] !== 0) {
    say('Le celle iniziali non si possono modificare.');
    return;
  }
  if (!game.board[index] && !game.notes[index]) return;

  pushUndo(index);
  game.board[index] = 0;
  game.notes[index] = 0;
  game.hinted[index] = 0;
  afterChange();
}

function removeNoteFromPeers(index, value) {
  const bit = 1 << (value - 1);
  for (const p of PEERS[index]) {
    if (game.notes[p] & bit) game.notes[p] &= ~bit;
  }
}

function undo() {
  if (game.completed || !game.undo.length) return;
  const step = game.undo.pop();
  game.board[step.index] = step.value;
  game.notes[step.index] = step.notes;
  game.hinted[step.index] = step.hinted;
  game.errors = step.errors;
  game.hints = step.hints;
  game.selected = step.index;
  afterChange();
  focusSelected();
}

function hint() {
  if (game.completed) return;

  let index = game.selected;
  if (index < 0 || game.board[index] !== 0 || game.puzzle[index] !== 0) index = bestHintCell();
  if (index < 0) return;

  pushUndo(index);
  game.board[index] = game.solution[index];
  game.notes[index] = 0;
  game.hinted[index] = 1;
  game.hints++;
  game.selected = index;
  removeNoteFromPeers(index, game.board[index]);
  afterChange();
  focusSelected();
  say(`Aiuto: riga ${ROW_OF[index] + 1}, colonna ${COL_OF[index] + 1} → ${game.board[index]}`);
  checkCompletion();
}

/** Cella vuota con il minor numero di candidati: il suggerimento più utile. */
function bestHintCell() {
  let best = -1;
  let bestCount = 10;
  for (let i = 0; i < CELLS; i++) {
    if (game.board[i]) continue;
    const n = candidatesFor(game.board, i).length;
    if (n < bestCount) {
      bestCount = n;
      best = i;
      if (n <= 1) break;
    }
  }
  return best;
}

function checkGrid() {
  if (game.completed) return;
  const wrong = new Set();
  for (let i = 0; i < CELLS; i++) {
    if (game.puzzle[i] || !game.board[i]) continue;
    if (game.board[i] !== game.solution[i]) wrong.add(i);
  }

  checkMarks = wrong;
  render();
  clearTimeout(checkTimer);
  checkTimer = setTimeout(() => {
    checkMarks = new Set();
    render();
  }, 3000);

  if (wrong.size === 0) say('Nessun errore nelle celle compilate.');
  else say(wrong.size === 1 ? '1 numero errato.' : `${wrong.size} numeri errati.`);
}

function afterChange() {
  checkMarks = new Set();
  clearTimeout(checkTimer);
  render();
  scheduleSave();
}

function checkCompletion() {
  for (let i = 0; i < CELLS; i++) {
    if (game.board[i] !== game.solution[i]) return false;
  }

  game.completed = true;
  stopTimer();
  render();
  save();

  el.winLevel.textContent = LEVEL_LABELS[game.level];
  el.winTime.textContent = formatTime(game.elapsed);
  el.winErrors.textContent = String(game.errors);
  el.winHints.textContent = String(game.hints);
  el.winLead.textContent =
    game.errors === 0 && game.hints === 0
      ? 'Completato senza errori e senza aiuti.'
      : 'Griglia risolta correttamente.';

  say('Sudoku completato.');
  openDialog(el.winDialog);
  return true;
}

/* ------------------------------------------------------------------ */
/* Salvataggio e ripristino                                            */
/* ------------------------------------------------------------------ */

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(save, 250);
}

function save() {
  if (!game.ready) return;
  store.write(STORAGE_KEY, {
    v: STATE_VERSION,
    level: game.level,
    puzzle: Array.from(game.puzzle).join(''),
    solution: Array.from(game.solution).join(''),
    board: Array.from(game.board).join(''),
    notes: Array.from(game.notes),
    hinted: Array.from(game.hinted).join(''),
    selected: game.selected,
    notesMode: game.notesMode,
    errors: game.errors,
    hints: game.hints,
    elapsed: Math.round(game.elapsed),
    completed: game.completed
  });
}

function restore() {
  const data = store.read(STORAGE_KEY);
  if (!data || data.v !== STATE_VERSION) return false;

  const toGrid = (text) =>
    typeof text === 'string' && text.length === CELLS
      ? Uint8Array.from(text, (ch) => {
          const n = Number(ch);
          return Number.isInteger(n) && n >= 0 && n <= 9 ? n : 0;
        })
      : null;

  const puzzle = toGrid(data.puzzle);
  const solution = toGrid(data.solution);
  const board = toGrid(data.board);
  if (!puzzle || !solution || !board) return false;

  game.level = LEVELS.includes(data.level) ? data.level : 'medio';
  game.puzzle = puzzle;
  game.solution = solution;
  game.board = board;
  game.notes = new Int16Array(CELLS);
  if (Array.isArray(data.notes)) {
    for (let i = 0; i < CELLS; i++) game.notes[i] = Number(data.notes[i]) || 0;
  }
  game.hinted = toGrid(data.hinted) || new Uint8Array(CELLS);
  game.selected = Number.isInteger(data.selected) && data.selected >= 0 && data.selected < CELLS
    ? data.selected
    : firstEmptyCell();
  game.notesMode = Boolean(data.notesMode);
  game.errors = Number(data.errors) || 0;
  game.hints = Number(data.hints) || 0;
  game.elapsed = Number(data.elapsed) || 0;
  game.completed = Boolean(data.completed);
  game.undo = [];
  game.ready = true;
  checkMarks = new Set();

  el.levelSelect.value = game.level;
  return true;
}

/* ------------------------------------------------------------------ */
/* Preferenze e tema                                                   */
/* ------------------------------------------------------------------ */

const THEMES = ['auto', 'light', 'dark'];
const THEME_ICON = { auto: '◐', light: '☀', dark: '☾' };
const THEME_NAME = { auto: 'automatico', light: 'chiaro', dark: 'scuro' };

let theme = 'auto';

function applyTheme(next) {
  theme = THEMES.includes(next) ? next : 'auto';
  document.documentElement.dataset.theme = theme;
  el.themeIcon.textContent = THEME_ICON[theme];
  el.themeBtn.setAttribute('aria-label', `Tema ${THEME_NAME[theme]}. Cambia tema.`);
  el.themeBtn.title = `Tema: ${THEME_NAME[theme]}`;

  if (themeMeta.light && themeMeta.dark) {
    if (theme === 'light') {
      themeMeta.light.media = 'all';
      themeMeta.dark.media = 'not all';
    } else if (theme === 'dark') {
      themeMeta.light.media = 'not all';
      themeMeta.dark.media = 'all';
    } else {
      themeMeta.light.media = '(prefers-color-scheme: light)';
      themeMeta.dark.media = '(prefers-color-scheme: dark)';
    }
  }
}

function loadPrefs() {
  const prefs = store.read(PREFS_KEY) || {};
  applyTheme(prefs.theme);
  if (LEVELS.includes(prefs.level)) el.levelSelect.value = prefs.level;
}

function savePrefs() {
  store.write(PREFS_KEY, { theme, level: el.levelSelect.value });
}

/* ------------------------------------------------------------------ */
/* Finestre di dialogo                                                 */
/* ------------------------------------------------------------------ */

function openDialog(dialog) {
  if (!dialog) return;
  stopTimer();
  if (typeof dialog.showModal === 'function') {
    if (!dialog.open) dialog.showModal();
  } else {
    dialog.setAttribute('open', '');
  }
  dialog.scrollTop = 0;
}

function closeDialog(dialog) {
  if (!dialog) return;
  if (typeof dialog.close === 'function' && dialog.open) dialog.close();
  else dialog.removeAttribute('open');
}

/* ------------------------------------------------------------------ */
/* Eventi                                                              */
/* ------------------------------------------------------------------ */

function bindEvents() {
  el.newGameBtn.addEventListener('click', () => {
    savePrefs();
    requestNewGame(el.levelSelect.value);
  });

  el.levelSelect.addEventListener('change', () => {
    requestNewGame(el.levelSelect.value);
  });

  el.confirmDialog.addEventListener('close', () => {
    const confirmed = el.confirmDialog.returnValue === 'confirm';
    const level = pendingLevel;
    pendingLevel = null;
    el.confirmDialog.returnValue = '';

    if (confirmed) {
      savePrefs();
      newGame(level);
      return;
    }
    /* Annullato: si torna alla partita in corso, difficoltà compresa. */
    el.levelSelect.value = game.level;
    if (!game.completed) startTimer();
  });

  el.notesBtn.addEventListener('click', () => {
    game.notesMode = !game.notesMode;
    renderStatus();
    say(game.notesMode ? 'Modalità note attiva.' : 'Modalità note disattivata.');
  });

  el.eraseBtn.addEventListener('click', eraseCell);
  el.undoBtn.addEventListener('click', undo);
  el.hintBtn.addEventListener('click', hint);
  el.checkBtn.addEventListener('click', checkGrid);

  el.themeBtn.addEventListener('click', () => {
    applyTheme(THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length]);
    savePrefs();
  });

  const openInfo = () => openDialog(el.infoDialog);
  el.infoBtn.addEventListener('click', openInfo);
  el.infoLink.addEventListener('click', openInfo);

  el.infoDialog.addEventListener('close', () => { if (!game.completed) startTimer(); });
  el.winDialog.addEventListener('close', () => { /* la partita è conclusa */ });

  el.winNewBtn.addEventListener('click', () => {
    closeDialog(el.winDialog);
    newGame(el.levelSelect.value);
  });

  el.resetDataBtn.addEventListener('click', () => {
    store.remove(STORAGE_KEY);
    store.remove(PREFS_KEY);
    closeDialog(el.infoDialog);
    applyTheme('auto');
    newGame(el.levelSelect.value);
    say('Dati locali cancellati.');
  });

  document.addEventListener('keydown', onKeyDown);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      stopTimer();
      save();
    } else if (!game.completed && !document.querySelector('dialog[open]')) {
      startTimer();
    }
  });

  window.addEventListener('pagehide', () => {
    stopTimer();
    save();
  });
}

function onKeyDown(event) {
  if (document.querySelector('dialog[open]')) return;

  const target = event.target;
  const tag = target && target.tagName ? target.tagName.toLowerCase() : '';
  if (tag === 'select' || tag === 'input' || tag === 'textarea') return;
  if (event.metaKey || event.ctrlKey || event.altKey) return;

  const key = event.key;

  if (key >= '1' && key <= '9') {
    event.preventDefault();
    enterValue(Number(key));
    return;
  }

  if (key === 'Backspace' || key === 'Delete' || key === '0') {
    event.preventDefault();
    eraseCell();
    return;
  }

  const moves = { ArrowUp: -SIZE, ArrowDown: SIZE, ArrowLeft: -1, ArrowRight: 1 };
  if (key in moves) {
    event.preventDefault();
    moveSelection(key);
    return;
  }

  const lower = key.toLowerCase();
  if (lower === 'n') {
    event.preventDefault();
    el.notesBtn.click();
  } else if (lower === 'h') {
    event.preventDefault();
    hint();
  } else if (lower === 'c') {
    event.preventDefault();
    checkGrid();
  } else if (lower === 'z') {
    event.preventDefault();
    undo();
  }
}

function moveSelection(key) {
  let index = game.selected;
  if (index < 0) index = 0;

  let row = ROW_OF[index];
  let col = COL_OF[index];

  if (key === 'ArrowUp') row = (row + SIZE - 1) % SIZE;
  else if (key === 'ArrowDown') row = (row + 1) % SIZE;
  else if (key === 'ArrowLeft') col = (col + SIZE - 1) % SIZE;
  else if (key === 'ArrowRight') col = (col + 1) % SIZE;

  game.selected = row * SIZE + col;
  render();
  cellEls[game.selected].focus();
}

/* ------------------------------------------------------------------ */
/* Avvio                                                               */
/* ------------------------------------------------------------------ */

function init() {
  el.versionTag.textContent = `v${APP_VERSION}`;
  el.dialogVersion.textContent = APP_VERSION;

  buildBoard();
  buildPad();
  loadPrefs();
  bindEvents();

  if (restore()) {
    render();
    if (game.completed) {
      say('Partita già completata. Avvia una nuova partita.');
    } else {
      startTimer();
      say('Partita ripresa.');
    }
  } else {
    newGame(el.levelSelect.value);
  }

  initNative();
  initPwa(() => say('Aggiornamento disponibile: applicazione in ricarica.'));
}

init();
