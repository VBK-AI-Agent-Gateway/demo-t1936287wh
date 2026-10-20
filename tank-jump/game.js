/* ============================================================
   坦克跳坑 · Tank Jump — 经典高级卡通版
   Canvas 2D · 蓄力跳跃 · 程序化地形 · 粒子特效 · WebAudio 音效
   ============================================================ */
(() => {
'use strict';

// ---------- 基础 ----------
const canvas = document.getElementById('game');
const ctx = canvas.getContext('2d');
const W = canvas.width, H = canvas.height; // 360x640 竖版

const ui = {
  score: document.getElementById('score'),
  dist:  document.getElementById('dist'),
  lives: document.getElementById('lives'),
  start: document.getElementById('overlay-start'),
  pause: document.getElementById('overlay-pause'),
  over:  document.getElementById('overlay-over'),
  finalScore: document.getElementById('final-score'),
  finalDist:  document.getElementById('final-dist'),
  bestScore:  document.getElementById('best-score'),
};

const GROUND_Y = 470;          // 地面基准线
const GRAVITY  = 2400;         // 重力 px/s^2
const MOVE_SPEED = 190;        // 坦克地面速度 px/s
const MAX_CHARGE = 1.0;        // 最大蓄力
const CHARGE_RATE = 1.4;       // 蓄力速度 /s

// ---------- 工具 ----------
const rand = (a,b)=>a+Math.random()*(b-a);
const clamp = (v,a,b)=>v<a?a:v>b?b:v;
const lerp = (a,b,t)=>a+(b-a)*t;

// ---------- 游戏状态 ----------
const S = {
  running:false, paused:false, over:false,
  time:0, camX:0,
  score:0, lives:3, dist:0, best: +(localStorage.getItem('tankjump_best')||0),
  charging:false, charge:0,
  speed: MOVE_SPEED,
};

// ---------- 音效 (WebAudio 合成) ----------
let AC=null;
function ac(){ if(!AC){ try{ AC=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} } return AC; }
function beep(freq, dur, type='square', vol=0.14, slide=0){
  const a=ac(); if(!a) return;
  const o=a.createOscillator(), g=a.createGain();
  o.type=type; o.frequency.setValueAtTime(freq, a.currentTime);
  if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(40,freq+slide), a.currentTime+dur);
  g.gain.setValueAtTime(vol, a.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, a.currentTime+dur);
  o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime+dur);
}
const sndJump  = ()=>beep(340,0.22,'square',0.13,420);
const sndCharge =()=>beep(180,0.05,'sawtooth',0.05,60);
const sndStar   =()=>{beep(880,0.09,'sine',0.16); setTimeout(()=>beep(1320,0.12,'sine',0.16),70);};
const sndPit    =()=>beep(220,0.4,'sawtooth',0.16,-160);
const sndLand   =()=>beep(120,0.1,'triangle',0.1,-40);
const sndOver   =()=>{beep(440,0.2,'square',0.15); setTimeout(()=>beep(330,0.3,'square',0.15),160);};

// ---------- 粒子 ----------
const particles=[];
function addParticle(x,y,vx,vy,life,color,size,grav=1){
  particles.push({x,y,vx,vy,life,max:life,color,size,grav});
}
function burst(x,y,n,color,spd=200,life=0.6,size=5,grav=1){
  for(let i=0;i<n;i++){ const a=rand(0,Math.PI*2),s=rand(spd*0.3,spd);
    addParticle(x,y,Math.cos(a)*s,Math.sin(a)*s,rand(life*0.5,life),color,rand(size*0.5,size),grav);}
}
function updateParticles(dt){
  for(let i=particles.length-1;i>=0;i--){ const p=particles[i];
    p.life-=dt; if(p.life<=0){particles.splice(i,1);continue;}
    p.vy += GRAV*p.grav*dt*0.4; p.x+=p.vx*dt; p.y+=p.vy*dt; }
}
function drawParticles(){
  for(const p of particles){ const a=clamp(p.life/p.max,0,1);
    ctx.globalAlpha=a; ctx.fillStyle=p.color;
    ctx.beginPath(); ctx.arc(p.x,p.y,p.size*a+0.5,0,Math.PI*2); ctx.fill(); }
  ctx.globalAlpha=1;
}

