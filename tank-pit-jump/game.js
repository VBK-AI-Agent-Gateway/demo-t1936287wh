/* 坦克跳坑 Tank Pit Jump — 经典横版跳坑 */
(() => {
"use strict";

const cvs = document.getElementById("game");
const ctx = cvs.getContext("2d");
const W = cvs.width, H = cvs.height;

const $ = id => document.getElementById(id);
const overlay = $("overlay"), titleEl = $("title"), descEl = $("desc"), btnEl = $("btn");

/* ---------- 关卡数据 ----------
   地面/平台: [x, y, w]  坑洞即平台之间的空隙
   旗帜: [x, y]   终点: [x, y]                     */
const LEVELS = [
  { spawn: [60, 420], goal: [1840, 436],
    platforms: [
      [0, 480, 420], [560, 480, 300], [1000, 480, 260], [1400, 480, 560],
      [300, 380, 120], [700, 360, 130], [1120, 370, 120], [1520, 350, 140]
    ],
    flags: [[355, 340], [760, 320], [1585, 310]] },
  { spawn: [50, 420], goal: [2260, 216],
    platforms: [
      [0, 480, 300], [430, 480, 220], [760, 480, 180], [1060, 480, 260],
      [1450, 480, 200], [1770, 480, 180], [2070, 480, 330],
      [250, 370, 110], [560, 330, 110], [870, 300, 100], [1180, 340, 110],
      [1500, 300, 110], [1820, 340, 100], [2130, 260, 200]
    ],
    flags: [[615, 290], [1555, 260], [2225, 220]] },
  { spawn: [50, 420], goal: [2740, 436],
    platforms: [
      [0, 480, 240], [370, 480, 150], [650, 480, 150], [940, 480, 130],
      [1220, 480, 150], [1520, 480, 130], [1800, 480, 160], [2110, 480, 140],
      [2400, 480, 500],
      [300, 360, 100], [560, 300, 100], [850, 260, 100], [1130, 300, 100],
      [1430, 360, 100], [1720, 300, 110], [2030, 250, 100], [2340, 330, 110]
    ],
    flags: [[615, 260], [1785, 260], [2455, 400]] }
];

/* ---------- 状态 ---------- */
const GRAV = 0.72, MOVE = 4.2, JUMP = 14.2, MAXFALL = 16;
let state = "menu";          // menu | play | dead | clear | over | win
let levelIdx = 0, lives = 3, flagsGot = 0, tStart = 0, elapsed = 0;
let best = Number(localStorage.getItem("tankPitBest") || 0);
let cam = 0, shake = 0, particles = [];
const keys = { left: false, right: false, jump: false };
let jumpHeld = false;

const tank = { x: 0, y: 0, w: 46, h: 30, vx: 0, vy: 0, onGround: false, face: 1, track: 0 };
let plats = [], flagList = [], goal = null, spawn = [0, 0], levelW = 0;

function loadLevel(i) {
  const L = LEVELS[i];
  spawn = L.spawn.slice();
  plats = L.platforms.map(p => ({ x: p[0], y: p[1], w: p[2], h: H - p[1] }));
  flagList = L.flags.map(f => ({ x: f[0], y: f[1], got: false, ph: Math.random() * 6 }));
  goal = { x: L.goal[0], y: L.goal[1] };
  levelW = Math.max(...L.platforms.map(p => p[0] + p[2]));
  flagsGot = 0;
  respawn();
}

function respawn() {
  tank.x = spawn[0]; tank.y = spawn[1];
  tank.vx = 0; tank.vy = 0; tank.onGround = false;
  cam = 0;
}

function startGame() {
  levelIdx = 0; lives = 3; elapsed = 0;
  loadLevel(0);
  tStart = performance.now();
  state = "play";
  overlay.classList.add("hidden");
}

function showPanel(t, d, b) {
  titleEl.textContent = t; descEl.textContent = d; btnEl.textContent = b;
  overlay.classList.remove("hidden");
}

/* ---------- 输入 ---------- */
addEventListener("keydown", e => {
  const k = e.key.toLowerCase();
  if (["arrowleft","arrowright","arrowup","arrowdown"," "].includes(k)) e.preventDefault();
  if (k === "arrowleft" || k === "a") keys.left = true;
  if (k === "arrowright" || k === "d") keys.right = true;
  if (k === "arrowup" || k === "w" || k === " ") keys.jump = true;
  if ((state === "menu" || state === "over" || state === "win") && (k === " " || k === "enter")) startGame();
});
addEventListener("keyup", e => {
  const k = e.key.toLowerCase();
  if (k === "arrowleft" || k === "a") keys.left = false;
  if (k === "arrowright" || k === "d") keys.right = false;
  if (k === "arrowup" || k === "w" || k === " ") keys.jump = false;
});
document.querySelectorAll(".tb").forEach(b => {
  const set = v => e => { e.preventDefault(); keys[b.dataset.k] = v; };
  b.addEventListener("touchstart", set(true), { passive: false });
  b.addEventListener("touchend", set(false), { passive: false });
  b.addEventListener("mousedown", set(true));
  b.addEventListener("mouseup", set(false));
  b.addEventListener("mouseleave", set(false));
});
btnEl.addEventListener("click", startGame);

/* ---------- 物理 ---------- */
function update() {
  if (state !== "play") return;
  elapsed = (performance.now() - tStart) / 1000;

  // 水平
  if (keys.left)  { tank.vx = -MOVE; tank.face = -1; }
  else if (keys.right) { tank.vx = MOVE; tank.face = 1; }
  else tank.vx *= 0.75;
  if (Math.abs(tank.vx) < 0.1) tank.vx = 0;

  // 跳跃（支持跳跃高度随按键时长）
  if (keys.jump && tank.onGround && !jumpHeld) {
    tank.vy = -JUMP; tank.onGround = false; jumpHeld = true;
    puff(tank.x + tank.w / 2, tank.y + tank.h, 6, "#c9c9c9");
  }
  if (!keys.jump) jumpHeld = false;
  if (!keys.jump && tank.vy < -4) tank.vy = -4;   // 松键截断 = 可控跳高

  tank.vy = Math.min(tank.vy + GRAV, MAXFALL);

  // X 轴
  tank.x += tank.vx;
  if (tank.x < 0) { tank.x = 0; tank.vx = 0; }
  if (tank.x + tank.w > levelW) { tank.x = levelW - tank.w; tank.vx = 0; }
  for (const p of plats) {
    if (rectHit(tank, p)) {
      if (tank.vx > 0) tank.x = p.x - tank.w;
      else if (tank.vx < 0) tank.x = p.x + p.w;
      tank.vx = 0;
    }
  }

  // Y 轴
  tank.y += tank.vy;
  tank.onGround = false;
  for (const p of plats) {
    if (rectHit(tank, p)) {
      if (tank.vy > 0) { tank.y = p.y - tank.h; tank.onGround = true; }
      else if (tank.vy < 0) tank.y = p.y + p.h;
      tank.vy = 0;
    }
  }

  if (tank.onGround && Math.abs(tank.vx) > 0.5) tank.track += Math.abs(tank.vx) * 0.1;

  // 掉坑
  if (tank.y > H + 60) {
    lives--;
    shake = 14;
    if (lives <= 0) {
      state = "over";
      showPanel("游戏结束", `你倒在了第 ${levelIdx + 1} 关。用时 ${elapsed.toFixed(1)} 秒。`, "再来一局");
    } else {
      respawn();
      flashMsg(`掉落！剩余 ${lives} 条命`);
    }
    updateHud();
    return;
  }

  // 旗帜
  for (const f of flagList) {
    if (!f.got && Math.abs(tank.x + tank.w / 2 - f.x) < 34 && Math.abs(tank.y + tank.h / 2 - f.y) < 44) {
      f.got = true; flagsGot++;
      puff(f.x, f.y, 12, "#ffd257");
      updateHud();
    }
  }

  // 终点
  if (Math.abs(tank.x + tank.w / 2 - goal.x) < 30 && Math.abs(tank.y + tank.h - goal.y) < 90) {
    if (flagsGot >= 3) nextLevel();
    else flashMsg(`还差 ${3 - flagsGot} 面旗帜！`);
  }

  // 镜头
  const target = Math.max(0, Math.min(tank.x - W * 0.4, levelW - W));
  cam += (target - cam) * 0.1;

  // 粒子
  particles = particles.filter(p => (p.life -= 1) > 0);
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += 0.25; }
  if (shake > 0) shake--;
}

function nextLevel() {
  levelIdx++;
  if (levelIdx >= LEVELS.length) {
    state = "win";
    const total = elapsed;
    if (!best || total < best) { best = total; localStorage.setItem("tankPitBest", String(best)); }
    showPanel("🎉 通关！", `全部 3 关完成！总用时 ${total.toFixed(1)} 秒${best === total ? "，刷新纪录！" : ""}`, "再玩一次");
    updateHud();
    return;
  }
  state = "clear";
  loadLevel(levelIdx);
  flashMsg(`第 ${levelIdx + 1} 关！`);
  setTimeout(() => { if (state === "clear") state = "play"; }, 900);
  updateHud();
}

let flash = { text: "", t: 0 };
function flashMsg(text) { flash = { text, t: 100 }; }
function puff(x, y, n, color) {
  for (let i = 0; i < n; i++)
    particles.push({ x, y, vx: (Math.random() - .5) * 5, vy: -Math.random() * 4, life: 30 + Math.random() * 20, color });
}
function rectHit(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function updateHud() {
  $("lives").textContent = lives;
  $("level").textContent = Math.min(levelIdx + 1, 3);
  $("flags").textContent = flagsGot;
  $("best").textContent = best ? `最佳: ${best.toFixed(1)}s` : "最佳: --";
}

/* ---------- 渲染 ---------- */
function draw() {
  const sx = shake ? (Math.random() - .5) * shake : 0;
  const sy = shake ? (Math.random() - .5) * shake : 0;

  // 天空渐变 + 云
  const g = ctx.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, "#5aa9e6"); g.addColorStop(1, "#bfe3ff");
  ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(sx - cam, sy);
  drawClouds();

  // 平台
  for (const p of plats) {
    if (p.x + p.w < cam - 50 || p.x > cam + W + 50) continue;
    ctx.fillStyle = "#7a4a1f";
    ctx.fillRect(p.x, p.y, p.w, p.h);
    ctx.fillStyle = "#3f9b3f";
    ctx.fillRect(p.x, p.y, p.w, 14);
    ctx.fillStyle = "#6cd06c";
    ctx.fillRect(p.x, p.y, p.w, 5);
    ctx.fillStyle = "rgba(0,0,0,.13)";
    for (let x = p.x + 10; x < p.x + p.w - 6; x += 34)
      ctx.fillRect(x, p.y + 26, 14, 8);
  }

  // 旗帜
  for (const f of flagList) {
    if (f.got) continue;
    f.ph += 0.06;
    ctx.strokeStyle = "#ddd"; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(f.x, f.y + 34); ctx.lineTo(f.x, f.y - 34); ctx.stroke();
    ctx.fillStyle = "#ff4d4d";
    const wv = Math.sin(f.ph) * 5;
    ctx.beginPath();
    ctx.moveTo(f.x, f.y - 34);
    ctx.lineTo(f.x + 30 + wv, f.y - 24);
    ctx.lineTo(f.x, f.y - 12);
    ctx.closePath(); ctx.fill();
  }

  // 终点
  ctx.strokeStyle = "#eee"; ctx.lineWidth = 6;
  ctx.beginPath(); ctx.moveTo(goal.x, goal.y); ctx.lineTo(goal.x, goal.y - 100); ctx.stroke();
  const ready = flagsGot >= 3;
  ctx.fillStyle = ready ? "#2ecc40" : "#888";
  ctx.fillRect(goal.x + 3, goal.y - 96, 46, 30);
  ctx.fillStyle = "#fff"; ctx.font = "bold 20px monospace";
  ctx.fillText(ready ? "GO" : "🔒", goal.x + 10, goal.y - 74);

  drawTank();
  drawParticles();

  // 小地图
  drawMinimap();

  // 闪光提示
  if (flash.t > 0) {
    flash.t--;
    ctx.globalAlpha = Math.min(1, flash.t / 30);
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(W / 2 - 190, 60, 380, 54);
    ctx.fillStyle = "#ffd257";
    ctx.font = "bold 26px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(flash.text, W / 2, 96);
    ctx.textAlign = "left";
    ctx.globalAlpha = 1;
  }
  ctx.restore();
}

function drawClouds() {
  ctx.fillStyle = "rgba(255,255,255,.85)";
  for (let i = 0; i < 14; i++) {
    const x = (i * 420 + (i % 3) * 130), y = 50 + (i % 4) * 55;
    ctx.beginPath();
    ctx.ellipse(x, y, 55, 22, 0, 0, 7);
    ctx.ellipse(x + 40, y + 8, 40, 16, 0, 0, 7);
    ctx.fill();
  }
}

function drawTank() {
  const t = tank;
  ctx.save();
  ctx.translate(t.x + t.w / 2, t.y + t.h / 2);
  ctx.scale(t.face, 1);
  // 履带
  ctx.fillStyle = "#222";
  ctx.beginPath(); ctx.roundRect(-t.w / 2, 4, t.w, 14, 7); ctx.fill();
  ctx.fillStyle = "#666";
  const off = (t.track % 12);
  for (let x = -t.w / 2 + 4 - off; x < t.w / 2 - 2; x += 12) ctx.fillRect(x, 7, 5, 8);
  // 车体
  ctx.fillStyle = "#3d7a3d";
  ctx.beginPath(); ctx.roundRect(-t.w / 2 + 3, -6, t.w - 6, 14, 4); ctx.fill();
  // 炮塔
  ctx.fillStyle = "#4f9a4f";
  ctx.beginPath(); ctx.roundRect(-12, -16, 24, 14, 5); ctx.fill();
  // 炮管
  ctx.fillStyle = "#2c2c2c";
  ctx.fillRect(8, -13, 24, 6);
  ctx.restore();
}

function drawParticles() {
  for (const p of particles) {
    ctx.globalAlpha = Math.max(0, p.life / 50);
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, 5, 5);
  }
  ctx.globalAlpha = 1;
}

