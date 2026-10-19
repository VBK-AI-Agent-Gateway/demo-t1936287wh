"use strict";
/* 坦克跳坑 - 经典横版坦克闯关 */

const cvs = document.getElementById("game");
const ctx = cvs.getContext("2d");
const W = cvs.width, H = cvs.height;
const GRAV = 0.55, GROUND = H - 60;

const $ = id => document.getElementById(id);
const ui = {
  lives: $("lives"), score: $("score"), level: $("level"), ammo: $("ammo"),
  title: $("screen-title"), pause: $("screen-pause"), over: $("screen-over"),
  overTitle: $("over-title"), finalScore: $("final-score")
};

/* ---------- 关卡数据 ---------- */
// 每关: 平台(x, w) 列表, 留空即坑; 坑宽决定跳跃难度
function buildLevel(i) {
  const P = [], E = [], B = [];
  const set = [
    { plats: [[0,420],[560,300],[980,340],[1440,420],[1980,260],[2360,300],[2780,520]],
      enemies: [700, 1150, 1600, 2100, 2560], boots: [1500] },
    { plats: [[0,340],[470,220],[830,300],[1260,240],[1650,380],[2160,220],[2520,260],[2920,420]],
      enemies: [560, 950, 1380, 1780, 2240, 2640], boots: [1720, 2560] },
    { plats: [[0,300],[430,200],[760,260],[1160,200],[1500,320],[1960,180],[2300,260],[2700,200],[3040,460]],
      enemies: [520, 840, 1240, 1600, 2040, 2400, 2800, 3150], boots: [1560, 3100] }
  ][i];
  set.plats.forEach(([x, w]) => P.push({ x, y: GROUND, w, h: 60 }));
  // 悬空小平台，可绕过部分坑
  if (i === 1) P.push({ x: 1060, y: GROUND - 120, w: 130, h: 18, air: true });
  if (i === 2) { P.push({ x: 1000, y: GROUND - 130, w: 120, h: 18, air: true });
                 P.push({ x: 2180, y: GROUND - 120, w: 110, h: 18, air: true }); }
  set.enemies.forEach(x => E.push({ x, y: GROUND - 30, w: 44, h: 30, dir: -1, hp: 1, t: Math.random() * 100, dead: false }));
  set.boots.forEach(x => B.push({ x, y: GROUND - 60, w: 30, h: 30, taken: false }));
  const end = P[P.length - 1];
  return { plats: P, enemies: E, boots: B, width: end.x + end.w, flagX: end.x + end.w - 70 };
}

/* ---------- 游戏状态 ---------- */
const state = {
  mode: "title", // title | play | pause | over | win
  level: 0, score: 0, lives: 3, ammo: Infinity, fireUp: 0,
  camX: 0, shake: 0, frame: 0
};
let tank, bullets, ebullets, level, particles, popups;

const keys = { left: false, right: false, up: false, fire: false };

function resetLevel(keepScore) {
  level = buildLevel(state.level);
  tank = { x: 60, y: GROUND - 34, w: 52, h: 34, vx: 0, vy: 0, onGround: true, face: 1, inv: 60, cool: 0 };
  bullets = []; ebullets = []; particles = []; popups = [];
  state.camX = 0;
  if (!keepScore) { state.score = 0; state.lives = 3; state.fireUp = 0; }
  updateHUD();
}

function startGame() {
  state.mode = "play"; state.level = 0;
  resetLevel(false);
  hideAll();
}
function hideAll() {
  ui.title.classList.add("hidden");
  ui.pause.classList.add("hidden");
  ui.over.classList.add("hidden");
}
function updateHUD() {
  ui.lives.textContent = state.lives;
  ui.score.textContent = state.score;
  ui.level.textContent = state.level + 1;
  ui.ammo.textContent = state.fireUp ? "强化" : "∞";
}

function popup(x, y, txt, color) { popups.push({ x, y, txt, color, t: 60 }); }
function burst(x, y, color, n) {
  for (let i = 0; i < n; i++)
    particles.push({ x, y, vx: (Math.random() - .5) * 7, vy: -Math.random() * 6, t: 30 + Math.random() * 20, color });
}

/* ---------- 输入 ---------- */
const KMAP = {
  ArrowLeft: "left", a: "left", A: "left",
  ArrowRight: "right", d: "right", D: "right",
  ArrowUp: "up", w: "up", W: "up", " ": "fire"
};
addEventListener("keydown", e => {
  const k = KMAP[e.key];
  if (k) { keys[k] = true; if (k === "fire") e.preventDefault(); }
  if (e.key === "p" || e.key === "P") togglePause();
  if (state.mode === "title" && (e.key === "Enter" || e.key === " ")) startGame();
});
addEventListener("keyup", e => { const k = KMAP[e.key]; if (k) keys[k] = false; });