// ---------- 程序化地形（深坑） ----------
// segments: {type:'ground'|'pit', w}
const segments=[]; let terrainX=0;
const STAR_TYPES=0;
const stars=[]; // {x,y,taken}
function ensureTerrain(untilX){
  while(terrainX < untilX){
    const gw = rand(260, 560);
    segments.push({type:'ground', x:terrainX, w:gw});
    terrainX += gw;
    // 决定是否有坑
    if(terrainX > 420){ // 前 420px 保证安全起始
      const pw = rand(90, 175) * (1 + Math.min(S.dist/2600,0.7));
      segments.push({type:'pit', x:terrainX, w:pw});
      terrainX += pw;
      // 坑上方悬浮星星
      if(Math.random()<0.62){
        stars.push({x:terrainX-pw/2 + rand(-20,20), y:GROUND_Y-rand(95,150), taken:false, phase:rand(0,6.28)});
      }
    }
  }
}
function groundAt(x){
  for(const s of segments){
    if(s.type==='ground' && x>=s.x && x<s.x+s.w) return GROUND_Y;
    if(s.type==='pit' && x>=s.x && x<s.x+s.w) return null;
  }
  return null; // 未生成区域视作坑（不该发生）
}
function pitAt(x){
  for(const s of segments) if(s.type==='pit'&&x>=s.x&&x<s.x+s.w) return s;
  return null;
}

// ---------- 坦克 ----------
const tank = {
  x:80, y:GROUND_Y, vy:0,
  w:58, h:36,
  onGround:true,
  barrelAngle:-0.35,
  trackPhase:0,
  tilt:0,
};

// ---------- 背景（云、远山、树） ----------
const clouds=[], hills=[];
function initDecor(){
  clouds.length=0; hills.length=0;
  for(let i=0;i<9;i++) clouds.push({x:rand(0,W*2),y:rand(30,180),s:rand(0.6,1.4),sp:rand(6,16)});
  for(let i=0;i<14;i++) hills.push({x:i*140+rand(-40,40),w:rand(160,280),h:rand(70,150),c:i%2});
}
initDecor();

// ---------- 输入 ----------
let pressing=false;
function pressStart(e){
  if(S.over||!S.running||S.paused) return;
  e.preventDefault && e.preventDefault();
  if(!S.charging){ S.charging=true; S.charge=0; }
}
function pressEnd(e){
  if(!S.charging) return;
  e.preventDefault && e.preventDefault();
  doJump();
}
function doJump(){
  if(!tank.onGround){ S.charging=false; S.charge=0; return; }
  const p = clamp(S.charge/MAX_CHARGE, 0.15, 1);
  tank.vy = -(520 + p*760);          // 蓄力决定起跳力度
  tank.onGround=false;
  S.charging=false; S.charge=0;
  sndJump();
  // 尾气/尘土
  burst(tank.x-20, tank.y, 14, '#c9bda6', 240, 0.5, 6, 0.6);
}

window.addEventListener('keydown', ev=>{
  if(ev.code==='Space'||ev.code==='ArrowUp'||ev.code==='KeyW'){
    if(!ev.repeat) pressStart(ev);
    else ev.preventDefault();
  }
  if(ev.code==='KeyP'||ev.code==='Escape') togglePause();
});
window.addEventListener('keyup', ev=>{
  if(ev.code==='Space'||ev.code==='ArrowUp'||ev.code==='KeyW') pressEnd(ev);
});
// --- 手机触控：跳键蓄力/松开起跳 + 屏幕点击备用 ---
const jumpBtn = document.getElementById('jump-btn');
const chargeFill = document.getElementById('charge-fill');
function btnDown(e){
  if(S.over||!S.running||S.paused) return;
  e.preventDefault();
  jumpBtn.classList.add('pressed');
  pressStart(e);
}
function btnUp(e){
  jumpBtn.classList.remove('pressed');
  pressEnd(e);
}
if(jumpBtn){
  jumpBtn.addEventListener('pointerdown', btnDown);
  jumpBtn.addEventListener('pointerup', btnUp);
  jumpBtn.addEventListener('pointercancel', btnUp);
  jumpBtn.addEventListener('pointerleave', btnUp);
  jumpBtn.addEventListener('contextmenu', e=>e.preventDefault());
}
// 屏幕任意处点击（已蓄力则跳，未蓄力则先蓄力）——防误触：touchstart 只开始蓄力，touchend 起跳
canvas.addEventListener('pointerdown', pressStart);
window.addEventListener('pointerup', pressEnd);
window.addEventListener('pointercancel', pressEnd);
// 禁止双指缩放/双击缩放
document.addEventListener('gesturestart', e=>e.preventDefault());

