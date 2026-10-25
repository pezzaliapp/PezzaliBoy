/* ============================================================
   Retro Arcade — Emulazione in stile classici anni '80
   Ricreazioni originali (nessuna ROM / codice / asset di terzi)
   Engine + input + sound + 5 games
   ============================================================ */
(()=>{
'use strict';

const cv  = document.getElementById('cv');
const ctx = cv.getContext('2d');
const W = 320, H = 320;
ctx.imageSmoothingEnabled = false;

// Size the canvas crisply to its container (square, letterboxed), keep 320x320 logical units.
function resizeCanvas(){
  const box = document.getElementById('screen-inner').getBoundingClientRect();
  const side = Math.max(80, Math.floor(Math.min(box.width, box.height)));
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  cv.width  = Math.round(side * dpr);
  cv.height = Math.round(side * dpr);
  cv.style.width  = side + 'px';
  cv.style.height = side + 'px';
  ctx.setTransform(cv.width / W, 0, 0, cv.height / H, 0, 0);
  ctx.imageSmoothingEnabled = false;
}

/* ---------- INPUT ---------- */
const input = { up:false, down:false, left:false, right:false, fire:false, _firePulse:false };
function setKey(dir,on){
  if(!(dir in input)) return;
  if(dir==='fire' && on && !input.fire) input._firePulse=true;
  input[dir]=on;
}
// keyboard
const KMAP={ArrowUp:'up',ArrowDown:'down',ArrowLeft:'left',ArrowRight:'right',
  KeyW:'up',KeyS:'down',KeyA:'left',KeyD:'right',Space:'fire',Enter:'fire',KeyK:'fire'};
addEventListener('keydown',e=>{const d=KMAP[e.code]; if(d){setKey(d,true); e.preventDefault();}});
addEventListener('keyup',  e=>{const d=KMAP[e.code]; if(d){setKey(d,false); e.preventDefault();}});
// touch buttons (dpad + fire)
document.querySelectorAll('[data-dir]').forEach(el=>{
  const dir=el.dataset.dir;
  const on =e=>{e.preventDefault(); el.classList.add('on'); setKey(dir,true);};
  const off=e=>{e.preventDefault(); el.classList.remove('on'); setKey(dir,false);};
  el.addEventListener('touchstart',on,{passive:false});
  el.addEventListener('touchend',off,{passive:false});
  el.addEventListener('touchcancel',off,{passive:false});
  el.addEventListener('mousedown',on); el.addEventListener('mouseup',off);
  el.addEventListener('mouseleave',off);
});
function firePressed(){ if(input._firePulse){input._firePulse=false; return true;} return false; }

/* ---------- SOUND (tiny WebAudio beeper) ---------- */
let actx=null;
function beep(freq,dur=0.06,type='square',vol=0.08){
  try{
    if(!actx) actx=new (window.AudioContext||window.webkitAudioContext)();
    if(actx.state==='suspended') actx.resume();
    const o=actx.createOscillator(), g=actx.createGain();
    o.type=type; o.frequency.value=freq;
    g.gain.value=vol; o.connect(g); g.connect(actx.destination);
    o.start(); g.gain.exponentialRampToValueAtTime(0.0001,actx.currentTime+dur);
    o.stop(actx.currentTime+dur);
  }catch(e){}
}

/* ---------- helpers ---------- */
const rnd=(a,b)=>a+Math.random()*(b-a);
const ri =(a,b)=>Math.floor(rnd(a,b+1));
const clamp=(v,a,b)=>v<a?a:v>b?b:v;
const aabb=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
function rect(x,y,w,h,c){ctx.fillStyle=c; ctx.fillRect(x|0,y|0,w|0,h|0);}
function text(s,x,y,c='#fff',size=10,align='left'){
  ctx.fillStyle=c; ctx.font='bold '+size+'px "Courier New",monospace';
  ctx.textAlign=align; ctx.textBaseline='top'; ctx.fillText(s,x,y);
}
function pix(map,x,y,scale,colors){            // draw a tiny pixel sprite from string rows
  for(let r=0;r<map.length;r++)for(let c=0;c<map[r].length;c++){
    const ch=map[r][c]; if(ch===' '||ch==='.')continue;
    ctx.fillStyle=colors[ch]||'#fff';
    ctx.fillRect(x+c*scale,y+r*scale,scale,scale);
  }
}

/* ---------- HIGH SCORES (persistent, with safe fallback) ---------- */
const Scores=(()=>{
  let mem={};
  const KEY='atari2600_scores';
  function read(){ try{ return JSON.parse(localStorage.getItem(KEY)||'{}'); }catch(e){ return mem; } }
  function write(o){ try{ localStorage.setItem(KEY,JSON.stringify(o)); }catch(e){ mem=o; } }
  return {
    best(k){ return read()[k]||0; },
    submit(k,v){ const o=read(); if(v>(o[k]||0)){ o[k]=v; write(o); return true; } return false; }
  };
})();
// builds the game-over line and records the score
function gameOverLine(key,val,label){
  const isRec=Scores.submit(key,val);
  return label+': '+val+(isRec?'   \u2605 NUOVO RECORD!':'   Record: '+Scores.best(key));
}

/* ---------- DOM / state ---------- */
const $=id=>document.getElementById(id);
const menuEl=$('menu'), hudEl=$('hud'), msgEl=$('msg'), ctrlEl=$('controls');
let current=null, last=0, acc=0, rafId=null, intId=null, runningLoop=false, lastRaf=0;
const STEP = 1/60;

function showMenu(){
  stopLoop(); current=null;
  menuEl.style.display='flex'; hudEl.style.display='none';
  msgEl.style.display='none'; ctrlEl.classList.add('hidden');
  ctx.clearRect(0,0,W,H);
  refreshRecords();
}
function refreshRecords(){
  document.querySelectorAll('.game-row').forEach(row=>{
    const best=Scores.best(row.dataset.game);
    let el=row.querySelector('.grec');
    if(!el){ el=document.createElement('div'); el.className='grec'; row.querySelector('.ginfo').appendChild(el); }
    el.textContent = best ? ('RECORD '+best) : '';
  });
}
function showMsg(title,txt,btn,cb){
  msgEl.style.display='flex';
  $('msgTitle').textContent=title; $('msgText').textContent=txt; $('msgBtn').textContent=btn;
  $('msgBtn').onclick=()=>{ msgEl.style.display='none'; cb&&cb(); };
}
function setStat(s){ $('stat').textContent=s; }

function startGame(g){
  menuEl.style.display='none'; hudEl.style.display='flex';
  ctrlEl.classList.remove('hidden');
  resizeCanvas();
  current=g; g.init();
  startLoop();
  beep(440,0.05); beep(660,0.05);
}
/* Robust loop: rAF for smoothness, plus a timer fallback that keeps the game
   running even in webviews/iframes that throttle or pause requestAnimationFrame.
   frame() is time-based (accumulator), so being driven by either source — or
   both — never double-advances the simulation. */
function frame(){
  const now=performance.now();
  let dt=(now-last)/1000; last=now;
  if(dt>0.25) dt=0.25;
  acc+=dt;
  try{
    let steps=0;
    while(acc>=STEP && steps<6){ if(current) current.update(STEP); acc-=STEP; steps++; }
    if(acc>0.25) acc=0;
    if(current) current.draw();
  }catch(err){ console.error('Game error:',err); stopLoop(); showMenu(); }
}
function startLoop(){
  if(runningLoop) return;
  runningLoop=true; last=performance.now(); acc=0; lastRaf=last;
  const tick=()=>{ if(!runningLoop) return; rafId=requestAnimationFrame(tick); lastRaf=performance.now(); frame(); };
  rafId=requestAnimationFrame(tick);
  // fallback driver: only advances if rAF has stalled (throttled/paused)
  intId=setInterval(()=>{ if(runningLoop && performance.now()-lastRaf>60) frame(); }, 1000/30);
}
function stopLoop(){
  runningLoop=false;
  if(rafId) cancelAnimationFrame(rafId); rafId=null;
  if(intId) clearInterval(intId); intId=null;
}

$('backBtn').onclick=showMenu;

/* ============================================================
   GAME 1 — PITFALL  (jungle runner)
   ============================================================ */
const Pitfall=(()=>{
  let p,scrollx,obstacles,vines,score,lives,timer,gnd,state,spawn;
  const GROUND=240, RUNCOLORS={g:'#3a7d2c',h:'#d99',b:'#1a3a12'};
  function reset(){
    p={x:60,y:GROUND-26,w:14,h:26,vy:0,onGround:true,frame:0};
    scrollx=0; obstacles=[]; vines=[]; score=2000; lives=3; timer=1200;
    state='play'; spawn=0;
  }
  function spawnObs(){
    const t=ri(0,2);
    if(t===0) obstacles.push({type:'pit',x:W+rnd(40,120),w:rnd(30,46)});
    else if(t===1) obstacles.push({type:'log',x:W+rnd(40,120),w:14,roll:true});
    else obstacles.push({type:'croc',x:W+rnd(40,120),w:30});
  }
  return{
    init(){ reset(); setStat('PUNTI 2000'); },
    update(dt){
      if(state!=='play') return;
      const sp=90;
      scrollx+=sp*dt; timer-=dt; if(timer<0)timer=0;
      // movement
      if(input.left)  p.x-=70*dt;
      if(input.right) p.x+=70*dt;
      p.x=clamp(p.x,8,W-40);
      // jump
      if((firePressed()||input.up)&&p.onGround){ p.vy=-260; p.onGround=false; beep(520,0.08);}
      p.vy+=720*dt; p.y+=p.vy*dt;
      if(p.y>=GROUND-p.h){p.y=GROUND-p.h;p.vy=0;p.onGround=true;}
      p.frame+=sp*dt*0.15;
      // obstacles
      spawn-=dt; if(spawn<=0){spawnObs(); spawn=rnd(1.1,2.0);}
      for(const o of obstacles){
        o.x-=sp*dt;
        if(o.roll) o.x-=40*dt;       // logs roll faster
      }
      obstacles=obstacles.filter(o=>o.x+ (o.w||40) >-10);
      // collisions
      const feet={x:p.x+2,y:p.y+p.h-4,w:p.w-4,h:4};
      const body={x:p.x+2,y:p.y+4,w:p.w-4,h:p.h-8};
      for(const o of obstacles){
        if(o.type==='pit'){
          // falling in the pit if on ground over the gap
          if(p.onGround && p.x+p.w>o.x+4 && p.x<o.x+o.w-4){ hit(); }
        }else{
          const ob={x:o.x,y:GROUND-(o.type==='croc'?14:14),w:o.w,h:14};
          if(aabb(body,ob)){ hit(); }
        }
      }
      score+=Math.floor(sp*dt*0.6);
      setStat('PUNTI '+score+'   T '+Math.ceil(timer)+'   VITE '+lives);
      if(timer<=0) over();
    },
    draw(){
      // sky / jungle
      rect(0,0,W,GROUND,'#6fae3a');
      // trees (parallax)
      for(let i=0;i<6;i++){
        const tx=((i*70 - scrollx*0.4)%(W+70)+W+70)%(W+70)-35;
        rect(tx+24,30,10,GROUND-30,'#5a3413');
        rect(tx,18,58,40,'#2f6b1f');
      }
      // ground strip
      rect(0,GROUND,W,8,'#caa64b');
      rect(0,GROUND+8,W,H-GROUND-8,'#000');
      // underground brick (decor) — offset sempre in [-16,0) cosi' copre tutta la fascia
      const boff=((Math.floor(-scrollx)%16)+16)%16-16;
      for(let x=boff;x<W;x+=16) rect(x,GROUND+10,14,8,'#7a1d12');
      // obstacles
      for(const o of obstacles){
        if(o.type==='pit'){ rect(o.x,GROUND,o.w,H-GROUND,'#000'); }
        else if(o.type==='log'){
          rect(o.x,GROUND-14,o.w,14,'#7b4a1d');
          rect(o.x+3,GROUND-11, o.roll?(((scrollx/4)|0)%2?5:8):6,3,'#bb7d3a');
        }else{ // crocodile heads
          for(let i=0;i<3;i++){rect(o.x+i*10,GROUND-12,8,12,'#2c7d3a'); rect(o.x+i*10+1,GROUND-9,6,2,'#fff');}
        }
      }
      // player (harry-style runner)
      const f=(p.frame|0)%2;
      const leg=p.onGround?(f?2:-2):0;
      rect(p.x+4,p.y,7,6,'#c1281e');          // head/cap
      rect(p.x+3,p.y+6,9,11,'#2aa84a');        // shirt
      rect(p.x+3,p.y+17,4,9+leg,'#2a4a8a');    // leg 1
      rect(p.x+8,p.y+17,4,9-leg,'#2a4a8a');    // leg 2
      if(state==='dead'){text('AHIA!',p.x-6,p.y-16,'#fff',12);}
    }
  };
  function hit(){ if(state!=='play')return; state='dead'; lives--; beep(120,0.25,'sawtooth',0.12);
    setTimeout(()=>{ if(lives<=0){over();} else { p.x=60;p.y=GROUND-26;p.vy=0;p.onGround=true; obstacles=obstacles.filter(o=>o.x>W-60); state='play'; } },450); }
  function over(){ state='over'; showMsg('GAME OVER',gameOverLine('pitfall',score,'Punti'),'RIGIOCA',()=>{reset();}); }
})();

/* ============================================================
   GAME 2 — RIVER RAID  (vertical scroller)
   ============================================================ */
const RiverRaid=(()=>{
  let plane,bullets,enemies,fuels,scrollY,score,fuel,lives,state,spawn,fspawn;
  const PLANE_Y=250, PW=14, PH=16, SP=92;
  // river is a continuous function of world-distance -> no segment recycling, always smooth
  function center(wy){ return W/2 + Math.sin(wy*0.010)*44 + Math.sin(wy*0.027)*20; }
  function halfW(wy){ return clamp(74 + Math.sin(wy*0.013)*26 + Math.sin(wy*0.0061)*14, 48, 116); }
  function worldY(sy){ return scrollY + (H - sy); }      // bottom of screen == scrollY
  function bank(sy){ const wy=worldY(sy); return {c:center(wy), hw:halfW(wy)}; }
  function reset(){
    plane={x:W/2-PW/2}; bullets=[]; enemies=[]; fuels=[];
    scrollY=0; score=0; fuel=100; lives=3; state='play'; spawn=1; fspawn=3;
  }
  return{
    init(){ reset(); setStat('PUNTI 0  CARB 100'); },
    update(dt){
      if(state!=='play') return;
      scrollY += SP*dt;
      if(input.left)  plane.x-=120*dt;
      if(input.right) plane.x+=120*dt;
      plane.x=clamp(plane.x,4,W-4-PW);
      const burn = input.up?13 : input.down?5 : 9;
      fuel-=burn*dt; if(fuel<=0){ fuel=0; return die('CARBURANTE ESAURITO'); }
      if(firePressed()){ bullets.push({x:plane.x+PW/2-1,y:PLANE_Y}); beep(880,0.04); }
      for(const b of bullets) b.y-=330*dt;
      bullets=bullets.filter(b=>b.y>-10 && !b.dead);
      // spawn enemies / fuel locked to the river so they ride the current
      spawn-=dt; if(spawn<=0){ const b=bank(-12);
        enemies.push({x:clamp(b.c+rnd(-b.hw*0.55,b.hw*0.55)-12,14,W-38),y:-16,w:24,h:13,kind:ri(0,2)});
        spawn=rnd(0.7,1.5); }
      for(const e of enemies) e.y+=SP*dt;
      enemies=enemies.filter(e=>e.y<H+20 && !e.dead);
      fspawn-=dt; if(fspawn<=0){ const b=bank(-26);
        fuels.push({x:clamp(b.c-7,14,W-28),y:-26,w:14,h:24}); fspawn=rnd(4.5,7.5); }
      for(const f of fuels) f.y+=SP*dt;
      fuels=fuels.filter(f=>f.y<H+20 && !f.got);
      // collisions
      for(const b of bullets)for(const e of enemies){
        if(aabb({x:b.x,y:b.y,w:2,h:8},e)){ e.dead=true; b.dead=true; score+=e.kind===2?60:30; beep(200,0.07,'sawtooth'); } }
      bullets=bullets.filter(b=>!b.dead); enemies=enemies.filter(e=>!e.dead);
      const ph={x:plane.x+1,y:PLANE_Y+1,w:PW-2,h:PH-2};
      for(const e of enemies){ if(aabb(ph,e)) return die('ABBATTUTO'); }
      for(const f of fuels){ if(aabb(ph,f)){ f.got=true; fuel=clamp(fuel+28,0,100); beep(660,0.06); } }
      const bk=bank(PLANE_Y+PH/2);
      if(plane.x < bk.c-bk.hw || plane.x+PW > bk.c+bk.hw) return die('SCONTRO ARGINE');
      score+=Math.floor(SP*dt*0.25);
      setStat('PUNTI '+score+'  CARB '+Math.ceil(fuel)+'  VITE '+lives);
    },
    draw(){
      rect(0,0,W,H,'#2c8a3a');                 // land
      for(let y=0;y<H;y+=2){ const wy=worldY(y), c=center(wy), hw=halfW(wy);
        rect(c-hw,y,hw*2,2,'#2a3ac1');          // water
        rect(c-hw,y,3,2,'#1b2780'); rect(c+hw-3,y,3,2,'#1b2780'); }  // banks
      for(const f of fuels){ rect(f.x,f.y,14,24,'#c9c9d6'); rect(f.x,f.y,14,7,'#c1281e'); text('F',f.x+3,f.y+8,'#7a0f08',9); }
      for(const e of enemies){
        if(e.kind===0){ rect(e.x,e.y+4,24,6,'#222'); rect(e.x+6,e.y,12,5,'#c1281e'); rect(e.x,e.y+9,24,3,'#3aa'); }
        else if(e.kind===1){ rect(e.x+4,e.y,16,13,'#d4d44a'); rect(e.x,e.y+5,24,3,'#888'); }
        else { rect(e.x+6,e.y+2,12,9,'#2aa84a'); rect(e.x,e.y+5,24,3,'#d4d44a'); } }
      for(const b of bullets) rect(b.x,b.y,2,8,'#fff');
      const px=plane.x,py=PLANE_Y;
      if(state==='dead'){ rect(px-3,py-3,PW+6,PH+6,'#ff6'); }
      rect(px+5,py,4,16,'#ffd34a'); rect(px,py+6,14,4,'#ffd34a'); rect(px+4,py+14,6,3,'#fff');
    }
  };
  function die(reason){ if(state!=='play')return; state='dead'; lives--; beep(90,0.3,'sawtooth',0.12);
    setTimeout(()=>{ if(lives<=0){ state='over'; showMsg('GAME OVER',(reason?reason+'  \u2014  ':'')+gameOverLine('riverraid',score,'Punti'),'RIGIOCA',()=>reset()); }
      else { plane.x=W/2-PW/2; fuel=Math.max(fuel,35); enemies=[]; bullets=[]; state='play'; } },500); }
})();

/* ============================================================
   GAME 3 — SPACE INVADERS
   ============================================================ */
const Invaders=(()=>{
  let ship,bullets,bombs,inv,shields,dir,sp,score,lives,state,stepT,moveDown,wave,ufo,ufoT;
  const COLS=6,ROWS=5,IW=18,IH=12,GAPX=10,GAPY=10,TOP=40,SHIPY=290;
  function reset(){
    ship={x:W/2-12,w:24,h:10}; bullets=[]; bombs=[]; dir=1; sp=14; score=0; lives=3;
    state='play'; stepT=0; moveDown=false; wave=1; ufo=null; ufoT=rnd(9,16); makeInv(); makeShields();
  }
  function makeInv(){
    inv=[];
    for(let r=0;r<ROWS;r++)for(let c=0;c<COLS;c++)
      inv.push({x:40+c*(IW+GAPX),y:TOP+r*(IH+GAPY),w:IW,h:IH,row:r,alive:true});
  }
  function makeShields(){
    shields=[];
    for(let s=0;s<3;s++){ const bx=44+s*92, by=250;
      for(let i=0;i<5;i++)for(let j=0;j<3;j++) shields.push({x:bx+i*7,y:by+j*6,w:7,h:6,hp:2});
    }
  }
  return{
    init(){ reset(); setStat('PUNTI 0'); },
    update(dt){
      if(state!=='play')return;
      if(input.left)  ship.x-=130*dt;
      if(input.right) ship.x+=130*dt;
      ship.x=clamp(ship.x,4,W-4-ship.w);
      if(firePressed()&&bullets.length<2){ bullets.push({x:ship.x+ship.w/2-1,y:SHIPY,vy:-320}); beep(900,0.04);}
      for(const b of bullets) b.y+=b.vy*dt; bullets=bullets.filter(b=>b.y>-8);
      // mystery UFO crosses the top
      ufoT-=dt;
      if(!ufo && ufoT<=0){ const fromLeft=Math.random()<0.5;
        ufo={x:fromLeft?-22:W+22, y:24, w:20, h:8, vx:(fromLeft?1:-1)*70, val:[50,100,150,300][ri(0,3)]}; beep(1200,0.04,'sine',0.05); }
      if(ufo){ ufo.x+=ufo.vx*dt;
        if(ufo.x<-30||ufo.x>W+30){ ufo=null; ufoT=rnd(12,20); }
        else for(const b of bullets){ if(!b.dead&&aabb({x:b.x,y:b.y,w:2,h:8},{x:ufo.x,y:ufo.y,w:ufo.w,h:ufo.h})){
          score+=ufo.val; b.dead=true; ufo={x:ufo.x,y:ufo.y,w:ufo.w,h:ufo.h,val:ufo.val,boom:0.5,vx:0}; beep(990,0.14,'square',0.1); } }
        if(ufo&&ufo.boom!==undefined){ ufo.boom-=dt; if(ufo.boom<=0){ufo=null;ufoT=rnd(12,20);} }
      }
      bullets=bullets.filter(b=>!b.dead);
      // invader march (stepped)
      const alive=inv.filter(i=>i.alive);
      stepT+=dt; const interval=clamp(0.5*alive.length/(COLS*ROWS),0.08,0.6);
      if(stepT>=interval){ stepT=0;
        let minX=1e9,maxX=-1e9;
        for(const i of alive){ minX=Math.min(minX,i.x); maxX=Math.max(maxX,i.x+i.w); }
        if(moveDown){ for(const i of alive) i.y+=10; dir*=-1; moveDown=false; beep(140,0.05);}
        else{ const nx=minX+dir*sp, mx=maxX+dir*sp;
          if(nx<6||mx>W-6) moveDown=true; else for(const i of alive) i.x+=dir*sp; beep(220,0.02);}
        // enemy fire
        if(Math.random()<0.5&&alive.length){ const shooter=alive[ri(0,alive.length-1)];
          bombs.push({x:shooter.x+shooter.w/2,y:shooter.y+IH,vy:150}); }
      }
      for(const b of bombs) b.y+=b.vy*dt; bombs=bombs.filter(b=>b.y<H+8);
      // collisions: bullet vs invader
      for(const b of bullets)for(const i of inv){ if(i.alive&&aabb({x:b.x,y:b.y,w:2,h:8},i)){
        i.alive=false;b.dead=true;score+=(ROWS-i.row)*10;beep(300,0.06,'sawtooth');}}
      bullets=bullets.filter(b=>!b.dead);
      // bullet/bomb vs shields
      for(const arr of [bullets,bombs])for(const b of arr)for(const s of shields){
        if(s.hp>0&&aabb({x:b.x,y:b.y,w:2,h:8},s)){ s.hp--; b.dead=true; }
      }
      bullets=bullets.filter(b=>!b.dead); bombs=bombs.filter(b=>!b.dead);
      // bomb vs ship
      const sh={x:ship.x,y:SHIPY,w:ship.w,h:ship.h};
      for(const b of bombs){ if(aabb({x:b.x,y:b.y,w:3,h:8},sh)){ b.dead=true; hit(); } }
      bombs=bombs.filter(b=>!b.dead);
      // win wave
      if(alive.length===0){ wave++; sp=Math.min(sp+3,30); makeInv(); makeShields(); beep(660,0.1); beep(880,0.1);}
      // invaders reach bottom
      for(const i of alive){ if(i.y+IH>=SHIPY-6){ over(); break; } }
      setStat('PUNTI '+score+'   ONDATA '+wave+'   VITE '+lives);
    },
    draw(){
      rect(0,0,W,H,'#000');
      // invaders (3 shapes)
      for(const i of inv){ if(!i.alive)continue;
        const c = i.row===0?'#d4d44a':i.row<3?'#9ad44a':'#4ad4a8';
        const map = i.row===0?['.XX.','XXXX','X.X.X'.slice(0,4),'X..X']:
                    i.row<3 ?['X..X','.XX.','XXXX','X..X']:
                             ['.XX.','XXXX','.XX.','X..X'];
        pix(map,i.x,i.y,IW/4,{X:c});
      }
      // shields
      for(const s of shields){ if(s.hp>0) rect(s.x,s.y,s.w,s.h, s.hp>1?'#2aa84a':'#1a6a2a'); }
      // mystery UFO
      if(ufo){
        if(ufo.boom!==undefined){ text(ufo.val, ufo.x+ufo.w/2, ufo.y-2, '#fff', 11, 'center'); }
        else { rect(ufo.x,ufo.y+3,ufo.w,4,'#c1281e'); rect(ufo.x+4,ufo.y,ufo.w-8,3,'#e84a3a');
          rect(ufo.x+2,ufo.y+7,3,2,'#ff9'); rect(ufo.x+ufo.w-5,ufo.y+7,3,2,'#ff9'); }
      }
      // bullets / bombs
      for(const b of bullets) rect(b.x,b.y,2,8,'#fff');
      for(const b of bombs)   rect(b.x,b.y,2,8,'#ff6');
      // ship
      rect(ship.x,SHIPY+4,ship.w,6,'#3ad44a'); rect(ship.x+ship.w/2-2,SHIPY,4,5,'#3ad44a');
    }
  };
  function hit(){ if(state!=='play')return; lives--; beep(80,0.3,'sawtooth',0.12);
    if(lives<=0) over(); else { ship.x=W/2-12; bombs=[]; } }
  function over(){ state='over'; showMsg('GAME OVER',gameOverLine('invaders',score,'Punti')+'  \u2022  Ondata '+wave,'RIGIOCA',()=>reset()); }
})();

/* ============================================================
   GAME 4 — MAZE MUNCHER  (Ms.Pac-Man style, original maze)
   ============================================================ */
const Maze=(()=>{
  /* grid: # wall, . dot, o power, ' ' empty, P start */
  const MAP=[
   "############################",
   "#............##............#",
   "#.####.#####.##.#####.####.#",
   "#o####.#####.##.#####.####o#",
   "#..........................#",
   "#.####.##.########.##.####.#",
   "#......##....##....##......#",
   "######.##### ## #####.######",
   "######.##          ##.######",
   "######.## ###--### ##.######",
   "      .   #      #   .      ",
   "######.## ######## ##.######",
   "######.##          ##.######",
   "######.## ######## ##.######",
   "#............##............#",
   "#.####.#####.##.#####.####.#",
   "#o..##.......P .......##..o#",
   "###.##.##.########.##.##.###",
   "#......##....##....##......#",
   "#.##########.##.##########.#",
   "#..........................#",
   "############################"];
  const COLS=28, ROWS=22;
  let TS, OX, OY, pac, ghosts, grid, dots, score, lives, state, powerT, win;
  function build(){
    grid=MAP.map(r=>r.split(''));
    dots=0;
    for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){ const c=grid[y][x]; if(c==='.'||c==='o')dots++; }
    TS=Math.floor(Math.min(W/COLS,(H-20)/ROWS));
    OX=Math.floor((W-COLS*TS)/2); OY=18;
  }
  function reset(){
    build();
    pac={cx:13,cy:16,x:0,y:0,dir:{x:0,y:0},want:{x:0,y:0},mouth:0};
    pac.x=pac.cx*TS+TS/2; pac.y=pac.cy*TS+TS/2;
    // BUGFIX: i fantasmi 3 e 4 nascevano dentro un muro (cy:11) e la porta '-'
    // era un muro anche per loro: nessuno usciva mai dalla casa.
    ghosts=[
      {cx:12,cy:10,col:'#e84a3a',x:0,y:0,dir:{x: 1,y:0},home:0},
      {cx:13,cy:10,col:'#f4a6d4',x:0,y:0,dir:{x:-1,y:0},home:35},
      {cx:14,cy:10,col:'#4ad4e8',x:0,y:0,dir:{x: 1,y:0},home:70},
      {cx:15,cy:10,col:'#f4b24a',x:0,y:0,dir:{x:-1,y:0},home:105},
    ];
    for(const g of ghosts){ g.x=g.cx*TS+TS/2; g.y=g.cy*TS+TS/2; g.frt=0; g.t=0; g.ghost=true; g.dcx=-1; g.dcy=-1; }
    score=0; lives=3; state='play'; powerT=0;
  }
  // la porta '-' e' attraversabile SOLO dai fantasmi che si trovano dentro/sulla casa
  const inHouse=e=>e.cy>=9 && e.cy<=10 && e.cx>=11 && e.cx<=16;
  const wall=(cx,cy,e)=>{ if(cy<0||cy>=ROWS)return true; cx=(cx+COLS)%COLS; const c=grid[cy][cx];
    if(c==='-') return !(e&&e.ghost&&inHouse(e));
    return c==='#'; };
  function respawnGhosts(){
    const gx=[12,13,14,15], hm=[0,25,50,75];
    ghosts.forEach((g,i)=>{ g.cx=gx[i]; g.cy=10; g.x=g.cx*TS+TS/2; g.y=g.cy*TS+TS/2;
      g.frt=0; g.home=hm[i]; g.dir={x:i%2?-1:1,y:0}; g.dcx=-1; g.dcy=-1; });
  }
  const centered=(e)=>{ const fx=e.x-(e.cx*TS+TS/2), fy=e.y-(e.cy*TS+TS/2); return Math.abs(fx)<2&&Math.abs(fy)<2; };
  return{
    init(){ reset(); setStat('PUNTI 0'); },
    update(dt){
      if(state!=='play')return;
      if(input.up){pac.want={x:0,y:-1};} else if(input.down){pac.want={x:0,y:1};}
      else if(input.left){pac.want={x:-1,y:0};} else if(input.right){pac.want={x:1,y:0};}
      const spd=58;
      // pac movement on grid
      stepEntity(pac,spd*dt,true);
      // eat
      const c=grid[pac.cy] && grid[pac.cy][pac.cx];
      if(c==='.'){grid[pac.cy][pac.cx]=' ';score+=10;dots--;beep(660,0.02);}
      else if(c==='o'){grid[pac.cy][pac.cx]=' ';score+=50;dots--;powerT=6;for(const g of ghosts)g.frt=6;beep(440,0.1);}
      pac.mouth+=dt*10;
      if(powerT>0){powerT-=dt; if(powerT<=0)for(const g of ghosts)g.frt=0;}
      // ghosts
      for(const g of ghosts){
        g.t+=dt;
        if(g.home>0) g.home-=dt*30;          // release timer (counts down)
        if(g.frt>0)g.frt-=dt;
        const house=inHouse(g);
        const gs=(g.frt>0?38:52)*dt;
        // BUGFIX: decidere la direzione UNA volta per cella. Prima il selettore
        // girava a ogni frame riagganciando il fantasma al centro cella:
        // con passo < soglia (2px) i fantasmi restavano congelati per sempre.
        const blocked=wall(g.cx+g.dir.x, g.cy+g.dir.y, g);
        if(centered(g) && (g.dcx!==g.cx || g.dcy!==g.cy || blocked)){
          g.cx=(g.cx+COLS)%COLS;
          g.dcx=g.cx; g.dcy=g.cy;
          const opts=[{x:1,y:0},{x:-1,y:0},{x:0,y:1},{x:0,y:-1}].filter(d=>
            !wall(g.cx+d.x,g.cy+d.y,g) && !(d.x===-g.dir.x&&d.y===-g.dir.y));
          if(opts.length===0)opts.push({x:-g.dir.x,y:-g.dir.y});
          // target: pac (o fuga se spaventato); dentro la casa: pattuglia finche'
          // home>0, poi punta sopra la porta per uscire
          let tx=pac.cx, ty=pac.cy, flee=g.frt>0, rndAmt=0.15;
          if(house){
            flee=false; rndAmt=0;
            if(g.home>0){ tx=g.cx+g.dir.x*2; ty=10; }  // avanti e indietro in attesa
            else        { tx=13; ty=7; }               // esci dalla porta
          }
          let best=opts[0],bestScore=flee?-1e9:1e9;
          for(const d of opts){
            const nx=g.cx+d.x, ny=g.cy+d.y;
            const dist=(nx-tx)**2+(ny-ty)**2;
            if(flee){ if(dist>bestScore){bestScore=dist;best=d;} }
            else { if(dist<bestScore){bestScore=dist;best=d;} }
          }
          if(rndAmt&&Math.random()<rndAmt){ best=opts[ri(0,opts.length-1)]; } // a little randomness
          g.dir=best;
          g.x=g.cx*TS+TS/2; g.y=g.cy*TS+TS/2;
        }
        stepEntity(g,gs,false);
        // collide with pac
        if(Math.hypot(g.x-pac.x,g.y-pac.y)<TS*0.7){
          if(g.frt>0){ score+=200; g.frt=0; g.cx=13;g.cy=10;g.x=g.cx*TS+TS/2;g.y=g.cy*TS+TS/2;
            g.dir={x:1,y:0}; g.home=25; g.dcx=-1; g.dcy=-1; beep(880,0.1);}  // torna in casa e riparte
          else return die();
        }
      }
      if(dots<=0){ state='win'; beep(660,0.1);beep(880,0.1);beep(990,0.15);
        showMsg('LIVELLO COMPLETATO!','Punti: '+score,'CONTINUA',()=>{const s=score,l=lives;reset();score=s;lives=l;}); }
      setStat('PUNTI '+score+'   VITE '+lives+(powerT>0?'   POWER!':''));
    },
    draw(){
      rect(0,0,W,H,'#000');
      for(let y=0;y<ROWS;y++)for(let x=0;x<COLS;x++){
        const c=grid[y][x]; const px=OX+x*TS, py=OY+y*TS;
        if(c==='#') rect(px,py,TS,TS,'#2a2ad4');
        else if(c==='-') rect(px,py+TS/2-1,TS,2,'#f4a6d4');
        else if(c==='.') rect(px+TS/2-1,py+TS/2-1,2,2,'#f4d9b0');
        else if(c==='o'){ ctx.fillStyle='#f4d9b0'; ctx.beginPath(); ctx.arc(px+TS/2,py+TS/2,TS/3,0,7); ctx.fill(); }
      }
      // pac
      const m=Math.abs(Math.sin(pac.mouth))*0.3;
      let ang=0; if(pac.dir.x<0)ang=Math.PI; else if(pac.dir.y<0)ang=-Math.PI/2; else if(pac.dir.y>0)ang=Math.PI/2;
      ctx.fillStyle='#f4d44a'; ctx.beginPath();
      const pcx=OX+pac.x, pcy=OY+pac.y;
      ctx.moveTo(pcx,pcy);
      ctx.arc(pcx,pcy,TS*0.5,ang+m,ang+Math.PI*2-m); ctx.closePath(); ctx.fill();
      // ghosts
      for(const g of ghosts){
        const gx=OX+g.x-TS*0.5, gy=OY+g.y-TS*0.5;
        ctx.fillStyle = g.frt>0 ? (g.frt<2&&(Math.floor(g.frt*8)%2)?'#fff':'#2a2ad4') : g.col;
        ctx.beginPath(); ctx.arc(gx+TS/2,gy+TS*0.45,TS*0.45,Math.PI,0); 
        ctx.lineTo(gx+TS,gy+TS); ctx.lineTo(gx,gy+TS); ctx.closePath(); ctx.fill();
        ctx.fillStyle='#fff';
        rect(gx+TS*0.25,gy+TS*0.3,3,3,'#fff'); rect(gx+TS*0.6,gy+TS*0.3,3,3,'#fff');
      }
    }
  };
  function stepEntity(e,step,isPac){
    const cellX=e.cx*TS+TS/2, cellY=e.cy*TS+TS/2;
    const atCenter = Math.abs(e.x-cellX)<=step && Math.abs(e.y-cellY)<=step;
    // turn toward wanted dir only when it's a NEW direction and the path is open
    if(isPac && atCenter && (e.want.x||e.want.y) && (e.want.x!==e.dir.x || e.want.y!==e.dir.y)){
      if(!wall(e.cx+e.want.x, e.cy+e.want.y, e)){ e.dir={...e.want}; e.x=cellX; e.y=cellY; }
    }
    // stop at a wall directly ahead
    if(atCenter && wall(e.cx+e.dir.x, e.cy+e.dir.y, e)){ e.x=cellX; e.y=cellY; if(isPac)e.dir={x:0,y:0}; return; }
    e.x+=e.dir.x*step; e.y+=e.dir.y*step;
    // keep the off-axis coordinate locked to the lane center (prevents drift)
    if(e.dir.x){ e.y += (cellY-e.y)*Math.min(1,step*0.5); }
    if(e.dir.y){ e.x += (cellX-e.x)*Math.min(1,step*0.5); }
    // tunnel wrap (row 10)
    if(e.x<-TS/2)e.x=COLS*TS+TS/2; if(e.x>COLS*TS+TS/2)e.x=-TS/2;
    e.cx=((Math.floor(e.x/TS))%COLS+COLS)%COLS; e.cy=Math.floor(e.y/TS);
  }
  function die(){ if(state!=='play')return; state='dead'; lives--; beep(160,0.3,'sawtooth',0.12);
    setTimeout(()=>{ if(lives<=0){ state='over'; showMsg('GAME OVER',gameOverLine('pacman',score,'Punti'),'RIGIOCA',()=>reset()); }
      else { pac.cx=13;pac.cy=16;pac.x=pac.cx*TS+TS/2;pac.y=pac.cy*TS+TS/2;pac.dir={x:0,y:0};pac.want={x:0,y:0};
        respawnGhosts(); state='play'; }
    },500); }
})();

/* ============================================================
   GAME 5 — ENDURO  (racing)
   ============================================================ */
const Enduro=(()=>{
  let car,cars,score,passed,goal,dist,road,state,timeOfDay,speed,curve,lives;
  const HORIZON=90, CARW=26;
  function reset(){
    car={x:W/2, w:CARW}; cars=[]; score=0; passed=0; goal=200; dist=0;
    state='play'; timeOfDay=0; speed=0; curve=0; lives=3;
  }
  function roadX(y,t){ // road center & half-width at screen y, t=0 horizon..1 bottom
    const cx=W/2 + curve*(1-t)*60;
    const hw=20 + t*120;
    return {cx,hw};
  }
  return{
    init(){ reset(); setStat('SORPASSI 0 / 200'); },
    update(dt){
      if(state!=='play')return;
      // accelerate
      const maxSpd=1; speed=clamp(speed + (input.up?0.6:input.down?-1.2:-0.2)*dt, 0.25, maxSpd);
      curve += ((Math.sin(dist*0.02)) - curve)*dt*0.8; // gentle changing curve
      dist += speed*120*dt;
      timeOfDay += dt*0.04; // cycle
      // steer
      const steer=(input.left?-1:0)+(input.right?1:0);
      car.x += steer*120*dt;
      car.x += -curve*40*dt*speed; // pushed by curve
      car.x = clamp(car.x, 40, W-40);
      // spawn rival cars
      if(Math.random()<speed*2.4*dt){ const lane=rnd(-0.7,0.7);
        cars.push({t:0,lane,col:['#e8d94a','#4ad4e8','#f4a6d4','#fff'][ri(0,3)],passed:false}); }
      for(const c of cars){
        c.t += (speed*0.6+0.15)*dt;
      }
      // collision & passing
      const bottomCar={x:car.x-CARW/2,y:H-54,w:CARW,h:20};
      for(const c of cars){
        if(c.t>=1 && !c.passed){ c.passed=true; passed++; score+=1; beep(700,0.03);
          if(passed>=goal){ goal+=200; beep(880,0.15); } }
        if(c.t>0.82 && c.t<1.05){
          const {cx,hw}=roadX(H-54,1);
          const ex=cx + c.lane*hw - CARW/2;
          if(Math.abs((ex+CARW/2)-(car.x))<CARW-4){ // crash
            hit(); c.t=1.2;
          }
        }
      }
      cars=cars.filter(c=>c.t<1.3);
      setStat('SORPASSI '+passed+' / '+goal+'   VITE '+lives);
    },
    draw(){
      // sky changes with time of day
      const day=(Math.sin(timeOfDay*Math.PI*2)+1)/2; // 1 day, 0 night
      const sky = day>0.5 ? '#2a6ad4' : day>0.2? '#7a3a6a' : '#10103a';
      rect(0,0,W,HORIZON,sky);
      rect(0,HORIZON-14,W,14, day>0.4?'#7a8a4a':'#3a3a5a'); // hills
      // grass
      rect(0,HORIZON,W,H-HORIZON, day>0.4?'#2a7d2a':'#143a14');
      // road (trapezoid via scanlines)
      for(let y=HORIZON;y<H;y++){
        const t=(y-HORIZON)/(H-HORIZON);
        const {cx,hw}=roadX(y,t);
        const stripe=(Math.floor((dist*0.5 + t*40))%2)===0;
        rect(cx-hw,y,hw*2,1, stripe?'#555':'#4a4a4a');
        // edge lines
        rect(cx-hw,y,3,1,'#fff'); rect(cx+hw-3,y,3,1,'#fff');
        // center dashes
        if(Math.floor((dist*0.6 + t*30))%4<2) rect(cx-1,y,2,1,'#f4d94a');
      }
      // rival cars
      cars.sort((a,b)=>a.t-b.t);
      for(const c of cars){
        const y=HORIZON + c.t*(H-HORIZON);
        const t=c.t; const {cx,hw}=roadX(y,t);
        const sc=0.3+t*0.9; const cw=CARW*sc;
        const ex=cx + c.lane*hw - cw/2;
        rect(ex,y-cw*0.7,cw,cw*0.7,c.col);
        rect(ex+2,y-cw*0.7-3,cw-4,4, '#222');
      }
      // player car
      const py=H-54;
      rect(car.x-CARW/2,py,CARW,20,'#e84a3a');
      rect(car.x-CARW/2+3,py-6,CARW-6,8,'#c1281e');
      rect(car.x-CARW/2,py+16,5,6,'#111'); rect(car.x+CARW/2-5,py+16,5,6,'#111');
      rect(car.x-CARW/2,py-2,5,6,'#111'); rect(car.x+CARW/2-5,py-2,5,6,'#111');
      // odometer plate
      rect(60,H-20,W-120,16,'#000'); 
      text('GIORNO '+ (1+Math.floor(timeOfDay)) +'   KM '+Math.floor(dist/100), W/2,H-18,'#f4a623',9,'center');
    }
  };
  function hit(){ if(state!=='play')return; lives--; speed=0.25; beep(90,0.25,'sawtooth',0.12);
    if(lives<=0){ state='over'; showMsg('GAME OVER',gameOverLine('enduro',passed,'Sorpassi'),'RIGIOCA',()=>reset()); } }
})();

/* ============================================================
   THUMBNAILS for the menu
   ============================================================ */
function drawThumbs(){
  const make=(id,fn)=>{ const c=document.querySelector('[data-thumb="'+id+'"]'); if(!c)return;
    const x=c.getContext('2d'); fn(x); };
  make('pitfall',x=>{x.fillStyle='#6fae3a';x.fillRect(0,0,54,30);x.fillStyle='#caa64b';x.fillRect(0,30,54,4);
    x.fillStyle='#000';x.fillRect(0,34,54,6);x.fillStyle='#2aa84a';x.fillRect(20,22,6,8);x.fillStyle='#c1281e';x.fillRect(20,18,6,4);});
  make('riverraid',x=>{x.fillStyle='#2c8a3a';x.fillRect(0,0,54,40);x.fillStyle='#2a3ac1';x.fillRect(16,0,22,40);
    x.fillStyle='#ffd34a';x.fillRect(24,26,6,8);x.fillStyle='#c1281e';x.fillRect(22,8,10,4);});
  make('invaders',x=>{x.fillStyle='#000';x.fillRect(0,0,54,40);x.fillStyle='#9ad44a';
    [[8,6],[24,6],[40,6],[8,18],[24,18],[40,18]].forEach(p=>x.fillRect(p[0],p[1],8,6));
    x.fillStyle='#3ad44a';x.fillRect(23,32,8,4);});
  make('pacman',x=>{x.fillStyle='#000';x.fillRect(0,0,54,40);x.fillStyle='#2a2ad4';
    x.fillRect(4,4,46,4);x.fillRect(4,4,4,32);x.fillRect(46,4,4,32);x.fillRect(4,32,46,4);
    x.fillStyle='#f4d44a';x.beginPath();x.arc(20,20,7,0.5,5.8);x.lineTo(20,20);x.fill();
    x.fillStyle='#e84a3a';x.beginPath();x.arc(36,20,6,Math.PI,0);x.lineTo(42,26);x.lineTo(30,26);x.fill();});
  make('enduro',x=>{const g=x.createLinearGradient(0,0,0,40);g.addColorStop(0,'#2a6ad4');g.addColorStop(.4,'#2a7d2a');g.addColorStop(1,'#2a7d2a');
    x.fillStyle=g;x.fillRect(0,0,54,40);x.fillStyle='#555';x.beginPath();x.moveTo(24,12);x.lineTo(30,12);x.lineTo(44,40);x.lineTo(10,40);x.fill();
    x.fillStyle='#e84a3a';x.fillRect(22,30,10,7);});
}

/* ---------- menu wiring ---------- */
const GAMES={pitfall:Pitfall,riverraid:RiverRaid,invaders:Invaders,pacman:Maze,enduro:Enduro};
document.querySelectorAll('.game-row').forEach(row=>{
  row.addEventListener('click',()=>{ const g=GAMES[row.dataset.game]; if(g) startGame(g); });
});

/* ---------- responsive canvas sizing ---------- */
addEventListener('resize', ()=>{ resizeCanvas(); });
addEventListener('orientationchange', ()=>setTimeout(resizeCanvas,200));
resizeCanvas();

drawThumbs();
showMenu();
})();
