/* 坦克跳坑 Tank Ditch Jump — 经典横版跳坑玩法
   纯 Canvas + 原生 JS，无依赖 */
'use strict';

const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const W = cvs.width, H = cvs.height;
const GROUND_Y = H - 90;           // 地面基准线
const GRAVITY = 0.62;
const JUMP_V = -13.2;

// ---------- DOM ----------
const overlay = document.getElementById('overlay');
const titleEl = document.getElementById('title');
const subEl = document.getElementById('sub');
const helpEl = document.getElementById('help');
const btnStart = document.getElementById('btnStart');
const finalEl = document.getElementById('finalScore');
const hud = {
  score: document.getElementById('hudScore'),
  level: document.getElementById('hudLevel'),
  lives: document.getElementById('hudLives'),
  coins: document.getElementById('hudCoins'),
  best: document.getElementById('hudBest'),
};

// ---------- 音效 (WebAudio 合成) ----------
let AC = null;
function audio() {
  if (!AC) { try { AC = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
  if (AC && AC.state === 'suspended') AC.resume();
  return AC;
}
function beep(freq, dur, type, vol, slide) {
  const ac = audio(); if (!ac) return;
  const o = ac.createOscillator(), g = ac.createGain();
  o.type = type || 'square'; o.frequency.setValueAtTime(freq, ac.currentTime);
  if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(40, freq + slide), ac.currentTime + dur);
  g.gain.setValueAtTime(vol || 0.12, ac.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + dur);
  o.connect(g); g.connect(ac.destination);
  o.start(); o.stop(ac.currentTime + dur);
}
const sfx = {
  jump:  () => beep(300, 0.18, 'square', 0.1, 300),
  double:() => beep(450, 0.18, 'square', 0.1, 400),
  coin:  () => { beep(880, 0.08, 'square', 0.1); setTimeout(() => beep(1320, 0.12, 'square', 0.1), 70); },
  stomp: () => beep(200, 0.12, 'sawtooth', 0.14, -120),
  hurt:  () => beep(160, 0.35, 'sawtooth', 0.16, -100),
  level: () => { beep(520,0.1,'square',0.1); setTimeout(()=>beep(660,0.1,'square',0.1),90); setTimeout(()=>beep(880,0.16,'square',0.1),180); },
  over:  () => beep(400, 0.7, 'sawtooth', 0.15, -320),
  start: () => beep(660, 0.14, 'square', 0.1, 200),
};

// ---------- 输入 ----------
const keys = {};
window.addEventListener('keydown', e => {
  if ([' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
  keys[e.code] = true;
  if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'play') pause();
  else if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'pause') resume();
  if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') && state === 'play') tryJump();
  if (e.code === 'Enter' && state !== 'play') btnStart.click();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function bindTouch(id, code) {
  const el = document.getElementById(id);
  const down = e => { e.preventDefault(); keys[code] = true; if (code === 'Space' && state === 'play') tryJump(); };
  const up = e => { e.preventDefault(); keys[code] = false; };
  el.addEventListener('touchstart', down, {passive:false});
  el.addEventListener('touchend', up, {passive:false});
  el.addEventListener('mousedown', down);
  el.addEventListener('mouseup', up);
  el.addEventListener('mouseleave', up);
}
bindTouch('tLeft', 'ArrowLeft');
bindTouch('tRight', 'ArrowRight');
bindTouch('tJump', 'Space');

btnStart.addEventListener('click', () => { audio(); sfx.start(); startGame(); });

// ---------- 游戏状态 ----------
let state = 'menu';   // menu | play | pause | over
let frame = 0;
let best = +(localStorage.getItem('tankDitchBest') || 0);

const game = {
  score: 0, coins: 0, lives: 3, level: 1, dist: 0,
  speed: 4.2, baseSpeed: 4.2, camX: 0, shake: 0,
  hurtCd: 0, invCd: 0,
};

const tank = {
  x: 120, y: GROUND_Y, vx: 0, vy: 0,
  w: 62, h: 34, onGround: true, jumps: 0,
  track: 0, // 履带动画
};

let platforms = [];  // {x, w} 实心地面段；段间即深坑
let enemies = [];    // {x, y, w, h, vx, alive, type}
let coins = [];      // {x, y, got, t}
let clouds = [];
let bushes = [];

function rnd(a, b) { return a + Math.random() * (b - a); }
function irnd(a, b) { return Math.floor(rnd(a, b + 1)); }

function genClouds() {
  clouds = [];
  for (let i = 0; i < 7; i++) clouds.push({ x: rnd(0, 3000), y: rnd(30, 200), s: rnd(0.5, 1.4) });
}

// 生成一屏地形（含坑、敌、金币），从 fromX 起
function genTerrain(fromX) {
  let x = fromX;
  const end = fromX + 4000;
  while (x < end) {
    const segW = irnd(220, 480);
    platforms.push({ x: x, w: segW });
    // 地面上的装饰与道具
    if (Math.random() < 0.7) {
      const n = irnd(1, 3);
      for (let i = 0; i < n; i++) {
        coins.push({ x: x + 40 + i * 46, y: GROUND_Y - irnd(46, 96), got: false, t: rnd(0, 6) });
      }
    }
    if (Math.random() < 0.45 && segW > 260) {
      enemies.push({ x: x + segW * rnd(0.4, 0.8), y: GROUND_Y, w: 40, h: 30, vx: rnd(0.6, 1.1) + game.level * 0.12, alive: true, t: rnd(0, 9) });
    }
    if (Math.random() < 0.5) bushes.push({ x: x + rnd(20, Math.max(30, segW - 40)), s: rnd(0.7, 1.3) });
    x += segW;
    // 深坑：随关卡变宽
    const pitW = irnd(70, 110 + game.level * 14);
    x += pitW;
  }
  return x;
}

function resetWorld() {
  platforms = []; enemies = []; coins = []; bushes = [];
  platforms.push({ x: -600, w: 900 });  // 起始安全地面
  genTerrain(300);
  genClouds();
}

function startGame() {
  Object.assign(game, { score: 0, coins: 0, lives: 3, level: 1, dist: 0, speed: 4.2, baseSpeed: 4.2, camX: 0, shake: 0, hurtCd: 0, invCd: 0 });
  Object.assign(tank, { x: 120, y: GROUND_Y, vx: 0, vy: 0, onGround: true, jumps: 0 });
  resetWorld();
  hideOverlay();
  state = 'play';
  updateHud();
}

function pause()  { state = 'pause'; showOverlay('已暂停', '按 P / Esc 或点击按钮继续', '继续', ''); helpEl.style.display=''; }
function resume() { hideOverlay(); state = 'play'; }
function gameOver() {
  state = 'over'; sfx.over();
  if (game.score > best) { best = game.score; localStorage.setItem('tankDitchBest', best); }
  showOverlay('游戏结束', '最终得分：' + game.score + '  ·  金币：' + game.coins + '  ·  到达关卡 ' + game.level, '再来一局', '');
  updateHud();
}

function showOverlay(t, s, btn, f) {
  titleEl.textContent = t; subEl.textContent = s;
  btnStart.textContent = btn; finalEl.textContent = f || '';
  helpEl.style.display = (state === 'over' || t === '已暂停') ? 'none' : '';
  overlay.classList.add('show');
}
function hideOverlay() { overlay.classList.remove('show'); }

function tryJump() {
  if (state !== 'play') return;
  if (tank.onGround) { tank.vy = JUMP_V; tank.onGround = false; tank.jumps = 1; sfx.jump(); }
  else if (tank.jumps < 2) { tank.vy = JUMP_V * 0.92; tank.jumps = 2; sfx.double(); puff(tank.x, tank.y); }
}
function puff(x, y) { for (let i=0;i<6;i++) parts.push({x:x+rnd(-14,14), y:y+rnd(-8,8), vx:rnd(-1.5,1.5), vy:rnd(-1,-0.2), life:24, c:'#ffffff'}); }

let parts = [];  // 粒子

function groundAt(x) {
  // 返回该 x 处的地面 y（有实心段）否则 null（深坑）
  for (const p of platforms) if (x >= p.x && x <= p.x + p.w) return GROUND_Y;
  return null;
}

function update(dt) {
  frame++;
  const left = keys['ArrowLeft'] || keys['KeyA'];
  const right = keys['ArrowRight'] || keys['KeyD'];

  // 速度随距离缓慢提升
  game.speed = game.baseSpeed + Math.min(4.5, game.dist / 2600);
  const newLevel = 1 + Math.floor(game.dist / 3000);
  if (newLevel > game.level) { game.level = newLevel; sfx.level(); }

  // 水平操控
  if (right) tank.vx = Math.min(tank.vx + 0.55, game.speed);
  else if (left) tank.vx = Math.max(tank.vx - 0.5, -2.6);
  else tank.vx *= tank.onGround ? 0.94 : 0.99;
  if (tank.vx < 0 && tank.x < game.camX + 60) tank.vx = 0;

  tank.x += tank.vx;
  if (tank.x < game.camX + 60) tank.x = game.camX + 60;

  // 垂直
  tank.vy += GRAVITY;
  tank.y += tank.vy;

  const g = groundAt(tank.x + tank.w / 2);
  const headY = tank.y;
  if (g !== null && headY >= g && tank.vy >= 0) {
    if (!tank.onGround && tank.vy > 6) puff(tank.x, g);
    tank.y = g; tank.vy = 0; tank.onGround = true; tank.jumps = 0;
  } else if (g === null) {
    tank.onGround = false;
  } else if (headY < g - 1) {
    tank.onGround = false;
  }

  tank.track += Math.abs(tank.vx) * 0.15;

  // 掉坑
  if (tank.y > H + 60) {
    game.lives--; game.shake = 14; sfx.hurt();
    if (game.lives <= 0) { gameOver(); return; }
    // 复活：回到最近安全地面
    let rx = game.camX + 140;
    while (groundAt(rx + tank.w/2) === null) rx += 30;
    tank.x = rx; tank.y = GROUND_Y - 40; tank.vy = 0; tank.vx = 0;
    tank.onGround = false; tank.jumps = 1;
    game.invCd = 90;
  }

  // 相机
  const targetCam = tank.x - 200;
  if (targetCam > game.camX) game.camX = targetCam;
  game.dist = Math.max(game.dist, tank.x);

  // 分数 = 距离 + 金币
  game.score = Math.floor(game.dist / 10) + game.coins * 25;
  if (game.hurtCd > 0) game.hurtCd--;
  if (game.invCd > 0) game.invCd--;
  if (game.shake > 0) game.shake--;

  // 地形无限生成/回收
  const lastX = platforms.length ? platforms[platforms.length - 1].x + platforms[platforms.length - 1].w : 0;
  if (lastX < game.camX + W + 800) genTerrain(lastX);
  platforms = platforms.filter(p => p.x + p.w > game.camX - 500);
  coins = coins.filter(c => c.x > game.camX - 300 && !c.got ? true : (!c.got && c.x > game.camX - 300));
  enemies = enemies.filter(e => e.alive && e.x > game.camX - 300);
  bushes = bushes.filter(b => b.x > game.camX - 300);

  // 金币
  for (const c of coins) {
    if (c.got) continue;
    c.t += 0.1;
    if (Math.abs(c.x - (tank.x + tank.w/2)) < 40 && Math.abs(c.y - (tank.y - tank.h/2)) < 44) {
      c.got = true; game.coins++; sfx.coin();
      for (let i=0;i<5;i++) parts.push({x:c.x, y:c.y, vx:rnd(-2,2), vy:rnd(-3,-0.5), life:26, c:'#ffe066'});
    }
  }

  // 敌人
  for (const e of enemies) {
    if (!e.alive) continue;
    e.t += 0.14;
    // 简单巡逻：到坑边折返
    const ahead = groundAt(e.x + Math.sign(e.vx) * (e.w/2 + 6));
    if (ahead === null) e.vx *= -1;
    e.x += e.vx;

    // 碰撞
    if (tank.invCd <= 0 &&
        Math.abs(e.x - tank.x) < (e.w + tank.w) / 2 - 4 &&
        Math.abs((e.y - e.h/2) - (tank.y - tank.h/2)) < (e.h + tank.h) / 2 - 4) {
      if (tank.vy > 1.5 && tank.y < e.y - e.h * 0.5) {
        // 踩爆
        e.alive = false; tank.vy = JUMP_V * 0.7; sfx.stomp(); game.score += 50;
        for (let i=0;i<8;i++) parts.push({x:e.x, y:e.y-e.h/2, vx:rnd(-3,3), vy:rnd(-4,0), life:30, c:'#58c96b'});
      } else {
        // 受伤
        game.lives--; game.hurtCd = 60; game.invCd = 90; game.shake = 12; sfx.hurt();
        tank.vy = -7; tank.vx = -3;
        if (game.lives <= 0) { gameOver(); return; }
      }
    }
  }

  // 粒子
  for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; }
  parts = parts.filter(p => p.life > 0);

  // 云
  for (const c of clouds) { c.x -= 0.25 * c.s; if (c.x < -200) { c.x = W + rnd(50, 400); c.y = rnd(30, 200); } }

  if (frame % 6 === 0) updateHud();
}

function updateHud() {
  hud.score.textContent = '分数 ' + game.score;
  hud.level.textContent = '关卡 ' + game.level;
  hud.lives.textContent = '生命 ' + '♥'.repeat(Math.max(0, game.lives));
  hud.coins.textContent = '金币 ' + game.coins;
  hud.best.textContent = '最高 ' + best;
}

// ---------- 绘制 ----------
function drawBackground() {
  // 天空渐变
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#6ec6ff'); g.addColorStop(0.7, '#b8e4ff'); g.addColorStop(1, '#dff5ff');
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  // 太阳
  ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(W - 90, 80, 40, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(W - 90, 80, 30, 0, 7); ctx.fill();
  // 远山
  ctx.fillStyle = '#a5d6a7';
  const off = -(game.camX * 0.2) % 400;
  for (let i = -1; i < 4; i++) {
    const bx = off + i * 400;
    ctx.beginPath(); ctx.moveTo(bx, GROUND_Y);
    ctx.quadraticCurveTo(bx + 100, GROUND_Y - 160, bx + 220, GROUND_Y);
    ctx.fill();
  }
  // 云
  ctx.fillStyle = 'rgba(255,255,255,.9)';
  for (const c of clouds) {
    const x = c.x - game.camX * 0.4;
    ctx.beginPath();
    ctx.arc(x, c.y, 20 * c.s, 0, 7);
    ctx.arc(x + 22 * c.s, c.y - 8 * c.s, 16 * c.s, 0, 7);
    ctx.arc(x + 44 * c.s, c.y, 18 * c.s, 0, 7);
    ctx.fill();
  }
}

function drawTerrain() {
  for (const p of platforms) {
    const x = p.x - game.camX;
    if (x > W || x + p.w < 0) continue;
    // 草皮
    ctx.fillStyle = '#4caf50'; ctx.fillRect(x, GROUND_Y, p.w, 12);
    ctx.fillStyle = '#388e3c'; ctx.fillRect(x, GROUND_Y + 12, p.w, 6);
    // 泥土
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(x, GROUND_Y + 18, p.w, H - GROUND_Y);
    ctx.fillStyle = '#795548';
    for (let i = 0; i < p.w; i += 34) ctx.fillRect(x + i + 6, GROUND_Y + 30, 14, 8);
    // 坑壁阴影
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x, GROUND_Y + 18, 4, H - GROUND_Y);
    ctx.fillRect(x + p.w - 4, GROUND_Y + 18, 4, H - GROUND_Y);
  }
  // 深坑黑底
  ctx.fillStyle = '#120a06';
  ctx.fillRect(0, GROUND_Y + 18, W, H - GROUND_Y);
  // 重画草皮在坑底之上
  for (const p of platforms) {
    const x = p.x - game.camX;
    if (x > W || x + p.w < 0) continue;
    ctx.fillStyle = '#4caf50'; ctx.fillRect(x, GROUND_Y, p.w, 12);
    ctx.fillStyle = '#388e3c'; ctx.fillRect(x, GROUND_Y + 12, p.w, 6);
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(x, GROUND_Y + 18, p.w, H - GROUND_Y);
    ctx.fillStyle = '#795548';
    for (let i = 0; i < p.w; i += 34) ctx.fillRect(x + i + 6, GROUND_Y + 30, 14, 8);
  }
  // 灌木
  for (const b of bushes) {
    const x = b.x - game.camX;
    if (x < -60 || x > W + 60) continue;
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath();
    ctx.arc(x, GROUND_Y, 16 * b.s, Math.PI, 0);
    ctx.arc(x + 20 * b.s, GROUND_Y, 13 * b.s, Math.PI, 0);
    ctx.arc(x - 20 * b.s, GROUND_Y, 12 * b.s, Math.PI, 0);
    ctx.fill();
  }
}

function drawCoin(c) {
  if (c.got) return;
  const x = c.x - game.camX, y = c.y + Math.sin(c.t) * 4;
  if (x < -30 || x > W + 30) return;
  const squish = Math.abs(Math.cos(c.t * 0.8));
  ctx.save(); ctx.translate(x, y); ctx.scale(Math.max(0.25, squish), 1);
  ctx.fillStyle = '#ffd54f'; ctx.beginPath(); ctx.arc(0, 0, 12, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffb300'; ctx.beginPath(); ctx.arc(0, 0, 9, 0, 7); ctx.fill();
  ctx.fillStyle = '#ffe082'; ctx.font = 'bold 12px monospace'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.scale(1 / Math.max(0.25, squish), 1); ctx.fillText('$', 0, 1);
  ctx.restore();
}

function drawEnemy(e) {
  const x = e.x - game.camX, y = e.y;
  if (x < -60 || x > W + 60) return;
  ctx.save(); ctx.translate(x, y);
  // 车体
  ctx.fillStyle = '#c62828'; ctx.fillRect(-20, -20, 40, 16);
  // 炮塔
  ctx.fillStyle = '#e53935'; ctx.fillRect(-8, -30, 18, 12);
  // 炮管（朝移动方向）
  const dir = Math.sign(e.vx) || 1;
  ctx.fillStyle = '#b71c1c'; ctx.fillRect(dir > 0 ? 8 : -24, -27, 16, 5);
  // 履带
  ctx.fillStyle = '#37474f'; ctx.fillRect(-22, -6, 44, 8);
  ctx.fillStyle = '#263238';
  const tw = Math.sin(e.t) * 4;
  for (let i = -18; i <= 14; i += 8) ctx.fillRect(i + tw, -5, 4, 6);
  // 眼睛
  ctx.fillStyle = '#fff'; ctx.fillRect(dir > 0 ? 2 : -8, -27, 5, 5);
  ctx.restore();
}

function drawTank() {
  const blink = game.invCd > 0 && Math.floor(frame / 4) % 2 === 0;
  if (blink) return;
  const x = tank.x - game.camX, y = tank.y;
  ctx.save(); ctx.translate(x, y);
  // 履带
  ctx.fillStyle = '#263238'; ctx.fillRect(-31, -12, 62, 12);
  ctx.fillStyle = '#37474f';
  for (let i = -28; i <= 24; i += 9) {
    const tx = ((i + tank.track) % 62 + 62) % 62 - 31;
    ctx.fillRect(tx, -10, 5, 8);
  }
  // 车体
  ctx.fillStyle = '#33691e'; ctx.fillRect(-30, -26, 60, 16);
  ctx.fillStyle = '#558b2f'; ctx.fillRect(-30, -26, 60, 5);
  // 炮塔
  ctx.fillStyle = '#33691e'; ctx.fillRect(-8, -36, 26, 12);
  ctx.fillStyle = '#689f38'; ctx.fillRect(-8, -36, 26, 4);
  // 炮管
  ctx.fillStyle = '#1b5e20'; ctx.fillRect(16, -34, 30, 6);
  ctx.fillStyle = '#33691e'; ctx.fillRect(42, -35, 6, 8);
  // 舱盖
  ctx.fillStyle = '#7cb342'; ctx.fillRect(-4, -40, 12, 5);
  // 星星
  ctx.fillStyle = '#ffe066'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
  ctx.fillText('★', -18, -14);
  ctx.restore();
}

function drawParts() {
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.life / 30);
    ctx.fillStyle = p.c;
    ctx.fillRect(p.x - game.camX, p.y, 4, 4);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.save();
  if (game.shake > 0) ctx.translate(rnd(-4, 4) * game.shake / 14, rnd(-4, 4) * game.shake / 14);
  drawBackground();
  drawTerrain();
  for (const c of coins) drawCoin(c);
  for (const e of enemies) drawEnemy(e);
  drawTank();
  drawParts();
  // 暂停提示
  if (state === 'pause') {
    ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, W, H);
  }
  ctx.restore();
}

function loop() {
  if (state === 'play') update(1);
  draw();
  requestAnimationFrame(loop);
}

updateHud();
loop();