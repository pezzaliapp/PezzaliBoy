// GalagaPWA — tributo didattico (MIT) © 2025 pezzaliAPP
(() => {
  'use strict';

  // Canvas
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');

  // HUD
  const elScore = document.getElementById('score');
  const elLives = document.getElementById('lives');
  const elWave = document.getElementById('wave');
  const elStatus = document.getElementById('status');

  // UI
  const menu = document.getElementById('menu');
  const btnStart = document.getElementById('btnStart');
  const btnMute = document.getElementById('btnMute');
  const touch = {
    left: document.getElementById('left'),
    right: document.getElementById('right'),
    fire: document.getElementById('fire'),
    activeLeft: false,
    activeRight: false,
    activeFire: false
  };

  // Dimensions (internal logical size matches classic vertical monitor)
  const W = 224, H = 288;

  // Game State
  let state = 'menu'; // 'menu' | 'play' | 'paused' | 'gameover'
  let last = 0;
  let acc = 0;
  let score = 0;
  let lives = 3;
  let wave = 1;

  // Player
  const player = {
    x: W/2, y: H-20, w: 14, h: 8, speed: 80, cooldown: 0, reload: 0.25
  };
  const bullets = [];
  const eBullets = [];
  let enemies = [];
  let dir = 1; // formation direction
  let formationOffset = 0;
  let formationTime = 0;
  let nextDive = 2;

  // Audio (WebAudio simple beeps)
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  const audio = {
    ctx: null,
    muted: false
  };
  function initAudio() {
    if (!audio.ctx) audio.ctx = new AudioCtx();
  }
  function beep(freq=440, dur=0.08, type='square', vol=0.05){
    if (audio.muted) return;
    if (!audio.ctx) initAudio();
    const ctxA = audio.ctx;
    const t = ctxA.currentTime;
    const o = ctxA.createOscillator();
    const g = ctxA.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(ctxA.destination);
    o.start(t);
    o.stop(t + dur);
  }

  // Helpers
  const clamp = (v,min,max)=>Math.max(min,Math.min(max,v));
  const rnd = (a,b)=>Math.random()*(b-a)+a;
  function aabb(a,b){ return Math.abs(a.x-b.x) < (a.w+b.w)/2 && Math.abs(a.y-b.y) < (a.h+b.h)/2; }

  // Input
  const keys = {};
  window.addEventListener('keydown', e => {
    if (e.repeat) return;
    keys[e.code] = true;
    if (state === 'menu' && (e.code==='Space' || e.code==='Enter')) start();
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'Space' || e.code === 'Enter') fire();
  });
  window.addEventListener('keyup', e => keys[e.code] = false);

  // Touch controls
  function bindHold(btn, setFlag){
    const start = e => { e.preventDefault(); setFlag(true); };
    const end   = e => { e.preventDefault(); setFlag(false); };
    btn.addEventListener('touchstart', start, {passive:false});
    btn.addEventListener('touchend', end, {passive:false});
    btn.addEventListener('mousedown', start);
    btn.addEventListener('mouseup', end);
    btn.addEventListener('mouseleave', end);
  }
  bindHold(touch.left, v => touch.activeLeft = v);
  bindHold(touch.right, v => touch.activeRight = v);
  bindHold(touch.fire, v => touch.activeFire = v);

  // Drag to move
  let dragging = false;
  cvs.addEventListener('touchstart', e => { dragging = true; });
  cvs.addEventListener('touchend', e => { dragging = false; });
  cvs.addEventListener('touchmove', e => {
    if (!dragging) return;
    const rect = cvs.getBoundingClientRect();
    const x = e.touches[0].clientX - rect.left;
    // map to canvas coords
    const scaledX = x * (W / rect.width);
    player.x = clamp(scaledX, 12, W-12);
  }, {passive:true});

  // Buttons
  btnStart?.addEventListener('click', start);
  btnMute?.addEventListener('click', () => {
    audio.muted = !audio.muted;
    btnMute.textContent = audio.muted ? '🔇' : '🔊';
    if (!audio.muted) initAudio();
  });

  // Resize canvas responsively (CSS handles size; canvas internal stays classic)
  function fitCanvas(){
    // Nothing needed; logical size is fixed; CSS aspect-ratio keeps it scaled.
  }
  window.addEventListener('resize', fitCanvas);
  fitCanvas();

  // Game flow
  function start(){
    state = 'play';
    menu.classList.remove('show');
    score = 0; lives = 3; wave = 1;
    spawnWave();
    elScore.textContent = score;
    elLives.textContent = lives;
    elWave.textContent = wave;
    elStatus.textContent = 'Pronto!';
    last = performance.now();
    requestAnimationFrame(loop);
    beep(880,.1,'square',.03);
  }
  function togglePause(){
    if (state === 'play'){ state = 'paused'; elStatus.textContent = '⏸ Pausa'; }
    else if (state === 'paused'){ state = 'play'; elStatus.textContent = ''; last = performance.now(); requestAnimationFrame(loop); }
  }
  function gameOver(){
    state = 'gameover';
    elStatus.textContent = '💀 Game Over — premi Spazio/Invio per ripartire';
    menu.classList.add('show');
    btnStart.textContent = 'Rigioca';
  }

  function spawnWave(){
    enemies.length = 0;
    const cols = 10, rows = 5;
    const startX = 24, startY = 40;
    const gapX = 16, gapY = 14;
    for (let r=0;r<rows;r++){
      for (let c=0;c<cols;c++){
        enemies.push({
          x: startX + c*gapX,
          y: startY + r*gapY,
          w: 12, h: 8,
          row: r, col: c,
          mode: 'formation', t: 0, // 'formation' | 'dive' | 'return'
          hp: (r<2?1:2), // front weak, back stronger
          vy: 0,
        });
      }
    }
    dir = 1;
    formationOffset = 0;
    formationTime = 0;
    nextDive = 1.5;
  }

  function fire(){
    if (state!=='play') return;
    if (player.cooldown>0) return;
    bullets.push({x:player.x, y:player.y-8, w:2, h:6, vy:-180});
    player.cooldown = player.reload;
    beep(1200,.06,'square',.03);
  }

  function enemyFire(e){
    eBullets.push({x:e.x, y:e.y+6, w:2, h:6, vy:100});
    beep(300,.06,'square',.02);
  }

  // Update & Render
  function loop(now){
    if (state!=='play') return;
    const dt = Math.min(0.033, (now-last)/1000);
    last = now;

    update(dt);
    render();

    requestAnimationFrame(loop);
  }

  function update(dt){
    // cooldowns
    player.cooldown = Math.max(0, player.cooldown - dt);

    // input horiz
    let vx = 0;
    if (keys.ArrowLeft || keys.KeyA || touch.activeLeft) vx -= 1;
    if (keys.ArrowRight || keys.KeyD || touch.activeRight) vx += 1;
    player.x = clamp(player.x + vx * player.speed * dt, 12, W-12);
    if (keys.Space || keys.Enter || touch.activeFire) fire();

    // bullets
    for (let i=bullets.length-1;i>=0;i--){
      const b = bullets[i];
      b.y += b.vy*dt;
      if (b.y < -10) bullets.splice(i,1);
    }
    for (let i=eBullets.length-1;i>=0;i--){
      const b = eBullets[i];
      b.y += b.vy*dt;
      if (b.y > H+10) eBullets.splice(i,1);
    }

    // Formation motion
    formationTime += dt;
    formationOffset += dir * 20 * dt;
    if (formationOffset > 18 || formationOffset < -18) dir *= -1;

    // Enemy update
    nextDive -= dt;
    if (nextDive <= 0 && enemies.length){
      // pick a random bottom-row enemy in formation to dive
      const candidates = enemies.filter(e=>e.mode==='formation')
        .sort((a,b)=>b.row-a.row); // prefer lower rows
      if (candidates.length){
        const e = candidates[Math.floor(Math.random()*Math.min(6,candidates.length))];
        e.mode = 'dive'; e.t = 0;
      }
      nextDive = rnd(1.2, 2.5);
    }

    for (let i=enemies.length-1;i>=0;i--){
      const e = enemies[i];
      e.t += dt;
      if (e.mode === 'formation'){
        // base position + sine wave
        const baseX = e.col*16 + 24;
        const baseY = e.row*14 + 40;
        e.x = baseX + formationOffset + Math.sin(formationTime*1.5 + e.col*0.6)*3;
        e.y = baseY + Math.sin(formationTime*2.2 + e.row*0.8)*2;
        // occasionally shoot
        if (Math.random() < 0.0015 + wave*0.0003 && e.row === 4) enemyFire(e);
      } else if (e.mode === 'dive'){
        // parametric swoop
        const p = e.t;
        e.x += Math.sin(p*4) * 28 * dt * (Math.random()<.5?1:-1);
        e.y += 60 * dt + Math.sin(p*3)*8*dt;
        if (e.y > H*0.75 && Math.random()<0.02) enemyFire(e);
        if (e.y > H+12){ e.mode='return'; e.t=0; e.y = -8; e.x = Math.random()* (W-40) + 20; }
      } else if (e.mode === 'return'){
        // go back to formation area
        e.y += 80*dt;
        if (e.y > 40 + e.row*14){ e.mode='formation'; e.t=0; }
      }

      // collisions with player bullets
      for (let j=bullets.length-1;j>=0;j--){
        const b = bullets[j];
        if (Math.abs(b.x - e.x) < (e.w/2 + b.w/2) && Math.abs(b.y - e.y) < (e.h/2 + b.h/2)){
          bullets.splice(j,1);
          e.hp -= 1;
          if (e.hp<=0){
            enemies.splice(i,1);
            score += 50 + (4-e.row)*10;
            elScore.textContent = score;
            beep(900,.06,'sawtooth',.04);
          } else {
            beep(600,.05,'triangle',.03);
          }
          break;
        }
      }
    }

    // enemy bullets vs player
    for (let i=eBullets.length-1;i>=0;i--){
      const b = eBullets[i];
      if (Math.abs(b.x - player.x) < (player.w/2 + b.w/2) && Math.abs(b.y - player.y) < (player.h/2 + b.h/2)){
        eBullets.splice(i,1);
        lives -= 1; elLives.textContent = lives;
        beep(200,.2,'sawtooth',.05);
        player.x = W/2;
        if (lives<=0){ gameOver(); return; }
      }
    }

    // Win wave
    if (!enemies.length){
      wave += 1; elWave.textContent = wave;
      elStatus.textContent = '✔ Wave cleared!';
      spawnWave();
      // increase difficulty slightly
      player.reload = Math.max(0.18, player.reload*0.98);
    }
  }

  function render(){
    // clear
    ctx.fillStyle = '#000';
    ctx.fillRect(0,0,W,H);

    // stars
    ctx.fillStyle = '#1c2a40';
    for (let i=0;i<80;i++){
      const sx = (i*47 % W);
      const sy = (i*89 + (performance.now()/20)) % H;
      ctx.fillRect(sx, sy, 1, 1);
    }

    // player ship
    drawShip(player.x, player.y, '#7fffd4');

    // bullets
    ctx.fillStyle='#aef';
    bullets.forEach(b=> ctx.fillRect(b.x-1, b.y-3, 2, 6));
    ctx.fillStyle='#ff8080';
    eBullets.forEach(b=> ctx.fillRect(b.x-1, b.y-3, 2, 6));

    // enemies
    enemies.forEach(e=> drawEnemy(e));
  }

  function drawShip(x,y,color){
    ctx.fillStyle = color;
    // simple sprite
    ctx.fillRect(x-1, y-4, 2, 8);
    ctx.fillRect(x-5, y-3, 10, 2);
    ctx.fillRect(x-4, y-2, 8, 2);
    ctx.fillRect(x-3, y-1, 6, 2);
  }

  function drawEnemy(e){
    // color by row
    let color = '#7aa0ff';
    if (e.row<=1) color = '#ffdd57';
    if (e.row===4) color = '#ff6ea6';
    ctx.fillStyle = color;
    // simple bug-like sprite
    ctx.fillRect(e.x-5, e.y-2, 10, 4);
    ctx.fillRect(e.x-3, e.y-4, 6, 2);
    ctx.fillRect(e.x-3, e.y+2, 6, 2);
    // eyes
    ctx.fillStyle='#111';
    ctx.fillRect(e.x-2, e.y-1, 1,1);
    ctx.fillRect(e.x+1, e.y-1, 1,1);
  }

  // Kick off in menu; show a gentle message
  elStatus.textContent = 'Premi Gioca per iniziare';

})();