// ---------- UI 按钮 ----------
document.getElementById('btn-start').onclick = ()=>{ ac(); startGame(); };
document.getElementById('btn-restart').onclick = ()=>{ startGame(); };
document.getElementById('btn-pause').onclick = ()=>togglePause();
document.getElementById('btn-resume').onclick = ()=>togglePause();

function togglePause(){
  if(S.over||!S.running) return;
  S.paused=!S.paused;
  ui.pause.classList.toggle('hidden', !S.paused);
  if(!S.paused) last=performance.now();
}
function startGame(){
  S.running=true; S.paused=false; S.over=false;
  S.score=0; S.lives=3; S.dist=0; S.speed=MOVE_SPEED; S.camX=0; S.time=0;
  S.charging=false; S.charge=0;
  segments.length=0; stars.length=0; terrainX=0;
  ensureTerrain(W+800);
  tank.x=80; tank.y=GROUND_Y; tank.vy=0; tank.onGround=true; tank.tilt=0;
  particles.length=0;
  ui.start.classList.add('hidden');
  ui.over.classList.add('hidden');
  ui.pause.classList.add('hidden');
  updateHUD();
  last=performance.now();
}
function gameOver(){
  S.over=true; S.running=false;
  sndOver();
  ui.finalScore.textContent=S.score;
  ui.finalDist.textContent=Math.floor(S.dist);
  if(S.score>S.best){ S.best=S.score; localStorage.setItem('tankjump_best',S.best); }
  ui.bestScore.textContent=S.best;
  ui.over.classList.remove('hidden');
}
function loseLife(reason){
  S.lives--;
  if(reason==='pit') sndPit();
  updateHUD();
  if(S.lives<=0){ gameOver(); return; }
  // 复活在坑后安全地面
  const safe = findSafeGround(tank.x+40);
  tank.x=safe; tank.y=GROUND_Y-6; tank.vy=0; tank.onGround=true;
  S.camX = Math.max(0, tank.x - W*0.30);
  S.charging=false; S.charge=0;
  burst(tank.x,tank.y-20,18,'#ff6b4a',300,0.7,7,0.5);
}
function findSafeGround(fromX){
  let x=fromX;
  for(let i=0;i<400;i++){ if(groundAt(x)!==null && groundAt(x+30)!==null && groundAt(x+70)!==null) return x; x+=10; }
  return fromX;
}
function updateHUD(){
  ui.score.textContent=S.score;
  ui.dist.textContent=Math.floor(S.dist);
  // 生命用 emoji 心显示
  ui.lives.textContent = '\u2764\uFE0F'.repeat(Math.max(0,S.lives)) || '\u2764\uFE0F';
}
function updateChargeBar(){
  if(!chargeFill) return;
  const p = S.charging ? clamp(S.charge/MAX_CHARGE,0,1) : 0;
  chargeFill.style.width = (p*100).toFixed(1)+'%';
}

