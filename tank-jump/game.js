(function(){
"use strict";
const cv = document.getElementById('game');
const ctx = cv.getContext('2d');
const W = cv.width, H = cv.height;

const UI = {
  score: document.getElementById('score'),
  best: document.getElementById('best'),
  state: document.getElementById('state'),
  overlay: document.getElementById('overlay'),
  ovTitle: document.getElementById('ovTitle'),
  ovDesc: document.getElementById('ovDesc'),
  btnStart: document.getElementById('btnStart')
};

// ---- 常量 ----
const TILE = 48;                 // 地面砖块尺寸
const GROUND_Y = H - TILE*2;      // 地面基准线
const GRAV = 0.7, MOVE_ACC = 0.9, MAX_VX = 7.5, FRICTION = 0.86;
const JUMP_V = -13.5;

let tiles = [];       // {x,w} 有地面的段，其余为坑
let segX = 0;         // 下一段生成位置
let tank, camX, score, best, running, dead, particles;

best = +(localStorage.getItem('tankjump_best') || 0);
UI.best.textContent = best;

function reset(){
  tiles = [];
  camX = 0; score = 0; dead = false;
  particles = [];
  // 起始平台
  pushSegment(0, TILE*6, 0);
  segX = TILE*6;
  genAhead();
  tank = { x: TILE*1.5, y: GROUND_Y-34, w: 44, h: 34, vx: 0, vy: 0, onGround: true, track: 0 };
  running = true;
  UI.state.textContent = 'RUN';
}

// 生成一段地面（有随机宽度的坑）
function pushSegment(x, w, lvl){
  tiles.push({ x:x, w:w });
}
function genAhead(){
  while(segX < camX + W*2){
    const progress = segX / TILE;            // 越远越难
    // 坑宽：随进度变宽
    const gap = TILE * (1 + Math.random() * (1 + Math.min(3, progress/40)));
    const land = TILE * (2 + Math.random()*3);
    segX += gap;                             // 跳过坑
    pushSegment(segX, land, 0);
    segX += land;
  }
  // 清理屏外数据
  tiles = tiles.filter(t => t.x + t.w > camX - TILE*4);
}

function groundAt(x){
  for(let i=0;i<tiles.length;i++){
    const t = tiles[i];
    if(x >= t.x && x < t.x + t.w) return GROUND_Y;
  }
  return null;
}

// ---- 输入 ----
const keys = { left:false, right:false, jump:false };
const KEYMAP = {
  ArrowLeft:'left', KeyA:'left',
  ArrowRight:'right', KeyD:'right',
  ArrowUp:'jump', KeyW:'jump', Space:'jump'
};
addEventListener('keydown', e=>{
  const k = KEYMAP[e.code]; if(!k) return;
  e.preventDefault();
  if(k==='jump' && !keys.jump) tryJump();
  keys[k]=true;
  if(!running && (e.code==='Enter'||e.code==='Space')) UI.btnStart.click();
});
addEventListener('keyup', e=>{ const k=KEYMAP[e.code]; if(k) keys[k]=false; });

// 触屏按钮
document.querySelectorAll('.tbtn').forEach(b=>{
  const k = b.dataset.k;
  const on = ev=>{ ev.preventDefault(); if(k==='jump'){ tryJump(); } keys[k]=true; };
  const off = ev=>{ ev.preventDefault(); keys[k]=false; };
  b.addEventListener('touchstart', on, {passive:false});
  b.addEventListener('touchend', off, {passive:false});
  b.addEventListener('mousedown', on);
  b.addEventListener('mouseup', off);
  b.addEventListener('mouseleave', off);
});

let jumpHeld = false;
function tryJump(){
  if(running && tank && tank.onGround){
    tank.vy = JUMP_V; tank.onGround = false;
    for(let i=0;i<8;i++) spawnParticle(tank.x+tank.w/2, tank.y+tank.h, '#9aa7c0');
  }
}

// ---- 粒子 ----
function spawnParticle(x,y,c){
  particles.push({x,y,vx:(Math.random()-.5)*4, vy:-Math.random()*3, life:30, c});
}

// ---- 更新 ----
function update(){
  if(!running) return;
  // 水平
  if(keys.left)  tank.vx -= MOVE_ACC;
  if(keys.right) tank.vx += MOVE_ACC;
  tank.vx *= FRICTION;
  if(Math.abs(tank.vx) > MAX_VX) tank.vx = Math.sign(tank.vx)*MAX_VX;
  tank.x += tank.vx;
  if(tank.x < camX + TILE*0.6){ tank.x = camX + TILE*0.6; tank.vx = 0; }

  // 垂直
  tank.vy += GRAV;
  tank.y += tank.vy;

  const footX1 = tank.x + 6, footX2 = tank.x + tank.w - 6;
  const g1 = groundAt(footX1), g2 = groundAt(footX2);
  const gy = (g1!==null || g2!==null) ? GROUND_Y : null;

  if(gy !== null && tank.y + tank.h >= gy && tank.vy >= 0){
    tank.y = gy - tank.h; tank.vy = 0; tank.onGround = true;
  } else {
    tank.onGround = false;
  }

  // 摄像机跟随
  const target = tank.x - W*0.35;
  if(target > camX) camX = target;

  // 掉坑
  if(tank.y > H + 100){ gameOver(); }

  // 分数 = 前进距离
  score = Math.max(score, Math.floor((tank.x - TILE*1.5)/TILE*10)/10 | 0);
  score = Math.max(0, Math.floor((tank.x - TILE*1.5)/10));
  UI.score.textContent = score;

  genAhead();

  // 履带痕迹
  tank.track += Math.abs(tank.vx);
  if(tank.onGround && tank.track > 18 && Math.abs(tank.vx)>1){
    tank.track = 0;
    spawnParticle(tank.x+tank.w/2, tank.y+tank.h, '#6b7590');
  }

  // 粒子
  for(let i=particles.length-1;i>=0;i--){
    const p=particles[i]; p.x+=p.vx; p.y+=p.vy; p.vy+=0.2; p.life--;
    if(p.life<=0) particles.splice(i,1);
  }
}

function gameOver(){
  running = false; dead = true;
  UI.state.textContent = 'OVER';
  if(score > best){ best = score; localStorage.setItem('tankjump_best', best); UI.best.textContent = best; }
  UI.ovTitle.textContent = '💥 游戏结束';
  UI.ovDesc.innerHTML = '本次前进 <b style="color:#5cf08a">'+score+'</b> 米<br>最佳纪录 '+best+' 米';
  UI.btnStart.textContent = '再来一局';
  UI.overlay.classList.add('show');
}

// ---- 渲染 ----
function drawTank(x,y){
  ctx.save();
  ctx.translate(x, y);
  // 履带
  ctx.fillStyle = '#2b3242';
  roundRect(0, 20, 44, 14, 6); ctx.fill();
  ctx.fillStyle = '#4a5570';
  for(let i=0;i<5;i++){ ctx.fillRect(4+i*8, 23, 5, 8); }
  // 车身
  ctx.fillStyle = '#3f7a4a';
  roundRect(3, 8, 38, 14, 3); ctx.fill();
  ctx.fillStyle = '#57a86a';
  ctx.fillRect(6, 10, 32, 5);
  // 炮塔
  ctx.fillStyle = '#356b41';
  roundRect(14, 2, 16, 10, 3); ctx.fill();
  // 炮管
  ctx.fillStyle = '#2b3242';
  ctx.fillRect(28, 5, 16, 4);
  ctx.restore();
}
function roundRect(x,y,w,h,r){
  ctx.beginPath();
  ctx.moveTo(x+r,y);
  ctx.arcTo(x+w,y,x+w,y+h,r);
  ctx.arcTo(x+w,y+h,x,y+h,r);
  ctx.arcTo(x,y+h,x,y,r);
  ctx.arcTo(x,y,x+w,y,r);
  ctx.closePath();
}

function drawBG(){
  // 天空渐变
  const g = ctx.createLinearGradient(0,0,0,H);
  g.addColorStop(0,'#0a0f1e'); g.addColorStop(1,'#16233a');
  ctx.fillStyle = g; ctx.fillRect(0,0,W,H);
  // 星星
  ctx.fillStyle = 'rgba(255,255,255,.5)';
  for(let i=0;i<40;i++){
    const sx = (i*137 - camX*0.2) % W; const x = (sx+W)%W;
    const y = (i*53) % (H*0.5);
    ctx.fillRect(x, y, 2, 2);
  }
  // 远山
  ctx.fillStyle = '#101a2c';
  for(let i=0;i<12;i++){
    const bx = ((i*260) - camX*0.4) % (W+260) - 130;
    ctx.beginPath();
    ctx.moveTo(bx, GROUND_Y);
    ctx.lineTo(bx+130, GROUND_Y-120);
    ctx.lineTo(bx+260, GROUND_Y);
    ctx.fill();
  }
}

function drawGround(){
  for(const t of tiles){
    const sx = t.x - camX;
    if(sx + t.w < -10 || sx > W+10) continue;
    // 土层
    ctx.fillStyle = '#5a4632';
    ctx.fillRect(sx, GROUND_Y, t.w, H-GROUND_Y);
    // 草皮
    ctx.fillStyle = '#4f8a3d';
    ctx.fillRect(sx, GROUND_Y, t.w, 10);
    ctx.fillStyle = '#6bb550';
    for(let i=0;i<t.w;i+=16) ctx.fillRect(sx+i, GROUND_Y, 10, 5);
    // 砖纹
    ctx.strokeStyle = 'rgba(0,0,0,.25)';
    ctx.strokeRect(sx, GROUND_Y, t.w, H-GROUND_Y);
  }
}

function drawParticles(){
  for(const p of particles){
    ctx.globalAlpha = Math.max(0, p.life/30);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x-camX, p.y, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function render(){
  drawBG();
  drawGround();
  drawParticles();
  if(tank) drawTank(tank.x-camX, tank.y);
  // 深渊提示
  ctx.fillStyle = 'rgba(0,0,0,.45)';
}

// ---- 主循环 ----
function loop(){
  update();
  render();
  requestAnimationFrame(loop);
}

UI.btnStart.addEventListener('click', ()=>{
  UI.overlay.classList.remove('show');
  reset();
});

// 初始渲染一帧背景
camX = 0; tank = null; particles = [];
reset(); running = false; UI.state.textContent='READY';
UI.overlay.classList.add('show');
loop();
})();
