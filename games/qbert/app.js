// Q*bert Arcade Complete v2 — FINAL STABLE INPUT (isometric fix) — MIT © 2025 pezzaliAPP
(() => {
  'use strict';

  // === DOM ===
  const cvs = document.getElementById('game'), ctx = cvs.getContext('2d');
  const elScore = document.getElementById('score'),
        elLives = document.getElementById('lives'),
        elLevel = document.getElementById('level'),
        elStatus = document.getElementById('status');
  const btnStart = document.getElementById('btnStart'),
        btnMute  = document.getElementById('btnMute'),
        btnInfo  = document.getElementById('btnInfo');
  const help = document.getElementById('help'),
        helpClose = document.getElementById('helpClose');
  const selDiff = document.getElementById('difficulty');

  let ctl = {
    ul: document.getElementById('upLeft'),
    ur: document.getElementById('upRight'),
    dl: document.getElementById('downLeft'),
    dr: document.getElementById('downRight')
  };

  if (!cvs.hasAttribute('tabindex')) cvs.setAttribute('tabindex','0');
  const W = cvs.width, H = cvs.height;

  // === Scoring ===
  const SCORE_STEP = 25;
  const ROUND_BONUS = 1000;
  const COILY_BONUS = 500;
  const LIFE_BONUS  = 50;

  // === Audio/Vibrate ===
  const AC = window.AudioContext || window.webkitAudioContext;
  const audio = { ctx: null, muted: false };
  function initA(){ if(!audio.ctx && AC){ try{ audio.ctx = new AC(); }catch(_e){} } }
  function beep(f=440, d=.08, t='square', v=.05){
    if(audio.muted || !AC) return;
    initA(); const a = audio.ctx; if(!a) return;
    const g = a.createGain(); g.gain.value = v;
    const o = a.createOscillator(); o.type=t; o.frequency.value=f;
    o.connect(g); g.connect(a.destination);
    const T=a.currentTime; o.start(T); o.stop(T+d);
  }
  const vibrate = (p)=>{ try{ navigator.vibrate && navigator.vibrate(p);}catch(_e){} };
  btnMute?.addEventListener('click', () => {
    audio.muted = !audio.muted;
    btnMute.textContent = audio.muted ? '🔇' : '🔊';
    if(!audio.muted) initA();
  });
  btnInfo?.addEventListener('click', () => help.classList.remove('hidden'));
  helpClose?.addEventListener('click', () => help.classList.add('hidden'));

  // === State ===
  let state='menu', last=0, score=0, lives=3;
  let world = { level:1, round:1, steps:1, diff: (selDiff?.value || 'arcade') };

  // === Geometry ===
  const rows=7, tileW=32, tileH=18, startX=W/2, startY=70;
  function rcToXY(r,c){ const dx=(c-r/2)*tileW; const dy=r*tileH; return {x:startX+dx, y:startY+dy}; }

  // === Colors (start BLU) ===
  const colorSets = {
    1: ['#38bdf8', '#ff8b00'],
    2: ['#38bdf8', '#ffd24a', '#ff8b00'],
    3: ['#38bdf8', '#9cff4a', '#ffd24a', '#ff8b00']
  };
  function currentPalette(){ return colorSets[Math.min(3, world.steps)]; }

  // === Tiles ===
  let tiles = createTiles();
  function createTiles(){
    const a=[]; for(let r=0;r<rows;r++){ const row=[]; for(let c=0;c<=r;c++) row.push(0); a.push(row); }
    return a;
  }

  // === Player ===
  const player = { r:0,c:0,x:0,y:0,jumping:false,t:0,dur:.25,amp:10,from:{x:0,y:0},to:{x:0,y:0} };
  placePlayer(0,0);
  function placePlayer(r,c){ const p=rcToXY(r,c); player.r=r; player.c=c; player.x=p.x; player.y=p.y; player.t=0; player.jumping=false; }

  // === Enemies & Disks ===
  let enemies=[], redBallBudget=1, ballSpeed=0.55, coily=null, coilyTimer=6, coilySpeed=0.45;
  function spawnBall(){ const e={kind:'ball', r:Math.floor(Math.random()*2), c:0, t:0, x:0, y:0}; const p=rcToXY(e.r,e.c); e.x=p.x; e.y=p.y; enemies.push(e); }
  function ensureBalls(){ const want=Math.min(2, redBallBudget); const have=enemies.filter(e=>e.kind==='ball').length; for(let i=0;i<want-have;i++) spawnBall(); }
  function spawnCoily(){ if(coily) return; const p=rcToXY(0,0); coily={r:0,c:0,x:p.x,y:p.y,t:0}; elStatus.textContent='⚠️ Coily in caccia!'; }
  let disks=[];
  function resetDisks(){ const A=rcToXY(0,0); disks=[ {x:A.x-48,y:A.y-4,side:'L',active:true}, {x:A.x+48,y:A.y-4,side:'R',active:true} ]; }

  // === Difficulty ===
  function applyDifficulty(){
    const d=world.diff;
    if(d==='easy'){ redBallBudget=1; ballSpeed=0.65; coilySpeed=0.5; coilyTimer=7; }
    else if(d==='hard'){ redBallBudget=2; ballSpeed=0.45; coilySpeed=0.38; coilyTimer=5; }
    else { redBallBudget=1+Math.floor((world.level-1)/4); ballSpeed=0.55; coilySpeed=0.45; coilyTimer=6; } // arcade
  }
  selDiff?.addEventListener('change', () => {
    world.diff = selDiff.value;
    applyDifficulty();
    elStatus.textContent = 'Difficoltà: ' + selDiff.options[selDiff.selectedIndex].text;
  });

  // === Lifecycle ===
  function difficultyTune(){
    world.steps = Math.min(3, 1 + Math.floor((world.level-1)/3) + Math.floor((world.round-1)/2));
    applyDifficulty();
  }
  function resetLevel(){
    tiles=createTiles(); score=0; lives=3;
    world.level=1; world.round=1; world.steps=1; world.diff=(selDiff?.value||'arcade');
    enemies.length=0; coily=null; resetDisks(); placePlayer(0,0);
    difficultyTune(); ensureBalls(); updateHUD(); elStatus.textContent='Pronto!';
  }
  function nextRound(){
    score += ROUND_BONUS + (LIFE_BONUS * lives);
    world.round++; if(world.round>4){ world.round=1; world.level++; }
    if(world.level>9){ state='over'; elStatus.textContent='🎉 Hai completato tutti i livelli!'; updateHUD(); return; }
    tiles=createTiles(); resetDisks(); placePlayer(0,0);
    difficultyTune(); enemies.length=0; ensureBalls(); coily=null;
    updateHUD(); elStatus.textContent='✔ Round ' + world.level + '-' + world.round + ' completato!';
  }

  // === Move / Disks ===
  function rideDisk(side){
    const d = disks.find(x => x.active && x.side===side);
    if(!d){ fall(); return; }
    d.active=false; placePlayer(0,0);
    if(coily){ score+=COILY_BONUS; coily=null; beep(600,.25,'square',.05); vibrate([60,40,60]); updateHUD(); }
    elStatus.textContent='🛟 Disco!';
  }

  // >>>>>>>>>> ISOMETRIC FIX: calcolo nc corretto per ↖ ↗ ↙ ↘ <<<<<<<<<<
  function move(dr, side){
    if(player.jumping) return;
    const fromR=player.r, fromC=player.c;

    // mappa delle 4 direzioni nello spazio isometrico:
    // dr=-1,side=0 => (r-1,c-1)  ↖
    // dr=-1,side=1 => (r-1,c)    ↗
    // dr=+1,side=0 => (r+1,c)    ↙
    // dr=+1,side=1 => (r+1,c+1)  ↘
    const nr = fromR + dr;
    const nc = (dr < 0)
      ? fromC + (side ? 0 : -1)
      : fromC + (side ? 1 : 0);

    const off = (nr<0 || nr>=rows || nc<0 || nc>nr);
    if(off){
      // gestione dischi dall’apice (r=0,c=0): su-sinistra ⇒ L, su-destra ⇒ R
      if(fromR===0 && fromC===0 && dr===-1){
        if(side===0) return rideDisk('L');
        if(side===1) return rideDisk('R');
      }
      return fall();
    }

    const from=rcToXY(fromR,fromC), to=rcToXY(nr,nc);
    player.from=from; player.to=to; player.t=0; player.jumping=true;
    player.dur=.25; player.amp=dr<0?12:8; player.r=nr; player.c=nc;
    beep(1000,.05,'square',.04);
  }

  // === Game loop ===
  function fall(){ lives--; updateHUD(); beep(200,.25,'sawtooth',.06); vibrate(120); if(lives<=0){ gameOver(); return; } placePlayer(0,0); }
  function updateHUD(){ elScore.textContent=score; elLives.textContent=lives; elLevel.textContent=`${world.level}-${world.round}`; }
  function loop(now){ if(state!=='play') return; const dt=Math.min(.033,(now-last)/1000); last=now; update(dt); render(); requestAnimationFrame(loop); }

  function update(dt){
    if(!coily){ coilyTimer-=dt; if(coilyTimer<=0){ spawnCoily(); coilyTimer=(world.diff==='hard'?5:(world.diff==='easy'?7:6)); } }
    ensureBalls();

    // jump anim
    if(player.jumping){
      player.t += dt / player.dur;
      const k = Math.min(1, player.t);
      const arc = Math.sin(Math.PI*k)*player.amp;
      player.x = player.from.x + (player.to.x - player.from.x)*k;
      player.y = player.from.y + (player.to.y - player.from.y)*k - arc;
      if(k>=1){
        player.jumping=false;
        const pal=currentPalette(); const maxIdx=pal.length-1;
        const v=tiles[player.r][player.c];
        if(v<maxIdx){ tiles[player.r][player.c]=v+1; score+=SCORE_STEP; updateHUD(); beep(800,.06,'triangle',.05); }

        // magnete dischi
        for(const d of disks){
          if(d.active && Math.hypot(player.x-d.x, player.y-d.y) < 28){
            d.active=false; placePlayer(0,0);
            if(coily){ score+=COILY_BONUS; coily=null; beep(600,.25,'square',.05); vibrate([60,40,60]); updateHUD(); }
            elStatus.textContent='🛟 Disco!';
          }
        }

        // fine round?
        let done=true; for(let r=0;r<rows;r++){ for(let c=0;c<=r;c++){ if(tiles[r][c]!==maxIdx){ done=false; break; } } if(!done) break; }
        if(done) nextRound();
      }
    }

    // sfere
    for(let i=enemies.length-1;i>=0;i--){
      const e=enemies[i]; e.t+=dt;
      if(e.t>ballSpeed){
        e.t=0; const dir=Math.random()<.5?0:1;
        let nr=e.r+1, nc=e.c+(dir?1:0);
        if(nr>=rows){ enemies.splice(i,1); continue; }
        e.r=nr; e.c=nc; const p=rcToXY(nr,nc); e.x=p.x; e.y=p.y;
      }
      if(!player.jumping && Math.abs(e.x-player.x)<14 && Math.abs(e.y-player.y)<10){
        lives--; updateHUD(); beep(120,.2,'sawtooth',.06); vibrate(120);
        if(lives<=0){ gameOver(); return; } placePlayer(0,0);
      }
    }

    // coily
    if(coily){
      coily.t+=dt;
      if(coily.t>coilySpeed){
        coily.t=0;
        const dr = player.r>coily.r ? 1 : -1;
        const dc = (dr<0) ? (player.c<coily.c?0:1) : (player.c>coily.c?1:0);
        const nr=coily.r+dr, nc=coily.c+dc;
        if(nr<0||nc<0||nc>nr||nr>=rows){
          score+=300; updateHUD(); coily=null; elStatus.textContent='🐍 Coily fuori!'; beep(700,.25,'triangle',.06); vibrate([80,40,80]);
        } else {
          const p=rcToXY(nr,nc); coily.r=nr; coily.c=nc; coily.x=p.x; coily.y=p.y;
        }
      }
      if(!player.jumping && Math.abs(coily.x-player.x)<14 && Math.abs(coily.y-player.y)<10){
        lives--; updateHUD(); beep(100,.25,'sawtooth',.06); vibrate(160);
        if(lives<=0){ gameOver(); return; } placePlayer(0,0);
      }
    }
  }

  function render(){
    ctx.fillStyle='#000'; ctx.fillRect(0,0,W,H);
    // starfield
    ctx.fillStyle='#13213f';
    for(let i=0;i<60;i++){ const sx=(i*37)%W, sy=(i*79 + (performance.now()/25))%H; ctx.fillRect(sx,sy,1,1); }
    const pal=currentPalette();
    for(let r=rows-1;r>=0;r--){
      for(let c=0;c<=r;c++){
        const p=rcToXY(r,c), idx=tiles[r][c];
        const top=pal[Math.min(idx,pal.length-1)];
        drawCube(p.x,p.y,top);
      }
    }
    disks.forEach(d=>{ if(d.active) drawDisk(d.x,d.y); });
    enemies.forEach(e=>drawBall(e.x,e.y,'#ff5d8f'));
    if(coily) drawCoily(coily.x,coily.y);
    drawQbert(player.x, player.y);
  }

  // === Draw helpers ===
  function drawCube(cx,cy,top){ const w=32,h=18;
    ctx.fillStyle=top; ctx.beginPath(); ctx.moveTo(cx,cy-h); ctx.lineTo(cx+w/2,cy); ctx.lineTo(cx,cy+h); ctx.lineTo(cx-w/2,cy); ctx.closePath(); ctx.fill();
    ctx.fillStyle=shade(top,-30); ctx.beginPath(); ctx.moveTo(cx-w/2,cy); ctx.lineTo(cx,cy+h); ctx.lineTo(cx,cy+h+h); ctx.lineTo(cx-w/2,cy+h); ctx.closePath(); ctx.fill();
    ctx.fillStyle=shade(top,-50); ctx.beginPath(); ctx.moveTo(cx+w/2,cy); ctx.lineTo(cx,cy+h); ctx.lineTo(cx,cy+h+h); ctx.lineTo(cx+w/2,cy+h); ctx.closePath(); ctx.fill();
  }
  function shade(hex,amt){ const c=parseInt(hex.slice(1),16); let r=(c>>16)+amt,g=((c>>8)&255)+amt,b=(c&255)+amt;
    r=Math.max(0,Math.min(255,r)); g=Math.max(0,Math.min(255,g)); b=Math.max(0,Math.min(255,b));
    return '#'+(r<<16|g<<8|b).toString(16).padStart(6,'0');
  }
  function drawBall(x,y,color){ ctx.fillStyle=color; ctx.beginPath(); ctx.arc(x,y-6,6,0,Math.PI*2); ctx.fill(); }
  function drawDisk(x,y){ ctx.fillStyle='#65f0ff'; ctx.beginPath(); ctx.arc(x,y,7,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#1c2a55'; ctx.beginPath(); ctx.arc(x,y,4,0,Math.PI*2); ctx.fill(); }
  function drawQbert(x,y){
    ctx.fillStyle='#ff7f2a'; ctx.beginPath(); ctx.arc(x,y-8,7,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#ff9a56'; ctx.beginPath(); ctx.ellipse(x+6,y-8,5,3,0,0,Math.PI*2); ctx.fill();
    ctx.fillStyle='#000'; ctx.fillRect(x-4,y-12,2,2); ctx.fillRect(x-1,y-12,2,2);
    ctx.fillStyle='#ff7f2a'; ctx.fillRect(x-3,y-4,2,4); ctx.fillRect(x+1,y-4,2,4);
  }
  function drawCoily(x,y){
    ctx.fillStyle='#b26cff'; ctx.beginPath(); ctx.arc(x,y-5,6,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle='#7f44cc'; ctx.beginPath(); ctx.moveTo(x,y); for(let i=1;i<=4;i++){ ctx.lineTo(x+(i%2?4:-4), y+i*5); } ctx.stroke();
  }

  // === Keyboard input (↖ ↗ ↙ ↘ + Start/Pause) ===
  function isLU(e){ return e.code==='ArrowLeft' || e.code==='KeyQ' || e.code==='Numpad7' || e.key==='ArrowLeft'; } // ↖
  function isRU(e){ return e.code==='ArrowUp'   || e.code==='KeyW' || e.code==='Numpad9' || e.key==='ArrowUp'; }   // ↗
  function isRD(e){ return e.code==='ArrowRight'|| e.code==='KeyS' || e.code==='Numpad3' || e.key==='ArrowRight'; }// ↘
  function isLD(e){ return e.code==='ArrowDown' || e.code==='KeyA' || e.code==='Numpad1' || e.key==='ArrowDown'; } // ↙
  function isStart(e){ return e.code==='Space' || e.code==='Enter' || e.key===' ' || e.key==='Enter'; }
  function isPause(e){ return e.code==='KeyP' || e.key==='p' || e.key==='P'; }

  function keyHandler(e){
    if (isStart(e) || isPause(e) || isLU(e) || isRU(e) || isLD(e) || isRD(e)) e.preventDefault();
    if (isStart(e)) { if(state!=='play') start(); else togglePause(); return; }
    if (isPause(e)) { if(state==='play'||state==='paused') togglePause(); return; }

    if (state!=='play'){ // avvio anche con prima freccia
      if (isLU(e)||isRU(e)||isLD(e)||isRD(e)) { start(); }
      return;
    }
    if (player.jumping) return;

    if (isLU(e)) return move(-1,0);
    if (isRU(e)) return move(-1,1);
    if (isLD(e)) return move( 1,0);
    if (isRD(e)) return move( 1,1);
  }
  window.addEventListener('keydown', keyHandler, {capture:true});

  // === Touch/Pointer: binding esplicito ===
  function secureBind(el, fn){
    if(!el) return;
    const h = (ev)=>{
      try{
        ev.preventDefault();
        ev.stopPropagation();
        ev.stopImmediatePropagation?.();
        if (ev.type==='pointerdown' && el.setPointerCapture && ev.pointerId!=null){
          try{ el.setPointerCapture(ev.pointerId); }catch(_){}
        }
      }catch(_){}
      if(state!=='play'){ start(); return; }
      fn();
    };
    ['pointerdown','touchstart','mousedown','click'].forEach(evt=>{
      try{ el.addEventListener(evt, h, {passive:false, capture:true}); }catch(_){ el.addEventListener(evt, h, true); }
    });
  }

  function sanitizeControls(){
    function replaceById(id){
      const n = document.getElementById(id);
      if (!n || !n.parentNode) return n;
      const fresh = n.cloneNode(true);
      n.parentNode.replaceChild(fresh, n);
      return fresh;
    }
    ctl.ul = replaceById('upLeft');
    ctl.ur = replaceById('upRight');
    ctl.dl = replaceById('downLeft');
    ctl.dr = replaceById('downRight');

    [ctl.ul,ctl.ur,ctl.dl,ctl.dr].forEach(b=>{
      if(!b) return;
      try {
        b.style.pointerEvents = 'auto';
        b.style.touchAction = 'manipulation';
        b.style.webkitTapHighlightColor = 'rgba(0,0,0,0)';
        b.style.userSelect = 'none'; b.style.webkitUserSelect = 'none';
      } catch(_) {}
    });

    secureBind(ctl.ul, ()=>move(-1,0)); // ↖ (ora va davvero su-sinistra)
    secureBind(ctl.ur, ()=>move(-1,1)); // ↗
    secureBind(ctl.dl, ()=>move( 1,0)); // ↙
    secureBind(ctl.dr, ()=>move( 1,1)); // ↘
  }
  sanitizeControls();

  // Start/Pausa sempre attivo
  if (btnStart){
    const sh = (ev)=>{ try{ ev.preventDefault(); ev.stopPropagation(); ev.stopImmediatePropagation?.(); }catch(_e){} if(state!=='play') start(); else togglePause(); };
    ['pointerdown','touchstart','mousedown','click'].forEach(evt=>{
      try{ btnStart.addEventListener(evt, sh, {passive:false, capture:true}); }catch(_e){ btnStart.addEventListener(evt, sh, true); }
    });
  }

  // Auto-start alla prima interazione
  (function(){
    let armed = true;
    function boot(ev){
      if(!armed) return;
      armed=false;
      try{ ev && ev.preventDefault && ev.preventDefault(); }catch(_e){}
      if(state!=='play') start();
      ['pointerdown','touchstart','mousedown','click'].forEach(evt=>{
        try{ document.removeEventListener(evt, boot, true); }catch(_e){}
      });
    }
    ['pointerdown','touchstart','mousedown','click'].forEach(evt=>{
      try{ document.addEventListener(evt, boot, true); }catch(_e){ document.addEventListener(evt, boot, false); }
    });
  })();

  // === Start/Pause/Over ===
  function start(){
    state='play';
    resetLevel();
    last = performance.now();
    try{ cvs.focus(); }catch(_e){}
    elStatus.textContent = '';
    requestAnimationFrame(loop);
  }
  function togglePause(){
    if(state==='play'){ state='paused'; elStatus.textContent='⏸ Pausa'; }
    else if(state==='paused'){ state='play'; elStatus.textContent=''; last=performance.now(); requestAnimationFrame(loop); }
  }
  function gameOver(){ state='over'; elStatus.textContent='💀 Game Over — premi Gioca per ripartire'; }

  // === Init UI ===
  elStatus.textContent = 'Premi “Gioca” per iniziare';
})();
