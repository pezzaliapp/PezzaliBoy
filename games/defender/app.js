/* Defender — Tribute PWA v2 (MIT) — pezzaliAPP
   - D-Pad touch (sx) + FIRE/MISSILE (dx)
   - WebAudio effects (laser, explosion, pickup, missile)
*/
(() => {
  'use strict';

  // Canvas & HUD
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;
  const hud = {
    score: document.getElementById('score'),
    lives: document.getElementById('lives'),
    humans: document.getElementById('humans'),
    level: document.getElementById('level'),
    fps: document.getElementById('fps')
  };
  const btnPause = document.getElementById('btnPause');
  const btnRestart = document.getElementById('btnRestart');

  // World
  const WORLD = { width: 8000, groundY: H-60, gravity: 0.24, starCount: 120 };

  // Helpers
  const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
  const rnd = (a,b)=>Math.random()*(b-a)+a;
  const choice = (arr)=>arr[(Math.random()*arr.length)|0];

  // Input
  const input = { left:false, right:false, up:false, down:false, fire:false, bomb:false };
  const keymap = {
    ArrowLeft:'left', ArrowRight:'right', ArrowUp:'up', ArrowDown:'down',
    'a':'left','d':'right','w':'up','s':'down',
    'x':'bomb','X':'bomb',
    ' ':'fire' // SPACE = FIRE
  };
  window.addEventListener('keydown', e=>{
    if(e.repeat) return;
    const k = keymap[e.key];
    if(k){ input[k]=true; e.preventDefault(); }
    if(e.key==='p'||e.key==='P'){ togglePause(); }
  });
  window.addEventListener('keyup', e=>{
    const k = keymap[e.key];
    if(k){ input[k]=false; e.preventDefault(); }
  });

  // Touch (D-Pad left + Buttons right)
  const dkeys = document.querySelectorAll('.dkey');
  dkeys.forEach(el=>{
    const k = el.getAttribute('data-hold');
    const on = (v)=>{ input[k]=v; };
    el.addEventListener('touchstart', e=>{ on(true); e.preventDefault(); }, {passive:false});
    el.addEventListener('touchend', e=>{ on(false); e.preventDefault(); }, {passive:false});
    el.addEventListener('touchcancel', e=>{ on(false); }, {passive:false});
  });
  document.querySelectorAll('[data-tap]').forEach(el=>{
    const k = el.getAttribute('data-tap');
    el.addEventListener('touchstart', e=>{ input[k]=true; setTimeout(()=>input[k]=false,60); unlockAudio(); e.preventDefault(); }, {passive:false});
  });

  btnPause.addEventListener('click', ()=>togglePause());
  btnRestart.addEventListener('click', ()=>restart());

  // -------- WebAudio --------
  let AC, masterGain;
  function unlockAudio(){
    if(AC) return;
    AC = new (window.AudioContext || window.webkitAudioContext)();
    masterGain = AC.createGain();
    masterGain.gain.value = 0.3;
    masterGain.connect(AC.destination);
  }
  function tone(type, freq, dur=0.08, vol=0.3){
    if(!AC) return;
    const o = AC.createOscillator();
    const g = AC.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.value = vol;
    o.connect(g); g.connect(masterGain);
    const t = AC.currentTime;
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t+dur);
    o.start(t); o.stop(t+dur+0.02);
  }
  function noiseExplosion(){
    if(!AC) return;
    const bufferSize = AC.sampleRate * 0.2;
    const buffer = AC.createBuffer(1, bufferSize, AC.sampleRate);
    const data = buffer.getChannelData(0);
    for(let i=0;i<bufferSize;i++){ data[i] = (Math.random()*2-1) * Math.exp(-i/ (AC.sampleRate*0.12)); }
    const src = AC.createBufferSource(); src.buffer = buffer;
    const g = AC.createGain(); g.gain.value = 0.5;
    src.connect(g); g.connect(masterGain); src.start();
  }
  const SFX = {
    fire: ()=>{ unlockAudio(); tone('square', 880, 0.05, 0.35); tone('square', 660, 0.07, 0.25); },
    hit: ()=>{ unlockAudio(); tone('sawtooth', 200, 0.06, 0.35); },
    boom: ()=>{ unlockAudio(); noiseExplosion(); },
    rescue: ()=>{ unlockAudio(); tone('triangle', 1320, 0.07, 0.3); tone('triangle', 1760, 0.07, 0.25); },
    smart: ()=>{ unlockAudio(); tone('sine', 400, 0.12, 0.35); }
  };

  // Entities
  class Ship {
    constructor(){ this.x=200; this.y=H/2; this.vx=0; this.vy=0; this.dir=1; this.cool=0; this.speed=0.65; this.maxV=6.4; }
    update(){
      if(input.left){ this.vx-=this.speed; this.dir=-1; }
      if(input.right){ this.vx+=this.speed; this.dir=1; }
      if(input.up){ this.vy-=this.speed*1.2; }
      if(input.down){ this.vy+=this.speed*1.2; }
      this.vx*=0.985; this.vy*=0.985;
      this.vx=clamp(this.vx,-this.maxV,this.maxV); this.vy=clamp(this.vy,-this.maxV,this.maxV);
      this.x=(this.x+this.vx+WORLD.width)%WORLD.width;
      this.y=clamp(this.y+this.vy,40,WORLD.groundY-16);
      if(this.cool>0) this.cool--;
      if(input.fire && this.cool===0){
        bullets.push(new Bullet(this.x+this.dir*18, this.y-2, this.dir*12, 0));
        this.cool=6; spawnFlash(this.x+this.dir*20, this.y-2); SFX.fire();
      }
      if(input.bomb && state.bombs>0 && !state.bombFlash){
        state.bombs--; state.score+=50; bombExplode(this.x,this.y); SFX.smart();
      }
    }
    draw(camx){
      const x=this.x-camx;
      ctx.save(); ctx.translate(x,this.y); ctx.rotate(this.vy*0.02*this.dir);
      ctx.fillStyle='#49f3ff'; ctx.beginPath(); ctx.moveTo(16*this.dir,0); ctx.lineTo(-12*this.dir,-7); ctx.lineTo(-12*this.dir,7); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#ffd24d'; ctx.fillRect(-10*this.dir,-2,6*this.dir,4);
      ctx.fillStyle = '#ff3b58'; ctx.fillRect(-13*this.dir,-2,-4*this.dir,4);
      ctx.restore();
    }
  }
  class Bullet{ constructor(x,y,vx,vy){ this.x=x; this.y=y; this.vx=vx; this.vy=vy; this.t=0; } update(){ this.x=(this.x+this.vx+WORLD.width)%WORLD.width; this.y+=this.vy; this.t++; if(this.y<0||this.y>H) this.t=9999; } draw(camx){ const x=this.x-camx; ctx.fillStyle='#fff'; ctx.fillRect(x-2,this.y-1,4,2);} }
  class Enemy{
    constructor(x,y,type='lander'){ this.x=x; this.y=y; this.vx=rnd(-0.6,0.6); this.vy=rnd(-0.4,0.4); this.type=type; this.hp=(type==='lander'?1:2); this.target=null; this.carry=null; }
    update(){
      if(this.type==='lander'){
        if(!this.carry && Math.random()<0.003 && humanoids.length){ this.target = choice(humanoids.filter(h=>!h.abducted && h.alive)); }
        if(this.carry){ this.vy=-0.7; if(this.y<80){ this.carry.alive=false; this.carry=null; state.lives--; spawnText('UMANOIDE PERSO', this.x, 80, '#ff3b58'); SFX.hit(); } }
        else if(this.target && !this.target.abducted && this.target.alive){
          const dx=this.target.x-this.x, dy=this.target.y-this.y; this.vx+=Math.sign(dx)*0.04; this.vy+=Math.sign(dy)*0.04;
          if(Math.abs(dx)<8 && Math.abs(dy)<8){ this.carry=this.target; this.carry.abducted=true; }
        } else { this.vx+=rnd(-0.05,0.05); this.vy+=rnd(-0.05,0.05); }
      }
      this.vx=clamp(this.vx,-1.2,1.2); this.vy=clamp(this.vy,-1,1);
      this.x=(this.x+this.vx+WORLD.width)%WORLD.width; this.y=clamp(this.y+this.vy,40,WORLD.groundY-24);
      if(this.carry){ this.carry.x=this.x; this.carry.y=this.y+8; }
    }
    draw(camx){ const x=this.x-camx; ctx.save(); ctx.translate(x,this.y); ctx.fillStyle=(this.type==='lander')?'#ff7ab3':'#ffa64d'; ctx.beginPath(); ctx.arc(0,0,8,0,Math.PI*2); ctx.fill(); ctx.fillStyle='#000'; ctx.fillRect(-3,-2,2,2); ctx.fillRect(1,-2,2,2); ctx.restore(); }
    hit(){ this.hp--; spawnFlash(this.x,this.y); if(this.hp<=0){ this.dead=true; state.score+=100; if(this.carry){ this.carry.abducted=false; } spawnText('+100', this.x, this.y-12, '#49ffa1'); SFX.boom(); } else { SFX.hit(); } }
  }
  class Humanoid{
    constructor(x){ this.x=x; this.y=WORLD.groundY-10; this.alive=true; this.abducted=false; }
    update(){ if(distance(this, ship)<14 && !this.abducted){ this.alive=false; state.score+=200; state.rescued++; spawnText('SALVATO +200', this.x, this.y-16, '#49ffa1'); SFX.rescue(); } }
    draw(camx){ if(!this.alive) return; const x=this.x-camx; ctx.fillStyle=this.abducted?'#ffd24d':'#d0e3ff'; ctx.fillRect(x-2,this.y-6,4,6); ctx.fillRect(x-3,this.y-2,6,2); }
  }

  // Effects
  const flashes=[], texts=[];
  function spawnFlash(x,y){ flashes.push({x,y,t:0}); }
  function spawnText(msg,x,y,color){ texts.push({msg,x,y,t:0,color}); }
  function bombExplode(cx,cy){
    state.bombFlash=40;
    enemies.forEach(e=>{
      const dx=((e.x-cx+WORLD.width+WORLD.width/2)%WORLD.width)-WORLD.width/2;
      const dy=e.y-cy;
      if(Math.hypot(dx,dy)<240){ e.dead=true; state.score+=80; spawnFlash(e.x,e.y); }
    });
    spawnText('SMART MISSILE!', cx, cy-20, '#ffd24d');
  }
  function distance(a,b){ const dx=Math.abs(a.x-b.x); const wrap=Math.min(dx, WORLD.width-dx); const dy=a.y-b.y; return Math.hypot(wrap,dy); }

  // Stars
  const stars = Array.from({length:WORLD.starCount},()=>({x:Math.random()*WORLD.width,y:Math.random()*H*0.9}));

  // Terrain
  function drawTerrain(camx){
    ctx.strokeStyle='#203252'; ctx.lineWidth=2; ctx.beginPath();
    for(let i=0;i<=W;i+=6){ const wx=(i+camx)%WORLD.width; const y=WORLD.groundY-10*Math.sin(wx*0.001)-6*Math.sin(wx*0.005); if(i===0) ctx.moveTo(i,y); else ctx.lineTo(i,y); }
    ctx.stroke();
  }

  // Radar
  function drawRadar(camx){
    const rw=220, rh=42, rx=10, ry=10;
    ctx.fillStyle='rgba(17,22,37,0.8)'; ctx.fillRect(rx,ry,rw,rh);
    ctx.strokeStyle='#27324a'; ctx.strokeRect(rx,ry,rw,rh);
    const scale = rw / WORLD.width; const cx=(ship.x)*scale;
    const drawDot=(x,color)=>{ const dx=(x*scale - cx + rw/2 + rw)%rw; ctx.fillStyle=color; ctx.fillRect(rx+dx, ry+rh/2-1, 2,2); };
    humanoids.forEach(h=>{ if(h.alive) drawDot(h.x, '#49ffa1'); });
    enemies.forEach(e=>{ if(!e.dead) drawDot(e.x, '#ff3b58'); });
    drawDot(ship.x, '#49f3ff');
  }

  // State
  const state = { score:0, lives:3, level:1, rescued:0, bombs:3, bombFlash:0, paused:false, over:false };
  let ship, enemies, humanoids, bullets;

  function setupLevel(){
    ship = new Ship();
    bullets = [];
    enemies = Array.from({length: 6+state.level*2}, ()=> new Enemy(rnd(0,WORLD.width), rnd(60, WORLD.groundY-80)));
    humanoids = Array.from({length: 6}, (_,i)=> new Humanoid((i+1)*(WORLD.width/7) + rnd(-120,120)));
    state.rescued=0; state.bombs=3; state.bombFlash=0;
    updateHUD();
  }
  function restart(){ state.score=0; state.lives=3; state.level=1; state.over=false; setupLevel(); }
  function updateHUD(){ hud.score.textContent=state.score|0; hud.lives.textContent=state.lives; hud.humans.textContent=humanoids.filter(h=>h.alive).length; hud.level.textContent=state.level; }
  function togglePause(){ state.paused=!state.paused; }

  // Collisions
  function handleCollisions(){
    for(const b of bullets){
      for(const e of enemies){
        if(e.dead) continue;
        const dx=Math.abs(b.x-e.x); const wrap=Math.min(dx, WORLD.width-dx);
        if(Math.hypot(wrap, b.y-e.y)<12){ e.hit(); b.t=9999; }
      }
    }
    for(const e of enemies){
      if(e.dead) continue;
      if(distance(ship,e)<18){
        state.lives--; e.dead=true; spawnFlash(ship.x, ship.y); SFX.hit();
        if(state.lives<=0){ state.over=true; spawnText('GAME OVER', ship.x, ship.y-20, '#ff3b58'); }
      }
    }
  }

  function cameraX(){ return (ship.x - W/2 + WORLD.width) % WORLD.width; }

  // Loop
  let last=performance.now(), fps=60;
  function loop(ts){
    const dt = ts-last; last=ts; fps=Math.round(1000/dt); hud.fps.textContent=fps;
    if(!state.paused && !state.over){
      ship.update(); enemies.forEach(e=>e.update()); humanoids.forEach(h=>h.update());
      bullets.forEach(b=>b.update()); bullets = bullets.filter(b=>b.t<600);
      handleCollisions();
      const aliveHum = humanoids.filter(h=>h.alive).length;
      if(aliveHum===0){ spawnText('ONDATA FALLITA', ship.x, ship.y-24, '#ffd24d'); state.level++; setupLevel(); }
      else if(enemies.every(e=>e.dead)){ state.level++; state.score+=500; spawnText('WAVE CLEAR +500', ship.x, ship.y-24, '#49ffa1'); setupLevel(); }
      if(state.bombFlash>0) state.bombFlash--;
    }
    draw(); requestAnimationFrame(loop);
  }

  function draw(){
    const camx=cameraX();
    ctx.fillStyle='#05060a'; ctx.fillRect(0,0,W,H);
    ctx.fillStyle='#2a3757'; for(const s of stars){ const x=(s.x - camx*0.5 + WORLD.width)%WORLD.width; ctx.fillRect(x, s.y*0.9, 2,2); }
    drawRadar(camx); drawTerrain(camx);
    bullets.forEach(b=>b.draw(camx));
    enemies.forEach(e=>{ if(!e.dead) e.draw(camx); });
    humanoids.forEach(h=>h.draw(camx));
    ship.draw(camx);
    flashes.forEach(f=>{ f.t++; ctx.strokeStyle=`rgba(255,255,255,${1-f.t/20})`; ctx.beginPath(); ctx.arc((f.x - camx + WORLD.width)%WORLD.width, f.y, f.t*2, 0, Math.PI*2); ctx.stroke(); });
    while(flashes.length && flashes[0].t>20) flashes.shift();
    texts.forEach(t=>{ t.t++; ctx.fillStyle=t.color; ctx.fillText(t.msg, (t.x - camx + WORLD.width)%WORLD.width, t.y - t.t*0.4); });
    while(texts.length && texts[0].t>160) texts.shift();
    if(state.bombFlash>0){ ctx.fillStyle=`rgba(255,210,77,${state.bombFlash/40})`; ctx.fillRect(0,0,W,H); }
  }

  // Boot
  restart(); requestAnimationFrame(loop);
})();