document.querySelectorAll("#touch button").forEach(b => {
  const k = b.dataset.k;
  const on = e => { e.preventDefault(); if (k === "fire") keys.fire = true; else keys[k] = true; };
  const off = e => { e.preventDefault(); if (k === "fire") keys.fire = false; else keys[k] = false; };
  b.addEventListener("touchstart", on); b.addEventListener("touchend", off);
  b.addEventListener("mousedown", on); b.addEventListener("mouseup", off);
});

$("btn-start").onclick = startGame;
$("btn-restart").onclick = startGame;
$("btn-resume").onclick = togglePause;

function togglePause() {
  if (state.mode === "play") { state.mode = "pause"; ui.pause.classList.remove("hidden"); }
  else if (state.mode === "pause") { state.mode = "play"; ui.pause.classList.add("hidden"); }
}

function gameOver(win) {
  state.mode = win ? "win" : "over";
  ui.overTitle.textContent = win ? "🎉 通关胜利！" : "游戏结束";
  ui.finalScore.textContent = state.score;
  ui.over.classList.remove("hidden");
}

/* ---------- 更新 ---------- */
function rects(a, b) {
  return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
}
function fallInPit(x) {
  for (const p of level.plats) if (!p.air && x > p.x && x < p.x + p.w) return false;
  return x >= 0 && x <= level.width;
}

function update() {
  if (state.mode !== "play") return;
  state.frame++;
  if (state.shake > 0) state.shake--;
  if (tank.inv > 0) tank.inv--;

  /* --- 坦克移动 --- */
  const acc = tank.onGround ? 0.55 : 0.3, max = 5.2;
  if (keys.left)  { tank.vx = Math.max(tank.vx - acc, -max); tank.face = -1; }
  else if (keys.right) { tank.vx = Math.min(tank.vx + acc, max); tank.face = 1; }
  else tank.vx *= tank.onGround ? 0.82 : 0.97;

  if (keys.up && tank.onGround) { tank.vy = -12.2; tank.onGround = false; burst(tank.x + tank.w / 2, tank.y + tank.h, "#aaa", 6); }

  /* 水平 */
  tank.x += tank.vx;
  tank.x = Math.max(0, Math.min(tank.x, level.width - tank.w));

  /* 竖直 */
  tank.vy += GRAV;
  tank.y += tank.vy;
  tank.onGround = false;
  if (tank.vy >= 0) {
    for (const p of level.plats) {
      if (tank.x + tank.w > p.x + 6 && tank.x < p.x + p.w - 6 &&
          tank.y + tank.h >= p.y && tank.y + tank.h - tank.vy - 2 <= p.y) {
        tank.y = p.y - tank.h; tank.vy = 0; tank.onGround = true;
      }
    }
  } else { // 顶头撞平台底
    for (const p of level.plats)
      if (tank.x + tank.w > p.x && tank.x < p.x + p.w && tank.y <= p.y + p.h && tank.y >= p.y) { tank.y = p.y + p.h; tank.vy = 1; }
  }

  /* 掉坑 */
  if (tank.y > H + 40) {
    state.lives--; state.shake = 14;
    burst(tank.x, H - 20, "#ff5030", 18);
    if (state.lives <= 0) { updateHUD(); gameOver(false); return; }
    popup(tank.x, H - 100, "-1 生命", "#ff5030");
    // 回到最近安全地面起点
    tank.x = Math.max(20, findSafeX(tank.x) - 80);
    tank.y = GROUND - 200; tank.vx = 0; tank.vy = 0; tank.inv = 90;
    updateHUD();
  }

  /* --- 射击 --- */
  if (tank.cool > 0) tank.cool--;
  if (keys.fire && tank.cool === 0) {
    tank.cool = state.fireUp ? 7 : 14;
    const n = state.fireUp ? 2 : 1;
    for (let i = 0; i < n; i++)
      bullets.push({ x: tank.x + tank.w / 2 + tank.face * 24, y: tank.y + 14 - (i ? 6 : 0), w: 12, h: 5, vx: tank.face * 11, t: 90 });
  }

  /* --- 子弹 --- */
  for (const b of bullets) { b.x += b.vx; b.t--; }
  bullets = bullets.filter(b => b.t > 0 && b.x > 0 && b.x < level.width &&
    !level.plats.some(p => b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h));

  /* --- 敌人 --- */
  for (const e of level.enemies) {
    if (e.dead) continue;
    e.t++;
    const patrol = [e.x0 ?? (e.x0 = e.x), 0];
    e.x += e.dir * 1.3;
    // 巡逻边界: 原地 ±110 且必须落在平台上
    if (Math.abs(e.x - e.x0) > 110 || !fallSafe(e)) { e.x -= e.dir * 1.3; e.dir *= -1; }
    // 射击
    if (e.t % 110 === 0 && Math.abs(e.x - tank.x) < 560)
      ebullets.push({ x: e.x + (e.dir > 0 ? e.w : -6), y: e.y + 10, w: 10, h: 5, vx: e.dir * 5.5, t: 130 });
    // 撞击
    if (rects(tank, e) && tank.inv === 0) hurt();
  }
  for (const b of ebullets) { b.x += b.vx; b.t--; }
  ebullets = ebullets.filter(b => b.t > 0 &&
    !level.plats.some(p => b.x > p.x && b.x < p.x + p.w && b.y > p.y && b.y < p.y + p.h));

  /* 命中敌人 */
  for (const b of bullets) for (const e of level.enemies) {
    if (!e.dead && rects(b, e)) {
      e.dead = true; b.t = 0;
      state.score += 100; state.shake = 4;
      burst(e.x + e.w / 2, e.y + e.h / 2, "#ff9d3c", 16);
      popup(e.x, e.y - 10, "+100", "#ffd75e");
      updateHUD();
    }
  }
  /* 玩家中弹 */
  if (tank.inv === 0 && ebullets.some(b => rects(b, tank))) hurt();

  /* 道具 */
  for (const it of level.boots) if (!it.taken && rects(tank, it)) {
    it.taken = true; state.fireUp = 1;
    state.score += 50; popup(it.x, it.y - 10, "火力强化!", "#9adf6a");
    burst(it.x + 15, it.y + 15, "#9adf6a", 14); updateHUD();
  }

  /* 粒子/浮字 */
  for (const p of particles) { p.x += p.vx; p.y += p.vy; p.vy += .3; p.t--; }
  particles = particles.filter(p => p.t > 0);
  for (const p of popups) { p.y -= .8; p.t--; }
  popups = popups.filter(p => p.t > 0);

  /* 终点旗 */
  if (tank.x + tank.w > level.flagX) {
    state.score += 500; updateHUD();
    if (state.level >= 2) { gameOver(true); return; }
    state.level++;
    popup(tank.x, tank.y - 20, "过关! +500", "#7ec8f0");
    resetLevel(true);
    popup(W / 2 - 40, H / 2, "第 " + (state.level + 1) + " 关", "#ffd75e");
  }

  /* 摄像机 */
  const target = tank.x - W * 0.38;
  state.camX += (Math.max(0, Math.min(target, level.width - W)) - state.camX) * 0.12;
}