// ---------- 碰撞 & 计分 ----------
let pitCooldown=0;
function updateGameplay(dt){
  S.time+=dt;
  // 蓄力
  if(S.charging && tank.onGround){ S.charge=clamp(S.charge+CHARGE_RATE*dt,0,MAX_CHARGE); if(Math.random()<0.3) sndCharge(); }

  // 难度递增
  S.speed = MOVE_SPEED + Math.min(S.dist*0.06, 150);

  // 坦克前进（空中略慢，地面快）
  const targetV = tank.onGround ? S.speed : S.speed*0.7;
  tank.x += targetV*dt;
  S.dist = tank.x/40;
  ensureTerrain(tank.x + W + 600);

  // 垂直物理
  const g = groundAt(tank.x + tank.w*0.4);
  if(tank.onGround){
    if(g===null){ // 走到坑上方 → 开始下坠
      tank.onGround=false; tank.vy=0;
    } else {
      tank.y = g;
      tank.vy = 0;
      tank.tilt = lerp(tank.tilt, 0, 10*dt);
    }
  }
  if(!tank.onGround){
    tank.vy += GRAVITY*dt;
    tank.y += tank.vy*dt;
    tank.tilt = clamp(tank.vy/1400, -0.5, 0.6);
    const gg = groundAt(tank.x + tank.w*0.4);
    if(gg!==null && tank.y>=gg && tank.vy>0){
      tank.y=gg; tank.vy=0; tank.onGround=true;
      sndLand();
      burst(tank.x, tank.y, 12, '#d8ccb4', 200, 0.45, 6, 0.6);
    }
  }

  // 掉坑检测（坦克中心落入坑）
  pitCooldown-=dt;
  const cx = tank.x;
  const pit = pitAt(cx);
  if(pit && tank.y > GROUND_Y + 40){
    loseLife('pit');
    return;
  }
  // 越过坑奖励：坦克完全通过坑右边缘
  if(pitCooldown<=0){
    for(const s of segments){
      if(s.type==='pit' && tank.x > s.x+s.w+30 && !s.done && tank.x < s.x+s.w+160 && tank.onGround){
        s.done=true; S.score+=10; sndStar(); updateHUD();
        burst(tank.x-40, tank.y-30, 8, '#ffe066', 160, 0.5, 4, 0.5);
      }
    }
  }

  // 星星收集
  for(const st of stars){
    if(st.taken) continue;
    const dx=st.x-tank.x, dy=st.y-(tank.y-tank.h*0.5);
    if(Math.abs(dx)<46 && Math.abs(dy)<46){
      st.taken=true; S.score+=50; sndStar(); updateHUD();
      burst(st.x,st.y,16,'#ffd93b',240,0.7,6,0.3);
    }
  }

  // 排除过远的段与星
  while(segments.length && segments[0].x+segments[0].w < tank.x-600) segments.shift();
  for(let i=stars.length-1;i>=0;i--) if(stars[i].taken||stars[i].x<tank.x-400) stars.splice(i,1);

  // 相机
  const targetCam = tank.x - W*0.30;
  S.camX = lerp(S.camX, targetCam, 6*dt);
  if(S.camX<0) S.camX=0;

  // 尾气烟雾
  if(tank.onGround && Math.random()<0.35){
    addParticle(tank.x-34, tank.y-16, rand(-60,-20), rand(-40,-10), rand(0.4,0.8), 'rgba(200,200,200,0.5)', rand(4,8), -0.1);
  }
}

