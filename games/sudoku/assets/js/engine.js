/*
 * SUDOKU — motore di gioco
 * Generazione, risoluzione, verifica di unicità e valutazione della difficoltà.
 * Nessuna dipendenza esterna.
 */

export const SIZE = 9;
export const CELLS = 81;
export const ALL = 0x1ff; // maschera dei candidati 1..9

export const LEVELS = ['facile', 'medio', 'difficile', 'esperto'];

export const LEVEL_LABELS = {
  facile: 'Facile',
  medio: 'Medio',
  difficile: 'Difficile',
  esperto: 'Esperto'
};

/* Livello -> tier logico richiesto e numero minimo di indizi. */
const LEVEL_SPEC = {
  facile: { tier: 1, minClues: 38 },
  medio: { tier: 2, minClues: 32 },
  difficile: { tier: 3, minClues: 28 },
  esperto: { tier: 4, minClues: 24 }
};

/* ------------------------------------------------------------------ */
/* Tabelle precalcolate                                                */
/* ------------------------------------------------------------------ */

export const ROW_OF = new Uint8Array(CELLS);
export const COL_OF = new Uint8Array(CELLS);
export const BOX_OF = new Uint8Array(CELLS);

for (let i = 0; i < CELLS; i++) {
  const r = (i / SIZE) | 0;
  const c = i % SIZE;
  ROW_OF[i] = r;
  COL_OF[i] = c;
  BOX_OF[i] = ((r / 3) | 0) * 3 + ((c / 3) | 0);
}

/* 27 unità: 9 righe, 9 colonne, 9 blocchi. */
export const UNITS = [];
for (let r = 0; r < SIZE; r++) {
  const u = [];
  for (let c = 0; c < SIZE; c++) u.push(r * SIZE + c);
  UNITS.push(u);
}
for (let c = 0; c < SIZE; c++) {
  const u = [];
  for (let r = 0; r < SIZE; r++) u.push(r * SIZE + c);
  UNITS.push(u);
}
for (let b = 0; b < SIZE; b++) {
  const u = [];
  const r0 = ((b / 3) | 0) * 3;
  const c0 = (b % 3) * 3;
  for (let r = r0; r < r0 + 3; r++) {
    for (let c = c0; c < c0 + 3; c++) u.push(r * SIZE + c);
  }
  UNITS.push(u);
}

/* Per ogni cella: i 20 "peer" (stessa riga, colonna o blocco). */
export const PEERS = [];
for (let i = 0; i < CELLS; i++) {
  const set = new Set();
  for (const u of UNITS) {
    if (u.indexOf(i) === -1) continue;
    for (const j of u) if (j !== i) set.add(j);
  }
  PEERS.push(Array.from(set));
}

const BIT_COUNT = new Uint8Array(512);
const SINGLE_VALUE = new Int8Array(512).fill(-1);
for (let m = 0; m < 512; m++) {
  let n = 0;
  for (let b = 0; b < 9; b++) if (m & (1 << b)) n++;
  BIT_COUNT[m] = n;
  if (n === 1) SINGLE_VALUE[m] = Math.log2(m) + 1;
}

const bitOf = (value) => 1 << (value - 1);

/* ------------------------------------------------------------------ */
/* Numeri pseudo-casuali riproducibili (mulberry32)                    */
/* ------------------------------------------------------------------ */