function fallSafe(e) {
  const cx = e.x + e.w / 2;
  return fallInPit(cx) === false;
}
function findSafeX(x) {
  for (const p of level.plats) if (!p.air && x >= p.x - 40 && x <= p.x + p.w) return Math.max(p.x + 40, x);
  for (const p of level.plats) if (!p.air) return p.x + 40;
  return 60;
}
function hurt() {
  state.lives--; state.shake = 12; tank.inv = 90;
  burst(tank.x + tank.w / 2, tank.y + tank.h / 2, "#ff5030", 14);
  updateHUD();
  if (state.lives <= 0) gameOver(false);
}

/* ---------- 绘制 ---------- */
function drawTank(x, y, w, h, face, color, turret) {
  x = Math.round(x); y = Math.round(y);
  ctx.fillStyle = "#222";
  ctx.fillRect(x, y + h - 12, w, 12);              // 履带
  ctx.fillStyle = "#555";
  for (let i = 3; i < w - 4; i += 9) ctx.fillRect(x + i, y + h - 10, 5, 8);
  ctx.fillStyle = color;
  ctx.fillRect(x + 4, y + 8, w - 8, h - 22);       // 车身
  ctx.fillRect(x + 12, y, w - 24, 12);             // 炮塔座
  ctx.fillStyle = "#111";
  ctx.fillRect(x + (face > 0 ? w - 4 : -16), y + 4, 20, 6); // 炮管
  ctx.fillStyle = color === "#3f7d3f" ? "#ffd75e" : "#000";
  ctx.fillRect(x + w / 2 - 5, y + 2, 10, 8);
}