function drawMinimap() {
  const mw = 240, mh = 16, mx = W - mw - 16, my = 16;
  ctx.fillStyle = "rgba(0,0,0,.45)";
  ctx.fillRect(mx - 4, my - 4, mw + 8, mh + 8);
  ctx.fillStyle = "#3f9b3f";
  for (const p of plats) {
    const x = mx + (p.x / levelW) * mw;
    const w = Math.max(3, (p.w / levelW) * mw);
    ctx.fillRect(x, my, w, mh);
  }
  ctx.fillStyle = "#ff4d4d";
  for (const f of flagList) if (!f.got) ctx.fillRect(mx + (f.x / levelW) * mw - 1, my - 3, 3, mh + 6);
  ctx.fillStyle = "#2ecc40";
  ctx.fillRect(mx + (goal.x / levelW) * mw - 2, my - 3, 4, mh + 6);
  ctx.fillStyle = "#ffd257";
  ctx.fillRect(mx + (tank.x / levelW) * mw - 2, my + 2, 5, mh - 4);
}

/* ---------- 主循环 ---------- */
let last = performance.now();
function loop(now) {
  const dt = now - last; last = now;
  if (dt < 60) update();
  draw();
  if (state === "play" || state === "clear") $("time").textContent = elapsed.toFixed(1);
  requestAnimationFrame(loop);
}

// 初始化
loadLevel(0);
state = "menu";
updateHud();
requestAnimationFrame(loop);

// 导出核心逻辑供无头测试
if (typeof module !== "undefined") module.exports = { rectHit, LEVELS };
})();