export function createRng(seed) {
  let a = (seed >>> 0) || 1;
  return function rng() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function randomSeed() {
  if (typeof crypto !== 'undefined' && crypto.getRandomValues) {
    return crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return (Math.random() * 0xffffffff) >>> 0;
}

function shuffle(array, rng) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
  return array;
}

/* ------------------------------------------------------------------ */
/* Validità e risoluzione                                              */
/* ------------------------------------------------------------------ */

function buildMasks(grid) {
  const rows = new Int32Array(SIZE);
  const cols = new Int32Array(SIZE);
  const boxes = new Int32Array(SIZE);
  for (let i = 0; i < CELLS; i++) {
    const v = grid[i];
    if (!v) continue;
    const b = bitOf(v);
    const r = ROW_OF[i];
    const c = COL_OF[i];
    const x = BOX_OF[i];
    if ((rows[r] & b) || (cols[c] & b) || (boxes[x] & b)) return null;
    rows[r] |= b;
    cols[c] |= b;
    boxes[x] |= b;
  }
  return { rows, cols, boxes };
}

/** Griglia priva di conflitti (può essere incompleta). */
export function isConsistent(grid) {
  return buildMasks(grid) !== null;
}

/** Griglia completa e valida. */
export function isSolved(grid) {
  for (let i = 0; i < CELLS; i++) if (!grid[i]) return false;
  return isConsistent(grid);
}

/**
 * Conta le soluzioni fino a `limit` e restituisce la prima trovata.
 * Backtracking con maschere di bit e selezione MRV.
 */
export function countSolutions(grid, limit = 2, digitOrder = null) {
  const masks = buildMasks(grid);
  if (!masks) return { count: 0, solution: null };

  const work = Uint8Array.from(grid);
  const { rows, cols, boxes } = masks;
  let count = 0;
  let solution = null;

  const order = digitOrder || [1, 2, 3, 4, 5, 6, 7, 8, 9];

  function recurse() {
    let best = -1;
    let bestMask = 0;
    let bestCount = 10;

    for (let i = 0; i < CELLS; i++) {
      if (work[i]) continue;
      const mask = ALL & ~(rows[ROW_OF[i]] | cols[COL_OF[i]] | boxes[BOX_OF[i]]);
      const n = BIT_COUNT[mask];
      if (n === 0) return false;
      if (n < bestCount) {
        bestCount = n;
        best = i;
        bestMask = mask;
        if (n === 1) break;
      }
    }

    if (best === -1) {
      count++;
      if (!solution) solution = Uint8Array.from(work);
      return count >= limit;
    }

    const r = ROW_OF[best];
    const c = COL_OF[best];
    const x = BOX_OF[best];

    for (let k = 0; k < SIZE; k++) {
      const v = order[k];
      const b = bitOf(v);
      if (!(bestMask & b)) continue;
      work[best] = v;
      rows[r] |= b;
      cols[c] |= b;
      boxes[x] |= b;
      const stop = recurse();
      work[best] = 0;
      rows[r] &= ~b;
      cols[c] &= ~b;
      boxes[x] &= ~b;
      if (stop) return true;
    }
    return false;
  }

  recurse();
  return { count, solution };
}

/** Restituisce la soluzione se esiste ed è unica, altrimenti null. */
export function solveUnique(grid) {
  const { count, solution } = countSolutions(grid, 2);
  return count === 1 ? solution : null;
}

export function hasUniqueSolution(grid) {
  return countSolutions(grid, 2).count === 1;
}

/* ------------------------------------------------------------------ */
/* Solutore logico (per valutare la difficoltà)                        */
/* ------------------------------------------------------------------ */

function createState(grid) {
  const cells = Uint8Array.from(grid);
  const cands = new Int16Array(CELLS).fill(ALL);
  let filled = 0;

  for (let i = 0; i < CELLS; i++) {
    if (!cells[i]) continue;
    filled++;
    cands[i] = 0;
  }
  for (let i = 0; i < CELLS; i++) {
    const v = cells[i];
    if (!v) continue;
    const b = bitOf(v);
    for (const p of PEERS[i]) cands[p] &= ~b;
  }
  return { cells, cands, filled };
}

function place(state, index, value) {
  state.cells[index] = value;
  state.cands[index] = 0;
  state.filled++;
  const b = bitOf(value);
  for (const p of PEERS[index]) state.cands[p] &= ~b;
}

function nakedSingle(state) {
  for (let i = 0; i < CELLS; i++) {
    if (state.cells[i]) continue;
    const m = state.cands[i];
    if (m === 0) return 'contradiction';
    if (BIT_COUNT[m] === 1) {
      place(state, i, SINGLE_VALUE[m]);
      return true;
    }
  }
  return false;
}

function hiddenSingle(state) {
  for (const unit of UNITS) {
    for (let v = 1; v <= SIZE; v++) {
      const b = bitOf(v);
      let spot = -1;
      let n = 0;
      let present = false;
      for (const i of unit) {
        if (state.cells[i] === v) { present = true; break; }
        if (!state.cells[i] && (state.cands[i] & b)) { n++; spot = i; }
      }
      if (present) continue;
      if (n === 0) return 'contradiction';
      if (n === 1) {
        place(state, spot, v);
        return true;
      }
    }
  }
  return false;
}

/* Candidati confinati: interazione blocco/riga e blocco/colonna. */
function lockedCandidates(state) {
  let changed = false;
  for (let b = 0; b < SIZE; b++) {
    const box = UNITS[18 + b];
    for (let v = 1; v <= SIZE; v++) {
      const bit = bitOf(v);
      const spots = box.filter((i) => !state.cells[i] && (state.cands[i] & bit));
      if (spots.length < 2) continue;
      const rows = new Set(spots.map((i) => ROW_OF[i]));
      const cols = new Set(spots.map((i) => COL_OF[i]));
      if (rows.size === 1) {
        const r = ROW_OF[spots[0]];
        for (const i of UNITS[r]) {
          if (BOX_OF[i] === b || state.cells[i]) continue;
          if (state.cands[i] & bit) { state.cands[i] &= ~bit; changed = true; }
        }
      }
      if (cols.size === 1) {
        const c = COL_OF[spots[0]];
        for (const i of UNITS[9 + c]) {
          if (BOX_OF[i] === b || state.cells[i]) continue;
          if (state.cands[i] & bit) { state.cands[i] &= ~bit; changed = true; }
        }
      }
    }
  }
  /* Interazione riga/blocco e colonna/blocco (claiming). */
  for (let u = 0; u < 18; u++) {
    const unit = UNITS[u];
    for (let v = 1; v <= SIZE; v++) {
      const bit = bitOf(v);
      const spots = unit.filter((i) => !state.cells[i] && (state.cands[i] & bit));
      if (spots.length < 2) continue;
      const boxes = new Set(spots.map((i) => BOX_OF[i]));
      if (boxes.size !== 1) continue;
      const b = BOX_OF[spots[0]];
      for (const i of UNITS[18 + b]) {
        if (unit.indexOf(i) !== -1 || state.cells[i]) continue;
        if (state.cands[i] & bit) { state.cands[i] &= ~bit; changed = true; }
      }
    }
  }
  return changed;
}

function nakedSubset(state, size) {
  let changed = false;
  for (const unit of UNITS) {
    const open = unit.filter((i) => !state.cells[i]);
    if (open.length <= size) continue;
    const combos = combinations(open, size);
    for (const combo of combos) {
      let mask = 0;
      for (const i of combo) mask |= state.cands[i];
      if (BIT_COUNT[mask] !== size) continue;
      for (const i of open) {
        if (combo.indexOf(i) !== -1) continue;
        if (state.cands[i] & mask) { state.cands[i] &= ~mask; changed = true; }
      }
    }
  }
  return changed;
}

function hiddenSubset(state, size) {
  let changed = false;
  for (const unit of UNITS) {
    const open = unit.filter((i) => !state.cells[i]);
    if (open.length <= size) continue;
    const digits = [];
    for (let v = 1; v <= SIZE; v++) {
      const bit = bitOf(v);
      const spots = open.filter((i) => state.cands[i] & bit);
      if (spots.length >= 2 && spots.length <= size) digits.push({ bit, spots });
    }
    if (digits.length < size) continue;
    for (const combo of combinations(digits, size)) {
      const cellSet = new Set();
      let mask = 0;
      for (const d of combo) {
        mask |= d.bit;
        for (const i of d.spots) cellSet.add(i);
      }
      if (cellSet.size !== size) continue;
      for (const i of cellSet) {
        if (state.cands[i] & ~mask) { state.cands[i] &= mask; changed = true; }
      }
    }
  }
  return changed;
}

function xWing(state) {
  let changed = false;
  for (let v = 1; v <= SIZE; v++) {
    const bit = bitOf(v);
    for (let base = 0; base < 2; base++) {
      const lines = [];
      for (let k = 0; k < SIZE; k++) {
        const unit = UNITS[base * 9 + k];
        const spots = unit.filter((i) => !state.cells[i] && (state.cands[i] & bit));
        if (spots.length === 2) {
          const key = base === 0 ? spots.map((i) => COL_OF[i]) : spots.map((i) => ROW_OF[i]);
          lines.push({ k, key });
        }
      }
      for (let a = 0; a < lines.length; a++) {
        for (let b = a + 1; b < lines.length; b++) {
          if (lines[a].key[0] !== lines[b].key[0] || lines[a].key[1] !== lines[b].key[1]) continue;
          for (const kk of lines[a].key) {
            const cross = UNITS[base === 0 ? 9 + kk : kk];
            for (const i of cross) {
              const line = base === 0 ? ROW_OF[i] : COL_OF[i];
              if (line === lines[a].k || line === lines[b].k) continue;
              if (!state.cells[i] && (state.cands[i] & bit)) {
                state.cands[i] &= ~bit;
                changed = true;
              }
            }
          }
        }
      }
    }
  }
  return changed;
}

function combinations(items, size) {
  const out = [];
  const current = [];
  (function walk(start) {
    if (current.length === size) {
      out.push(current.slice());
      return;
    }
    for (let i = start; i < items.length; i++) {
      current.push(items[i]);
      walk(i + 1);
      current.pop();
    }
  })(0);
  return out;
}

/**
 * Risolve con tecniche umane e restituisce il tier richiesto.
 * tier 1 = singoli, 2 = candidati confinati / coppie nude,
 * 3 = sottoinsiemi nascosti, terne, X-Wing, 4 = oltre (richiede tecniche avanzate).
 */
export function logicalSolve(grid, maxTier = 3) {
  const state = createState(grid);
  let tier = 1;

  for (;;) {
    if (state.filled === CELLS) return { solved: true, tier };

    const ns = nakedSingle(state);
    if (ns === 'contradiction') return { solved: false, tier: 4 };
    if (ns) continue;

    const hs = hiddenSingle(state);
    if (hs === 'contradiction') return { solved: false, tier: 4 };
    if (hs) continue;

    if (maxTier >= 2 && (lockedCandidates(state) || nakedSubset(state, 2))) {
      if (tier < 2) tier = 2;
      continue;
    }

    if (maxTier >= 3 &&
      (hiddenSubset(state, 2) || nakedSubset(state, 3) || hiddenSubset(state, 3) || xWing(state))) {
      if (tier < 3) tier = 3;
      continue;
    }

    return { solved: false, tier: 4 };
  }
}

/**
 * Difficoltà di un puzzle esistente: uno dei valori di LEVELS.
 * Pesa le tecniche necessarie e, a parità di tecniche, il numero di indizi:
 * una griglia con pochi indizi resta impegnativa anche con tecniche semplici.
 */
export function rateDifficulty(grid) {
  const tier = tierOf(grid);
  const clues = countClues(grid);
  if (tier >= 4) return 'esperto';
  if (tier === 3) return 'difficile';
  if (tier === 2) return clues <= 27 ? 'difficile' : 'medio';
  return clues <= 30 ? 'medio' : 'facile';
}

function tierOf(grid) {
  const { solved, tier } = logicalSolve(grid, 3);
  return solved ? tier : 4;
}

/* ------------------------------------------------------------------ */
/* Generazione                                                         */
/* ------------------------------------------------------------------ */

/** Griglia completa valida generata casualmente. */
export function generateSolved(rng = Math.random) {
  const empty = new Uint8Array(CELLS);
  const order = shuffle([1, 2, 3, 4, 5, 6, 7, 8, 9], rng);
  const { solution } = countSolutions(empty, 1, order);
  return solution;
}

function countClues(grid) {
  let n = 0;
  for (let i = 0; i < CELLS; i++) if (grid[i]) n++;
  return n;
}

/**
 * Vero se il puzzle è risolvibile con tecniche fino al tier indicato.
 * Il tier 4 non impone vincoli logici: basta la soluzione unica.
 */
function solvableWithin(grid, maxTier) {
  if (maxTier >= 4) return true;
  return logicalSolve(grid, maxTier).solved;
}

/**
 * Scava la griglia togliendo indizi finché resta unica e coerente col livello.
 * Fase 1: rispetta il numero minimo di indizi.
 * Fase 2: se il puzzle è ancora troppo semplice, prosegue oltre quella soglia.
 */
function dig(puzzle, level, spec, rng) {
  const target = LEVELS.indexOf(level);
  const floor = spec.minClues + Math.floor(rng() * 4);
  const canRemove = (index) => {
    const backup = puzzle[index];
    puzzle[index] = 0;
    const ok = countSolutions(puzzle, 2).count === 1 && solvableWithin(puzzle, spec.tier);
    if (!ok) puzzle[index] = backup;
    return ok;
  };

  let clues = countClues(puzzle);
  for (const i of shuffle(Array.from({ length: CELLS }, (_, k) => k), rng)) {
    if (clues <= floor) break;
    if (puzzle[i] && canRemove(i)) clues--;
  }

  /* Se il risultato è ancora più facile del livello richiesto, si prosegue. */
  for (const i of shuffle(Array.from({ length: CELLS }, (_, k) => k), rng)) {
    if (LEVELS.indexOf(rateDifficulty(puzzle)) >= target) break;
    if (puzzle[i] && canRemove(i)) clues--;
  }

  /* Piccola variazione finale: griglie dello stesso livello non identiche. */
  let extra = Math.floor(rng() * 5);
  for (const i of shuffle(Array.from({ length: CELLS }, (_, k) => k), rng)) {
    if (extra <= 0) break;
    if (!puzzle[i]) continue;
    const backup = puzzle[i];
    puzzle[i] = 0;
    if (countSolutions(puzzle, 2).count === 1 && rateDifficulty(puzzle) === level) {
      clues--;
      extra--;
    } else {
      puzzle[i] = backup;
    }
  }
  return clues;
}

/**
 * Genera un puzzle con soluzione unica per il livello richiesto.
 * Ritorna { puzzle, solution, level, clues, tier }.
 */
export function generatePuzzle(level = 'medio', rng = Math.random) {
  const spec = LEVEL_SPEC[level] || LEVEL_SPEC.medio;
  const attempts = 14;
  let best = null;

  for (let attempt = 0; attempt < attempts; attempt++) {
    const solution = generateSolved(rng);
    const puzzle = Uint8Array.from(solution);
    const clues = dig(puzzle, level, spec, rng);
    const rated = rateDifficulty(puzzle);
    const candidate = { puzzle, solution, level, clues, rated, tier: tierOf(puzzle) };

    if (rated === level) return candidate;

    const distance = Math.abs(LEVELS.indexOf(rated) - LEVELS.indexOf(level));
    if (!best || distance < best.distance) best = Object.assign(candidate, { distance });
  }

  return best;
}

/* ------------------------------------------------------------------ */
/* Utilità di gioco                                                    */
/* ------------------------------------------------------------------ */

/** Indici delle celle in conflitto con un'altra cella dello stesso valore. */
export function findConflicts(grid) {
  const bad = new Set();
  for (const unit of UNITS) {
    const seen = new Map();
    for (const i of unit) {
      const v = grid[i];
      if (!v) continue;
      if (seen.has(v)) {
        bad.add(i);
        bad.add(seen.get(v));
      } else {
        seen.set(v, i);
      }
    }
  }
  return bad;
}

/** Candidati validi per una cella secondo lo stato corrente della griglia. */
export function candidatesFor(grid, index) {
  let mask = ALL;
  for (const p of PEERS[index]) {
    const v = grid[p];
    if (v) mask &= ~bitOf(v);
  }
  const out = [];
  for (let v = 1; v <= SIZE; v++) if (mask & bitOf(v)) out.push(v);
  return out;
}

/** Quante volte ogni cifra 1..9 è già presente nella griglia. */
export function digitCounts(grid) {
  const counts = new Array(SIZE + 1).fill(0);
  for (let i = 0; i < CELLS; i++) if (grid[i]) counts[grid[i]]++;
  return counts;
}
