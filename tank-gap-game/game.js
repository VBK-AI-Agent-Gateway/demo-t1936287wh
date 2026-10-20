"use strict";
/* 坦克跳坑 - 经典横版 Canvas 小游戏，零依赖 */
(() => {
  const cvs = document.getElementById("game");
  const ctx = cvs.getContext("2d");
  const W = cvs.width, H = cvs.height;
  const GROUND_Y = H - 90;
  const GRAV = 0.62, JUMP_V = -13.2, JUMP2_V = -11.5;

  const $ = id => document.getElementById(id);
  const el = {
    hud: $("hud"), score: $("score"), dist: $("dist"), lives: $("lives"), fuel: $("fuel"),
    menu: $("menu"), over: $("over"), start: $("startBtn"), retry: $("retryBtn"),
    bestMenu: $("bestMenu"), bestOver: $("bestOver"), finalScore: $("finalScore"), finalDist: $("finalDist"),
    sound: $("soundBtn"), touch: $("touch"),
    tL: $("tLeft"), tJ: $("tJump"), tR: $("tRight")
  };

  const BEST_KEY = "tankGapBest";
  let best = +(localStorage.getItem(BEST_KEY) || 0);
  el.bestMenu.textContent = best;

  /* ---------- 音效（WebAudio 合成，无资源文件） ---------- */
  let actx = null, soundOn = true;
  function beep(freq, dur = 0.08, type = "square", vol = 0.05) {
    if (!soundOn) return;
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === "suspended") actx.resume();
      const o = actx.createOscillator(), g = actx.createGain();
      o.type = type; o.frequency.value = freq;
      g.gain.setValueAtTime(vol, actx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.0001, actx.currentTime + dur);
      o.connect(g); g.connect(actx.destination);
      o.start(); o.stop(actx.currentTime + dur);
    } catch (e) {}
  }
  el.sound.onclick = () => {
    soundOn = !soundOn;
    el.sound.textContent = soundOn ? "🔊" : "🔇";
    if (soundOn) beep(660);
  };

  /* ---------- 输入 ---------- */
  const keys = { left: false, right: false, jump: false };
  let jumpEdge = false;
  const KEYMAP = {
    ArrowLeft: "left", a: "left", A: "left",
    ArrowRight: "right", d: "right", D: "right",
    ArrowUp: "jump", w: "jump", W: "jump", " ": "jump"
  };
  addEventListener("keydown", e => {
    const k = KEYMAP[e.key];
    if (k) {
      e.preventDefault();
      if (k === "jump" && !keys.jump) jumpEdge = true;
      keys[k] = true;
    } else if (e.key === "Enter" && state !== "play") {
      startGame();
    }
  });
  addEventListener("keyup", e => {
    const k = KEYMAP[e.key];
    if (k) { e.preventDefault(); keys[k] = false; }
  });
  function bindTouch(btn, key) {
    const on = e => { e.preventDefault(); if (key === "jump" && !keys.jump) jumpEdge = true; keys[key] = true; };
    const off = e => { e.preventDefault(); keys[key] = false; };
    btn.addEventListener("touchstart", on, { passive: false });
    btn.addEventListener("touchend", off, { passive: false });
    btn.addEventListener("touchcancel", off, { passive: false });
    btn.addEventListener("mousedown", on);
    btn.addEventListener("mouseup", off);
    btn.addEventListener("mouseleave", off);
  }
  bindTouch(el.tL, "left"); bindTouch(el.tR, "right"); bindTouch(el.tJ, "jump");
  if (matchMedia("(pointer:coarse)").matches) el.touch.classList.remove("hidden");

  /* ---------- 状态 ---------- */
  let state = "menu";
  let score = 0, distM = 0, lives = 3, fuelCount = 0, invincible = 0, shake = 0;
  let speed = 4.2, camX = 0;

  const tank = { x: 200, y: GROUND_Y, vy: 0, onGround: true, jumps: 0, track: 0 };

  let ground = [];
  const pits = [], barrels = [], obstacles = [];

  function resetWorld() {
    ground = [{ x0: -600, x1: 1600 }];
    pits.length = 0; barrels.length = 0; obstacles.length = 0;
    tank.x = 200; tank.y = GROUND_Y; tank.vy = 0; tank.onGround = true; tank.jumps = 0;
    camX = 0; score = 0; distM = 0; lives = 3; fuelCount = 0;
    speed = 4.2; invincible = 0; shake = 0;
    ensureGround(camX + W * 2 + 1600);
  }

  function ensureGround(target) {
    while (ground[ground.length - 1].x1 < target) {
      const last = ground[ground.length - 1];
      const diff = Math.min(1, distM / 3000);
      const safe = Math.max(150, 300 - 90 * diff + Math.random() * 150);
      const pitW = 110 + Math.random() * (110 + 150 * diff);
      const px1 = last.x1;
      const nx0 = px1 + safe + pitW;
      const nx1 = nx0 + Math.max(260, 460 - 120 * diff) + Math.random() * 340;
      ground.push({ x0: nx0, x1: nx1 });
      pits.push({ x0: px1, x1: nx0 });
      if (Math.random() < 0.75) {
        const span = Math.max(60, (nx1 - nx0) - 120);
        barrels.push({ x: nx0 + 60 + Math.random() * span, y: GROUND_Y - 34, got: false });
      }
      if (diff > 0.1 && Math.random() < 0.35 + 0.3 * diff) {
        const span = Math.max(70, (nx1 - nx0) - 240);
        obstacles.push({ x: nx0 + 150 + Math.random() * span, y: GROUND_Y - 30, w: 34, h: 30 });
      }
    }
    const cut = camX - 900;
    while (ground.length > 2 && ground[1].x1 < cut) ground.shift();
    while (pits.length && pits[0].x1 < cut) pits.shift();
    while (barrels.length && barrels[0].x < cut) barrels.shift();
    while (obstacles.length && obstacles[0].x < cut) obstacles.shift();
  }

  function groundAt(x) {
    for (const g of ground) if (x >= g.x0 && x <= g.x1) return GROUND_Y;
    return null;
  }

  function respawnInPit() {
    lives--; shake = 16;
    beep(90, 0.35, "sawtooth", 0.09);
    if (lives <= 0) { gameOver(); return; }
    // 回到当前坑左侧平台
    let seg = null;
    for (let i = ground.length - 1; i >= 0; i--) {
      if (ground[i].x1 <= tank.x) { seg = ground[i]; break; }
    }
    if (!seg) seg = ground[0];
    tank.x = seg.x1 - 70;
    tank.y = GROUND_Y - 6; tank.vy = 0; tank.onGround = true; tank.jumps = 0;
    speed = 3.0; invincible = 110;
  }

  function hurt() {
    if (invincible > 0 || state !== "play") return;
    lives--; invincible = 100; shake = 14;
    beep(120, 0.25, "sawtooth", 0.08);
    if (lives <= 0) gameOver();
  }

  /* ---------- 主循环 ---------- */
  let last = performance.now();
  function loop(now) {
    const dt = Math.min(34, now - last); last = now;
    if (state === "play") update(dt);
    render();
    requestAnimationFrame(loop);
  }

  function update(dt) {
    const frame = dt / 16.667;
    const base = 4.2 + Math.min(4.6, distM / 900);
    if (keys.right) speed += 0.14 * frame;
    if (keys.left) speed -= 0.20 * frame;
    speed = Math.max(1.6, Math.min(base + 3.2, speed));
    if (speed > base) speed = Math.max(base, speed - 0.05 * frame);

    tank.x += speed * frame;
    tank.track += speed * frame;
    camX = Math.max(0, tank.x - 260);
    distM = Math.max(distM, Math.floor(tank.x / 10));
    score = Math.max(score, distM + fuelCount * 50);
    if (invincible > 0) invincible -= frame;
    if (shake > 0) shake -= frame;

    if (jumpEdge) {
      if (tank.onGround) { tank.vy = JUMP_V; tank.onGround = false; tank.jumps = 1; beep(440, 0.09); }
      else if (tank.jumps < 2) { tank.vy = JUMP2_V; tank.jumps = 2; beep(620, 0.09); }
      jumpEdge = false;
    }
    if (!tank.onGround) {
      tank.vy += GRAV * frame;
      tank.y += tank.vy * frame;
    }

    const g = groundAt(tank.x);
    if (g === null) {
      if (tank.y > H + 60) respawnInPit();
    } else if (tank.y >= g && tank.vy >= 0) {
      tank.y = g; tank.vy = 0;
      if (!tank.onGround) beep(200, 0.05, "triangle", 0.04);
      tank.onGround = true; tank.jumps = 0;
    } else if (tank.y < g - 1) {
      tank.onGround = false;
    }

    for (const b of barrels) {
      if (b.got) continue;
      if (Math.abs(b.x - tank.x) < 44 && Math.abs(b.y - (tank.y - 30)) < 44) {
        b.got = true; fuelCount++;
        beep(880, 0.07, "sine", 0.06);
        setTimeout(() => beep(1320, 0.08, "sine", 0.05), 60);
      }
    }
    if (tank.onGround || tank.y > GROUND_Y - 34) {
      for (const o of obstacles) {
        if (Math.abs(o.x + o.w / 2 - tank.x) < 46 && tank.y > o.y - 24) { hurt(); break; }
      }
    }

    ensureGround(camX + W * 2 + 1600);

    el.score.textContent = score;
    el.dist.textContent = distM;
    el.lives.textContent = "❤".repeat(Math.max(0, lives)) || "—";
    el.fuel.textContent = fuelCount;
  }

  function startGame() {
    resetWorld();
    state = "play";
    el.menu.classList.add("hidden");
    el.over.classList.add("hidden");
    el.hud.classList.remove("hidden");
    beep(520, 0.1);
  }

  function gameOver() {
    state = "over";
    if (score > best) {
      best = score;
      try { localStorage.setItem(BEST_KEY, best); } catch (e) {}
    }
    el.finalScore.textContent = score;
    el.finalDist.textContent = distM;
    el.bestOver.textContent = best;
    el.bestMenu.textContent = best;
    el.over.classList.remove("hidden");
    el.hud.classList.add("hidden");
    beep(200, 0.4, "sawtooth", 0.07);
    setTimeout(() => beep(140, 0.5, "sawtooth", 0.07), 200);
  }

  el.start.onclick = startGame;
  el.retry.onclick = startGame;

  /* ---------- 渲染 ---------- */
  function render() {
    ctx.save();
    const sx = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    const sy = shake > 0 ? (Math.random() - 0.5) * shake : 0;
    ctx.translate(sx, sy);

    // 天空渐变
    const sky = ctx.createLinearGradient(0, 0, 0, H);
    sky.addColorStop(0, "#1b2434");
    sky.addColorStop(0.6, "#2c3a52");
    sky.addColorStop(1, "#4a3a35");
    ctx.fillStyle = sky;
    ctx.fillRect(-20, -20, W + 40, H + 40);

    // 远山（视差）
    drawHills(0.15, "#232d3f", H - 190, 70);
    drawHills(0.3, "#2b374b", H - 140, 55);

    ctx.save();
    ctx.translate(-camX, 0);

    // 地面与坑
    for (const seg of ground) {
      if (seg.x1 < camX - 60 || seg.x0 > camX + W + 60) continue;
      const grd = ctx.createLinearGradient(0, GROUND_Y, 0, H);
      grd.addColorStop(0, "#6b4f2a");
      grd.addColorStop(0.15, "#5a421f");
      grd.addColorStop(1, "#33250f");
      ctx.fillStyle = grd;
      ctx.fillRect(seg.x0, GROUND_Y, seg.x1 - seg.x0, H - GROUND_Y);
      ctx.fillStyle = "#4c7a34";
      ctx.fillRect(seg.x0, GROUND_Y - 8, seg.x1 - seg.x0, 8);
      ctx.fillStyle = "#5f9642";
      for (let x = Math.ceil(seg.x0 / 24) * 24; x < seg.x1; x += 24) {
        ctx.fillRect(x, GROUND_Y - 12, 10, 5);
      }
      // 坑壁阴影
      ctx.fillStyle = "rgba(0,0,0,.55)";
      ctx.fillRect(seg.x1, GROUND_Y, 5, H - GROUND_Y);
      ctx.fillRect(seg.x0 - 5, GROUND_Y, 5, H - GROUND_Y);
    }

    // 油桶
    for (const b of barrels) {
      if (b.got || b.x < camX - 60 || b.x > camX + W + 60) continue;
      const bob = Math.sin(performance.now() / 300 + b.x) * 3;
      ctx.fillStyle = "#c0392b";
      ctx.fillRect(b.x - 12, b.y + bob, 24, 30);
      ctx.fillStyle = "#e74c3c";
      ctx.fillRect(b.x - 12, b.y + 6 + bob, 24, 6);
      ctx.fillStyle = "#7b241c";
      ctx.fillRect(b.x - 12, b.y + bob, 24, 4);
      ctx.fillRect(b.x - 12, b.y + 26 + bob, 24, 4);
      ctx.fillStyle = "#f1c40f";
      ctx.font = "bold 11px monospace";
      ctx.fillText("油", b.x - 6, b.y + 21 + bob);
    }

    // 障碍（石块带尖刺）
    for (const o of obstacles) {
      if (o.x < camX - 60 || o.x > camX + W + 60) continue;
      ctx.fillStyle = "#566573";
      ctx.fillRect(o.x, o.y, o.w, o.h);
      ctx.fillStyle = "#8395a7";
      ctx.beginPath();
      for (let i = 0; i < 3; i++) {
        const bx = o.x + 3 + i * 11;
        ctx.moveTo(bx, o.y);
        ctx.lineTo(bx + 5, o.y - 14);
        ctx.lineTo(bx + 10, o.y);
      }
      ctx.fill();
      ctx.fillStyle = "#34495e";
      ctx.fillRect(o.x, o.y + o.h - 5, o.w, 5);
    }

    // 坑内提示
    for (const p of pits) {
      if (p.x1 < camX - 60 || p.x0 > camX + W + 60) continue;
      ctx.fillStyle = "rgba(0,0,0,.35)";
      ctx.fillRect(p.x0, GROUND_Y, p.x1 - p.x0, H - GROUND_Y);
    }

    // 坦克
    drawTank(tank.x, tank.y, invincible > 0 && Math.floor(invincible / 6) % 2 === 0);

    ctx.restore(); // 相机

    // 速度线
    if (state === "play" && speed > 6) {
      ctx.strokeStyle = "rgba(255,255,255,.12)";
      ctx.lineWidth = 2;
      for (let i = 0; i < 6; i++) {
        const y = (i * 97 + performance.now() / 8) % H;
        const x = (i * 173 + performance.now() * (speed / 10)) % W;
        ctx.beginPath(); ctx.moveTo(W - x, y); ctx.lineTo(W - x - 40, y); ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawHills(par, color, baseY, amp) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, H);
    const off = camX * par;
    for (let x = -50; x <= W + 50; x += 50) {
      const h = Math.sin((x + off) / 130) * amp + Math.sin((x + off) / 61) * (amp / 3);
      ctx.lineTo(x, baseY - h);
    }
    ctx.lineTo(W, H);
    ctx.closePath();
    ctx.fill();
  }

  function drawTank(x, y, blinkOff) {
    if (blinkOff) return;
    ctx.save();
    ctx.translate(x, y);
    const t = tank.track;

    // 履带
    ctx.fillStyle = "#1f2429";
    roundRect(-40, -16, 80, 16, 8);
    ctx.fill();
    ctx.fillStyle = "#3a4148";
    for (let i = -3; i <= 3; i++) {
      const px = ((i * 11) - (t % 11));
      ctx.fillRect(px - 3, -14, 5, 12);
    }
    // 轮子
    ctx.fillStyle = "#5d6d7e";
    for (const wx of [-26, 0, 26]) {
      ctx.beginPath(); ctx.arc(wx, -8, 6, 0, Math.PI * 2); ctx.fill();
    }

    // 车身
    ctx.fillStyle = "#3e5c31";
    roundRect(-34, -34, 68, 20, 4); ctx.fill();
    ctx.fillStyle = "#4f7a3d";
    ctx.fillRect(-34, -34, 68, 6);
    // 伪影高光
    ctx.fillStyle = "rgba(255,255,255,.08)";
    ctx.fillRect(-30, -32, 60, 3);

    // 炮塔
    ctx.fillStyle = "#33502a";
    ctx.beginPath(); ctx.arc(4, -34, 14, Math.PI, 0); ctx.fill();
    ctx.fillRect(-10, -34, 28, 6);
    // 炮管
    ctx.strokeStyle = "#22351d"; ctx.lineWidth = 6; ctx.lineCap = "round";
    ctx.beginPath(); ctx.moveTo(6, -42); ctx.lineTo(44, -46); ctx.stroke();
    ctx.strokeStyle = "#6b8f5a"; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(40, -47); ctx.lineTo(46, -46.5); ctx.stroke();

    // 星徽
    ctx.fillStyle = "#f4d03f";
    star(4, -38, 5);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }
  function star(cx, cy, r) {
    ctx.beginPath();
    for (let i = 0; i < 10; i++) {
      const ang = -Math.PI / 2 + i * Math.PI / 5;
      const rr = i % 2 === 0 ? r : r * 0.45;
      const px = cx + Math.cos(ang) * rr, py = cy + Math.sin(ang) * rr;
      i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.closePath(); ctx.fill();
  }

  resetWorld();
  requestAnimationFrame(loop);
})();