// ============================================================
//  渲染：高级卡通画风
// ============================================================
function drawBackground(){
  // 天空渐变
  const sky = ctx.createLinearGradient(0,0,0,GROUND_Y);
  sky.addColorStop(0,'#6ec6ff'); sky.addColorStop(0.55,'#a8e0ff'); sky.addColorStop(1,'#ffe9b8');
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);

  // 太阳
  ctx.save();
  ctx.translate(W-120,90);
  const glow=ctx.createRadialGradient(0,0,10,0,0,70);
  glow.addColorStop(0,'rgba(255,240,160,0.95)'); glow.addColorStop(1,'rgba(255,240,160,0)');
  ctx.fillStyle=glow; ctx.beginPath(); ctx.arc(0,0,70,0,Math.PI*2); ctx.fill();
  ctx.fillStyle='#ffe066'; ctx.beginPath(); ctx.arc(0,0,34,0,Math.PI*2); ctx.fill();
  ctx.restore();

  // 远山（两层视差）
  const cam=S.camX;
  for(const h of hills){
    const px = ((h.x - cam*0.25) % (W+300) + (W+300)) % (W+300) - 150;
    ctx.fillStyle = h.c? '#5a8f5a' : '#4a7a6a';
    ctx.beginPath();
    ctx.moveTo(px-h.w/2, GROUND_Y);
    ctx.quadraticCurveTo(px, GROUND_Y-h.h*1.6, px+h.w/2, GROUND_Y);
    ctx.closePath(); ctx.fill();
    // 雪顶
    ctx.fillStyle='rgba(255,255,255,0.55)';
    ctx.beginPath();
    ctx.moveTo(px-h.w*0.1, GROUND_Y-h.h*0.95);
    ctx.quadraticCurveTo(px, GROUND_Y-h.h*1.6, px+h.w*0.1, GROUND_Y-h.h*0.95);
    ctx.quadraticCurveTo(px, GROUND_Y-h.h*1.25, px-h.w*0.1, GROUND_Y-h.h*0.95);
    ctx.fill();
  }

  // 云朵
  for(const c of clouds){
    c.x -= c.sp*0.016;
    if(c.x < -140) c.x = W+140;
    drawCloud(c.x, c.y, c.s);
  }
}
function drawCloud(x,y,s){
  ctx.save(); ctx.translate(x,y); ctx.scale(s,s);
  ctx.fillStyle='rgba(255,255,255,0.92)';
  const puffs=[[-38,6,26],[0,0,34],[34,8,24],[-8,14,22],[20,16,20]];
  for(const [px,py,r] of puffs){ ctx.beginPath(); ctx.arc(px,py,r,0,Math.PI*2); ctx.fill(); }
  ctx.restore();
}

function drawTerrain(){
  const cam=S.camX;
  for(const s of segments){
    const sx = s.x - cam;
    if(sx+s.w < -50 || sx > W+50) continue;
    if(s.type==='ground') drawGroundSeg(sx, s.w);
    else drawPitSeg(sx, s.w);
  }
}
function drawGroundSeg(x,w){
  // 草皮顶层
  const grass=ctx.createLinearGradient(0,GROUND_Y,0,GROUND_Y+26);
  grass.addColorStop(0,'#7ed957'); grass.addColorStop(1,'#4fa832');
  ctx.fillStyle=grass;
  ctx.beginPath(); ctx.rect(x,GROUND_Y,w,H-GROUND_Y); ctx.fill();
  // 泥土层
  const soil=ctx.createLinearGradient(0,GROUND_Y+24,0,H);
  soil.addColorStop(0,'#a9743f'); soil.addColorStop(1,'#6b4423');
  ctx.fillStyle=soil;
  ctx.beginPath(); ctx.rect(x,GROUND_Y+24,w,H-GROUND_Y-24); ctx.fill();
  // 草皮锯齿
  ctx.fillStyle='#7ed957';
  ctx.beginPath();
  for(let i=0;i<w;i+=16){ ctx.moveTo(x+i,GROUND_Y+2); ctx.lineTo(x+i+8,GROUND_Y-8); ctx.lineTo(x+i+16,GROUND_Y+2); }
  ctx.fill();
  // 泥土斑点
  ctx.fillStyle='rgba(80,50,25,0.4)';
  for(let i=0;i<w;i+=40){ const dx=x+((i*37)%w); ctx.beginPath(); ctx.arc(dx,GROUND_Y+40+((i*13)%30),4,0,6.3); ctx.fill(); }
}
function drawPitSeg(x,w){
  // 深坑黑洞
  const pit=ctx.createLinearGradient(0,GROUND_Y,0,H);
  pit.addColorStop(0,'#241009'); pit.addColorStop(1,'#000');
  ctx.fillStyle=pit;
  ctx.beginPath(); ctx.rect(x,GROUND_Y,w,H-GROUND_Y); ctx.fill();
  // 坑口阴影边缘
  ctx.fillStyle='#3a2416';
  ctx.fillRect(x-4,GROUND_Y-3,8,14);
  ctx.fillRect(x+w-4,GROUND_Y-3,8,14);
  // 尖牙
  ctx.fillStyle='#e8e0d0';
  for(let i=x+6;i<x+w-6;i+=18){ ctx.beginPath(); ctx.moveTo(i,GROUND_Y); ctx.lineTo(i+9,GROUND_Y+16); ctx.lineTo(i+18,GROUND_Y); ctx.fill(); }
}