function draw() {
  ctx.save();
  if (state.shake > 0) ctx.translate((Math.random() - .5) * state.shake, (Math.random() - .5) * state.shake);

  /* 天空 */
  const sky = ctx.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, "#5aa9e6"); sky.addColorStop(1, "#cfe9f7");
  ctx.fillStyle = sky; ctx.fillRect(-10, -10, W + 20, H + 20);

  /* 远景云 */
  ctx.fillStyle = "rgba(255,255,255,.8)";
  for (let i = 0; i < 8; i++) {
    const cx = ((i * 340 - state.camX * 0.3) % (W + 300) + W + 300) % (W + 300) - 150;
    const cy = 60 + (i % 3) * 55;
    ctx.beginPath();
    ctx.arc(cx, cy, 22, 0, 7); ctx.arc(cx + 26, cy - 8, 18, 0, 7); ctx.arc(cx + 50, cy, 20, 0, 7);
    ctx.fill();
  }

  if (level) {
    ctx.save();
    ctx.translate(-state.camX, 0);

    /* 平台 */
    for (const p of level.plats) {
      ctx.fillStyle = p.air ? "#8a6b4a" : "#6b4f35";
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = p.air ? "#a3855f" : "#4c7a3a";   // 草皮
      ctx.fillRect(p.x, p.y, p.w, p.air ? 6 : 10);
      ctx.fillStyle = "#3d5f2e";
      ctx.fillRect(p.x, p.y + (p.air ? 6 : 10), p.w, 4);
      // 坑内深度阴影
      if (!p.air) {
        ctx.fillStyle = "rgba(0,0,0,.25)";
        for (let sx = p.x + 20; sx < p.x + p.w; sx += 60)
          ctx.fillRect(sx, p.y + 24, 24, 10);
      }
    }
    /* 坑底深渊 */
    ctx.fillStyle = "#10131c";
    ctx.fillRect(-state.camX, H - 26, W, 26);

    /* 终点旗 */
    ctx.fillStyle = "#ddd"; ctx.fillRect(level.flagX, GROUND - 90, 6, 90);
    ctx.fillStyle = state.frame % 30 < 15 ? "#ff4040" : "#ffd75e";
    ctx.beginPath();
    ctx.moveTo(level.flagX + 6, GROUND - 90);
    ctx.lineTo(level.flagX + 52, GROUND - 76);
    ctx.lineTo(level.flagX + 6, GROUND - 62);
    ctx.fill();

    /* 道具 */
    for (const it of level.boots) if (!it.taken) {
      const bob = Math.sin(state.frame / 10) * 4;
      ctx.fillStyle = "#9adf6a";
      ctx.fillRect(it.x, it.y + bob, it.w, it.h);
      ctx.fillStyle = "#0d3b0d";
      ctx.font = "bold 18px monospace"; ctx.fillText("F", it.x + 9, it.y + bob + 22);
    }

    /* 敌人 */
    for (const e of level.enemies) if (!e.dead)
      drawTank(e.x, e.y, e.w, e.h, e.dir, "#7a3030");

    /* 玩家 */
    if (state.mode !== "over") {
      ctx.globalAlpha = tank && tank.inv > 0 && state.frame % 8 < 4 ? .35 : 1;
      if (tank) drawTank(tank.x, tank.y, tank.w, tank.h, tank.face, "#3f7d3f");
      ctx.globalAlpha = 1;
    }

    /* 子弹 */
    ctx.fillStyle = "#ffe066";
    for (const b of bullets) ctx.fillRect(b.x, b.y, b.w, b.h);
    ctx.fillStyle = "#ff6040";
    for (const b of ebullets) ctx.fillRect(b.x, b.y, b.w, b.h);

    /* 粒子与浮字 */
    for (const p of particles) { ctx.globalAlpha = p.t / 50; ctx.fillStyle = p.color; ctx.fillRect(p.x, p.y, 5, 5); }
    ctx.globalAlpha = 1;
    ctx.font = "bold 16px monospace"; ctx.textAlign = "center";
    for (const p of popups) { ctx.globalAlpha = Math.min(1, p.t / 25); ctx.fillStyle = p.color; ctx.fillText(p.txt, p.x, p.y); }
    ctx.globalAlpha = 1; ctx.textAlign = "left";

    ctx.restore();
  }

  ctx.restore();

  /* 关卡提示浮层 */
  if (state.mode === "play" && state.frame < 130 && popups.some(p => p.txt.includes("关"))) {
    ctx.fillStyle = "rgba(0,0,0,.55)";
    ctx.fillRect(W / 2 - 150, H / 2 - 40, 300, 70);
    ctx.fillStyle = "#ffd75e"; ctx.font = "bold 34px monospace"; ctx.textAlign = "center";
    ctx.fillText("第 " + (state.level + 1) + " 关", W / 2, H / 2 + 10);
    ctx.textAlign = "left";
  }
}

/* ---------- 主循环 ---------- */
function loop() { update(); draw(); requestAnimationFrame(loop); }

level = buildLevel(0);
tank = { x: 60, y: GROUND - 34, w: 52, h: 34, vx: 0, vy: 0, onGround: true, face: 1, inv: 0, cool: 0 };
bullets = []; ebullets = []; particles = []; popups = [];
updateHUD();
loop();