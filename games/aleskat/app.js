'use strict';
// ═══════════════════════════════════════════════════════════════════════════════
//  ALESKAT v3 — mondo infinito verticale + camera + responsive su tutti gli schermi
//  Coordinate MONDO: worldX (wrappato 0…W), worldY (infinito, ↓ = più profondo)
//  Camera: camY segue il lombrico, tutto il draw usa (worldY - camY)
//  Profondità in metri = camY / METER_PX  (aumenta man mano che si scende)
//  Superficie = profondità bassa/nulla, fondale = profondità alta
// ═══════════════════════════════════════════════════════════════════════════════

const CFG = {
  BASE_W      : 414,     // larghezza logica di riferimento
  SEG_R       : 13,      // raggio segmento testa (px logici a BASE_W)
  SPEED_BASE  : 3.2,
  SPEED_MAX   : 7.5,
  INIT_LEN    : 8,
  ENERGY_MAX  : 100,
  ENERGY_DRAIN: 0.065,
  FOOD_INT    : 75,
  PLANKTON_N  : 45,
  BUBBLE_N    : 30,
  PARTICLE_MAX: 200,
  METER_PX    : 4,       // pixel mondo per 1 metro di profondità
  MAX_DEPTH_M : 3000,    // profondità massima (metro) — poi si "avvolge"
  LIVES       : 3,
  LEVEL_SCORE : 300,
  NEMO_CHANCE : 0.012,
  NEMO_MIN_DEPTH : 30,
  NEMO_FORCE_MS  : 45000,
  SHARK_LEVEL : 2,
  CAM_LERP    : 0.08,    // fluidità della camera (0=rigida, 1=istantanea)
  WORLD_VIEW  : 1.5,     // quante volte H copre il "mondo visibile" per spawn
};

// ─── STATO ────────────────────────────────────────────────────────────────────
let canvas, ctx, dpr;
let W = 414, H = 736, sc = 1;       // dimensioni CSS canvas / viewport
let camY = 0;                        // Y mondo corrispondente al bordo superiore dello schermo
let targetCamY = 0;
let viewportMode = 'desktop';

let state = 'splash';
let tick = 0, score = 0, depth = 0, energy = CFG.ENERGY_MAX;
let lives = CFG.LIVES, level = 1, levelScore = 0;
let highScore = +localStorage.getItem('aleskat_hs') || 0;

let worm = null;
let foods = [], plankton = [], enemies = [], particles = [], bubbles = [];
let nemoObj = null;
let shakeT = 0;
let flashCol = '', flashA = 0;
let levelBanner = 0;
let encounterBanner = { text: '', timer: 0, color: '#00f5ff' };
let lastNemoAt = 0;
let sharkSpawnedAtLevel = 0;
let lastKiller = null;
let lastDeathReason = '';
let deathFocusTimer = 0;
let deathPulse = 0;
let pendingAutoReload = false;
let autoReloadTimer = 0;
let hasReloadedForUpdate = false;

let joyActive = false, joyX = 0, joyY = 0, joyDX = 0, joyDY = 0;

// ─── PALETTE ──────────────────────────────────────────────────────────────────
const WORM_PAL = [
  {h:175,s:100,l:65},{h:290,s:80,l:68},{h:150,s:100,l:62},{h:200,s:90,l:62}
];
let wormCol = WORM_PAL[0];

const FOODS = [
  {label:'krill',    col:'#ff6b35',glow:'#ff4400',r:7, en:22,pts:10},
  {label:'jellyfish',col:'#ff2d78',glow:'#ff0055',r:12,en:35,pts:25},
  {label:'fish_egg', col:'#ffb700',glow:'#ff8800',r:6, en:15,pts:8 },
  {label:'algae',    col:'#39ff14',glow:'#00cc00',r:9, en:18,pts:12},
  {label:'starfish', col:'#ff9ff3',glow:'#ff44cc',r:11,en:28,pts:18},
  {label:'shrimp',   col:'#f9ca24',glow:'#e55a00',r:7, en:20,pts:14},
];

const CREATURE_TYPES = [
  {name:'anglerfish',col:'#ff2d78',r:19,spd:1.2,pts:50,agg:true, minDepth:400 },
  {name:'barracuda', col:'#ff6b35',r:15,spd:2.4,pts:30,agg:false,minDepth:0   },
  {name:'pufferfish',col:'#f9ca24',r:18,spd:0.7,pts:20,agg:false,minDepth:100 },
  {name:'moray',     col:'#6c5ce7',r:13,spd:1.8,pts:35,agg:true, minDepth:300 },
  {name:'mantaray',  col:'#74b9ff',r:22,spd:1.5,pts:15,agg:false,minDepth:600 },
];

const WORM_ENEMY_COLS = [
  {h:0,s:90,l:55},{h:30,s:100,l:55},{h:260,s:70,l:60},{h:340,s:100,l:55}
];

// ─── INIT ─────────────────────────────────────────────────────────────────────
function init() {
  canvas = document.getElementById('gameCanvas');
  ctx = canvas.getContext('2d');
  dpr = Math.min(window.devicePixelRatio || 1, 2);
  resize();
  window.addEventListener('resize', resize, { passive: true });
  window.addEventListener('orientationchange', resize, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', resize, { passive: true });
    window.visualViewport.addEventListener('scroll', resize, { passive: true });
  }
  setupJoystick();
  setupButtons();
  document.getElementById('splashHS').textContent = highScore;
  initBubbles();
  requestAnimationFrame(loop);
}

function getViewportSize() {
  const vv = window.visualViewport;
  const vw = vv ? vv.width : window.innerWidth;
  const vh = vv ? vv.height : window.innerHeight;
  return {
    vw: Math.max(1, Math.round(vw)),
    vh: Math.max(1, Math.round(vh))
  };
}

function resize() {
  dpr = Math.min(window.devicePixelRatio || 1, 2);

  const { vw, vh } = getViewportSize();
  W = vw;
  H = vh;
  viewportMode = vw >= vh ? 'landscape' : 'portrait';

  canvas.width  = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const wr = document.getElementById('gameWrapper');
  wr.style.width  = W + 'px';
  wr.style.height = H + 'px';
  wr.dataset.viewport = viewportMode;

  sc = Math.max(0.72, Math.min(W / CFG.BASE_W, H / 736));
}

// ─── LOOP ─────────────────────────────────────────────────────────────────────
function loop() {
  requestAnimationFrame(loop);
  tick++;

  ctx.save();
  if (shakeT > 0) {
    ctx.translate((Math.random()-.5)*shakeT*9*sc, (Math.random()-.5)*shakeT*6*sc);
    shakeT = Math.max(0, shakeT - 0.06);
  }
  ctx.clearRect(-30, -30, W+60, H+60);

  const dr = depthRatio();

  if (state === 'splash') {
    drawBg(0);
    tickBubbles(); tickDrift(); tickParticles();
    drawBubbles(); drawParticles();
  } else if (state === 'playing' || state === 'gameover') {
    if (state === 'playing') update();
    if (worm) updateCamera();
    draw(dr);
  }

  if (pendingAutoReload && autoReloadTimer > 0) {
    autoReloadTimer--;
    if (autoReloadTimer <= 0) window.location.reload();
  }
  ctx.restore();
}

// ─── CAMERA ───────────────────────────────────────────────────────────────────
// La camera tiene il lombrico al 40% dell'altezza schermo
function updateCamera() {
  if (!worm) return;
  // Target: testa del lombrico al 40% dallo schermo
  targetCamY = worm.segs[0].wy - H * 0.40;
  targetCamY = Math.max(0, targetCamY); // non sale sopra la superficie
  camY += (targetCamY - camY) * CFG.CAM_LERP;
  // Aggiorna depth in metri
  depth = camY / CFG.METER_PX;
}

// Converte worldY → screenY
function sy(wy) { return wy - camY; }

function depthRatio() {
  return Math.min(depth / CFG.MAX_DEPTH_M, 1);
}