function drawStars(){
  const cam=S.camX;
  for(const st of stars){
    if(st.taken) continue;
    const sx=st.x-cam; if(sx<-40||sx>W+40) continue;
    const sy=st.y+Math.sin(S.time*3+st.phase)*7;
    drawStar(sx,sy,15,'#ffd93b','#ff9d2e');
  }
}
function drawStar(x,y,r,fill,stroke){
  ctx.save(); ctx.translate(x,y); ctx.rotate(Math.sin(y*0.1)*0.2);
  ctx.beginPath();
  for(let i=0;i<10;i++){ const ang=-Math.PI/2 + i*Math.PI/5; const rr=i%2?r*0.46:r;
    ctx.lineTo(Math.cos(ang)*rr, Math.sin(ang)*rr); }
  ctx.closePath();
  ctx.fillStyle=fill; ctx.fill();
  ctx.lineWidth=2.5; ctx.strokeStyle=stroke; ctx.stroke();
  ctx.restore();
}

// ---------- 卡通坦克 ----------
function drawTank(){
  const cam=S.camX;
  const x=tank.x-cam, y=tank.y;
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(tank.tilt*0.5);

  // 阴影
  if(tank.onGround){ ctx.save(); ctx.translate(0,4); ctx.scale(1,0.3);
    ctx.fillStyle='rgba(0,0,0,0.28)'; ctx.beginPath(); ctx.ellipse(0,0,44,18,0,0,6.3); ctx.fill(); ctx.restore(); }

  // ---- 履带 ----
  ctx.fillStyle='#2f3b2f';
  roundRect(-42,-20,84,26,13); ctx.fill();
  ctx.strokeStyle='#1b231b'; ctx.lineWidth=3; ctx.stroke();
  // 履带纹
  ctx.strokeStyle='#4a5a4a'; ctx.lineWidth=4;
  tank.trackPhase = (tank.trackPhase + S.speed*0.02) % 14;
  for(let i=-40;i<40;i+=14){ const off=((i+tank.trackPhase)%80+80)%80-40;
    ctx.beginPath(); ctx.moveTo(off,-16); ctx.lineTo(off,-2); ctx.stroke(); }
  // 负重轮
  for(const wx of [-26,-9,9,26]){ ctx.fillStyle='#c9c9c9'; ctx.beginPath(); ctx.arc(wx,-7,7,0,6.3); ctx.fill();
    ctx.fillStyle='#7a7a7a'; ctx.beginPath(); ctx.arc(wx,-7,3,0,6.3); ctx.fill(); }

  // ---- 车体 ----
  const body=ctx.createLinearGradient(0,-46,0,-16);
  body.addColorStop(0,'#8fd44f'); body.addColorStop(1,'#4f9e34');
  ctx.fillStyle=body;
  roundRect(-36,-46,72,28,7); ctx.fill();
  ctx.strokeStyle='#2f6b1e'; ctx.lineWidth=3; ctx.stroke();
  // 高光
  ctx.fillStyle='rgba(255,255,255,0.35)';
  roundRect(-30,-43,44,7,3); ctx.fill();
  // 车头挡板
  ctx.fillStyle='#6bbf3f'; roundRect(28,-44,10,24,4); ctx.fill();
  ctx.strokeStyle='#2f6b1e'; ctx.lineWidth=2; ctx.stroke();

  // ---- 炮塔 ----
  ctx.fillStyle='#7ac943'; ctx.beginPath(); ctx.arc(-4,-50,17,Math.PI,0); ctx.fill();
  ctx.fillRect(-21,-50,34,8);
  ctx.strokeStyle='#2f6b1e'; ctx.lineWidth=3; ctx.stroke();
  ctx.beginPath(); ctx.arc(-4,-50,17,Math.PI,0); ctx.stroke();
  // 指挥塔舱盖
  ctx.fillStyle='#4f9e34'; ctx.beginPath(); ctx.arc(-4,-64,7,Math.PI,0); ctx.fill();
  ctx.stroke();

  // ---- 炮管 ----
  const ang = tank.barrelAngle + (S.charging? -S.charge*0.5 : 0);
  ctx.save(); ctx.translate(6,-54); ctx.rotate(ang);
  ctx.fillStyle='#3d6b28'; roundRect(0,-5,52,10,4); ctx.fill();
  ctx.strokeStyle='#24401a'; ctx.lineWidth=2.5; ctx.stroke();
  ctx.fillStyle='#2c5220'; roundRect(44,-7,12,14,3); ctx.fill(); ctx.stroke();
  ctx.restore();

  // ---- 装饰：五角星徽章 + 眼睛（卡通感） ----
  drawStar(-20,-32,8,'#ffd93b','#c98a12');
  // 卡通眼睛
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(18,-36,7,0,6.3); ctx.fill();
  ctx.fillStyle='#222'; ctx.beginPath(); ctx.arc(20,-36,3.5,0,6.3); ctx.fill();
  ctx.fillStyle='#fff'; ctx.beginPath(); ctx.arc(21,-38,1.4,0,6.3); ctx.fill();

  ctx.restore();
}
function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y); ctx.arcTo(x+w,y,x+w,y+h,r); ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r); ctx.arcTo(x,y,x+w,y,r); ctx.closePath();
}

