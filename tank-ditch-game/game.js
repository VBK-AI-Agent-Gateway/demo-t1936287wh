/* 坦克跳坑 Tank Ditch Jump — 经典横版跳坑玩法（增强版）
   纯 Canvas + 原生 JS，无依赖
   新增：土狼时间 / 跳跃缓冲 / 可变跳高、移动平台、尖刺陷阱、补给箱、
        日夜交替、爆炸粒子、屏震、连击加分 */
'use strict';

const cvs = document.getElementById('game');
const ctx = cvs.getContext('2d');
const W = cvs.width, H = cvs.height;
const GROUND_Y = H - 90;
const GRAVITY = 0.62;
const JUMP_V = -13.6;
const COYOTE_MAX = 8;      // 土狼时间(帧)
const BUFFER_MAX = 8;      // 跳跃缓冲(帧)

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
  heal:  () => { beep(520,0.1,'sine',0.12); setTimeout(()=>beep(780,0.16,'sine',0.12),90); },
  boom:  () => beep(110, 0.3, 'sawtooth', 0.18, -70),
  level: () => { beep(520,0.1,'square',0.1); setTimeout(()=>beep(660,0.1,'square',0.1),90); setTimeout(()=>beep(880,0.16,'square',0.1),180); },
  over:  () => beep(400, 0.7, 'sawtooth', 0.15, -320),
  start: () => beep(660, 0.14, 'square', 0.1, 200),
};