// ─── START ────────────────────────────────────────────────────────────────────
function startGame(fresh) {
  tick = 0; energy = CFG.ENERGY_MAX;
  if (fresh) { score = 0; lives = CFG.LIVES; level = 1; levelScore = 0; }
  wormCol = WORM_PAL[Math.floor(Math.random() * WORM_PAL.length)];
  foods = []; enemies = []; particles = []; plankton = []; bubbles = [];
  nemoObj = null; camY = 0; targetCamY = 0; depth = 0;
  lastNemoAt = 0; sharkSpawnedAtLevel = 0; encounterBanner = { text: '', timer: 0, color: '#00f5ff' };
  lastKiller = null; lastDeathReason = ''; deathFocusTimer = 0; deathPulse = 0;
  initBubbles(); initPlankton();

  // Il lombrico inizia al centro orizzontale, appena sotto la superficie (mondo)
  const wxStart = W / 2;
  const wyStart = H * 0.35; // Y mondo iniziale (poco sotto superficie)
  const gap = (CFG.SEG_R * 2 + 5) * sc;
  const segs = [];
  for (let i = 0; i < CFG.INIT_LEN; i++)
    segs.push({ wx: wxStart, wy: wyStart + i * gap });

  worm = {
    segs,
    angle: -Math.PI / 2,
    speed: CFG.SPEED_BASE * sc,
    length: CFG.INIT_LEN,
    boosting: false,
    glow: 0,
    invincible: 120
  };

  state = 'playing';
  showEl('hud', true);
  showEl('joystickZone', true);
  showEl('gameOver', false);
  showEl('splash', false);
  updateLivesHUD();
}

// ─── UPDATE ───────────────────────────────────────────────────────────────────
function update() {
  updateInput();
  moveWorm();
  tickFood();
  tickCreatures();
  tickEnemyWorms();
  tickBubbles();
  tickParticles();
  tickPlankton();
  tickDrift();
  updateNemo();
  checkCollisions();
  updateHUD();

  if (level >= CFG.SHARK_LEVEL && !enemies.find(e => e.kind === 'shark') && sharkSpawnedAtLevel < level) {
    spawnSharkIfNeeded();
  }

  score     += 0.05 * level;
  levelScore += 0.05 * level;
  energy     = Math.max(0, energy - CFG.ENERGY_DRAIN * (1 + level * 0.04));
  if (energy <= 0) loseLife('Energia esaurita');

  if (levelScore >= CFG.LEVEL_SCORE) {
    levelScore = 0; level++;
    levelBanner = 180;
    spawnSharkIfNeeded();
  }

  const nowMs = tick * (1000 / 60);
  const nemoReady = depth >= CFG.NEMO_MIN_DEPTH && !nemoObj;
  const nemoForced = nemoReady && (lastNemoAt === 0 || nowMs - lastNemoAt >= CFG.NEMO_FORCE_MS);
  if (nemoForced || (nemoReady && Math.random() < CFG.NEMO_CHANCE / 60)) spawnNemo();
  if (worm) worm.invincible = Math.max(0, worm.invincible - 1);
}

