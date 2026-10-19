// 坦克跳坑 - Tank Jump (经典版)
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
  const GROUND_Y = H - 60;
  const GRAVITY = 0.55;
  const JUMP_V = -11.5;
  const MOVE_V = 3.4;

  // 背景图（cover 绘制，未加载时回退纯色天空）
  const bg = new Image();
  let bgReady = false;
  bg.onload = () => { bgReady = true; };
  bg.src = 'background.jpg';

  let best = +(localStorage.getItem('tankJumpBest') || 0);
  bestEl.textContent = best;

  const state = { mode: 'ready', score: 0, speed: 3.2, dist: 0, lives: 3 };

  let holes = [];
  let nextHoleAt = 700;
  let enemies = [];   // 敌方坦克 {worldX, dir, alive}
  let shots = [];     // 子弹 {x,y,vx,from}

  const tank = { x: 90, y: GROUND_Y - 34, w: 52, h: 34, vy: 0, onGround: true, jumps: 0, tread: 0, fireCd: 0, inv: 0 };

  const keys = {};
  addEventListener('keydown', e => {
    if (['ArrowLeft','ArrowRight','ArrowUp',' '].includes(e.key)) e.preventDefault();
    keys[e.key] = true;
    if (state.mode === 'playing') {
      if (e.key === ' ' || e.key === 'ArrowUp') jump();
      if (e.key === 'j' || e.key === 'J') fire();
    } else if (e.key === 'Enter' || e.key === ' ') {
      reset();
    }
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

  function fire() {
    if (tank.fireCd > 0 || state.mode !== 'playing') return;
    shots.push({ x: tank.x + tank.w + 6, y: tank.y + 8, vx: 9, from: 'p' });
    tank.fireCd = 20;
  }

  function reset() {
    state.mode = 'playing';
    state.score = 0;
    state.speed = 3.2;
    state.dist = 0;
    state.lives = 3;
    holes = [];
    enemies = [];
    shots = [];
    nextHoleAt = 600;
    Object.assign(tank, { x: 90, y: GROUND_Y - 34, vy: 0, onGround: true, jumps: 0, tread: 0, fireCd: 0, inv: 60 });
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

  function holeAt(x) {
    for (const h of holes) if (x > h.x && x < h.x + h.w) return h;
    return null;
  }

  function spawnEnemy(worldX) {
    // 不要生成在坑里
    if (holeAt(worldX)) return;
    enemies.push({ worldX, dir: -1, alive: true, cool: 80 + Math.random() * 80 });
  }

  function update() {
    if (state.mode !== 'playing') return;
    state.dist += state.speed;
    state.score = Math.floor(state.dist / 10);
    scoreEl.textContent = state.score;
    state.speed = 3.2 + Math.min(4, state.score / 120);
    tank.tread += state.speed;
    if (tank.fireCd > 0) tank.fireCd--;
    if (tank.inv > 0) tank.inv--;

    // 生成坑
    while (nextHoleAt < state.dist + W + 200) {
      const w = 70 + Math.random() * 70;
      holes.push({ x: nextHoleAt, w });
      const gap = 220 + Math.random() * 260 - Math.min(80, state.score / 4);
      nextHoleAt += w + Math.max(140, gap);
      // 随机在前方生成敌方坦克
      if (Math.random() < 0.65) spawnEnemy(nextHoleAt + 160 + Math.random() * 140);
    }
    holes = holes.filter(h => h.x + h.w > state.dist - 100);
    enemies = enemies.filter(e => e.alive && e.worldX > state.dist - 200);

    // 水平移动
    if (keys['ArrowLeft']) tank.x = Math.max(10, tank.x - MOVE_V);
    if (keys['ArrowRight']) tank.x = Math.min(W - tank.w - 10, tank.x + MOVE_V);

    // 垂直
    tank.vy += GRAVITY;
    tank.y += tank.vy;

    const footX = tank.x + tank.w / 2;
    const worldFoot = footX + state.dist;
    const inHole = holeAt(worldFoot);

    if (tank.y >= GROUND_Y - tank.h && !inHole) {
      tank.y = GROUND_Y - tank.h;
      tank.vy = 0;
      tank.onGround = true;
      tank.jumps = 0;
    } else if (tank.y < GROUND_Y - tank.h) {
      tank.onGround = false;
    }

    if (inHole && tank.y > GROUND_Y + 10) { loseLife(); }
    if (tank.y > H + 50) { loseLife(); }

    // 敌方坦克 AI：朝玩家靠近并开火
    const playerWorldX = tank.x + state.dist;
    for (const e of enemies) {
      if (!e.alive) continue;
      const dx = playerWorldX - e.worldX;
      e.dir = dx < 0 ? -1 : 1;
      if (Math.abs(dx) > 60) {
        const nx = e.worldX + e.dir * 1.0;
        if (!holeAt(nx)) e.worldX = nx;
        else e.dir *= -1;
      }
      if (e.cool > 0) e.cool--;
      if (e.cool === 0 && Math.abs(dx) < 320) {
        shots.push({ x: e.worldX - state.dist + (e.dir < 0 ? -20 : 52), y: GROUND_Y - 46, vx: e.dir * 6, from: 'e' });
        e.cool = 90 + Math.random() * 60;
      }
    }

    // 子弹
    for (const s of shots) s.x += s.vx;
    shots = shots.filter(s => {
      if (s.x < -60 || s.x > W + 60) return false;
      if (s.from === 'p') {
        for (const e of enemies) {
          if (e.alive && Math.abs((e.worldX - state.dist) + 26 - s.x) < 30 &&
              s.y > GROUND_Y - 50 && s.y < GROUND_Y - 10) {
            e.alive = false;
            state.score += 20;
            scoreEl.textContent = state.score;
            return false;
          }
        }
      } else {
        if (tank.inv <= 0 &&
            s.x > tank.x && s.x < tank.x + tank.w &&
            s.y > tank.y && s.y < tank.y + tank.h) {
          loseLife();
          return false;
        }
      }
      return true;
    });

    // 坦克撞敌车
    for (const e of enemies) {
      if (!e.alive || tank.inv > 0) continue;
      const ex = e.worldX - state.dist;
      if (tank.x + tank.w > ex && tank.x < ex + 52 && tank.y + tank.h > GROUND_Y - 34) {
        e.alive = false;
        loseLife();
      }
    }
  }

  function loseLife() {
    if (tank.inv > 0) return;
    state.lives--;
    if (state.lives <= 0) { gameOver(); return; }
    tank.inv = 90;
    tank.y = GROUND_Y - tank.h - 40;
    tank.vy = -4;
    tank.jumps = 1;
  }

  function drawBackground() {
    if (bgReady) {
      // cover 裁剪
      const scale = Math.max(W / bg.width, H / bg.height);
      const dw = bg.width * scale, dh = bg.height * scale;
      const off = (state.dist * 0.15) % dw;
      for (let x = -off; x < W; x += dw) {
        ctx.drawImage(bg, x, (H - dh) / 2, dw, dh);
      }
      ctx.fillStyle = 'rgba(26,28,44,.15)';
      ctx.fillRect(0, 0, W, H);
    } else {
      ctx.fillStyle = '#86b6f0';
      ctx.fillRect(0, 0, W, H);
    }
    // 云（轻微视差叠加）
    ctx.fillStyle = 'rgba(255,255,255,.6)';
    const cloudOff = (state.dist * 0.3) % (W + 160);
    for (let i = -1; i < 3; i++) {
      const cx = i * 260 - cloudOff + 120;
      ctx.fillRect(cx, 40, 70, 16);
      ctx.fillRect(cx + 12, 30, 44, 12);
    }
  }

  function drawTankAt(x, y, isPlayer) {
    const roll = Math.floor(tank.tread / 6) % 2;
    // 履带
    ctx.fillStyle = '#1c2431';
    ctx.fillRect(x, y + 22, 52, 12);
    ctx.fillStyle = '#3b4a63';
    for (let i = 0; i < 6; i++) {
      const tx = x + 3 + i * 8 + (roll ? 4 : 0);
      if (tx < x + 49) ctx.fillRect(tx, y + 24, 4, 8);
    }
    // 车体
    ctx.fillStyle = isPlayer ? '#37946e' : '#b13e53';
    ctx.fillRect(x + 4, y + 10, 44, 14);
    ctx.fillStyle = isPlayer ? '#2a6e53' : '#7a2b3a';
    ctx.fillRect(x + 4, y + 20, 44, 4);
    // 炮塔
    ctx.fillStyle = isPlayer ? '#4ecb8f' : '#e05a6f';
    ctx.fillRect(x + 16, y + 2, 20, 10);
    // 炮管（玩家朝右，敌方按 dir）
    ctx.fillStyle = '#1c2431';
    const dir = isPlayer ? 1 : (window.__lastEnemyDir || -1);
    if (dir > 0) ctx.fillRect(x + 34, y + 5, 18, 4);
    else ctx.fillRect(x, y + 5, 18, 4);
    // 高光
    ctx.fillStyle = isPlayer ? '#a7f070' : '#ff9aa8';
    ctx.fillRect(x + 18, y + 3, 5, 3);
  }

  function draw() {
    drawBackground();

    // 远景小山
    ctx.fillStyle = 'rgba(90,127,181,.55)';
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
      ctx.fillStyle = '#37946e';
      ctx.fillRect(sx, GROUND_Y, ex - sx, 10);
      ctx.fillStyle = '#8a5a3c';
      ctx.fillRect(sx, GROUND_Y + 10, ex - sx, H - GROUND_Y - 10);
      ctx.fillStyle = '#6e452c';
      for (let tx = Math.floor(s / 40) * 40; tx < e; tx += 40) {
        const px = tx - state.dist;
        ctx.fillRect(px + 6, GROUND_Y + 20, 8, 4);
        ctx.fillRect(px + 24, GROUND_Y + 34, 6, 4);
      }
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

    // 敌方坦克
    for (const e of enemies) {
      if (!e.alive) continue;
      const ex = e.worldX - state.dist;
      if (ex > -60 && ex < W + 60) {
        window.__lastEnemyDir = e.dir;
        drawTankAt(ex, GROUND_Y - 34, false);
      }
    }

    // 子弹
    for (const s of shots) {
      ctx.fillStyle = s.from === 'p' ? '#ffcd75' : '#ff6b6b';
      ctx.fillRect(s.x, s.y, 8, 4);
    }

    // 玩家（受击闪烁）
    if (tank.inv === 0 || Math.floor(tank.inv / 5) % 2 === 0) {
      drawTankAt(tank.x, tank.y, true);
    }

    // HUD：生命 + 坑数
    ctx.fillStyle = 'rgba(0,0,0,.35)';
    ctx.fillRect(W - 150, 8, 142, 24);
    ctx.fillStyle = '#ffcd75';
    ctx.font = 'bold 14px "Courier New", monospace';
    ctx.fillText('生命 ' + '❤'.repeat(Math.max(0, state.lives)) + ' · 坑 ' + holes.length, W - 142, 25);
  }

  function loop() {
    update();
    draw();
    requestAnimationFrame(loop);
  }
  loop();
})();