// ---------- 输入 ----------
const keys = {};
let jumpPressed = false;
window.addEventListener('keydown', e => {
  if ( [' ','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key) ) e.preventDefault();
  keys[e.code] = true;
  if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'play') pause();
  else if ((e.code === 'KeyP' || e.code === 'Escape') && state === 'pause') resume();
  if ((e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW')) {
    if (state === 'play') { jumpPressed = true; game.buffer = BUFFER_MAX; }
  }
  if (e.code === 'Enter' && state !== 'play') btnStart.click();
});
window.addEventListener('keyup', e => { keys[e.code] = false; });

function bindTouch(id, code, isJump) {
  const el = document.getElementById(id);
  const down = e => { e.preventDefault(); keys[code] = true;
    if (isJump && state === 'play') { jumpPressed = true; game.buffer = BUFFER_MAX; } };
  const up = e => { e.preventDefault(); keys[code] = false; };
  el.addEventListener('touchstart', down, {passive:false});
  el.addEventListener('touchend', up, {passive:false});
  el.addEventListener('mousedown', down);
  el.addEventListener('mouseup', up);
  el.addEventListener('mouseleave', up);
}
bindTouch('tLeft', 'ArrowLeft', false);
bindTouch('tRight', 'ArrowRight', false);
bindTouch('tJump', 'Space', true);

btnStart.addEventListener('click', () => { audio(); sfx.start(); startGame(); });

// ---------- 游戏状态 ----------
let state = 'menu';
let frame = 0;
let best = +(localStorage.getItem('tankDitchBest') || 0);

const game = {
  score: 0, coins: 0, lives: 3, level: 1, dist: 0,
  speed: 4.2, baseSpeed: 4.2, camX: 0, shake: 0,
  hurtCd: 0, invCd: 0, buffer: 0, coyote: 0,
  combo: 0, comboT: 0, dayT: 0,
};

const tank = {
  x: 120, y: GROUND_Y, vx: 0, vy: 0,
  w: 62, h: 34, onGround: true, jumps: 0,
  track: 0, holdJump: false,
};

let platforms = [];   // {x,w} 固定地面段
let movers = [];      // {x,y,w,h,vx,vy,range,axis,base}
let spikes = [];      // {x,w} 尖刺
let crates = [];      // {x,y,got} 补给箱
let enemies = [];     // {x,y,w,h,vx,alive,t}
let coins = [];
let clouds = [];
let bushes = [];
let parts = [];       // 粒子

function rnd(a, b) { return a + Math.random() * (b - a); }
function irnd(a, b) { return Math.floor(rnd(a, b + 1)); }

function genClouds() {
  clouds = [];
  for (let i = 0; i < 7; i++) clouds.push({ x: rnd(0, 3000), y: rnd(30, 200), s: rnd(0.5, 1.4) });
}

function genTerrain(fromX) {
  let x = fromX;
  const end = fromX + 4200;
  while (x < end) {
    const segW = irnd(240, 520);
    platforms.push({ x, w: segW });
    // 金币
    if (Math.random() < 0.75) {
      const n = irnd(1, 3);
      for (let i = 0; i < n; i++)
        coins.push({ x: x + 40 + i * 46, y: GROUND_Y - irnd(46, 96), got: false, t: rnd(0, 6) });
    }
    // 敌人
    if (Math.random() < 0.45 && segW > 280)
      enemies.push({ x: x + segW * rnd(0.4, 0.8), y: GROUND_Y, w: 40, h: 30,
                     vx: rnd(0.6, 1.1) + game.level * 0.12, alive: true, t: rnd(0, 9) });
    // 尖刺（地面段中部，留出落脚空间）
    if (Math.random() < 0.3 && segW > 320)
      spikes.push({ x: x + segW * rnd(0.35, 0.6), w: irnd(46, 72) });
    // 补给箱（低概率，回血）
    if (Math.random() < 0.14)
      crates.push({ x: x + rnd(60, Math.max(70, segW - 60)), y: GROUND_Y - 26, got: false });
    // 灌木
    if (Math.random() < 0.5) bushes.push({ x: x + rnd(20, Math.max(30, segW - 40)), s: rnd(0.7, 1.3) });
    x += segW;
    // 深坑，关卡越宽
    const pitW = irnd(72, 112 + game.level * 14);
    // 大坑加移动平台
    if (pitW > 150 && Math.random() < 0.5) {
      movers.push({ x: x + pitW / 2 - 34, y: GROUND_Y - 46, w: 68, h: 14,
                    base: GROUND_Y - 46, range: 42, axis: 'y', t: rnd(0, 6.3), vx: 0, vy: 0 });
    }
    x += pitW;
  }
  return x;
}

function resetWorld() {
  platforms = []; movers = []; spikes = []; crates = [];
  enemies = []; coins = []; bushes = []; parts = [];
  platforms.push({ x: -600, w: 900 });
  genTerrain(300);
  genClouds();
}

function startGame() {
  Object.assign(game, { score:0, coins:0, lives:3, level:1, dist:0, speed:4.2, baseSpeed:4.2,
    camX:0, shake:0, hurtCd:0, invCd:0, buffer:0, coyote:0, combo:0, comboT:0, dayT:0 });
  Object.assign(tank, { x:120, y:GROUND_Y, vx:0, vy:0, onGround:true, jumps:0 });
  resetWorld();
  hideOverlay();
  state = 'play';
  updateHud();
}

function pause()  { state='pause'; showOverlay('已暂停','按 P / Esc 或点击按钮继续','继续'); }
function resume() { hideOverlay(); state='play'; }
function gameOver() {
  state='over'; sfx.over();
  if (game.score > best) { best = game.score; localStorage.setItem('tankDitchBest', best); }
  showOverlay('游戏结束','最终得分：'+game.score+'  ·  金币：'+game.coins+'  ·  关卡 '+game.level,'再来一局');
  updateHud();
}
function showOverlay(t, s, btn) {
  titleEl.textContent = t; subEl.textContent = s;
  btnStart.textContent = btn; finalEl.textContent = '';
  helpEl.style.display = (state==='over' || t==='已暂停') ? 'none' : '';
  overlay.classList.add('show');
}
function hideOverlay() { overlay.classList.remove('show'); }

function doJump() {
  if (tank.onGround || game.coyote > 0) {
    tank.vy = JUMP_V; tank.onGround = false; tank.jumps = 1;
    game.coyote = 0; tank.holdJump = true; sfx.jump();
  } else if (tank.jumps < 2) {
    tank.vy = JUMP_V * 0.92; tank.jumps = 2; tank.holdJump = true;
    sfx.double(); puff(tank.x, tank.y);
  }
}
function puff(x, y) {
  for (let i=0;i<6;i++) parts.push({x:x+rnd(-14,14), y:y+rnd(-8,8), vx:rnd(-1.5,1.5), vy:rnd(-1,-0.2), life:24, c:'#ffffff'});
}
function explode(x, y, color, n) {
  sfx.boom();
  for (let i=0;i<(n||14);i++)
    parts.push({x, y, vx:rnd(-4.5,4.5), vy:rnd(-5,1), life:34, c: color || '#ff9800', s: irnd(3,7)});
}

function groundAt(x) {
  for (const p of platforms) if (x >= p.x && x <= p.x + p.w) return GROUND_Y;
  return null;
}

function update(dt) {
  frame++;
  game.dayT += 0.0012;
  const left = keys['ArrowLeft'] || keys['KeyA'];
  const right = keys['ArrowRight'] || keys['KeyD'];
  const jumpHeld = keys['Space'] || keys['ArrowUp'] || keys['KeyW'];

  game.speed = game.baseSpeed + Math.min(4.5, game.dist / 2600);
  const newLevel = 1 + Math.floor(game.dist / 3000);
  if (newLevel > game.level) { game.level = newLevel; sfx.level(); }

  if (game.buffer > 0) game.buffer--;
  if (game.coyote > 0) game.coyote--;

  // 水平操控
  if (right) tank.vx = Math.min(tank.vx + 0.55, game.speed);
  else if (left) tank.vx = Math.max(tank.vx - 0.5, -2.6);
  else tank.vx *= tank.onGround ? 0.94 : 0.99;
  if (tank.vx < 0 && tank.x < game.camX + 60) tank.vx = 0;

  tank.x += tank.vx;
  if (tank.x < game.camX + 60) tank.x = game.camX + 60;

  // 缓冲跳 + 土狼时间
  if (game.buffer > 0) doJump();
  if (game.buffer > 0 && (tank.onGround || game.coyote > 0)) game.buffer = 0;

  // 可变跳高：松开跳跃键截断上升
  if (!jumpHeld && tank.vy < -4.5) tank.vy = -4.5;

  tank.vy += GRAVITY;
  tank.y += tank.vy;

  // 地面
  const g = groundAt(tank.x + tank.w / 2);
  const wasAir = !tank.onGround;
  if (g !== null && tank.y >= g && tank.vy >= 0) {
    if (wasAir && tank.vy > 6) puff(tank.x, g);
    tank.y = g; tank.vy = 0; tank.onGround = true; tank.jumps = 0;
    game.coyote = COYOTE_MAX;
  } else if (g === null) {
    if (tank.onGround) game.coyote = COYOTE_MAX;   // 踩空瞬间保留土狼时间
    tank.onGround = false;
  } else {
    tank.onGround = false;
  }

  // 移动平台
  for (const m of movers) {
    m.t += 0.03;
    const oldY = m.y, oldX = m.x;
    if (m.axis === 'y') m.y = m.base + Math.sin(m.t) * m.range;
    else m.x = oldX + (m.vx || 1.2);
    m.vy = m.y - oldY;
    // 站立判定
    if (tank.vy >= 0 &&
        tank.x + tank.w > m.x && tank.x < m.x + m.w &&
        tank.y >= oldY - 2 && tank.y <= m.y + 18) {
      tank.y = m.y; tank.vy = Math.min(0, m.vy); tank.onGround = true;
      tank.jumps = 0; game.coyote = COYOTE_MAX;
      tank.x += (m.axis === 'x' ? (m.x - oldX) : 0);
    }
  }

  tank.track += Math.abs(tank.vx) * 0.15;

  // 尖刺碰撞
  if (game.invCd <= 0) {
    for (const s of spikes) {
      if (tank.x + tank.w > s.x && tank.x < s.x + s.w &&
          tank.y > GROUND_Y - 26) {
        hurt(1); break;
      }
    }
  }

  // 掉坑
  if (tank.y > H + 60) {
    game.lives--; game.shake = 14; sfx.hurt();
    if (game.lives <= 0) { gameOver(); return; }
    let rx = game.camX + 140;
    while (groundAt(rx + tank.w/2) === null) rx += 30;
    tank.x = rx; tank.y = GROUND_Y - 40; tank.vy = 0; tank.vx = 0;
    tank.onGround = false; tank.jumps = 1;
    game.invCd = 90; game.combo = 0;
  }

  // 相机
  const targetCam = tank.x - 200;
  if (targetCam > game.camX) game.camX = targetCam;
  game.dist = Math.max(game.dist, tank.x);

  game.score = Math.floor(game.dist / 10) + game.coins * 25 + game.combo * 10;
  if (game.hurtCd > 0) game.hurtCd--;
  if (game.invCd > 0) game.invCd--;
  if (game.shake > 0) game.shake--;
  if (game.comboT > 0) { game.comboT--; if (game.comboT === 0) game.combo = 0; }

  // 地形回收与生成
  const lastX = platforms.length ? platforms[platforms.length-1].x + platforms[platforms.length-1].w : 0;
  if (lastX < game.camX + W + 900) genTerrain(lastX);
  platforms = platforms.filter(p => p.x + p.w > game.camX - 500);
  movers  = movers.filter(m => m.x + m.w > game.camX - 500);
  spikes  = spikes.filter(s => s.x + s.w > game.camX - 500);
  crates  = crates.filter(c => !c.got && c.x > game.camX - 300);
  coins   = coins.filter(c => !c.got && c.x > game.camX - 300);
  enemies = enemies.filter(e => e.alive && e.x > game.camX - 300);
  bushes  = bushes.filter(b => b.x > game.camX - 300);

  // 金币
  for (const c of coins) {
    if (c.got) continue;
    c.t += 0.1;
    if (Math.abs(c.x - (tank.x + tank.w/2)) < 40 && Math.abs(c.y - (tank.y - tank.h/2)) < 44) {
      c.got = true; game.coins++; sfx.coin();
      for (let i=0;i<5;i++) parts.push({x:c.x, y:c.y, vx:rnd(-2,2), vy:rnd(-3,-0.5), life:26, c:'#ffe066'});
    }
  }

  // 补给箱
  for (const b of crates) {
    if (b.got) continue;
    if (Math.abs(b.x - (tank.x + tank.w/2)) < 42 && Math.abs(b.y - (tank.y - tank.h/2)) < 42) {
      b.got = true;
      if (game.lives < 3) { game.lives++; sfx.heal(); }
      else { game.score += 100; sfx.coin(); }
      explode(b.x, b.y, '#58c96b', 10);
    }
  }

  // 敌人
  for (const e of enemies) {
    if (!e.alive) continue;
    e.t += 0.14;
    const ahead = groundAt(e.x + Math.sign(e.vx) * (e.w/2 + 6));
    if (ahead === null) e.vx *= -1;
    e.x += e.vx;

    if (tank.invCd <= 0 &&
        Math.abs(e.x - tank.x) < (e.w + tank.w)/2 - 4 &&
        Math.abs((e.y - e.h/2) - (tank.y - tank.h/2)) < (e.h + tank.h)/2 - 4) {
      if (tank.vy > 1.5 && tank.y < e.y - e.h * 0.5) {
        e.alive = false; tank.vy = JUMP_V * 0.7;
        game.combo++; game.comboT = 120;
        game.score += 50 * Math.max(1, game.combo);
        explode(e.x, e.y - e.h/2, '#58c96b', 12);
        sfx.stomp();
      } else {
        hurt(1);
        tank.vy = -7; tank.vx = -3;
        if (game.lives <= 0) { gameOver(); return; }
      }
    }
  }

  // 粒子
  for (const p of parts) { p.x += p.vx; p.y += p.vy; p.vy += 0.12; p.life--; }
  parts = parts.filter(p => p.life > 0);

  // 云
  for (const c of clouds) { c.x -= 0.25 * c.s; if (c.x < -200) { c.x = W + rnd(50,400); c.y = rnd(30,200); } }

  if (frame % 6 === 0) updateHud();
}

function hurt(n) {
  game.lives -= n; game.hurtCd = 60; game.invCd = 90; game.shake = 12;
  sfx.hurt(); game.combo = 0;
  explode(tank.x + tank.w/2, tank.y - tank.h/2, '#ff5252', 8);
  if (game.lives <= 0) gameOver();
}

function updateHud() {
  hud.score.textContent = '分数 ' + game.score + (game.combo > 1 ? ' ×' + game.combo : '');
  hud.level.textContent = '关卡 ' + game.level;
  hud.lives.textContent = '生命 ' + '♥'.repeat(Math.max(0, game.lives));
  hud.coins.textContent = '金币 ' + game.coins;
  hud.best.textContent = '最高 ' + best;
}

// ---------- 绘制 ----------
function skyColors() {
  // 日夜交替：dayT 0..2π 循环
  const t = (Math.sin(game.dayT) + 1) / 2;  // 0 夜 → 1 昼
  const lerp = (a, b) => Math.round(a + (b - a) * t);
  return {
    top:  `rgb(${lerp(20,110)},${lerp(24,198)},${lerp(60,255)})`,
    bot:  `rgb(${lerp(40,216)},${lerp(50,228)},${lerp(90,255)})`,
    night: t < 0.4,
    t,
  };
}

function drawBackground() {
  const sc = skyColors();
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, sc.top); g.addColorStop(1, sc.bot);
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

  if (sc.night) {
    // 星星
    ctx.fillStyle = 'rgba(255,255,255,' + (0.7 - sc.t) + ')';
    for (let i = 0; i < 40; i++) {
      const sx = (i * 137 + 40) % W, sy = (i * 71 + 20) % (H * 0.5);
      const tw = (Math.sin(frame * 0.05 + i) + 1) / 2;
      ctx.globalAlpha = tw * (0.8 - sc.t);
      ctx.fillRect(sx, sy, 2, 2);
    }
    ctx.globalAlpha = 1;
    // 月亮
    ctx.fillStyle = '#f5f5dc'; ctx.beginPath(); ctx.arc(W - 90, 80, 34, 0, 7); ctx.fill();
    ctx.fillStyle = sc.top; ctx.beginPath(); ctx.arc(W - 76, 70, 30, 0, 7); ctx.fill();
  } else {
    // 太阳
    ctx.fillStyle = '#fff3b0'; ctx.beginPath(); ctx.arc(W - 90, 80, 40, 0, 7); ctx.fill();
    ctx.fillStyle = '#ffe066'; ctx.beginPath(); ctx.arc(W - 90, 80, 30, 0, 7); ctx.fill();
  }

  // 远山
  ctx.fillStyle = sc.night ? '#2e4a3a' : '#a5d6a7';
  const off = -(game.camX * 0.2) % 400;
  for (let i = -1; i < 4; i++) {
    const bx = off + i * 400;
    ctx.beginPath(); ctx.moveTo(bx, GROUND_Y);
    ctx.quadraticCurveTo(bx + 100, GROUND_Y - 160, bx + 220, GROUND_Y);
    ctx.fill();
  }

  // 云
  ctx.fillStyle = sc.night ? 'rgba(180,190,210,.55)' : 'rgba(255,255,255,.9)';
  for (const c of clouds) {
    const x = c.x - game.camX * 0.4;
    ctx.beginPath();
    ctx.arc(x, c.y, 20*c.s, 0, 7);
    ctx.arc(x + 22*c.s, c.y - 8*c.s, 16*c.s, 0, 7);
    ctx.arc(x + 44*c.s, c.y, 18*c.s, 0, 7);
    ctx.fill();
  }
}

function drawTerrain() {
  // 先铺坑底
  ctx.fillStyle = '#120a06'; ctx.fillRect(0, GROUND_Y + 18, W, H - GROUND_Y);
  for (const p of platforms) {
    const x = p.x - game.camX;
    if (x > W || x + p.w < 0) continue;
    ctx.fillStyle = '#4caf50'; ctx.fillRect(x, GROUND_Y, p.w, 12);
    ctx.fillStyle = '#388e3c'; ctx.fillRect(x, GROUND_Y + 12, p.w, 6);
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(x, GROUND_Y + 18, p.w, H - GROUND_Y);
    ctx.fillStyle = '#795548';
    for (let i = 0; i < p.w; i += 34) ctx.fillRect(x + i + 6, GROUND_Y + 30, 14, 8);
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(x, GROUND_Y + 18, 4, H - GROUND_Y);
    ctx.fillRect(x + p.w - 4, GROUND_Y + 18, 4, H - GROUND_Y);
  }
  // 灌木
  for (const b of bushes) {
    const x = b.x - game.camX;
    if (x < -60 || x > W + 60) continue;
    ctx.fillStyle = '#2e7d32';
    ctx.beginPath();
    ctx.arc(x, GROUND_Y, 16*b.s, Math.PI, 0);
    ctx.arc(x + 20*b.s, GROUND_Y, 13*b.s, Math.PI, 0);
    ctx.arc(x - 20*b.s, GROUND_Y, 12*b.s, Math.PI, 0);
    ctx.fill();
  }
  // 尖刺
  for (const s of spikes) {
    const x = s.x - game.camX;
    if (x > W || x + s.w < 0) continue;
    const n = Math.floor(s.w / 14);
    for (let i = 0; i < n; i++) {
      const sx = x + i * 14 + 7;
      ctx.fillStyle = '#cfd8dc';
      ctx.beginPath();
      ctx.moveTo(sx - 6, GROUND_Y);
      ctx.lineTo(sx, GROUND_Y - 24);
      ctx.lineTo(sx + 6, GROUND_Y);
      ctx.fill();
      ctx.fillStyle = '#90a4ae';
      ctx.beginPath();
      ctx.moveTo(sx, GROUND_Y - 24);
      ctx.lineTo(sx + 6, GROUND_Y);
      ctx.lineTo(sx + 2, GROUND_Y);
      ctx.fill();
    }
  }
  // 移动平台
  for (const m of movers) {
    const x = m.x - game.camX;
    if (x > W + 80 || x + m.w < -80) continue;
    ctx.fillStyle = '#5d4037'; ctx.fillRect(x, m.y, m.w, m.h);
    ctx.fillStyle = '#8d6e63'; ctx.fillRect(x, m.y, m.w, 5);
    ctx.fillStyle = '#ffca28';
    for (let i = 4; i < m.w - 6; i += 14) ctx.fillRect(x + i, m.y + 6, 6, 4);
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
  ctx.restore();
}

function drawCrate(b) {
  if (b.got) return;
  const x = b.x - game.camX, y = b.y + Math.sin(frame * 0.06) * 3;
  if (x < -30 || x > W + 30) return;
  ctx.fillStyle = '#6d4c41'; ctx.fillRect(x - 14, y - 14, 28, 28);
  ctx.fillStyle = '#8d6e63'; ctx.fillRect(x - 11, y - 11, 22, 22);
  ctx.fillStyle = '#ef5350'; ctx.fillRect(x - 3, y - 9, 6, 18);  // 十字
  ctx.fillRect(x - 9, y - 3, 18, 6);
  ctx.strokeStyle = '#4e342e'; ctx.lineWidth = 2;
  ctx.strokeRect(x - 14, y - 14, 28, 28);
}

function drawEnemy(e) {
  const x = e.x - game.camX, y = e.y;
  if (x < -60 || x > W + 60) return;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#c62828'; ctx.fillRect(-20, -20, 40, 16);
  ctx.fillStyle = '#e53935'; ctx.fillRect(-8, -30, 18, 12);
  const dir = Math.sign(e.vx) || 1;
  ctx.fillStyle = '#b71c1c'; ctx.fillRect(dir > 0 ? 8 : -24, -27, 16, 5);
  ctx.fillStyle = '#37474f'; ctx.fillRect(-22, -6, 44, 8);
  ctx.fillStyle = '#263238';
  const tw = Math.sin(e.t) * 4;
  for (let i = -18; i <= 14; i += 8) ctx.fillRect(i + tw, -5, 4, 6);
  ctx.fillStyle = '#fff'; ctx.fillRect(dir > 0 ? 2 : -8, -27, 5, 5);
  ctx.restore();
}

function drawTank() {
  const blink = game.invCd > 0 && Math.floor(frame / 4) % 2 === 0;
  if (blink) return;
  const x = tank.x - game.camX, y = tank.y;
  ctx.save(); ctx.translate(x, y);
  ctx.fillStyle = '#263238'; ctx.fillRect(-31, -12, 62, 12);
  ctx.fillStyle = '#37474f';
  for (let i = -28; i <= 24; i += 9) {
    const tx = ((i + tank.track) % 62 + 62) % 62 - 31;
    ctx.fillRect(tx, -10, 5, 8);
  }
  ctx.fillStyle = '#33691e'; ctx.fillRect(-30, -26, 60, 16);
  ctx.fillStyle = '#558b2f'; ctx.fillRect(-30, -26, 60, 5);
  ctx.fillStyle = '#33691e'; ctx.fillRect(-8, -36, 26, 12);
  ctx.fillStyle = '#689f38'; ctx.fillRect(-8, -36, 26, 4);
  ctx.fillStyle = '#1b5e20'; ctx.fillRect(16, -34, 30, 6);
  ctx.fillStyle = '#33691e'; ctx.fillRect(42, -35, 6, 8);
  ctx.fillStyle = '#7cb342'; ctx.fillRect(-4, -40, 12, 5);
  ctx.fillStyle = '#ffe066'; ctx.font = 'bold 10px monospace'; ctx.textAlign = 'center';
  ctx.fillText('★', -18, -14);
  ctx.restore();
}

function drawParts() {
  for (const p of parts) {
    ctx.globalAlpha = Math.max(0, p.life / 34);
    ctx.fillStyle = p.c;
    const s = p.s || 4;
    ctx.fillRect(p.x - game.camX, p.y, s, s);
  }
  ctx.globalAlpha = 1;
}

function draw() {
  ctx.save();
  if (game.shake > 0) ctx.translate(rnd(-4,4) * game.shake/14, rnd(-4,4) * game.shake/14);
  drawBackground();
  drawTerrain();
  for (const c of coins) drawCoin(c);
  for (const b of crates) drawCrate(b);
  for (const e of enemies) drawEnemy(e);
  drawTank();
  drawParts();
  // combo 提示
  if (game.combo > 1) {
    ctx.fillStyle = '#ffe066'; ctx.font = 'bold 20px monospace'; ctx.textAlign = 'center';
    ctx.fillText('COMBO ×' + game.combo, W / 2, 70);
  }
  if (state === 'pause') { ctx.fillStyle = 'rgba(0,0,0,.4)'; ctx.fillRect(0, 0, W, H); }
  ctx.restore();
}

function loop() {
  if (state === 'play') update(1);
  draw();
  requestAnimationFrame(loop);
}

updateHud();
loop();