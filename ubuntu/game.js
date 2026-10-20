/* 坦克跳坑 · Tank Hop — 经典卡通横版躲避游戏 */
(function () {
  'use strict';
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;
  const GROUND_Y = H - 70;              // 地面高度

  // ---------- 状态 ----------
  const S = {
    mode: 'menu',        // menu | playing | paused | over
    dist: 0, coins: 0, lives: 3, speed: 1, best: +(localStorage.getItem('tankhop_best') || 0),
    shake: 0, muted: false, time: 0
  };

  const tank = { x: 150, y: GROUND_Y, vy: 0, w: 78, h: 46, onGround: true, jumps: 0, tilt: 0, wheel: 0, hurt: 0 };
  let pits = [], rocks = [], coinsArr = [], parts = [], clouds = [];

  // ---------- 天空星星(背景 canvas) ----------
  const sc = document.getElementById('stars'), sx = sc.getContext('2d');
  function resizeStars() { sc.width = innerWidth; sc.height = innerHeight; drawStars(); }
  function drawStars() {
    sx.clearRect(0, 0, sc.width, sc.height);
    for (let i = 0; i < 70; i++) {
      const x = (i * 137.5) % sc.width, y = ((i * 89.3) % (sc.height * .6));
      sx.globalAlpha = .25 + .5 * Math.abs(Math.sin(i));
      sx.fillStyle = '#fff'; sx.beginPath(); sx.arc(x, y, (i % 3) * .8 + .5, 0, 7); sx.fill();
    }
    sx.globalAlpha = 1;
  }
  addEventListener('resize', resizeStars); resizeStars();

  // ---------- 音效 (WebAudio 合成) ----------
  let AC = null;
  function ac() { if (!AC) AC = new (window.AudioContext || window.webkitAudioContext)(); return AC; }
  function beep(freq, dur, type, vol, slide) {
    if (S.muted) return;
    try {
      const a = ac(), o = a.createOscillator(), g = a.createGain();
      o.type = type || 'square'; o.frequency.setValueAtTime(freq, a.currentTime);
      if (slide) o.frequency.exponentialRampToValueAtTime(slide, a.currentTime + dur);
      g.gain.setValueAtTime(vol || .08, a.currentTime);
      g.gain.exponentialRampToValueAtTime(.001, a.currentTime + dur);
      o.connect(g); g.connect(a.destination); o.start(); o.stop(a.currentTime + dur);
    } catch (e) {}
  }
  const sfx = {
    jump: () => beep(320, .18, 'square', .07, 620),
    djump: () => beep(520, .16, 'square', .07, 880),
    coin: () => { beep(880, .08, 'square', .06); setTimeout(() => beep(1320, .12, 'square', .06), 70); },
    hurt: () => beep(200, .3, 'sawtooth', .1, 60),
    die: () => beep(140, .6, 'sawtooth', .12, 40)
  };

  // ---------- 云 ----------
  function initClouds() {
    clouds = [];
    for (let i = 0; i < 5; i++) clouds.push({ x: Math.random() * W, y: 30 + Math.random() * 90, s: .6 + Math.random() * .8 });
  }
  initClouds();

  // ---------- 关卡生成 ----------
  let nextPitX = 700, nextRockX = 900, nextCoinX = 500;
  function resetWorld() {
    pits = []; rocks = []; coinsArr = []; parts = [];
    nextPitX = 700; nextRockX = 1000; nextCoinX = 500;
    S.dist = 0; S.coins = 0; S.lives = 3; S.speed = 1; S.shake = 0; S.time = 0;
    tank.y = GROUND_Y; tank.vy = 0; tank.onGround = true; tank.jumps = 0; tank.hurt = 0;
    initClouds(); updateHUD();
  }

  function spawnThings() {
    const off = S.speed * 3.4; // 世界滚动速度 ≈ 每帧像素
    nextPitX -= off; nextRockX -= off; nextCoinX -= off;
    if (nextPitX < W + 100) {
      const w = 90 + Math.random() * 90;
      pits.push({ x: W + 60, w: w });
      nextPitX = W + 60 + w + 260 + Math.random() * (340 - Math.min(180, S.speed * 30));
    }
    if (nextRockX < W + 100) {
      rocks.push({ x: W + 40, y: GROUND_Y, r: 16 + Math.random() * 8, vx: -(1.2 + Math.random() * 1.4), spin: 0 });
      nextRockX = W + 40 + 380 + Math.random() * 400;
    }
    if (nextCoinX < W + 100) {
      const n = 3 + (Math.random() * 3 | 0);
      const fly = Math.random() < .4;
      for (let i = 0; i < n; i++)
        coinsArr.push({ x: W + 40 + i * 40, y: (fly ? GROUND_Y - 110 : GROUND_Y - 46) - Math.sin(i / (n - 1) * Math.PI) * (fly ? 30 : 26), got: false, t: Math.random() * 6 });
      nextCoinX = W + 40 + n * 40 + 300 + Math.random() * 350;
    }
  }

  function overPit(x) { for (const p of pits) if (x > p.x && x < p.x + p.w) return true; return false; }

  // ---------- 输入 ----------
  function jump() {
    if (S.mode === 'menu' || S.mode === 'over') { startGame(); return; }
    if (S.mode !== 'playing') return;
    if (tank.jumps < 2) {
      tank.vy = tank.jumps === 0 ? -11.5 : -10;
      tank.jumps++; tank.onGround = false;
      tank.jumps === 1 ? sfx.jump() : sfx.djump();
      burst(tank.x + 20, GROUND_Y, '#d9c9a3', 6);
    }
  }
  addEventListener('keydown', e => {
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') jump();
    if (e.code === 'KeyP') togglePause();
    if (e.code === 'KeyM') toggleMute();
    if (e.code === 'Enter' && (S.mode === 'menu' || S.mode === 'over')) startGame();
  });
  cvs.addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
  const held = { l: false, r: false };
  function bindHold(id, k) {
    const el = document.getElementById(id);
    const on = e => { e.preventDefault(); held[k] = true; };
    const off = e => { held[k] = false; };
    el.addEventListener('pointerdown', on); el.addEventListener('pointerup', off);
    el.addEventListener('pointerleave', off); el.addEventListener('pointercancel', off);
  }
  bindHold('btnL', 'l'); bindHold('btnR', 'r');
  document.getElementById('btnJ').addEventListener('pointerdown', e => { e.preventDefault(); jump(); });
  document.getElementById('btnStart').addEventListener('click', startGame);
  document.getElementById('btnPause').addEventListener('click', togglePause);
  document.getElementById('btnMute').addEventListener('click', toggleMute);
  document.getElementById('btnReset').addEventListener('click', startGame);

  function startGame() { resetWorld(); S.mode = 'playing'; hideOverlay(); beep(440, .1, 'square', .06, 660); }
  function togglePause() {
    if (S.mode === 'playing') { S.mode = 'paused'; showOverlay('已暂停', '喘口气，坦克也需要休息。', '继续'); }
    else if (S.mode === 'paused') { S.mode = 'playing'; hideOverlay(); }
  }
  function toggleMute() { S.muted = !S.muted; document.getElementById('btnMute').textContent = '声音：' + (S.muted ? '关' : '开'); }

  const ov = document.getElementById('overlay');
  const ovT = document.getElementById('ovTitle'), ovM = document.getElementById('ovMsg'), btnS = document.getElementById('btnStart');
  function showOverlay(t, m, btn) { ovT.textContent = t; ovM.innerHTML = m; btnS.textContent = btn || '开始游戏'; ov.classList.remove('hide'); }
  function hideOverlay() { ov.classList.add('hide'); }

  function gameOver() {
    S.mode = 'over';
    if (S.dist > S.best) { S.best = S.dist; localStorage.setItem('tankhop_best', S.best); }
    sfx.die();
    showOverlay('游戏结束',
      `你驾驶坦克行进了 <b style="color:#ffd166">${S.dist}</b> 米，收集 <b style="color:#ffd166">${S.coins}</b> 枚金币。<br>历史最佳：<b style="color:#ffd166">${S.best}</b> 米`, '再来一局');
  }

  function updateHUD() {
    document.getElementById('hDist').textContent = S.dist;
    document.getElementById('hCoin').textContent = S.coins;
    document.getElementById('hLives').textContent = '♥'.repeat(Math.max(0, S.lives)) + '♡'.repeat(Math.max(0, 3 - S.lives));
    document.getElementById('hSpd').textContent = S.speed.toFixed(1);
  }

  // ---------- 粒子 ----------
  function burst(x, y, color, n) {
    for (let i = 0; i < n; i++) parts.push({
      x, y, vx: (Math.random() - .5) * 5, vy: -Math.random() * 4 - 1,
      life: 24 + Math.random() * 16, max: 40, color, r: 2 + Math.random() * 3
    });
  }

  // ---------- 受伤 ----------
  function hurt() {
    if (tank.hurt > 0) return;
    tank.hurt = 70; S.lives--; S.shake = 14; sfx.hurt();
    burst(tank.x + 30, tank.y - 20, '#ff5964', 14);
    updateHUD();
    if (S.lives <= 0) gameOver();
  }

  // ---------- 主更新 ----------
  function update() {
    S.time++;
    // 云
    for (const c of clouds) { c.x -= c.s * .4 * (S.mode === 'playing' ? S.speed : 1); if (c.x < -140) { c.x = W + 80; c.y = 30 + Math.random() * 90; } }
    if (S.mode !== 'playing') { // 慢慢消散粒子
      parts = parts.filter(p => (p.life--, p.life > 0));
      return;
    }

    S.speed = Math.min(3.2, 1 + S.dist / 700);
    S.dist += S.speed * .1 | 0 || 1;   // 距离按整数累加
    S.dist = Math.round(S.dist + S.speed * .1);
    spawnThings();

    // 坦克物理
    const grav = .55;
    tank.vy += grav;
    tank.y += tank.vy;
    // 左右微调
    if (held.l) tank.x = Math.max(40, tank.x - 2.5);
    if (held.r) tank.x = Math.min(W - 120, tank.x + 2.5);
    tank.x += (150 - tank.x) * .02; // 缓慢回位

    const footX = tank.x + tank.w / 2;
    const inPit = overPit(footX);
    if (tank.y >= GROUND_Y) {
      if (inPit) {                      // 掉坑
        tank.y = H + 200; tank.vy = 0;
        hurt();
        if (S.mode === 'playing') { tank.y = GROUND_Y; tank.vy = -4; }
      } else {
        if (!tank.onGround) burst(footX, GROUND_Y, '#d9c9a3', 5);
        tank.y = GROUND_Y; tank.vy = 0; tank.onGround = true; tank.jumps = 0;
      }
    } else tank.onGround = false;
    tank.tilt = Math.max(-.25, Math.min(.25, tank.vy * .02));
    tank.wheel += S.speed * .12;
    if (tank.hurt > 0) tank.hurt--;

    // 滚石
    for (const r of rocks) {
      r.x += r.vx * S.speed - S.speed * 3.4;   // 世界滚动 - 敌人自身速度
      r.spin -= (S.speed * 3.4 - r.vx) / r.r;
      if (Math.abs(r.x - footX) < r.r + 30 && tank.y > GROUND_Y - 46 - r.r && tank.y < GROUND_Y + r.r) hurt();
    }
    rocks = rocks.filter(r => r.x > -60);

    // 金币
    for (const c of coinsArr) {
      c.x -= S.speed * 3.4; c.t += .15;
      if (!c.got && Math.abs(c.x - footX) < 40 && Math.abs(c.y - (tank.y - tank.h / 2)) < 46) {
        c.got = true; S.coins++; sfx.coin(); burst(c.x, c.y, '#ffd166', 8); updateHUD();
      }
    }
    coinsArr = coinsArr.filter(c => !c.got && c.x > -40);

    pits = pits.filter(p => p.x + p.w > -40);
    parts = parts.filter(p => { p.life--; p.x += p.vx; p.y += p.vy; p.vy += .2; return p.life > 0; });
    if (S.shake > 0) S.shake--;
    updateHUD();
  }

  // ---------- 绘制 ----------
  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }

  function drawBackground() {
    // 天空渐变
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#6ec6f5'); g.addColorStop(.55, '#a8dcfa'); g.addColorStop(1, '#e8f6ff');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    // 太阳
    ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.arc(W - 110, 70, 34, 0, 7); ctx.fill();
    ctx.fillStyle = 'rgba(255,230,128,.3)'; ctx.beginPath(); ctx.arc(W - 110, 70, 50, 0, 7); ctx.fill();
    // 远山
    ctx.fillStyle = '#8fbf87';
    const off = (S.dist * .3) % 400;
    for (let i = -1; i < 4; i++) {
      const x = i * 400 - off;
      ctx.beginPath(); ctx.moveTo(x, GROUND_Y); ctx.quadraticCurveTo(x + 100, GROUND_Y - 130, x + 200, GROUND_Y);
      ctx.quadraticCurveTo(x + 300, GROUND_Y - 90, x + 400, GROUND_Y); ctx.fill();
    }
    // 云
    for (const c of clouds) {
      ctx.fillStyle = 'rgba(255,255,255,.9)';
      ctx.beginPath();
      ctx.arc(c.x, c.y, 20 * c.s, 0, 7); ctx.arc(c.x + 22 * c.s, c.y - 8 * c.s, 16 * c.s, 0, 7);
      ctx.arc(c.x + 44 * c.s, c.y, 18 * c.s, 0, 7); ctx.arc(c.x + 22 * c.s, c.y + 8 * c.s, 20 * c.s, 0, 7);
      ctx.fill();
    }
    // 地面
    ctx.fillStyle = '#7d5a3c'; ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);
    ctx.fillStyle = '#6b4a30'; ctx.fillRect(0, GROUND_Y + 26, W, H - GROUND_Y);
    // 草皮
    ctx.fillStyle = '#5cb84e';
    const gOff = S.dist % 40;
    for (let x = -gOff; x < W + 40; x += 20) {
      if (overPit(x + 10)) continue;
      ctx.fillRect(x, GROUND_Y - 8, 20, 12);
      // 草尖
      ctx.beginPath(); ctx.moveTo(x, GROUND_Y - 8); ctx.lineTo(x + 5, GROUND_Y - 14); ctx.lineTo(x + 10, GROUND_Y - 8); ctx.fill();
    }
    ctx.fillStyle = '#4a9c3e'; ctx.fillRect(0, GROUND_Y + 4, W, 5);
    // 地面纹理
    ctx.fillStyle = 'rgba(0,0,0,.12)';
    for (let i = 0; i < 14; i++) {
      const x = ((i * 97 - S.dist * 2) % (W + 60) + W + 60) % (W + 60) - 30;
      ctx.fillRect(x, GROUND_Y + 34 + (i * 13) % 40, 26, 5);
    }
    // 弹坑
    for (const p of pits) {
      // 坑口阴影
      ctx.fillStyle = '#3d2a18';
      ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, GROUND_Y, p.w / 2, 30, 0, 0, Math.PI); ctx.fill();
      ctx.fillStyle = '#241708';
      ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, GROUND_Y + 6, p.w / 2 - 14, 24, 0, 0, Math.PI); ctx.fill();
      // 坑沿高光
      ctx.strokeStyle = '#8a6a45'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.ellipse(p.x + p.w / 2, GROUND_Y, p.w / 2 + 3, 8, 0, Math.PI, 0); ctx.stroke();
      // 危险标记
      ctx.fillStyle = 'rgba(255,80,80,.75)';
      const bx = p.x + p.w / 2;
      ctx.font = 'bold 11px sans-serif'; ctx.textAlign = 'center';
      ctx.fillText('!', bx, GROUND_Y + 2);
    }
  }

  function drawTank() {
    const { x, y } = tank;
    ctx.save();
    if (tank.hurt > 0 && (tank.hurt >> 2) % 2) ctx.globalAlpha = .45;   // 受伤闪烁
    ctx.translate(x + tank.w / 2, y - tank.h / 2);
    ctx.rotate(tank.tilt);
    ctx.translate(-tank.w / 2, -tank.h / 2);

    // 履带
    ctx.fillStyle = '#2f3540'; roundRect(-4, 26, tank.w + 8, 20, 10); ctx.fill();
    ctx.strokeStyle = '#1d2128'; ctx.lineWidth = 2; ctx.stroke();
    // 轮子
    for (let i = 0; i < 4; i++) {
      const wx = 8 + i * 20;
      ctx.fillStyle = '#4a5160'; ctx.beginPath(); ctx.arc(wx, 36, 8, 0, 7); ctx.fill();
      ctx.strokeStyle = '#23272f'; ctx.lineWidth = 2; ctx.stroke();
      // 轮辐
      ctx.save(); ctx.translate(wx, 36); ctx.rotate(tank.wheel);
      ctx.beginPath(); ctx.moveTo(-6, 0); ctx.lineTo(6, 0); ctx.moveTo(0, -6); ctx.lineTo(0, 6);
      ctx.strokeStyle = '#8a93a5'; ctx.stroke(); ctx.restore();
    }
    // 车身
    ctx.fillStyle = '#5f9e42'; roundRect(0, 12, tank.w, 18, 6); ctx.fill();
    ctx.strokeStyle = '#3c6b2b'; ctx.lineWidth = 2.5; ctx.stroke();
    // 炮塔
    ctx.fillStyle = '#6fb350'; roundRect(24, -4, 36, 22, 8); ctx.fill();
    ctx.strokeStyle = '#3c6b2b'; ctx.stroke();
    // 炮管
    ctx.fillStyle = '#4c8a37';
    ctx.fillRect(56, 2, 34, 8);
    ctx.fillStyle = '#3c6b2b'; ctx.fillRect(86, 0, 8, 12);
    // 舱盖 + 星星
    ctx.fillStyle = '#3c6b2b'; ctx.beginPath(); ctx.arc(42, -4, 8, Math.PI, 0); ctx.fill();
    ctx.fillStyle = '#ffd166'; star(42, -8, 5, 4.5, 2.4); ctx.fill();
    // 车灯
    ctx.fillStyle = '#ffe680'; ctx.beginPath(); ctx.arc(tank.w - 2, 20, 5, 0, 7); ctx.fill();
    ctx.strokeStyle = '#c9a227'; ctx.lineWidth = 1.5; ctx.stroke();
    // 装甲线
    ctx.strokeStyle = 'rgba(0,0,0,.18)'; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(6, 20); ctx.lineTo(20, 20); ctx.moveTo(6, 25); ctx.lineTo(20, 25); ctx.stroke();
    ctx.restore();
  }
  function star(cx, cy, spikes, outer, inner) {
    let rot = -Math.PI / 2, step = Math.PI / spikes;
    ctx.beginPath(); ctx.moveTo(cx, cy - outer);
    for (let i = 0; i < spikes; i++) {
      ctx.lineTo(cx + Math.cos(rot) * outer, cy + Math.sin(rot) * outer); rot += step;
      ctx.lineTo(cx + Math.cos(rot) * inner, cy + Math.sin(rot) * inner); rot += step;
    }
    ctx.closePath();
  }

  function drawRocks() {
    for (const r of rocks) {
      ctx.save(); ctx.translate(r.x, r.y - r.r); ctx.rotate(r.spin);
      ctx.fillStyle = '#8d8d94'; ctx.beginPath(); ctx.arc(0, 0, r.r, 0, 7); ctx.fill();
      ctx.strokeStyle = '#5f5f68'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#6e6e78';
      ctx.beginPath(); ctx.arc(-r.r * .3, -r.r * .2, r.r * .3, 0, 7); ctx.fill();
      ctx.beginPath(); ctx.arc(r.r * .35, r.r * .25, r.r * .2, 0, 7); ctx.fill();
      ctx.restore();
      // 阴影
      if (r.y >= GROUND_Y - r.r) {
        ctx.fillStyle = 'rgba(0,0,0,.2)'; ctx.beginPath();
        ctx.ellipse(r.x, GROUND_Y + 2, r.r, 5, 0, 0, 7); ctx.fill();
      }
    }
  }

  function drawCoins() {
    for (const c of coinsArr) {
      const s = Math.abs(Math.cos(c.t));
      ctx.save(); ctx.translate(c.x, c.y); ctx.scale(Math.max(.2, s), 1);
      ctx.fillStyle = '#ffd166'; ctx.beginPath(); ctx.arc(0, 0, 13, 0, 7); ctx.fill();
      ctx.strokeStyle = '#e09b1e'; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = '#e09b1e'; ctx.font = 'bold 15px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('¥', 0, 1);
      ctx.restore();
      // 光晕
      ctx.fillStyle = 'rgba(255,209,102,.25)'; ctx.beginPath(); ctx.arc(c.x, c.y, 18, 0, 7); ctx.fill();
    }
  }

  function drawParts() {
    for (const p of parts) {
      ctx.globalAlpha = Math.max(0, p.life / p.max);
      ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, 7); ctx.fill();
    }
    ctx.globalAlpha = 1;
  }

  function draw() {
    ctx.save();
    if (S.shake > 0) ctx.translate((Math.random() - .5) * S.shake, (Math.random() - .5) * S.shake);
    drawBackground();
    drawCoins();
    drawRocks();
    drawTank();
    drawParts();
    // 暂停滤镜
    if (S.mode === 'paused') { ctx.fillStyle = 'rgba(10,20,40,.3)'; ctx.fillRect(0, 0, W, H); }
    ctx.restore();
  }

  // ---------- 循环 ----------
  function loop() { update(); draw(); requestAnimationFrame(loop); }
  loop();
})();