(() => {
  'use strict';
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const W = cvs.width, H = cvs.height;
  const GROUND_Y = 210;
  const GRAVITY = 0.55;
  const JUMP_V = -8.6;

  const elDist = document.getElementById('dist');
  const elBest = document.getElementById('best');
  const elLives = document.getElementById('lives');
  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ovTitle');
  const ovDesc = document.getElementById('ovDesc');
  const startBtn = document.getElementById('startBtn');
  const jumpBtn = document.getElementById('jumpBtn');

  let state = 'menu'; // menu | play | over
  let tank, pits, speed, scroll, dist, lives, best, frame, clouds, trees;

  best = parseInt(localStorage.getItem('tankPitBest') || '0', 10);
  elBest.textContent = best;

  function reset() {
    tank = { x: 90, y: GROUND_Y - 26, w: 46, h: 26, vy: 0, onGround: true, jumps: 0, angle: 0, inv: 0, falling: false };
    pits = [{ x: 620, w: 70 }];
    speed = 3.4;
    scroll = 0; dist = 0; lives = 3; frame = 0;
    clouds = Array.from({ length: 5 }, (_, i) => ({ x: i * 130 + Math.random() * 60, y: 20 + Math.random() * 50, s: 0.4 + Math.random() * 0.5 }));
    trees = Array.from({ length: 8 }, (_, i) => ({ x: i * 110 + Math.random() * 50 }));
    updateHUD();
  }

  function updateHUD() {
    elDist.textContent = dist;
    elBest.textContent = best;
    elLives.textContent = '♥'.repeat(Math.max(0, lives)) + '♡'.repeat(Math.max(0, 3 - lives));
  }

  function doJump() {
    if (state !== 'play') return;
    if (tank.jumps < 2) {
      tank.vy = JUMP_V - Math.min(2, speed * 0.15);
      tank.onGround = false;
      tank.jumps++;
    }
  }
  window.addEventListener('keydown', e => {
    if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'KeyW') {
      e.preventDefault();
      if (state === 'play') doJump(); else startGame();
    }
  });
  cvs.addEventListener('pointerdown', e => { e.preventDefault(); if (state === 'play') doJump(); });
  jumpBtn.addEventListener('pointerdown', e => { e.preventDefault(); doJump(); });
  startBtn.addEventListener('click', startGame);

  function startGame() { reset(); state = 'play'; overlay.classList.remove('show'); }

  function gameOver() {
    state = 'over';
    if (dist > best) { best = dist; localStorage.setItem('tankPitBest', String(best)); }
    updateHUD();
    ovTitle.textContent = '游戏结束';
    ovDesc.innerHTML = `你跑了 <b style="color:#06d6a0">${dist}</b> 米，最高纪录 <b style="color:#ffd166">${best}</b> 米<br>掉进坑里了！`;
    startBtn.textContent = '再来一局';
    overlay.classList.add('show');
  }

  function hitLife() {
    lives--;
    updateHUD();
    if (lives <= 0) gameOver();
    else {
      tank.inv = 60;
      speed = Math.max(3.0, speed * 0.7);
    }
  }

  function spawnPit() {
    const last = pits[pits.length - 1];
    const minGap = 170 + speed * 18;
    const gap = minGap + Math.random() * (80 + speed * 22);
    const w = 55 + Math.random() * (25 + speed * 6);
    pits.push({ x: last.x + last.w + gap, w: Math.min(w, 130) });
  }

  function update() {
    frame++;
    if (state !== 'play') return;

    speed = Math.min(9, 3.4 + dist / 350);
    scroll += speed;
    dist = Math.floor(scroll / 40);

    tank.vy += GRAVITY;
    tank.y += tank.vy;
    if (tank.y >= GROUND_Y - tank.h) {
      tank.y = GROUND_Y - tank.h; tank.vy = 0;
      if (!tank.onGround) tank.jumps = 0;
      tank.onGround = true;
    } else tank.onGround = false;
    tank.angle = tank.onGround ? 0 : Math.max(-0.3, Math.min(0.3, tank.vy * 0.03));
    if (tank.inv > 0) tank.inv--;

    for (const p of pits) p.x -= speed;
    while (pits.length && pits[0].x + pits[0].w < -50) pits.shift();
    const last = pits[pits.length - 1];
    if (last.x + last.w < W + 400) spawnPit();

    const tx = tank.x + 10, tw = tank.w - 20;
    if (!tank.falling && tank.inv <= 0) {
      for (const p of pits) {
        if (tx + tw > p.x + 6 && tx < p.x + p.w - 6 && tank.y + tank.h >= GROUND_Y - 4) {
          tank.falling = true;
          hitLife();
          setTimeout(() => {
            tank.falling = false;
            tank.y = GROUND_Y - tank.h; tank.vy = 0; tank.jumps = 0;
          }, 300);
          break;
        }
      }
    }

    for (const c of clouds) { c.x -= c.s * speed * 0.3; if (c.x < -80) { c.x = W + 60; c.y = 15 + Math.random() * 55; } }
    for (const t of trees) { t.x -= speed * 0.7; if (t.x < -60) t.x = W + Math.random() * 120; }

    updateHUD();
  }

  function draw() {
    const g = ctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, '#2b2d5e'); g.addColorStop(1, '#5a6ea8');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    ctx.fillStyle = 'rgba(255,255,255,.75)';
    for (const c of clouds) {
      ctx.beginPath();
      ctx.arc(c.x, c.y, 12, 0, 7); ctx.arc(c.x + 14, c.y - 5, 15, 0, 7); ctx.arc(c.x + 30, c.y, 11, 0, 7);
      ctx.fill();
    }

    ctx.fillStyle = '#3d4a7a';
    for (let i = 0; i < 6; i++) {
      const x = ((i * 120 - scroll * 0.4) % (W + 240) + W + 240) % (W + 240) - 120;
      ctx.beginPath(); ctx.arc(x, GROUND_Y + 30, 90, Math.PI, 0); ctx.fill();
    }

    for (const t of trees) drawTree(t.x);

    ctx.fillStyle = '#6b4a2b';
    ctx.fillRect(0, GROUND_Y, W, H - GROUND_Y);

    let cx = 0;
    const sorted = [...pits].sort((a, b) => a.x - b.x);
    ctx.fillStyle = '#3fa34d';
    for (const p of sorted) {
      if (p.x > cx) ctx.fillRect(cx, GROUND_Y, p.x - cx, 8);
      cx = Math.max(cx, p.x + p.w);
    }
    if (cx < W) ctx.fillRect(cx, GROUND_Y, W - cx, 8);

    for (const p of sorted) {
      if (p.x > W || p.x + p.w < 0) continue;
      ctx.fillStyle = '#120a05';
      ctx.fillRect(p.x, GROUND_Y, p.w, H - GROUND_Y);
      ctx.fillStyle = 'rgba(0,0,0,.5)';
      ctx.fillRect(p.x, GROUND_Y + 8, p.w, 6);
      ctx.fillStyle = '#888';
      for (let i = 0; i < p.w; i += 14) {
        ctx.beginPath();
        ctx.moveTo(p.x + i, H); ctx.lineTo(p.x + i + 7, H - 14); ctx.lineTo(p.x + i + 14, H);
        ctx.fill();
      }
      ctx.fillStyle = '#4a3018';
      ctx.fillRect(p.x - 3, GROUND_Y, 3, 10);
      ctx.fillRect(p.x + p.w, GROUND_Y, 3, 10);
    }

    ctx.fillStyle = 'rgba(0,0,0,.15)';
    for (let i = 0; i < 14; i++) {
      const x = ((i * 70 - scroll) % (W + 70) + W + 70) % (W + 70) - 35;
      ctx.fillRect(x, GROUND_Y + 16 + (i % 3) * 14, 26, 4);
    }

    if (tank) drawTank();
  }

  function drawTree(x) {
    ctx.fillStyle = '#3a2a17'; ctx.fillRect(x + 8, GROUND_Y - 34, 6, 34);
    ctx.fillStyle = '#2f7d3a';
    ctx.beginPath(); ctx.arc(x + 11, GROUND_Y - 42, 14, 0, 7); ctx.arc(x + 3, GROUND_Y - 34, 10, 0, 7); ctx.arc(x + 20, GROUND_Y - 34, 10, 0, 7); ctx.fill();
  }

  function drawTank() {
    const { x, y, w, h, angle } = tank;
    ctx.save();
    ctx.translate(x + w / 2, y + h / 2);
    ctx.rotate(angle);
    ctx.translate(-w / 2, -h / 2);

    if (tank.inv > 0 && Math.floor(frame / 4) % 2 === 0) ctx.globalAlpha = 0.4;

    ctx.fillStyle = '#3c6e47';
    roundRect(4, 8, w - 8, h - 12, 4); ctx.fill();
    ctx.fillStyle = '#4f8a5a';
    ctx.fillRect(6, 10, w - 12, 6);
    ctx.fillStyle = '#2c5535';
    roundRect(w / 2 - 10, 0, 20, 12, 3); ctx.fill();
    ctx.fillStyle = '#22331f';
    ctx.fillRect(w / 2 + 6, 3, 24, 5);
    ctx.fillStyle = '#111'; ctx.fillRect(w / 2 + 28, 2, 4, 7);
    ctx.fillStyle = '#1b1b1b';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(10 + i * 9, h - 4, 5, 0, 7); ctx.fill(); }
    ctx.fillStyle = '#555';
    for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.arc(10 + i * 9, h - 4, 2, 0, 7); ctx.fill(); }
    ctx.strokeStyle = '#111'; ctx.lineWidth = 3;
    roundRect(4, h - 10, w - 8, 9, 4); ctx.stroke();

    ctx.globalAlpha = 1;
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

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }

  reset();
  state = 'menu';
  loop();
})();