// ─── JOYSTICK + TASTIERA ──────────────────────────────────────────────────────
const keys = {};
function setupJoystick() {
  const zone    = document.getElementById('joystickZone');
  const wrapper = document.getElementById('gameWrapper');
  const base    = document.getElementById('joystickBase');
  const knob    = document.getElementById('joystickKnob');
  const MR = 50;

  function sj(cx, cy) {
    joyActive = true; joyX = cx; joyY = cy; joyDX = 0; joyDY = 0;
    const r = wrapper.getBoundingClientRect();
    base.style.left = (cx - r.left) + 'px';
    base.style.top  = (cy - r.top)  + 'px';
    base.style.bottom = ''; base.style.transform = 'translate(-50%,-50%)';
  }
  function mj(cx, cy) {
    const dx = cx - joyX, dy = cy - joyY, d = Math.hypot(dx, dy) || 1;
    joyDX = dx / d; joyDY = dy / d;
    knob.style.transform = `translate(${joyDX*Math.min(d,MR)}px,${joyDY*Math.min(d,MR)}px)`;
  }
  function ej() {
    joyActive = false; joyDX = 0; joyDY = 0;
    knob.style.transform = 'translate(0,0)';
    base.style.left = '50%';
    base.style.top = '';
    base.style.bottom = 'max(24px, env(safe-area-inset-bottom))';
    base.style.transform = 'translateX(-50%)';
  }

  // Touch — zone copre il 45% basso (mobile)
  zone.addEventListener('touchstart',  e => { e.preventDefault(); sj(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  zone.addEventListener('touchmove',   e => { e.preventDefault(); mj(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
  zone.addEventListener('touchend',    ej);
  zone.addEventListener('touchcancel', ej);

  // Mouse — su TUTTO il wrapper (non solo la zone) → funziona su laptop
  wrapper.addEventListener('mousedown', e => { e.preventDefault(); sj(e.clientX, e.clientY); });
  window.addEventListener('mousemove',  e => { if (joyActive) mj(e.clientX, e.clientY); });
  window.addEventListener('mouseup',    ej);

  // Tastiera — WASD e frecce per laptop
  window.addEventListener('keydown', e => { keys[e.key] = true; });
  window.addEventListener('keyup',   e => { keys[e.key] = false; });
}

function updateInput() {
  if (!worm) return;

  // Tastiera (priorità se joystick non attivo)
  if (!joyActive) {
    let kx = 0, ky = 0;
    if (keys['ArrowLeft']  || keys['a'] || keys['A']) kx = -1;
    if (keys['ArrowRight'] || keys['d'] || keys['D']) kx =  1;
    if (keys['ArrowUp']    || keys['w'] || keys['W']) ky = -1;
    if (keys['ArrowDown']  || keys['s'] || keys['S']) ky =  1;
    if (kx !== 0 || ky !== 0) {
      const tgt = Math.atan2(ky, kx);
      let d = tgt - worm.angle;
      while (d >  Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      worm.angle += d * 0.15;
      worm.boosting = (keys[' '] || keys['Shift']) ? true : false;
      return;
    }
  }

  // Joystick
  if (!joyActive) return;
  if (Math.abs(joyDX) > 0.05 || Math.abs(joyDY) > 0.05) {
    const tgt = Math.atan2(joyDY, joyDX);
    let d = tgt - worm.angle;
    while (d >  Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    worm.angle += d * 0.13;
    worm.boosting = Math.hypot(joyDX, joyDY) > 0.7;
  } else { worm.boosting = false; }
}

// ─── WORM MOVIMENTO (coordinate mondo: wx, wy) ────────────────────────────────
function moveWorm() {
  if (!worm) return;
  worm.glow += 0.05;
  const spd = worm.boosting
    ? Math.min(worm.speed * 1.85, CFG.SPEED_MAX * sc)
    : worm.speed;

  const hd = worm.segs[0];
  let nwx = hd.wx + Math.cos(worm.angle) * spd;
  let nwy = hd.wy + Math.sin(worm.angle) * spd;

  // X: wrap orizzontale
  nwx = ((nwx % W) + W) % W;

  // Y: nessun rimbalzo — limite solo superiore (superficie oceano = wy=0)
  if (nwy < 5 * sc) {
    nwy = 5 * sc;
    worm.angle = Math.abs(worm.angle); // rimanda giù
  }
  // Nessun limite inferiore → si può scendere all'infinito

  worm.segs.unshift({ wx: nwx, wy: nwy });
  while (worm.segs.length > worm.length) worm.segs.pop();

  if (worm.boosting) {
    energy = Math.max(0, energy - 0.2);
    if (tick % 2 === 0) {
      const tl = worm.segs[worm.segs.length - 1];
      addPart(tl.wx, tl.wy, `hsla(${wormCol.h},${wormCol.s}%,${wormCol.l}%,0.4)`, 3*sc, 0.028);
    }
  }
}

// ─── CIBO (spawna attorno alla camera, fluttua in mondo) ──────────────────────
function tickFood() {
  if (tick % Math.max(30, CFG.FOOD_INT - level * 8) === 0) {
    const t = FOODS[Math.floor(Math.random() * FOODS.length)];
    // Spawna 1.5 schermi sopra la camera — cade verso il basso
    const spawnWy = camY - H * 0.1 - Math.random() * H * 0.4;
    foods.push({
      wx: Math.random() * W,
      wy: spawnWy,
      type: t,
      drift: (0.6 + Math.random() * 1.0) * sc,  // cade verso il basso (wy aumenta)
      wobble: Math.random() * Math.PI * 2,
      pulse: 0, dead: false
    });
  }
  foods.forEach(f => {
    f.wy += f.drift;
    f.wx += Math.sin(f.wobble + tick * 0.02) * 0.6;
    f.wx = ((f.wx % W) + W) % W;
    f.wobble += 0.04; f.pulse += 0.09;
    // Rimuovi se troppo lontano dalla camera
    if (f.wy > camY + H * 1.5) f.dead = true;
  });
  foods = foods.filter(f => !f.dead);
}

// ─── PLANCTON (segue la camera, distribuito in una fascia attorno) ─────────────
function initPlankton() {
  plankton = [];
  for (let i = 0; i < CFG.PLANKTON_N; i++) plankton.push(mkP());
}
function mkP() {
  return {
    wx: Math.random() * W,
    wy: camY + Math.random() * H,
    r: (2 + Math.random() * 3) * sc,
    vx: (Math.random() - 0.5) * 0.5,
    vy: (Math.random() - 0.5) * 0.5,
    hue: 160 + Math.random() * 80,
    phase: Math.random() * Math.PI * 2, dead: false
  };
}
function tickPlankton() {
  plankton.forEach(p => {
    p.wx = ((p.wx + p.vx + W) % W);
    p.wy += p.vy;
    p.phase += 0.04;
    // Se esce dalla finestra visibile, riciclalo vicino alla camera
    if (p.wy < camY - H * 0.2 || p.wy > camY + H * 1.2) {
      p.wx = Math.random() * W;
      p.wy = camY + Math.random() * H;
    }
  });
  plankton = plankton.filter(p => !p.dead);
  while (plankton.length < CFG.PLANKTON_N) plankton.push(mkP());
}

// ─── CREATURE NEMICHE ─────────────────────────────────────────────────────────
function tickCreatures() {
  const maxC = 3 + level;
  if (tick % Math.max(120, 300 - level * 20) === 0 &&
      enemies.filter(e => e.kind === 'creature').length < maxC)
    spawnCreature();

  enemies.filter(e => e.kind === 'creature').forEach(e => {
    e.phase += 0.03;
    if (e.type.agg && worm) {
      const hd = worm.segs[0];
      const dx = hd.wx - e.wx, dy = hd.wy - e.wy;
      if (Math.hypot(dx, dy) < 240 * sc) e.angle = Math.atan2(dy, dx);
      else e.angle += Math.sin(e.phase) * 0.04;
    } else { e.angle += Math.sin(e.phase) * 0.03; }
    e.wx += Math.cos(e.angle) * e.type.spd * sc * (1 + level * 0.08);
    e.wy += Math.sin(e.angle) * e.type.spd * sc * (1 + level * 0.08);
    e.wx = ((e.wx % W) + W) % W;
    // Mantieni nella fascia di profondità corrente ± 2 schermi
    const minWy = Math.max(0, camY - H);
    const maxWy = camY + H * 2;
    if (e.wy < minWy) { e.wy = minWy; e.angle = Math.abs(e.angle); }
    if (e.wy > maxWy) { e.wy = maxWy; e.angle = -Math.abs(e.angle); }
    e.segs.unshift({ wx: e.wx, wy: e.wy });
    while (e.segs.length > e.segLen) e.segs.pop();
  });

  // Squalo
  const shark = enemies.find(e => e.kind === 'shark');
  if (shark) {
    shark.phase += 0.02;
    if (worm) {
      const hd = worm.segs[0];
      const distToPlayer = Math.hypot(hd.wx - shark.wx, hd.wy - shark.wy);
      if (distToPlayer < 600 * sc) shark.angle = Math.atan2(hd.wy - shark.wy, hd.wx - shark.wx);
      else shark.angle += Math.sin(shark.phase) * 0.02;
    }
    shark.wx += Math.cos(shark.angle) * 2.8 * sc * (1 + level * 0.06);
    shark.wy += Math.sin(shark.angle) * 2.8 * sc * (1 + level * 0.06);
    shark.wx = ((shark.wx % W) + W) % W;
    const minWy = Math.max(0, camY - H * 0.1);
    const maxWy = camY + H * 1.1;
    shark.wy = Math.max(minWy, Math.min(maxWy, shark.wy));
    shark.segs.unshift({ wx: shark.wx, wy: shark.wy });
    while (shark.segs.length > shark.segLen) shark.segs.pop();
  }

  enemies = enemies.filter(e => !e.dead);
}

function spawnCreature() {
  const eligible = CREATURE_TYPES.filter(t => depth >= t.minDepth);
  const type = eligible.length ? eligible[Math.floor(Math.random() * eligible.length)] : CREATURE_TYPES[1];
  // Spawna ai bordi della finestra visibile
  const side = Math.floor(Math.random() * 4);
  let wx, wy, angle;
  if      (side === 0) { wx = Math.random()*W; wy = camY - 40;  angle =  Math.PI/2; }
  else if (side === 1) { wx = W + 40;          wy = camY + Math.random()*H; angle = Math.PI; }
  else if (side === 2) { wx = Math.random()*W; wy = camY + H+40; angle = -Math.PI/2; }
  else                 { wx = -40;             wy = camY + Math.random()*H; angle = 0; }
  const segLen = 5 + Math.floor(Math.random() * 5);
  enemies.push({ kind:'creature', wx, wy, angle, type, segLen,
    segs: Array.from({length:segLen}, () => ({wx, wy})),
    phase: Math.random()*Math.PI*2, dead: false });
}

function spawnSharkIfNeeded() {
  if (level < CFG.SHARK_LEVEL || enemies.find(e => e.kind === 'shark')) return;

  const refX = worm ? worm.segs[0].wx : W * 0.5;
  const refY = worm ? worm.segs[0].wy : camY + H * 0.5;
  const fromLeft = Math.random() < 0.5;
  const wx = fromLeft ? -70 : W + 70;
  const wy = refY + (Math.random() - 0.5) * H * 0.25;
  const angle = Math.atan2(refY - wy, refX - wx);

  enemies.push({ kind:'shark', wx, wy, angle, segLen:20,
    segs: Array.from({length:20}, () => ({wx, wy})), phase:0, dead:false });

  sharkSpawnedAtLevel = level;
  encounterBanner = { text: '⚠ SQUALO IN ARRIVO', timer: 150, color: '#8ea6ff' };
}

// ─── LOMBRICHI NEMICI ─────────────────────────────────────────────────────────
function tickEnemyWorms() {
  if (level < 2) return;
  const maxWE = 1 + Math.floor(level / 2);
  if (tick % Math.max(400, 600 - level*40) === 0 &&
      enemies.filter(e => e.kind === 'eworm').length < maxWE)
    spawnEnemyWorm();

  enemies.filter(e => e.kind === 'eworm').forEach(e => {
    e.glow += 0.04; e.phase += 0.02;
    if (worm) {
      const hd = worm.segs[0];
      if (Math.hypot(hd.wx - e.wx, hd.wy - e.wy) < 300 * sc)
        e.angle = Math.atan2(hd.wy - e.wy, hd.wx - e.wx);
      else e.angle += Math.sin(e.phase) * 0.05;
    }
    e.wx += Math.cos(e.angle) * e.speed * (1 + level * 0.07);
    e.wy += Math.sin(e.angle) * e.speed * (1 + level * 0.07);
    e.wx = ((e.wx % W) + W) % W;
    e.segs.unshift({ wx: e.wx, wy: e.wy });
    while (e.segs.length > e.length) e.segs.pop();
    // mangia il cibo
    foods.forEach(f => {
      if (!f.dead && Math.hypot(e.wx-f.wx, e.wy-f.wy) < e.r + f.type.r*sc) {
        f.dead = true; e.length = Math.min(e.length+1, 50);
      }
    });
  });
}

function spawnEnemyWorm() {
  const col = WORM_ENEMY_COLS[Math.floor(Math.random() * WORM_ENEMY_COLS.length)];
  const side = Math.floor(Math.random() * 4);
  let wx, wy, angle;
  if      (side === 0) { wx = Math.random()*W; wy = camY - 40;   angle =  Math.PI/2; }
  else if (side === 1) { wx = W + 40;          wy = camY + Math.random()*H; angle = Math.PI; }
  else if (side === 2) { wx = Math.random()*W; wy = camY + H+40; angle = -Math.PI/2; }
  else                 { wx = -40;             wy = camY + Math.random()*H; angle = 0; }
  const len = 10 + Math.floor(Math.random()*8) + level*2;
  enemies.push({ kind:'eworm', wx, wy, angle, col,
    r: (CFG.SEG_R+2)*sc, speed: (1.4+Math.random()*0.8)*sc,
    length: len, segLen: len,
    segs: Array.from({length:len}, () => ({wx, wy})),
    glow: 0, phase: Math.random()*Math.PI*2, dead: false });
}

// ─── COLLISIONI ───────────────────────────────────────────────────────────────
function checkCollisions() {
  if (!worm || !worm.segs.length) return;
  const hd = worm.segs[0];
  const hr = CFG.SEG_R * sc;
  const inv = worm.invincible > 0;

  foods.forEach(f => {
    if (f.dead) return;
    if (Math.hypot(hd.wx-f.wx, hd.wy-f.wy) < hr + f.type.r*sc) {
      f.dead = true;
      energy = Math.min(CFG.ENERGY_MAX, energy + f.type.en);
      score += f.type.pts * level; levelScore += f.type.pts;
      worm.length += 2;
      worm.speed = Math.min(CFG.SPEED_MAX*sc, worm.speed + 0.03);
      burst(f.wx, f.wy, f.type.col, 12);
    }
  });

  plankton.forEach(p => {
    if (p.dead) return;
    if (Math.hypot(hd.wx-p.wx, hd.wy-p.wy) < hr + p.r) {
      p.dead = true;
      energy = Math.min(CFG.ENERGY_MAX, energy + 7);
      score += 2 * level;
    }
  });

  if (inv) return;

  enemies.filter(e => e.kind === 'creature').forEach(e => {
    if (e.dead) return;
    if (Math.hypot(hd.wx-e.wx, hd.wy-e.wy) < hr + e.type.r*sc) {
      if (worm.length >= e.segLen + 4) {
        e.dead = true; score += e.type.pts*level; levelScore += e.type.pts;
        worm.length += 3; energy = Math.min(CFG.ENERGY_MAX, energy+18);
        burst(e.wx, e.wy, e.type.col, 14);
      } else {
        burst(hd.wx, hd.wy, `hsl(${wormCol.h},${wormCol.s}%,${wormCol.l}%)`, 25);
        setLastKiller({ kind:'creature', label: prettyEnemyName(e.type.name), wx:e.wx, wy:e.wy, color:e.type.col, radius:e.type.r * sc * 1.8, enemy:e });
        loseLife('Divorato da ' + prettyEnemyName(e.type.name));
      }
    }
  });

  const shark = enemies.find(e => e.kind === 'shark');
  if (shark && Math.hypot(hd.wx-shark.wx, hd.wy-shark.wy) < hr + 28*sc) {
    burst(hd.wx, hd.wy, `hsl(${wormCol.h},${wormCol.s}%,${wormCol.l}%)`, 30);
    shakeT = 1;
    setLastKiller({ kind:'shark', label:'Squalo', wx:shark.wx, wy:shark.wy, color:'#8ea6ff', radius:34 * sc, enemy:shark });
    loseLife('Lo squalo ti ha mangiato!');
  }

  enemies.filter(e => e.kind === 'eworm').forEach(e => {
    if (e.dead) return;
    if (Math.hypot(hd.wx-e.wx, hd.wy-e.wy) < hr + e.r) {
      if (worm.length > e.length + 4) {
        e.dead = true; score += e.length*3*level; levelScore += e.length*2;
        worm.length += Math.floor(e.length/3);
        energy = Math.min(CFG.ENERGY_MAX, energy+25);
        burst(e.wx, e.wy, `hsl(${e.col.h},${e.col.s}%,${e.col.l}%)`, 20);
      } else {
        burst(hd.wx, hd.wy, `hsl(${wormCol.h},${wormCol.s}%,${wormCol.l}%)`, 25);
        shakeT = 0.8;
        setLastKiller({ kind:'eworm', label:'Lombrico gigante', wx:e.wx, wy:e.wy, color:`hsl(${e.col.h},${e.col.s}%,${e.col.l}%)`, radius:e.r * 1.8, enemy:e });
        loseLife('Divorato da un lombrico più grosso!');
      }
    }
  });
}

// ─── PERDITA VITA / GAME OVER ─────────────────────────────────────────────────
function setLastKiller(killer) {
  if (!killer) return;
  lastKiller = { ...killer };
}

function prettyEnemyName(name) {
  const map = {
    anglerfish: 'Pesce lanterna',
    barracuda: 'Barracuda',
    pufferfish: 'Pesce palla',
    moray: 'Murena',
    mantaray: 'Manta'
  };
  return map[name] || name;
}

function loseLife(reason) {
  if (state !== 'playing') return;
  lastDeathReason = reason;
  deathFocusTimer = 140;
  deathPulse = 1;
  flashCol = '#ff2d78';
  flashA = 0.5;
  lives--;
  updateLivesHUD();
  if (lives <= 0) {
    gameOver();
  } else {
    const cx = W / 2;
    const cy_world = camY + H * 0.4;
    const gap = (CFG.SEG_R*2+5)*sc;
    const segs = [];
    for (let i = 0; i < CFG.INIT_LEN; i++) segs.push({wx:cx, wy:cy_world + i*gap});
    worm = { segs, angle:-Math.PI/2, speed:CFG.SPEED_BASE*sc,
             length:Math.max(CFG.INIT_LEN, Math.floor((worm?.length||CFG.INIT_LEN)*0.7)),
             boosting:false, glow:0, invincible:180 };
    energy = 50;
    encounterBanner = { text: lastDeathReason.toUpperCase(), timer: 90, color: '#ff6b8f' };
  }
}

function gameOver() {
  state = 'gameover';
  showEl('hud', false); showEl('joystickZone', false);
  highScore = Math.max(highScore, Math.floor(score));
  localStorage.setItem('aleskat_hs', highScore);
  document.getElementById('goScore').textContent  = Math.floor(score);
  document.getElementById('goLength').textContent = worm ? worm.length : 0;
  document.getElementById('goDepth').textContent  = Math.floor(depth) + 'm';
  document.getElementById('goHS').textContent     = highScore;
  document.getElementById('goLevel').textContent  = 'Liv. ' + level;

  let goReason = document.getElementById('goReason');
  if (!goReason) {
    goReason = document.createElement('div');
    goReason.id = 'goReason';
    goReason.style.cssText = "font-family:'Rajdhani',sans-serif;font-size:16px;line-height:1.2;text-align:center;color:rgba(255,255,255,.92);max-width:260px;";
    const goTitle = document.querySelector('.go-title');
    if (goTitle && goTitle.parentNode) goTitle.parentNode.insertBefore(goReason, goTitle.nextSibling);
  }
  const killerLabel = lastKiller?.label ? ` · ${lastKiller.label}` : '';
  goReason.textContent = lastDeathReason ? `${lastDeathReason}${killerLabel}` : 'Sei stato mangiato';

  document.getElementById('gameOver').classList.remove('hidden');
}

// ─── NEMO ─────────────────────────────────────────────────────────────────────
function spawnNemo() {
  if (depth < CFG.NEMO_MIN_DEPTH || nemoObj) return;
  const fromLeft = Math.random() < 0.5;
  const wx = fromLeft ? -60 : W + 60;
  const wy = camY + H * (0.28 + Math.random() * 0.22);
  const angle = fromLeft ? 0 : Math.PI;
  nemoObj = {
    wx, wy, angle, phase:0,
    segs: Array.from({length:8}, ()=>({wx, wy})),
    speed: 1.9*sc,
    timer: 0,
    gifted: false,
    fromLeft,
    targetOffsetY: (-0.08 + Math.random() * 0.16) * H
  };
  lastNemoAt = tick * (1000 / 60);
  encounterBanner = { text: '🐠 NEMO PASSA DI QUI', timer: 110, color: '#ff9a4d' };
}

function updateNemo() {
  if (!nemoObj) return;
  nemoObj.phase += 0.07;
  nemoObj.timer++;

  const hd = worm?.segs?.[0];
  const cruiseX = nemoObj.fromLeft ? W + 120 : -120;
  let tx = cruiseX;
  let ty = nemoObj.wy + Math.sin(nemoObj.phase) * 10 * sc;

  if (hd && nemoObj.timer < 220) {
    tx = hd.wx + (nemoObj.fromLeft ? 110 : -110) * sc;
    ty = hd.wy + nemoObj.targetOffsetY + Math.sin(nemoObj.phase * 1.2) * 18 * sc;
  }

  const dx = tx - nemoObj.wx;
  const dy = ty - nemoObj.wy;
  const dist = Math.hypot(dx, dy) || 1;
  nemoObj.angle = Math.atan2(dy, dx);
  const spd = nemoObj.speed * (nemoObj.timer > 220 ? 1.15 : 1);
  nemoObj.wx += Math.cos(nemoObj.angle) * Math.min(dist, spd);
  nemoObj.wy += Math.sin(nemoObj.angle) * Math.min(dist, spd * 0.75);
  nemoObj.wx = ((nemoObj.wx % W) + W) % W;

  nemoObj.segs.unshift({ wx: nemoObj.wx, wy: nemoObj.wy });
  while (nemoObj.segs.length > 8) nemoObj.segs.pop();

  if (hd && !nemoObj.gifted && Math.hypot(hd.wx - nemoObj.wx, hd.wy - nemoObj.wy) < 95 * sc) {
    nemoObj.gifted = true;
    energy = Math.min(CFG.ENERGY_MAX, energy + 30);
    score += 20 * Math.max(1, level * 0.5);
    burst(nemoObj.wx, nemoObj.wy, '#ff9a4d', 14);
    encounterBanner = { text: '🐠 NEMO TI AIUTA  +30 ENERGIA', timer: 120, color: '#ffd166' };
  }

  if (nemoObj.timer >= 320) nemoObj = null;
}

// ─── BOLLE ────────────────────────────────────────────────────────────────────
function initBubbles() {
  bubbles = [];
  for (let i = 0; i < CFG.BUBBLE_N; i++) bubbles.push(mkBubble(true));
}
function mkBubble(rand) {
  return { wx: Math.random()*W,
           wy: rand ? (camY + Math.random()*H) : (camY + H + 10),
           r: (2+Math.random()*7)*sc,
           spd: (0.3+Math.random()*0.8)*sc,
           wobble: Math.random()*Math.PI*2,
           opacity: 0.07+Math.random()*0.18 };
}
function tickBubbles() {
  bubbles.forEach(b => {
    b.wy -= b.spd; // salgono (wy decresce)
    b.wx += Math.sin(b.wobble + tick*0.02) * 0.4;
    b.wx = ((b.wx % W) + W) % W;
    b.wobble += 0.02;
    if (b.wy < camY - 30) Object.assign(b, mkBubble(false));
  });
}

// ─── PARTICELLE (coordinate mondo) ────────────────────────────────────────────
function addPart(wx, wy, col, r, decay) {
  particles.push({ wx, wy, vx:(Math.random()-.5)*1.5, vy:(Math.random()-.5)*1.5,
    life:0.7, decay, r, color:col });
}
function burst(wx, wy, col, n) {
  for (let i = 0; i < n; i++) {
    const a = (i/n)*Math.PI*2, spd = (1+Math.random()*4)*sc;
    particles.push({ wx, wy, vx:Math.cos(a)*spd, vy:Math.sin(a)*spd,
      life:1, decay:0.032+Math.random()*0.03, r:(2+Math.random()*4)*sc, color:col });
  }
}
function tickParticles() {
  particles.forEach(p => { p.wx+=p.vx; p.wy+=p.vy; p.vy+=0.04; p.life-=p.decay; });
  particles = particles.filter(p => p.life > 0);
  if (particles.length > CFG.PARTICLE_MAX)
    particles.splice(0, particles.length - CFG.PARTICLE_MAX);
}
function tickDrift() {
  if (tick % 3 === 0) {
    particles.push({ wx:Math.random()*W, wy:camY - 10,
      vx:(Math.random()-.5)*0.3, vy:(0.4+Math.random()*0.7)*sc,
      life:1, decay:0.003, r:(1+Math.random()*2)*sc,
      color:`hsla(${170+Math.random()*60},80%,70%,0.35)` });
  }
}

// ─── DISEGNO ──────────────────────────────────────────────────────────────────
function draw(dr) {
  drawBg(dr);
  drawBubbles();
  drawPlankton(dr);
  drawFood();
  drawCreatures(dr);
  drawEnemyWorms();
  if (nemoObj) drawNemoScene();
  if (worm && worm.segs && worm.segs.length) drawWorm();
  drawParticles();

  // Velo abissale — più scuro in profondità
  if (dr > 0.18) {
    ctx.fillStyle = `rgba(0,0,18,${(dr-0.18)/0.82 * 0.55})`;
    ctx.fillRect(0, 0, W, H);
  }

  // Indicatore di profondità visivo laterale (mini barra)
  drawDepthBar(dr);
  drawEncounterBanner();
  drawKillerFocus();

  // Flash danno
  if (flashA > 0) {
    ctx.fillStyle = flashCol + Math.round(flashA*255).toString(16).padStart(2,'0');
    ctx.fillRect(0,0,W,H);
    flashA = Math.max(0, flashA - 0.04);
  }

  // Banner livello
  if (levelBanner > 0) {
    ctx.save();
    ctx.globalAlpha = Math.min(1, levelBanner/40) * Math.min(1, (levelBanner)/40);
    ctx.font = `bold ${46*sc}px 'Orbitron',monospace`;
    ctx.textAlign = 'center'; ctx.fillStyle = '#00f5ff';
    ctx.shadowColor = '#00f5ff'; ctx.shadowBlur = 30;
    ctx.fillText('LIVELLO ' + level, W/2, H*0.38);
    ctx.font = `${18*sc}px 'Rajdhani',sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,0.75)'; ctx.shadowBlur = 10;
    const msgs = ['','Buona fortuna!','Attenzione ai predatori!','Lo squalo è in agguato!','Negli abissi nessuno sente le tue urla…','Solo i più forti sopravvivono'];
    ctx.fillText(msgs[Math.min(level-1,msgs.length-1)]||'Forza!', W/2, H*0.38+44*sc);
    ctx.restore();
    levelBanner--;
  }
}

// ─── SFONDO — colori legati alla profondità ───────────────────────────────────
function drawBg(dr) {
  // dr=0 (superficie): azzurro ciano brillante
  // dr=0.5 (medio): blu-indaco scuro
  // dr=1  (abisso): quasi nero con sfumatura viola
  const topH = Math.round(190 - dr * 190);
  const topL = Math.max(1, Math.round(13 - dr * 11));
  const midH = Math.round(210 - dr * 205);
  const midL = Math.max(1, Math.round(6  - dr * 5));
  const botH = Math.round(240 + dr * 30);

  const grad = ctx.createLinearGradient(0, 0, 0, H);
  grad.addColorStop(0,   `hsl(${topH},90%,${topL}%)`);
  grad.addColorStop(0.4, `hsl(${midH},88%,${midL}%)`);
  grad.addColorStop(1,   `hsl(${botH},70%,${Math.max(1, Math.round(2-dr))}%)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, W, H);

  // Raggi caustica — solo in superficie
  if (dr < 0.55) {
    const alpha = (1 - dr/0.55) * 0.065;
    ctx.save();
    for (let i = 0; i < 9; i++) {
      const rx = (W*0.12*i + tick*0.45) % (W*1.35) - W*0.1;
      const rg = ctx.createLinearGradient(rx, 0, rx+35*sc, H*0.5);
      rg.addColorStop(0, `rgba(0,245,255,${alpha})`);
      rg.addColorStop(1, 'rgba(0,245,255,0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.moveTo(rx,0); ctx.lineTo(rx+22*sc,H*0.5);
      ctx.lineTo(rx+65*sc,H*0.5); ctx.lineTo(rx+43*sc,0);
      ctx.fill();
    }
    ctx.restore();
  }

  // "Superficie" visibile se la camera è vicina a wy=0
  if (camY < H * 0.5) {
    const surfY = sy(0); // posizione schermo della superficie (wy=0)
    if (surfY > 0 && surfY < H) {
      // Linea di superficie
      ctx.save();
      const surfGrad = ctx.createLinearGradient(0, surfY-20*sc, 0, surfY+10*sc);
      surfGrad.addColorStop(0, 'rgba(100,220,255,0)');
      surfGrad.addColorStop(0.5, `rgba(100,220,255,${0.25*(1-camY/(H*0.5))})`);
      surfGrad.addColorStop(1, 'rgba(100,220,255,0)');
      ctx.fillStyle = surfGrad;
      ctx.fillRect(0, surfY-20*sc, W, 30*sc);
      // Increspature
      ctx.strokeStyle = `rgba(180,240,255,${0.3*(1-camY/(H*0.5))})`;
      ctx.lineWidth = 1.5;
      for (let x = 0; x < W; x += 30*sc) {
        ctx.beginPath();
        ctx.moveTo(x, surfY + Math.sin((x*0.04)+tick*0.04)*4*sc);
        ctx.lineTo(x+15*sc, surfY + Math.sin((x*0.04+0.5)+tick*0.04)*4*sc);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  // Fondale — appare sempre in basso sullo schermo, sempre più tetro
  const bedScreenY = H - 40*sc;
  const bedG = ctx.createLinearGradient(0, bedScreenY, 0, H);
  bedG.addColorStop(0, `hsla(${200+dr*40},60%,${Math.max(3,8-dr*6)}%,0.95)`);
  bedG.addColorStop(1, `hsl(${190+dr*50},50%,1%)`);
  ctx.fillStyle = bedG;
  ctx.beginPath(); ctx.moveTo(0, bedScreenY);
  for (let x = 0; x <= W; x += 18)
    ctx.lineTo(x, bedScreenY + Math.sin(x*0.05 + tick*0.007)*9*sc);
  ctx.lineTo(W,H); ctx.lineTo(0,H); ctx.fill();
}

// ─── BARRA PROFONDITÀ laterale ────────────────────────────────────────────────
function drawDepthBar(dr) {
  const bw = 6*sc, bh = H*0.35, bx = W-bw-8*sc, by = H*0.32;
  const fillH = bh * dr;
  const barGrad = ctx.createLinearGradient(0,by,0,by+bh);
  barGrad.addColorStop(0,'#00f5ff'); barGrad.addColorStop(0.5,'#9b5de5'); barGrad.addColorStop(1,'#220033');
  ctx.fillStyle = 'rgba(0,0,0,0.3)';
  rRect(bx,by,bw,bh,3); ctx.fill();
  ctx.fillStyle = barGrad;
  rRect(bx,by+bh-fillH,bw,fillH,3); ctx.fill();
  ctx.font = `bold ${7*sc}px 'Orbitron',monospace`;
  ctx.textAlign = 'center'; ctx.fillStyle = 'rgba(0,245,255,0.6)';
  ctx.fillText('▼', bx+bw/2, by-4*sc);
}

function drawEncounterBanner() {
  if (!encounterBanner.timer || !encounterBanner.text) return;
  const alpha = Math.min(1, encounterBanner.timer / 20);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(16, 20 * sc)}px 'Orbitron', monospace`;
  ctx.fillStyle = encounterBanner.color;
  ctx.shadowColor = encounterBanner.color;
  ctx.shadowBlur = 18;
  ctx.fillText(encounterBanner.text, W / 2, H * 0.12);
  ctx.restore();
  encounterBanner.timer = Math.max(0, encounterBanner.timer - 1);
}

// ─── BOLLE ────────────────────────────────────────────────────────────────────
function drawBubbles() {
  ctx.save();
  bubbles.forEach(b => {
    const sY = sy(b.wy);
    if (sY < -30 || sY > H+30) return;
    ctx.beginPath(); ctx.arc(b.wx, sY, b.r, 0, Math.PI*2);
    ctx.strokeStyle = `rgba(180,240,255,${b.opacity})`; ctx.lineWidth=0.8; ctx.stroke();
    ctx.beginPath(); ctx.arc(b.wx-b.r*0.3, sY-b.r*0.3, b.r*0.28, 0, Math.PI*2);
    ctx.fillStyle = `rgba(255,255,255,${b.opacity*1.4})`; ctx.fill();
  });
  ctx.restore();
}

// ─── PLANCTON (più luminoso in profondità) ────────────────────────────────────
function drawPlankton(dr) {
  ctx.save();
  plankton.forEach(p => {
    const sY = sy(p.wy);
    if (sY < -20 || sY > H+20) return;
    const g = (Math.sin(p.phase)+1)*0.5;
    const lum = dr > 0.3 ? 70+dr*22 : 50+g*22;
    const gblur = dr > 0.3 ? 8+dr*18 : 8;
    ctx.shadowColor = `hsla(${p.hue},80%,60%,0.9)`; ctx.shadowBlur = gblur;
    ctx.beginPath(); ctx.arc(p.wx, sY, p.r*(1+dr*0.6), 0, Math.PI*2);
    ctx.fillStyle = `hsla(${p.hue},80%,${lum}%,${0.45+g*0.4+dr*0.3})`; ctx.fill();
  });
  ctx.restore();
}

// ─── CIBO ─────────────────────────────────────────────────────────────────────
function drawFood() {
  ctx.save();
  foods.forEach(f => {
    const sY = sy(f.wy);
    if (sY < -30 || sY > H+30) return;
    const g = (Math.sin(f.pulse)+1)*0.5, r = f.type.r*sc;
    ctx.shadowColor = f.type.glow; ctx.shadowBlur = 9+g*9;
    if (f.type.label === 'jellyfish') {
      ctx.beginPath(); ctx.arc(f.wx, sY, r, -Math.PI, 0);
      ctx.fillStyle = f.type.col+'88'; ctx.fill();
      for (let i=0;i<5;i++){
        const tx=f.wx+(i-2)*r*0.42;
        ctx.beginPath(); ctx.moveTo(tx,sY);
        ctx.bezierCurveTo(tx,sY+r*1.4,tx+Math.sin(tick*0.05+i)*r,sY+r*2.4,tx,sY+r*3);
        ctx.strokeStyle=f.type.col+'66'; ctx.lineWidth=1.5; ctx.stroke();
      }
    } else {
      ctx.beginPath(); ctx.arc(f.wx, sY, r*(0.9+g*0.13), 0, Math.PI*2);
      ctx.fillStyle=f.type.col; ctx.fill();
      const ig=ctx.createRadialGradient(f.wx,sY,0,f.wx,sY,r);
      ig.addColorStop(0,'rgba(255,255,255,0.5)'); ig.addColorStop(1,'rgba(255,255,255,0)');
      ctx.fillStyle=ig; ctx.fill();
    }
  });
  ctx.restore();
}

// ─── CREATURE (occhi bioluminescenti in profondità) ───────────────────────────
function drawCreatures(dr) {
  ctx.save();
  const dg = 1 + dr * 2.8;
  enemies.filter(e => e.kind==='creature'||e.kind==='shark').forEach(e => {
    const isShark = e.kind === 'shark';
    const r = isShark ? 28*sc : e.type.r*sc;
    const col = isShark ? '#4a4aaa' : e.type.col;
    const g = (Math.sin(e.phase)+1)*0.5;
    ctx.shadowColor = isShark?'#8888ff':col;
    ctx.shadowBlur = (isShark?22:12+g*10)*dg;

    for (let i=e.segs.length-1;i>=0;i--) {
      const sY = sy(e.segs[i].wy);
      if (sY<-60||sY>H+60) continue;
      const t=1-i/e.segs.length, sr=r*(0.3+t*0.7);
      ctx.beginPath(); ctx.arc(e.segs[i].wx, sY, sr, 0, Math.PI*2);
      ctx.fillStyle=hexA(col,(0.3+t*0.5)*0.8); ctx.fill();
      ctx.strokeStyle=hexA(col,0.4+t*0.5); ctx.lineWidth=1; ctx.stroke();
    }
    const sY = sy(e.wy);
    if (sY<-60||sY>H+60) return;
    ctx.shadowBlur=(isShark?30:18+g*14)*dg;
    ctx.beginPath(); ctx.arc(e.wx, sY, r, 0, Math.PI*2);
    ctx.fillStyle=col+'cc'; ctx.fill();

    if (isShark) {
      ctx.beginPath();
      ctx.moveTo(e.wx, sY-r);
      ctx.lineTo(e.wx+Math.cos(e.angle-0.3)*r*1.5, sY+Math.sin(e.angle-0.3)*r*1.5-r*0.5);
      ctx.lineTo(e.wx+Math.cos(e.angle)*r*0.5, sY+Math.sin(e.angle)*r*0.5);
      ctx.fillStyle='rgba(80,80,180,0.85)'; ctx.fill();
      ctx.shadowBlur=0; ctx.font=`bold ${14*sc}px monospace`; ctx.textAlign='center';
      ctx.fillText('🦈', e.wx, sY+5*sc);
    } else {
      const eo=r*0.42;
      const eyeCol = dr>0.35 ? `rgba(255,${Math.max(0,Math.round(200-dr*200))},0,1)` : '#fff';
      [e.angle-0.5,e.angle+0.5].forEach(a=>{
        const ex=e.wx+Math.cos(a)*eo, ey=sY+Math.sin(a)*eo;
        ctx.shadowBlur=dr>0.35?14:0; ctx.shadowColor=dr>0.35?'rgba(255,100,0,0.9)':'transparent';
        ctx.fillStyle=eyeCol;
        ctx.beginPath(); ctx.arc(ex,ey,3*sc,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#111'; ctx.shadowBlur=0;
        ctx.beginPath(); ctx.arc(ex+Math.cos(e.angle)*sc,ey+Math.sin(e.angle)*sc,1.5*sc,0,Math.PI*2); ctx.fill();
      });
    }
  });
  ctx.restore();
}

// ─── LOMBRICHI NEMICI ─────────────────────────────────────────────────────────
function drawEnemyWorms() {
  ctx.save();
  enemies.filter(e => e.kind==='eworm').forEach(e => {
    const {h,s,l} = e.col;
    const gv = (Math.sin(e.glow)+1)*0.5;
    ctx.shadowColor=`hsl(${h},${s}%,${l}%)`; ctx.shadowBlur=16+gv*12;
    for (let i=e.segs.length-1;i>=0;i--) {
      const sY=sy(e.segs[i].wy);
      if(sY<-40||sY>H+40)continue;
      const t=1-i/e.segs.length,r=e.r*(0.35+t*0.65),alpha=0.3+t*0.65;
      const biolum=Math.sin(e.glow+i*0.3);
      const fg=ctx.createRadialGradient(e.segs[i].wx-r*0.2,sY-r*0.2,0,e.segs[i].wx,sY,r);
      fg.addColorStop(0,`hsla(${h},${s}%,${l+20}%,${alpha*0.88})`);
      fg.addColorStop(0.5,`hsla(${h},${s}%,${l}%,${alpha*0.55})`);
      fg.addColorStop(1,`hsla(${h},${s}%,${l-12}%,${alpha*0.18})`);
      ctx.beginPath(); ctx.arc(e.segs[i].wx,sY,r,0,Math.PI*2);
      ctx.fillStyle=fg; ctx.fill();
      ctx.strokeStyle=`hsla(${h},${s}%,${l+12}%,${alpha*0.7})`; ctx.lineWidth=1.3; ctx.stroke();
      if(i%3===0){
        ctx.beginPath(); ctx.arc(e.segs[i].wx,sY,r*0.27,0,Math.PI*2);
        ctx.fillStyle=`hsla(${h+30},${s}%,${l+22}%,${0.32+biolum*0.28})`; ctx.fill();
      }
    }
    // Testa
    const sYH=sy(e.wy);
    if(sYH>=-40&&sYH<=H+40){
      ctx.shadowBlur=24+gv*16;
      const hg=ctx.createRadialGradient(e.wx-e.r*0.25,sYH-e.r*0.25,0,e.wx,sYH,e.r);
      hg.addColorStop(0,`hsla(${h},${s}%,${l+28}%,0.96)`);
      hg.addColorStop(0.6,`hsla(${h},${s}%,${l}%,0.78)`);
      hg.addColorStop(1,`hsla(${h},${s}%,${l-16}%,0.28)`);
      ctx.beginPath(); ctx.arc(e.wx,sYH,e.r,0,Math.PI*2); ctx.fillStyle=hg; ctx.fill();
      ctx.strokeStyle=`hsla(${h},${s}%,${l+18}%,0.9)`; ctx.lineWidth=1.8; ctx.stroke();
      ctx.shadowBlur=10; ctx.shadowColor='red';
      const eo=e.r*0.42;
      [e.angle-0.55,e.angle+0.55].forEach(a=>{
        const ex=e.wx+Math.cos(a)*eo,ey=sYH+Math.sin(a)*eo;
        ctx.fillStyle='#ff3030'; ctx.beginPath(); ctx.arc(ex,ey,3.5*sc,0,Math.PI*2); ctx.fill();
        ctx.fillStyle='#220000'; ctx.beginPath(); ctx.arc(ex+Math.cos(e.angle)*sc,ey+Math.sin(e.angle)*sc,1.8*sc,0,Math.PI*2); ctx.fill();
      });
    }
  });
  ctx.restore();
}

// ─── LOMBRICO GIOCATORE ───────────────────────────────────────────────────────
function drawWorm() {
  const segs=worm.segs, {h,s,l}=wormCol;
  const gv=(Math.sin(worm.glow)+1)*0.5;
  const inv=worm.invincible>0;
  ctx.save();
  if(inv&&Math.floor(tick/8)%2===0) ctx.globalAlpha=0.4;
  ctx.shadowColor=`hsl(${h},${s}%,${l}%)`; ctx.shadowBlur=14+gv*10;

  for(let i=segs.length-1;i>=0;i--){
    const sY=sy(segs[i].wy);
    if(sY<-30||sY>H+30)continue;
    const t=1-i/segs.length,r=(CFG.SEG_R*0.38+t*CFG.SEG_R*0.62)*sc;
    const alpha=0.28+t*0.65,biolum=Math.sin(worm.glow+i*0.3);
    const fg=ctx.createRadialGradient(segs[i].wx-r*0.2,sY-r*0.2,0,segs[i].wx,sY,r);
    fg.addColorStop(0,`hsla(${h},${s}%,${l+22}%,${alpha*0.85})`);
    fg.addColorStop(0.5,`hsla(${h},${s}%,${l}%,${alpha*0.52})`);
    fg.addColorStop(1,`hsla(${h},${s}%,${l-12}%,${alpha*0.18})`);
    ctx.beginPath(); ctx.arc(segs[i].wx,sY,r,0,Math.PI*2);
    ctx.fillStyle=fg; ctx.fill();
    ctx.strokeStyle=`hsla(${h},${s}%,${l+12}%,${alpha*0.7})`; ctx.lineWidth=1.2; ctx.stroke();
    if(i%3===0){
      ctx.beginPath(); ctx.arc(segs[i].wx,sY,r*0.27,0,Math.PI*2);
      ctx.fillStyle=`hsla(${h+30},${s}%,${l+22}%,${0.3+biolum*0.28})`; ctx.fill();
    }
  }
  // Testa
  const hd=segs[0], hr=CFG.SEG_R*sc, sYH=sy(hd.wy);
  ctx.shadowBlur=22+gv*16;
  const hg=ctx.createRadialGradient(hd.wx-hr*0.25,sYH-hr*0.25,0,hd.wx,sYH,hr);
  hg.addColorStop(0,`hsla(${h},${s}%,${l+26}%,0.96)`);
  hg.addColorStop(0.6,`hsla(${h},${s}%,${l}%,0.76)`);
  hg.addColorStop(1,`hsla(${h},${s}%,${l-16}%,0.28)`);
  ctx.beginPath(); ctx.arc(hd.wx,sYH,hr,0,Math.PI*2);
  ctx.fillStyle=hg; ctx.fill();
  ctx.strokeStyle=`hsla(${h},${s}%,${l+16}%,0.92)`; ctx.lineWidth=1.5; ctx.stroke();
  ctx.shadowBlur=0;
  const eo=hr*0.42;
  [worm.angle-0.6,worm.angle+0.6].forEach(a=>{
    const ex=hd.wx+Math.cos(a)*eo, ey=sYH+Math.sin(a)*eo;
    ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(ex,ey,3.2*sc,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#001a2e'; ctx.beginPath(); ctx.arc(ex+Math.cos(worm.angle)*sc,ey+Math.sin(worm.angle)*sc,1.8*sc,0,Math.PI*2); ctx.fill();
  });
  ctx.globalAlpha=1;
  ctx.restore();
}

// ─── NEMO ─────────────────────────────────────────────────────────────────────
function drawNemoScene() {
  if (!nemoObj) return;
  ctx.save();
  const nx=nemoObj.wx, nY=sy(nemoObj.wy), nr=18*sc;
  const g=(Math.sin(nemoObj.phase)+1)*0.5;
  // Coda
  ctx.beginPath();
  ctx.moveTo(nx+Math.cos(nemoObj.angle+Math.PI)*nr, nY+Math.sin(nemoObj.angle+Math.PI)*nr);
  ctx.lineTo(nx+Math.cos(nemoObj.angle+Math.PI+0.6)*nr*2, nY+Math.sin(nemoObj.angle+Math.PI+0.6)*nr*2);
  ctx.lineTo(nx+Math.cos(nemoObj.angle+Math.PI-0.6)*nr*2, nY+Math.sin(nemoObj.angle+Math.PI-0.6)*nr*2);
  ctx.fillStyle='#ff6b35'; ctx.fill();
  // Corpo
  ctx.shadowColor='#ff6b35'; ctx.shadowBlur=20+g*15;
  ctx.beginPath(); ctx.ellipse(nx,nY,nr*1.2,nr*0.85,nemoObj.angle,0,Math.PI*2);
  ctx.fillStyle='#ff6b35'; ctx.fill();
  // Strisce bianche
  ctx.strokeStyle='rgba(255,255,255,0.9)'; ctx.lineWidth=4*sc;
  for(let i=0;i<3;i++){
    const sx2=nx+Math.cos(nemoObj.angle)*(nr*(0.5-i*0.5));
    const sy2=nY+Math.sin(nemoObj.angle)*(nr*(0.5-i*0.5));
    ctx.beginPath(); ctx.arc(sx2,sy2,nr*(0.3+i*0.1),nemoObj.angle-Math.PI/2,nemoObj.angle+Math.PI/2);
    ctx.stroke();
  }
  // Scia gentile
  ctx.shadowBlur = 0;
  ctx.strokeStyle = 'rgba(255,166,77,0.35)';
  ctx.lineWidth = 2 * sc;
  ctx.beginPath();
  ctx.moveTo(nx - Math.cos(nemoObj.angle) * nr * 1.4, nY - Math.sin(nemoObj.angle) * nr * 1.4);
  ctx.lineTo(nx - Math.cos(nemoObj.angle) * nr * 3.4, nY - Math.sin(nemoObj.angle) * nr * 3.4);
  ctx.stroke();
  // Occhio
  const ex2=nx+Math.cos(nemoObj.angle)*nr*0.6, ey2=nY+Math.sin(nemoObj.angle)*nr*0.3;
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(ex2,ey2,4*sc,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#111'; ctx.beginPath(); ctx.arc(ex2+Math.cos(nemoObj.angle)*1.5*sc,ey2+Math.sin(nemoObj.angle)*1.5*sc,2.2*sc,0,Math.PI*2); ctx.fill();

  if (nemoObj.gifted && nemoObj.timer < 150) {
    ctx.globalAlpha = Math.max(0, 1 - (nemoObj.timer - 30) / 120);
    ctx.textAlign = 'center';
    ctx.font = `bold ${18*sc}px 'Orbitron',monospace`;
    ctx.fillStyle = '#ffd166';
    ctx.shadowColor = '#ffd166';
    ctx.shadowBlur = 18;
    ctx.fillText('+30 ENERGIA', nx, nY - 26*sc);
  }
  ctx.restore();
}

function drawKillerFocus() {
  if (!lastKiller || deathFocusTimer <= 0) return;
  const x = lastKiller.wx;
  const y = sy(lastKiller.wy);
  const pulse = 1 + Math.sin(tick * 0.35) * 0.12;
  const r = (lastKiller.radius || 28 * sc) * pulse;
  const alpha = Math.min(0.72, deathFocusTimer / 140);
  ctx.save();
  ctx.fillStyle = `rgba(0,0,0,${alpha * 0.42})`;
  ctx.fillRect(0, 0, W, H);
  ctx.strokeStyle = lastKiller.color || '#ff5a7a';
  ctx.shadowColor = lastKiller.color || '#ff5a7a';
  ctx.shadowBlur = 22;
  ctx.lineWidth = 4 * sc;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - r - 18*sc, y);
  ctx.lineTo(x - r + 2*sc, y);
  ctx.moveTo(x + r - 2*sc, y);
  ctx.lineTo(x + r + 18*sc, y);
  ctx.moveTo(x, y - r - 18*sc);
  ctx.lineTo(x, y - r + 2*sc);
  ctx.moveTo(x, y + r - 2*sc);
  ctx.lineTo(x, y + r + 18*sc);
  ctx.stroke();
  ctx.textAlign = 'center';
  ctx.font = `bold ${Math.max(16, 20 * sc)}px 'Orbitron', monospace`;
  ctx.fillStyle = '#ffffff';
  ctx.shadowColor = '#000000';
  ctx.shadowBlur = 12;
  ctx.fillText(lastKiller.label || 'PREDATORE', W / 2, H * 0.18);
  if (lastDeathReason) {
    ctx.font = `${Math.max(13, 15 * sc)}px 'Rajdhani', sans-serif`;
    ctx.fillText(lastDeathReason, W / 2, H * 0.22);
  }
  ctx.restore();
  deathFocusTimer = Math.max(0, deathFocusTimer - 1);
}

// ─── PARTICELLE ───────────────────────────────────────────────────────────────
function drawParticles() {
  ctx.save();
  particles.forEach(p => {
    const sY=sy(p.wy);
    if(sY<-20||sY>H+20)return;
    ctx.globalAlpha=Math.max(0,p.life);
    ctx.shadowColor=p.color; ctx.shadowBlur=6;
    ctx.beginPath(); ctx.arc(p.wx,sY,Math.max(0.1,p.r*p.life),0,Math.PI*2);
    ctx.fillStyle=p.color; ctx.fill();
  });
  ctx.globalAlpha=1; ctx.restore();
}

// ─── HUD ─────────────────────────────────────────────────────────────────────
function updateHUD(){
  document.getElementById('scoreVal').textContent  = Math.floor(score);
  document.getElementById('depthVal').textContent  = Math.floor(depth)+'m';
  document.getElementById('levelVal').textContent  = 'LV '+level;
  const pct=(energy/CFG.ENERGY_MAX)*100;
  const fill=document.getElementById('energyFill');
  fill.style.width=pct+'%'; fill.classList.toggle('low',pct<25);
}
function updateLivesHUD(){
  document.getElementById('livesVal').textContent='❤️'.repeat(Math.max(0,lives));
}

// ─── BOTTONI ──────────────────────────────────────────────────────────────────
function setupButtons(){
  document.getElementById('btnPlay').addEventListener('click',()=>{showEl('splash',false);startGame(true);});
  document.getElementById('btnRestart').addEventListener('click',()=>{showEl('gameOver',false);startGame(true);});
  document.getElementById('btnMenu').addEventListener('click',()=>{
    showEl('gameOver',false);showEl('splash',true);
    document.getElementById('splashHS').textContent=highScore;state='splash';
  });
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
function rRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.lineTo(x+w-r,y); ctx.arcTo(x+w,y,x+w,y+r,r);
  ctx.lineTo(x+w,y+h-r); ctx.arcTo(x+w,y+h,x+w-r,y+h,r);
  ctx.lineTo(x+r,y+h); ctx.arcTo(x,y+h,x,y+h-r,r);
  ctx.lineTo(x,y+r); ctx.arcTo(x,y,x+r,y,r);
  ctx.closePath();
}
function showEl(id,v){document.getElementById(id).classList.toggle('hidden',!v);}
function hexA(hex,a){
  return`rgba(${parseInt(hex.slice(1,3),16)},${parseInt(hex.slice(3,5),16)},${parseInt(hex.slice(5,7),16)},${a})`;
}

window.addEventListener('DOMContentLoaded', init);

// ─── AUTO-UPDATE: ascolta messaggi dal Service Worker ─────────────────────────
if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('message', e => {
    if (e.data && e.data.type === 'aleskat:updated') {
      showUpdateBanner();
      queueAutoReload();
    }
  });

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (hasReloadedForUpdate) return;
    hasReloadedForUpdate = true;
    window.location.reload();
  });

  window.addEventListener('load', () => {
    navigator.serviceWorker.getRegistration().then(reg => {
      if (!reg) return;
      reg.update();
      setInterval(() => reg.update(), 25000);
    });
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      navigator.serviceWorker.getRegistration().then(reg => {
        if (reg) reg.update();
      });
    }
  });
}

function queueAutoReload() {
  pendingAutoReload = true;
  autoReloadTimer = state === 'playing' ? 240 : 30;
  encounterBanner = {
    text: state === 'playing' ? '🔄 AGGIORNAMENTO IN ARRIVO…' : '🔄 AGGIORNAMENTO AUTOMATICO',
    timer: Math.max(encounterBanner.timer, state === 'playing' ? 150 : 60),
    color: '#7cf5b3'
  };
}

function showUpdateBanner() {
  // Evita duplicati
  if (document.getElementById('updateBanner')) return;

  const banner = document.createElement('div');
  banner.id = 'updateBanner';
  banner.style.cssText = `
    position: absolute;
    bottom: 20px;
    left: 50%;
    transform: translateX(-50%);
    z-index: 999;
    background: linear-gradient(135deg, #00f5ff, #39ff14);
    color: #000d1a;
    font-family: 'Orbitron', monospace;
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 0.15em;
    padding: 12px 22px;
    border-radius: 6px;
    box-shadow: 0 0 30px rgba(0,245,255,0.5);
    cursor: pointer;
    white-space: nowrap;
    animation: bannerIn 0.4s ease-out;
  `;
  banner.textContent = '🔄 NUOVA VERSIONE — TOCCA PER AGGIORNARE';
  banner.addEventListener('click', () => window.location.reload());

  // Aggiunge stile animazione inline (non dipende dal CSS esterno)
  const style = document.createElement('style');
  style.textContent = `
    @keyframes bannerIn {
      from { opacity:0; transform:translateX(-50%) translateY(20px); }
      to   { opacity:1; transform:translateX(-50%) translateY(0); }
    }
  `;
  document.head.appendChild(style);

  // Attacca al wrapper se esiste, altrimenti al body
  const target = document.getElementById('gameWrapper') || document.body;
  target.appendChild(banner);
}
