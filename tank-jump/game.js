// 坦克跳坑 - Tank Jump
(() => {
  const cvs = document.getElementById('game');
  const ctx = cvs.getContext('2d');
  const scoreEl = document.getElementById('score');
  const bestEl = document.getElementById('best');
  const overlay = document.getElementById('overlay');
  const ovTitle = document.getElementById('ovTitle');
  const ovText = document.getElementById('ovText');
  const btnStart = document.getElementById('btnStart');

  const W = cvs.width, H = cvs.height;
  const GROUND_Y = H - 60;           // 地面顶边
  const GRAVITY = 0.55;
  const JUMP_V = -11.5;
  const MOVE_V = 3.4;

  let best = +(localStorage.getItem('tankJumpBest') || 0);
  bestEl.textContent = best;

  const state = { mode: 'ready', score: 0, speed: 3.2, dist: 0 };

  // 坑列表：{x, w}，地面段 = 坑之间的空隙
  let holes = [];
  let nextHoleAt = 700;

  const tank = { x: 90, y: GROUND_Y - 34, w: 52, h: 34, vy: 0, onGround: true, jumps: 0, tread: 0 };

  const keys = {};
  addEventListener('keydown', e => {
    if (['ArrowLeft','ArrowRight','ArrowUp',' '].includes(e.key)) e.preventDefault();
    keys[e.key] = true;
    if (state.mode === 'playing' && (e.key === ' ' || e.key === 'ArrowUp')) jump();
    if (state.mode !== 'playing' && (e.key === 'Enter' || e.key === ' ')) reset();
  });
  addEventListener('keyup', e => keys[e.key] = false);
  btnStart.addEventListener('click', reset);

  function jump() {
    if (tank.jumps < 2) {
      tank.vy = JUMP_V * (tank.jumps === 1 ? 0.92 : 1);
      tank.onGround = false;
      tank.jumps++;
    }
  }

  function reset() {
    state.mode = 'playing';
    state.score = 0;
    state.speed = 3.2;
    state.dist = 0;
    holes = [];
    nextHoleAt = 600;
    Object.assign(tank, { x: 90, y: GROUND_Y - 34, vy: 0, onGround: true, jumps: 0, tread: 0 });
    overlay.classList.add('hidden');
  }

  function gameOver() {
    state.mode = 'over';
    if (state.score > best) {
      best = state.score;
      localStorage.setItem('tankJumpBest', best);
      bestEl.textContent = best;
    }
    ovTitle.textContent = '游戏结束';
    ovText.innerHTML = `本局分数: <b style="color:#a7f070">${state.score}</b><br>最高分: ${best}`;
    btnStart.textContent = '再来一局';
    overlay.classList.remove('hidden');
  }

  // 当前地面是否有坑（供 x 落点检测）
  function holeAt(x) {
    for (const h of holes) if (x > h.x && x < h.x + h.w) return h;
    return null;
  }

  function update() {
    if (state.mode !== 'playing') return;
    state.dist += state.speed;
    state.score = Math.floor(state.dist / 10);
    scoreEl.textContent = state.score;
    state.speed = 3.2 + Math.min(4, state.score / 120);
    tank.tread += state.speed;

    // 生成坑
    while (nextHoleAt < state.dist + W + 200) {
      const w = 70 + Math.random() * 70;
      holes.push({ x: nextHoleAt, w });
      const gap = 220 + Math.random() * 260 - Math.min(80, state.score / 4);
      nextHoleAt += w + Math.max(140, gap);
    }
    // 移除离开屏幕的坑
    holes = holes.filter(h => h.x + h.w > state.dist - 100);

    // 水平移动（相对屏幕固定 x）
    if (keys['ArrowLeft']) tank.x = Math.max(10, tank.x - MOVE_V);
    if (keys['ArrowRight']) tank.x = Math.min(W - tank.w - 10, tank.x + MOVE_V);

    // 垂直
    tank.vy += GRAVITY;
    tank.y += tank.vy;

    const footX = tank.x + tank.w / 2;          // 坦克世界屏幕坐标
    const worldFoot = footX + state.dist;       // 换算到"世界"坐标检测坑
    const inHole = holeAt(worldFoot);

    if (tank.y >= GROUND_Y - tank.h && !inHole) {
      tank.y = GROUND_Y - tank.h;
      tank.vy = 0;
      tank.onGround = true;
      tank.jumps = 0;
    } else if (tank.y < GROUND_Y - tank.h) {
      tank.onGround = false;
    }

    // 掉入坑底
    if (inHole && tank.y > GROUND_Y + 10) { gameOver(); }
    if (tank.y > H + 50) { gameOver(); }
  }

  function drawTank() {
    const x = tank.x, y = tank.y;
    const roll = Math.floor(tank.tread / 6) % 2;
    // 履带
    ctx.fillStyle = '#1c2431';
    ctx.fillRect(x, y + 22, tank.w, 12);
    ctx.fillStyle = '#3b4a63';
    for (let i = 0; i < 6; i++) {
      const tx = x + 3 + i * 8 + (roll ? 4 : 0);
      if (tx < x + tank.w - 3) ctx.fillRect(tx, y + 24, 4, 8);
    }
    // 车体
    ctx.fillStyle = '#37946e';
    ctx.fillRect(x + 4, y + 10, tank.w - 8, 14);
    ctx.fillStyle = '#2a6e53';
    ctx.fillRect(x + 4, y + 20, tank.w - 8, 4);
    // 炮塔
    ctx.fillStyle = '#4ecb8f';
    ctx.fillRect(x + 16, y + 2, 20, 10);
    // 炮管
    ctx.fillStyle = '#1c2431';
    ctx.fillRect(x + 34, y + 5, 18, 4);
    // 高光
    ctx.fillStyle = '#a7f070';
    ctx.fillRect(x + 18, y + 3, 5, 3);
  }

  function draw() {
    // 天空
    ctx.fillStyle = '#86b6f0';
    ctx.fillRect(0, 0, W, H);
    // 云
    ctx.fillStyle = 'rgba(255,255,255,.85)';
    const cloudOff = (state.dist * 0.3) % (W + 160);
    for (let i = -1; i < 3; i++) {
      const cx = i * 260 - cloudOff + 120;
      ctx.fillRect(cx, 40, 70, 16);
      ctx.fillRect(cx + 12, 30, 44, 12);
      ctx.fillRect(cx + 24, 24, 24, 8);
    }

    // 远景小山
    ctx.fillStyle = '#5a7fb5';
    const hillOff = (state.dist * 0.5) % 200;
    for (let i = -1; i < 5; i++) {
      const hx = i * 200 - hillOff;
      ctx.beginPath();
      ctx.moveTo(hx, GROUND_Y);
      ctx.lineTo(hx + 60, GROUND_Y - 50);
      ctx.lineTo(hx + 120, GROUND_Y);
      ctx.fill();
    }

    // 地面（草皮 + 土层），坑留空
    const segs = [];
    let cursor = state.dist - 100;
    const sorted = holes.slice().sort((a, b) => a.x - b.x);
    for (const h of sorted) {
      if (h.x > cursor) segs.push([cursor, h.x]);
      cursor = Math.max(cursor, h.x + h.w);
    }
    segs.push([cursor, state.dist + W + 100]);

    for (const [s, e] of segs) {
      const sx = s - state.dist, ex = e - state.dist;
      // 草
      ctx.fillStyle = '#37946e';
      ctx.fillRect(sx, GROUND_Y, ex - sx, 10);
      // 泥土
      ctx.fillStyle = '#8a5a3c';
      ctx.fillRect(sx, GROUND_Y + 10, ex - sx, H - GROUND_Y - 10);
      // 泥土纹理
      ctx.fillStyle = '#6e452c';
      for (let tx = Math.floor(s / 40) * 40; tx < e; tx += 40) {
        const px = tx - state.dist;
        ctx.fillRect(px + 6, GROUND_Y + 20, 8, 4);
        ctx.fillRect(px + 24, GROUND_Y + 34, 6, 4);
      }
      // 坑壁描黑
      ctx.fillStyle = '#120d0a';
      if (s > state.dist - 90) ctx.fillRect(sx - 3, GROUND_Y, 3, H - GROUND_Y);
      if (e < state.dist + W + 90) ctx.fillRect(ex, GROUND_Y, 3, H - GROUND_Y);
    }

    // 坑内深渊
    ctx.fillStyle = '#0d0a08';
    for (const h of sorted) {
      const hx = h.x - state.dist;
      if (hx > -50 && hx < W + 50) ctx.fillRect(hx, GROUND_Y, h.w, H - GROUND_Y);
    }

    // 分数牌
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(W - 150, 8, 142, 24);
    ctx.fillStyle = '#ffcd75';
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillText('距离坑数: ' + holes.length, W - 142, 25);

    drawTank();
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }
  loop();
})();