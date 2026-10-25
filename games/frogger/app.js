// Frogger — mobile-first PWA (Tributo didattico) © 2025 pezzaliAPP (MIT)
(() => {
  'use strict';

  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');

  // Logical grid
  const COLS = 14;
  const ROWS = 16;
  let TILE;
  let W, H;

  // Game state
  let running = false;
  let paused = false;
  let level = 1;
  let points = 0;
  let lives = 3;
  let hiscore = Number(localStorage.getItem('frogger.hiscore')||0);
  let timeLeft = 45; // seconds per life
  let maxTime = 45;
  const timeBar = document.getElementById('timeBar');

  let frog = null;
  let lanes = [];
  let lastTime = 0;
  let fly = null; // bonus fly at home slots
  let croc = null; // crocodile guarding a home (one at a time)

  // HUD
  const $ = sel => document.querySelector(sel);
  const btnPlay = $('#btnPlay');
  const btnPause = $('#btnPause');
  const livesEl = $('#lives');
  const levelEl = $('#level');
  const pointsEl = $('#points');
  let timerBadge;

  function updateHud(){
    livesEl.textContent = `❤️ x${lives}`;
    levelEl.textContent = `Livello ${level}`;
    pointsEl.innerHTML = `Punti ${String(points).padStart(4,'0')} · Hi ${String(hiscore).padStart(4,'0')} · <span id='time' class='badge'>${Math.ceil(timeLeft)}</span>`;
    timerBadge = document.getElementById('time');
    if (timerBadge){ timerBadge.className = 'badge' + (timeLeft<=10? ' warn':'' ); }
    // Progress bar update
    if (timeBar){
      const pct = Math.max(0, Math.min(1, timeLeft / maxTime));
      timeBar.style.width = (pct*100).toFixed(1) + '%';
      timeBar.className = 'bar' + (timeLeft<=10? ' warn':'' );
    }
  }

  // Sounds (simple, start after first tap to comply with iOS)
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  let actx, canPlay = false;
  function initAudio(){
    if (!actx){ actx = new AudioCtx(); }
    canPlay = true;
  }
  function beep(freq=880, dur=0.07){
    if(!canPlay || !actx) return;
    const osc = actx.createOscillator();
    const gain = actx.createGain();
    osc.frequency.value = freq;
    gain.gain.value = 0.08;
    osc.connect(gain).connect(actx.destination);
    osc.start();
    setTimeout(()=>osc.stop(), dur*1000);
  }

  function resize(){
    const cssWidth = cvs.clientWidth;
    TILE = Math.floor(cssWidth / COLS);
    W = TILE * COLS;
    H = TILE * ROWS;
    cvs.width = W;
    cvs.height = H;
  }
  window.addEventListener('resize', resize, {passive:true});
  resize();

  const HOME_ROW = 1;
  const START_ROW = ROWS - 2;

  const homes = []; // filled indices
  function resetHomes(){ homes.length = 0; }

  function makeLanes(){
    lanes = [];
    // River rows: 2..6, alternate logs/turtles
    const riverRows = [2,3,4,5,6];
    riverRows.forEach((r,i)=>{
      const speed = (i%2 ? -1 : 1) * (0.6 + 0.1*level + i*0.05);
      const size = (i%2 ? 3 : 2);
      const kind = (i%2===0) ? 'turtles' : 'river';
      lanes.push(spawnLane(r, kind, speed, size, 5));
    });
    // Road rows: 8..13
    const roadRows = [8,9,10,11,12,13];
    roadRows.forEach((r,i)=>{
      const speed = (i%2 ? 1 : -1) * (0.9 + 0.12*level + i*0.07);
      lanes.push(spawnLane(r, 'road', speed, 1, 6));
    });
  }

  function spawnLane(row, kind, speed, size, density){
    const entities = [];
    for (let i=0; i<density; i++){
      const x = Math.floor((i * (COLS/density)) % COLS);
      const ent = { x, row, kind, size, speed };
      if (kind==='turtles'){
        ent.phase = Math.random()*Math.PI*2;
      }
      entities.push(ent);
    }
    return {row, kind, entities, speed, size};
  }

  function resetFrog(){
    frog = { col: Math.floor(COLS/2), row: START_ROW, onLog: null, alive:true };
    frog._carry = 0;
  }

  function resetLevel(){
    resetHomes();
    makeLanes();
    resetFrog();
    maxTime = Math.max(30, 45 - (level-1)*3);
    timeLeft = maxTime;
    fly = null;
  }

  function startGame(){
    initAudio();
    if (lives <= 0){
      level = 1; points = 0; lives = 3; hiscore = Number(localStorage.getItem('frogger.hiscore')||0);
    }
    resetLevel();
    running = true;
    paused = false;
    btnPlay.textContent = '▶︎ Restart';
    updateHud();
    beep(660,0.08);
  }

  function togglePause(){
    paused = !paused;
    btnPause.textContent = paused ? 'Riprendi' : 'Pausa';
  }

  btnPlay?.addEventListener('click', startGame);
  btnPause?.addEventListener('click', togglePause);

  function move(dir){
    if(!running || paused) return;
    beep(880,0.05);
    if (dir === 'up' && frog.row > 0) frog.row--;
    if (dir === 'down' && frog.row < START_ROW) frog.row++;
    if (dir === 'left' && frog.col > 0) frog.col--;
    if (dir === 'right' && frog.col < COLS-1) frog.col++;
    // Reached home row?
    if (frog.row === HOME_ROW){
      const slots = 5;
      const slotW = COLS / slots;
      const idx = Math.floor(frog.col / slotW);
      if (!homes.includes(idx)){
        // Crocodile check: if mouth open -> death
        let crocOpen = false;
        if (croc && croc.slot === idx){
          const mouth = Math.sin(croc.phase||0);
          crocOpen = mouth > 0.3; // threshold for open
        }
        if (crocOpen){ frogDies(); return; }
        // Safe to land
        homes.push(idx);
        points += 50;
        timeLeft = Math.min(timeLeft+10, 60);
        if (fly && fly.slot === idx){ points += 100; fly = null; }
        if (croc && croc.slot === idx){ croc = null; }
        // back to start
        frog.row = START_ROW; frog.col = Math.floor(COLS/2);
        if (homes.length >= 5){
          level++;
          points += 200;
          resetLevel();
        }
        updateHud();
      } else {
        frogDies();
      }
    }
  }

  document.querySelectorAll('.dir').forEach(btn=>{
    btn.addEventListener('click', e => move(e.currentTarget.dataset.dir));
  });

  let touchStart = null;
  const zone = document.getElementById('touchZone');
  zone.addEventListener('touchstart', e => {
    if (!running) startGame();
    initAudio();
    touchStart = {x:e.touches[0].clientX, y:e.touches[0].clientY};
  }, {passive:true});
  zone.addEventListener('touchend', e => {
    if(!touchStart) return;
    const dx = (e.changedTouches[0].clientX - touchStart.x);
    const dy = (e.changedTouches[0].clientY - touchStart.y);
    const ax = Math.abs(dx), ay = Math.abs(dy);
    if (Math.max(ax,ay) > 24){
      if (ax > ay) move(dx>0?'right':'left');
      else move(dy>0?'down':'up');
    }
    touchStart = null;
  }, {passive:true});

  window.addEventListener('keydown', e => {
    const k = e.key.toLowerCase();
    if (k==='arrowup' || k==='w') move('up');
    if (k==='arrowdown' || k==='s') move('down');
    if (k==='arrowleft' || k==='a') move('left');
    if (k==='arrowright' || k==='d') move('right');
    if (k===' ' || k==='enter') { if(!running) startGame(); else togglePause(); }
  });

  function frogDies(){
    if(!frog.alive) return;
    frog.alive = false;
    beep(180,0.2);
    lives--;
    if (lives <= 0){
      running = false;
      if (points > hiscore){ hiscore = points; localStorage.setItem('frogger.hiscore', String(hiscore)); }
      setTimeout(()=>{
        alert(`Game Over — Punti: ${points}  ·  Hi: ${hiscore}`);
        btnPlay.textContent = '▶︎ Play';
      }, 50);
    } else {
      setTimeout(()=>{ resetFrog(); }, 300);
    }
    updateHud();
  }

  function update(dt){
    // Move entities
    lanes.forEach(lane => {
      lane.entities.forEach(ent => {
        ent.x += ent.speed * dt;
        if (ent.x < -4) ent.x = COLS + 4;
        if (ent.x > COLS + 4) ent.x = -4;
      });
    });

    // Collisions
    frog.onLog = null;
    const fr = frog.row;

    // Road rows: car hit
    if (fr >= 8 && fr <= 13){
      const lane = lanes.find(l=>l.row===fr);
      if (lane){
        const hit = lane.entities.some(ent => {
          for (let i=0;i<ent.size;i++){
            const cx = Math.floor(ent.x+i);
            if (cx===frog.col) return true;
          }
          return false;
        });
        if (hit) frogDies();
      }
    }

    // River rows: logs or turtles (turtles occasionally submerge)
    if (fr >= 2 && fr <= 6){
      const lane = lanes.find(l=>l.row===fr);
      let on = false, carrySpeed = 0;
      if (lane){
        lane.entities.forEach(ent => {
          let visible = true;
          if (ent.kind==='turtles'){
            ent.phase += dt * 2.0;
            const s = Math.sin(ent.phase);
            visible = s > -0.7; // submerged for a short while
          }
          for (let i=0;i<ent.size;i++){
            const cx = Math.floor(ent.x+i);
            if (cx===frog.col && visible){ on = true; carrySpeed = lane.speed; }
          }
        });
      }
      if (!on){ frogDies(); }
      else {
        frog._carry = (frog._carry||0) + carrySpeed * dt;
        if (Math.abs(frog._carry) >= 1){
          const step = Math.sign(frog._carry);
          frog.col += step;
          frog._carry -= step;
          if (frog.col<0 || frog.col>=COLS) frogDies();
        }
      }
    }

    // Random moving bonus fly: travels between empty home slots
    const freeSlots = [0,1,2,3,4].filter(i=>!homes.includes(i));
    if (!fly && Math.random() < 0.002 && freeSlots.length){ 
      const start = freeSlots[Math.floor(Math.random()*freeSlots.length)];
      let targetChoices = freeSlots.filter(s=>s!==start);
      const target = targetChoices.length ? targetChoices[Math.floor(Math.random()*targetChoices.length)] : start;
      fly = { slot:start, target:target, p:0, speed:0.35 }; // p in [0,1]
    }
    if (fly){
      // If current target becomes filled, retarget
      if (homes.includes(fly.target)){
        const choices = [0,1,2,3,4].filter(s=>!homes.includes(s) && s!==fly.slot);
        if (choices.length) fly.target = choices[Math.floor(Math.random()*choices.length)];
      }
      // Interpolate
      fly.p += dt * fly.speed;
      if (fly.p >= 1){
        fly.slot = fly.target;
        fly.p = 0;
        const choices = [0,1,2,3,4].filter(s=>!homes.includes(s) && s!==fly.slot);
        if (choices.length){
          fly.target = choices[Math.floor(Math.random()*choices.length)];
        } else {
          // No other free slots: keep hovering or disappear after a while
          fly.target = fly.slot;
        }
      }
      // If all homes filled, remove fly
      if (freeSlots.length===0) fly = null;
    }

    // Crocodile spawn/animate/despawn (one at a time)
    if (!croc){
      if (Math.random() < 0.001 && freeSlots.length){
        const slot = freeSlots[Math.floor(Math.random()*freeSlots.length)];
        croc = { slot, phase: Math.random()*Math.PI*2, t: 8 + Math.random()*6 };
      }
    } else {
      // If home becomes filled, remove croc
      if (homes.includes(croc.slot)) croc = null;
      else {
        croc.phase += dt * 3.1415/1.0; // ~2s per cycle
        croc.t -= dt;
        if (croc.t <= 0) croc = null;
      }
    }
  }

  function rect(x,y,w,h, color){ ctx.fillStyle = color; ctx.fillRect(x,y,w,h); }
  function roundRect(x,y,w,h,r,color){
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(x+r, y);
    ctx.arcTo(x+w, y, x+w, y+h, r);
    ctx.arcTo(x+w, y+h, x, y+h, r);
    ctx.arcTo(x, y+h, x, y, r);
    ctx.arcTo(x, y, x+w, y, r);
    ctx.closePath();
    ctx.fill();
  }

  function drawBackground(){
    rect(0, 0, W, TILE*2, '#12224a');
    rect(0, TILE*2, W, TILE*5, '#0b245c');
    rect(0, TILE*7, W, TILE, '#10224e');
    rect(0, TILE*8, W, TILE*6, '#1b1b1b');
    rect(0, TILE*14, W, TILE, '#10224e');
    ctx.globalAlpha = 0.1;
    for (let r=0; r<ROWS; r++){ rect(0, r*TILE, W, 2, '#ffffff'); }
    ctx.globalAlpha = 1;

    const slots = 5, slotW = W/slots;
    for (let i=0;i<slots;i++){
      const cx = i*slotW + slotW/2;
      roundRect(cx - TILE*1, TILE*0.2, TILE*2, TILE*1.6, 6, '#0b1536');
    }
    // filled homes (green)
    homes.forEach(i=>{
      const slotW = W/5;
      const cx = i*slotW + slotW/2;
      roundRect(cx - TILE*1, TILE*0.2, TILE*2, TILE*1.6, 6, '#2dd36f');
    });

    // Fly bonus mark (moving between empty home slots)
    if (fly){
      const slotW = W/5;
      const cxA = fly.slot*slotW + slotW/2;
      const cxB = fly.target*slotW + slotW/2;
      const fx = cxA + (cxB - cxA) * (fly.p||0);
      const fy = TILE*0.95; 
      const s = Math.max(3, Math.floor(TILE*0.12));
      ctx.fillStyle = '#ffd166';
      ctx.beginPath();
      ctx.moveTo(fx, fy - s);
      ctx.lineTo(fx + s, fy);
      ctx.lineTo(fx, fy + s);
      ctx.lineTo(fx - s, fy);
      ctx.closePath();
      ctx.fill();
    }

    // Crocodile (home guard): green head, red mouth when open
    if (croc){
      const slotW = W/5;
      const cx = croc.slot*slotW + slotW/2;
      const x = cx - TILE*1;
      const y = TILE*0.2;
      const w = TILE*2;
      const h = TILE*1.6;
      // Head
      ctx.fillStyle = '#1aa94f';
      ctx.fillRect(x+2, y+2, w-4, h-4);
      // Mouth animation
      const open = Math.sin(croc.phase||0) > 0.3;
      ctx.fillStyle = open ? '#ff4d6d' : '#0b1536';
      const mh = open ? h*0.45 : h*0.12;
      ctx.fillRect(x+6, y+h*0.55, w-12, mh);
      // Eyes
      ctx.fillStyle = '#e9f1ff';
      ctx.fillRect(x+w*0.25, y+h*0.18, 6, 6);
      ctx.fillRect(x+w*0.65, y+h*0.18, 6, 6);
      ctx.fillStyle = '#0a1228';
      ctx.fillRect(x+w*0.25+2, y+h*0.18+2, 2, 2);
      ctx.fillRect(x+w*0.65+2, y+h*0.18+2, 2, 2);
    }
  }

  function drawEntities(){
    // Logs
    lanes.filter(l=>l.kind==='river').forEach(lane => {
      lane.entities.forEach(ent => {
        for (let i=0;i<ent.size;i++){
          const col = Math.floor(ent.x+i);
          roundRect(col*TILE+2, lane.row*TILE+6, TILE-4, TILE-12, 8, '#8b5a2b');
        }
      });
    });
    // Turtles
    lanes.filter(l=>l.kind==='turtles').forEach(lane => {
      lane.entities.forEach(ent => {
        const vis = Math.sin(ent.phase||0) > -0.7;
        for (let i=0;i<ent.size;i++){
          const col = Math.floor(ent.x+i);
          if (!vis) continue;
          roundRect(col*TILE+2, lane.row*TILE+10, TILE-4, TILE-20, 12, '#2dd36f');
        }
      });
    });
    // Cars
    lanes.filter(l=>l.kind==='road').forEach(lane => {
      lane.entities.forEach(ent => {
        for (let i=0;i<ent.size;i++){
          const col = Math.floor(ent.x+i);
          roundRect(col*TILE+3, lane.row*TILE+5, TILE-6, TILE-10, 8, '#ffd166');
          rect(col*TILE+10, lane.row*TILE+8, TILE-20, TILE-16, '#333');
        }
      });
    });
  }

  function drawFrog(){
    if (!frog) return;
    const x = frog.col*TILE;
    const y = frog.row*TILE;
    roundRect(x+4,y+4,TILE-8,TILE-8,8, frog.alive? '#2dd36f' : '#ff4d6d');
    ctx.fillStyle = '#0a1228';
    ctx.fillRect(x+TILE*0.45, y+TILE*0.28, 3,3);
    ctx.fillRect(x+TILE*0.60, y+TILE*0.28, 3,3);
  }

  function frame(ts){
    const dt = Math.min(0.04, (ts - lastTime)/1000 || 0);
    lastTime = ts;

    resize();
    ctx.clearRect(0,0,cvs.width,cvs.height);

    if (running && !paused){
      timeLeft -= dt;
      if (timeLeft <= 0){ frogDies(); timeLeft = maxTime; }
    }
    updateHud();

    drawBackground();
    if (running && !paused){ update(dt); }
    drawEntities();
    drawFrog();

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  // Initial state
  updateHud();
  resetLevel();
  running = false;
  paused = false;
})();