// ---------- 蓄力条 ----------
function drawChargeBar(){
  return; // 蓄力条已移到底部 DOM (#charge-fill)
  if(!S.charging || !tank.onGround) return;
  const cam=S.camX;
  const bx=tank.x-cam-30, by=tank.y-100, bw=60, bh=12;
  ctx.fillStyle='rgba(0,0,0,0.5)'; roundRect(bx-3,by-3,bw+6,bh+6,6); ctx.fill();
  ctx.fillStyle='#333'; roundRect(bx,by,bw,bh,4); ctx.fill();
  const p=S.charge/MAX_CHARGE;
  const g=ctx.createLinearGradient(bx,0,bx+bw,0);
  g.addColorStop(0,'#5cf05c'); g.addColorStop(0.5,'#ffe14d'); g.addColorStop(1,'#ff4d4d');
  ctx.fillStyle=g; roundRect(bx,by,Math.max(6,bw*p),bh,4); ctx.fill();
  ctx.strokeStyle='#fff'; ctx.lineWidth=2; roundRect(bx,by,bw,bh,4); ctx.stroke();
}

// ---------- 提示文字 ----------
function drawHint(){
  if(S.running && !S.over && S.time<6 && S.dist<40){
    ctx.save(); ctx.globalAlpha=clamp(1-(S.time-4)/2,0,1);
    ctx.font='bold 26px sans-serif'; ctx.textAlign='center';
    ctx.fillStyle='#fff'; ctx.strokeStyle='#2c548a'; ctx.lineWidth=6;
    const msg='按住右下「跳」按钮蓄力 → 松开起跳！';
    ctx.strokeText(msg, W/2, 150); ctx.fillText(msg, W/2, 150);
    ctx.restore();
  }
}

// ---------- 主循环 ----------
let last=performance.now();
function loop(now){
  requestAnimationFrame(loop);
  let dt=(now-last)/1000; last=now;
  if(dt>0.05) dt=0.05;   // 防大帧跳

  if(S.running && !S.paused && !S.over){
    updateGameplay(dt);
    updateParticles(dt);
    updateChargeBar();
  } else {
    updateParticles(dt);
    updateChargeBar();
  }

  // ---- 绘制 ----
  drawBackground();
  drawTerrain();
  drawStars();
  drawParticles();
  if(S.running || S.over) { drawTank(); drawChargeBar(); drawHint(); }
  else {
    // 开始界面下也让坦克亮相
    drawTank();
  }
}
requestAnimationFrame(loop);

// 初始地形（供开始背景）
ensureTerrain(W+800);
updateHUD();
})();
