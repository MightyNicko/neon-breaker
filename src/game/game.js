// Core breakout engine: fixed-step physics, cached glow sprites, cached brick layer.
import { COLS, LEVELS, HITS, EMPTY, TWO_HIT, SOLID, BOMB } from './levels.js';
import { t } from '../core/i18n.js';

export const W = 336;            // logical width (21 columns x 16)
const CELL = W / COLS, BR = 14.5;
const MIN_H = 600, MAX_H = 760;  // logical height range; 600 leaves room for 25 rows above the paddle
const BALL_R = 4, PW = 64, PH = 6, STEP = 1 / 120, BALLS = 3;
const MAX_ANGLE = 1.08;          // steepest paddle bounce, in radians from straight up
const START_SPEED = 0.75, RAMP_TIME = 30; // each ball starts at 75 % of the level's speed and reaches it after 30 s
const LAUNCH_MIN = 0.3, LAUNCH_SPREAD = 0.2; // launch angle in radians, to the side that was tapped
// Loop breaker: the paddle always decides the angle, except when the ball lands on the same spot at the same angle
// LOOP_HITS times in a row without breaking anything, so it would fly the same path again. Then it gets a small nudge.
const LOOP_HITS = 3, LOOP_X = 1, LOOP_ANGLE = 0.01, LOOP_NUDGE = [0.05, 0.1]; // nudge of 3-6 degrees, either way
const GLOW_PAD = 9;
const TOP = 48;                  // below the safe area: the ceiling, and the top of the first brick row
const MAX_DPR = 3, LINE_PT = 1;   // draw at the screen's full resolution; brick outlines are 1 point wide
const MAX_PARTICLES = 160;
const FLASH_TIME = 0.16;
const BOMB_RADIUS = 1;            // a bomb clears the bricks around it, unbreakable ones too (provisional: 3 x 3)
const BG = '#0a0614';            // = theme-color; the top edge of the page must stay this solid colour

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

export class Game {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.hooks = hooks;           // { onEnd(won), onPause() }
    this.state = 'idle';          // idle | ready | playing | paused | won | lost
    this.safe = { top: 0, bottom: 0 };
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, hue: 0 }));
    this.flashes = [];
    this.trail = [];
    this.sprites = {};
    this.running = false;
    this.pointer = null;
    this.tutorial = 0;            // 0 off, 1 show how to move, 2 show how to launch
    this.frame = this.frame.bind(this);
    canvas.addEventListener('pointerdown', (e) => this.onDown(e));
    canvas.addEventListener('pointermove', (e) => this.onMove(e));
    canvas.addEventListener('pointerup', (e) => this.onUp(e));
    canvas.addEventListener('pointercancel', (e) => this.onUp(e, true));
  }

  // ---------- layout ----------
  resize(safeTopPx = 0, safeBottomPx = 0) {
    const vw = window.innerWidth, vh = window.innerHeight;
    // The window can report size 0 while in the background: keep the last layout.
    if (!vw || !vh) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    // whole screen pixels per brick cell, so every brick edge lands on a pixel and stays sharp
    this.s = Math.max(1, Math.floor(CELL * Math.min(vw / W, vh / MIN_H) * this.dpr)) / (CELL * this.dpr);
    const visW = vw / this.s, visH = vh / this.s;
    this.H = Math.min(visH, MAX_H);
    this.offX = (visW - W) / 2;
    this.fullWidth = this.offX * this.s < 4; // phones: the outer bricks reach the screen edges; tablets get side margins
    this.offY = (visH - this.H) / 2;
    this.k = this.s * this.dpr;
    this.safe.top = Math.max(0, safeTopPx / this.s - this.offY);
    this.safe.bottom = Math.max(0, safeBottomPx / this.s - this.offY);
    this.canvas.width = Math.round(vw * this.dpr);
    this.canvas.height = Math.round(vh * this.dpr);
    this.paddleY = Math.round(this.H - 84 - this.safe.bottom);
    this.layoutGrid();
    this.sprites = {};
    this.buildBackground();
    this.layer = null;
    this.dirty = true;
    if (this.paddle) this.paddle.x = Math.min(Math.max(this.paddle.x, PW / 2), W - PW / 2);
  }

  layoutGrid() { // row 1 always has the same place, as in the editor, against the ceiling
    this.gy = Math.round(this.safe.top + TOP);
    this.layoutBricks();
  }

  // Bricks are placed in whole screen pixels. When the field fills the screen, the outer columns reach the screen
  // edges; the leftover pixels are spread over the gaps, which then differ by at most one pixel.
  layoutBricks() {
    if (!this.k) return;
    const k = this.k, cellPx = Math.round(CELL * k), brPx = Math.round(BR * k);
    const left = this.fullWidth ? 0 : Math.round(this.offX * k);
    const right = this.fullWidth ? this.canvas.width : Math.round((this.offX + W) * k);
    const gaps = right - left - COLS * brPx;
    this.brPx = brPx; this.cellPx = cellPx;
    this.colPx = Array.from({ length: COLS }, (_, c) => left + c * brPx + Math.round(gaps * c / (COLS - 1)));
    this.rowTopPx = Math.round((this.offY + this.gy) * k) + Math.floor((cellPx - brPx) / 2);
    // the same rectangles in logical units, for the physics
    this.brW = brPx / k;
    this.colX = this.colPx.map((x) => x / k - this.offX);
    this.rowY0 = this.rowTopPx / k - this.offY;
  }

  // ---------- level ----------
  start(levelIndex, opts = {}) {
    const level = LEVELS[levelIndex];
    this.level = level;
    this.rows = level.grid.length;
    this.layoutGrid();
    this.tutorial = opts.tutorial ? 1 : 0;
    this.type = new Uint8Array(COLS * this.rows);  // EMPTY once a brick is gone
    this.hits = new Uint8Array(COLS * this.rows);  // hits left
    this.hue = new Uint16Array(COLS * this.rows);
    this.remaining = 0;
    const colour = randomColours(this.rows);
    level.grid.forEach((row, y) => {
      for (let x = 0; x < COLS; x++) {
        const t = row[x], i = y * COLS + x;
        if (t === EMPTY) continue;
        this.type[i] = t;
        this.hits[i] = HITS[t];
        if (t !== SOLID) this.remaining++;
        this.hue[i] = colour(x, y);
      }
    });
    this.balls = BALLS;
    this.paddle = { x: W / 2 };
    this.particles.forEach((p) => { p.on = false; });
    this.flashes.length = 0;
    this.ballGlow = 0;
    this.dirty = true;
    this.resetBall();
    this.endTimer = 0;
    this.begin();
  }

  begin() {
    this.running = true;
    this.last = performance.now();
    this.acc = 0;
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }

  stop() { this.running = false; cancelAnimationFrame(this.raf); this.state = 'idle'; }

  resetBall() {
    this.ball = { x: this.paddle.x, y: this.paddleY - BALL_R - 1, vx: 0, vy: 0 };
    this.trail.length = 0;
    this.paddleHits = [];
    this.playTime = 0;
    this.speed = this.level.speed * START_SPEED;
    this.state = 'ready';
  }

  pause() {
    if (this.state === 'playing' || this.state === 'ready') { this.resumeState = this.state; this.state = 'paused'; }
  }
  resume() {
    if (this.state === 'paused') { this.state = this.resumeState; this.last = performance.now(); this.acc = 0; }
  }

  launch(side = Math.random() < 0.5 ? -1 : 1) {
    const a = side * (LAUNCH_MIN + Math.random() * LAUNCH_SPREAD);
    this.ball.vx = this.speed * Math.sin(a);
    this.ball.vy = -this.speed * Math.cos(a);
    this.state = 'playing';
    this.sfx('launch');
    if (this.tutorial) { this.tutorial = 0; this.hooks.onTutorialDone?.(); }
  }

  sfx(name, arg) { this.hooks.sfx?.(name, arg); }

  // ---------- input (relative drag, must start in the zone around the paddle) ----------
  toLogical(e) { return { x: e.clientX / this.s - this.offX, y: e.clientY / this.s - this.offY }; }
  inZone(p) { return p.y >= this.paddleY - 44; }

  onDown(e) {
    e.preventDefault();
    if (this.pointer || (this.state !== 'ready' && this.state !== 'playing')) return;
    const p = this.toLogical(e);
    if (this.state !== 'ready' && !this.inZone(p)) return; // before launch the whole screen counts
    this.canvas.setPointerCapture(e.pointerId);
    this.pointer = { id: e.pointerId, x: p.x, startX: p.x, t: performance.now(), moved: 0 };
  }
  onMove(e) {
    const ptr = this.pointer;
    if (!ptr || ptr.id !== e.pointerId) return;
    const p = this.toLogical(e);
    const dx = (p.x - ptr.x) * 1.2;
    ptr.x = p.x;
    ptr.moved += Math.abs(dx);
    if (this.state === 'paused') return;
    if (this.tutorial === 1 && ptr.moved > 30) this.tutorial = 2;
    this.paddle.x = Math.min(Math.max(this.paddle.x + dx, PW / 2), W - PW / 2);
  }
  onUp(e, cancelled) {
    const ptr = this.pointer;
    if (!ptr || ptr.id !== e.pointerId) return;
    this.pointer = null;
    if (!cancelled && this.state === 'ready' && ptr.moved < 8 && performance.now() - ptr.t < 350) this.launch(ptr.startX >= W / 2 ? 1 : -1);
  }

  // ---------- physics ----------
  step(dt) {
    const b = this.ball;
    this.rampSpeed(dt);
    // x axis
    b.x += b.vx * dt;
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); this.sfx('wall'); }
    else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); this.sfx('wall'); }
    if (this.hitBrick()) { b.x -= b.vx * dt; b.vx = -b.vx; }
    // y axis
    b.y += b.vy * dt;
    const ceiling = this.safe.top + TOP + BALL_R;
    if (b.y < ceiling) { b.y = ceiling; b.vy = Math.abs(b.vy); this.keepAngle(); this.sfx('wall'); }
    if (this.hitBrick()) { b.y -= b.vy * dt; b.vy = -b.vy; this.keepAngle(); }
    this.hitPaddle();
    if (b.y - BALL_R > this.H) this.loseBall();
  }

  rampSpeed(dt) {
    this.playTime += dt;
    const speed = this.level.speed * Math.min(1, START_SPEED + (1 - START_SPEED) * this.playTime / RAMP_TIME);
    const k = speed / this.speed;
    this.ball.vx *= k; this.ball.vy *= k;
    this.speed = speed;
  }

  hitPaddle() {
    const b = this.ball, px = this.paddle.x, py = this.paddleY, half = PW / 2;
    const dx = b.x - Math.max(px - half, Math.min(b.x, px + half));
    const dy = b.y - Math.max(py, Math.min(b.y, py + PH));
    if (dx * dx + dy * dy >= BALL_R * BALL_R) return;
    if (b.y <= py) { // top: the bounce angle follows where the ball lands
      if (b.vy <= 0) return;
      const off = Math.max(-1, Math.min(1, (b.x - px) / half));
      const ang = this.breakLoop(off * MAX_ANGLE, b.x);
      b.y = py - BALL_R;
      b.vx = this.speed * Math.sin(ang);
      b.vy = -this.speed * Math.cos(ang);
      this.sfx('paddle');
    } else if (dy > 0 && dx === 0) { // underside: the paddle slid over the ball, which keeps falling
      b.y = py + PH + BALL_R;
      b.vy = Math.abs(b.vy);
    } else { // side: bounces off but stays below the top edge, so the ball is still lost
      const side = dx !== 0 ? Math.sign(dx) : (b.x >= px ? 1 : -1);
      b.x = Math.max(BALL_R, Math.min(W - BALL_R, px + side * (half + BALL_R)));
      b.vx = side * Math.abs(b.vx);
      this.sfx('wall');
    }
  }

  breakLoop(ang, x) {
    const h = this.paddleHits;
    const loop = h.length >= LOOP_HITS - 1
      && h.slice(1 - LOOP_HITS).every((p) => Math.abs(p.x - x) < LOOP_X && Math.abs(p.ang - ang) < LOOP_ANGLE);
    h.push({ x, ang });
    if (h.length > LOOP_HITS) h.shift();
    if (!loop) return ang;
    h.length = 0;
    const nudge = (LOOP_NUDGE[0] + Math.random() * (LOOP_NUDGE[1] - LOOP_NUDGE[0])) * (Math.random() < 0.5 ? -1 : 1);
    return Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, ang + nudge));
  }

  keepAngle() { // avoid near-horizontal ping-pong
    const b = this.ball, min = this.speed * 0.28;
    if (Math.abs(b.vy) < min) {
      b.vy = (b.vy < 0 ? -1 : 1) * min;
      const vx = Math.sqrt(Math.max(0, this.speed * this.speed - b.vy * b.vy));
      b.vx = (b.vx < 0 ? -1 : 1) * vx;
    }
  }

  hitBrick() {
    const b = this.ball;
    // one extra column and row on each side, since the pixel-aligned bricks sit slightly off the logical grid
    const c0 = Math.max(0, Math.floor((b.x - BALL_R) / CELL) - 1), c1 = Math.min(COLS - 1, Math.floor((b.x + BALL_R) / CELL) + 1);
    const r0 = Math.max(0, Math.floor((b.y - BALL_R - this.gy) / CELL) - 1), r1 = Math.min(this.rows - 1, Math.floor((b.y + BALL_R - this.gy) / CELL) + 1);
    const bw = this.brW;
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * COLS + c;
        const t = this.type[i];
        if (!t) continue;
        const rx = this.colX[c], ry = this.rowY0 + r * CELL;
        const nx = Math.max(rx, Math.min(b.x, rx + bw)), ny = Math.max(ry, Math.min(b.y, ry + bw));
        const dx = b.x - nx, dy = b.y - ny;
        if (dx * dx + dy * dy >= BALL_R * BALL_R) continue;
        if (t === SOLID) { this.sfx('wall'); return true; } // unbreakable: the ball just bounces
        this.paddleHits.length = 0; // the path has changed, so it is no loop
        if (--this.hits[i] > 0) { // a two-hit brick or a bomb that is not done yet
          this.dirty = true;
          this.flashes.push({ x: rx, y: ry, hue: this.hue[i], life: FLASH_TIME * 0.6 });
          this.sfx('brick', r);
          return true;
        }
        this.breakBrick(i);
        if (this.remaining === 0) { this.state = 'won'; this.endTimer = 0.7; this.sfx('win'); }
        return true;
      }
    }
    return false;
  }

  // removes a brick; a bomb takes the bricks around it with it, unbreakable ones and other bombs too
  breakBrick(i) {
    const t = this.type[i], c = i % COLS, r = Math.floor(i / COLS);
    const rx = this.colX[c], ry = this.rowY0 + r * CELL, bw = this.brW;
    this.type[i] = EMPTY; this.hits[i] = 0;
    if (t !== SOLID) this.remaining--;
    this.dirty = true;
    this.burst(rx + bw / 2, ry + bw / 2, this.hue[i]);
    this.flashes.push({ x: rx, y: ry, hue: this.hue[i], life: FLASH_TIME });
    this.ballGlow = 1;
    if (t !== BOMB) { this.sfx('brick', r); return; }
    this.sfx('bomb');
    for (let y = r - BOMB_RADIUS; y <= r + BOMB_RADIUS; y++) for (let x = c - BOMB_RADIUS; x <= c + BOMB_RADIUS; x++) {
      if (x < 0 || x >= COLS || y < 0 || y >= this.rows) continue;
      if (this.type[y * COLS + x]) this.breakBrick(y * COLS + x);
    }
  }

  loseBall() {
    this.balls--;
    if (this.balls > 0) { this.sfx('lose'); this.resetBall(); return; }
    this.sfx('gameover');
    this.state = 'lost';
    this.endTimer = 0.5;
  }

  // ---------- particles ----------
  burst(x, y, hue) {
    let n = 7;
    for (const p of this.particles) {
      if (p.on) continue;
      const a = Math.random() * 6.283, v = 30 + Math.random() * 70;
      p.on = true; p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v;
      p.life = p.max = 0.35 + Math.random() * 0.3; p.hue = hue;
      if (--n === 0) break;
    }
  }
  updateParticles(dt) {
    for (const p of this.particles) {
      if (!p.on) continue;
      p.life -= dt;
      if (p.life <= 0) { p.on = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97;
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      if ((this.flashes[i].life -= dt) <= 0) this.flashes.splice(i, 1);
    }
    const fade = Math.pow(0.001, dt); // about 1/1000 left after a second
    this.ballGlow *= fade;
  }

  // ---------- loop ----------
  frame(ts) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    let dt = (ts - this.last) / 1000;
    this.last = ts;
    if (dt > 0.1) dt = 0.1;
    if (this.state === 'paused') { this.render(ts); return; }
    if (this.state === 'playing') {
      this.acc += dt;
      while (this.acc >= STEP && this.state === 'playing') { this.step(STEP); this.acc -= STEP; }
    } else if (this.state === 'ready') {
      this.ball.x = this.paddle.x;
    }
    this.updateParticles(dt);
    if (this.state === 'won' || this.state === 'lost') {
      this.endTimer -= dt;
      if (this.endTimer <= 0) {
        const won = this.state === 'won';
        this.state = 'idle';
        this.hooks.onEnd(won);
      }
    }
    if (this.state === 'playing' || this.state === 'ready') {
      this.trail.push(this.ball.x, this.ball.y);
      if (this.trail.length > 16) this.trail.splice(0, 2);
    }
    this.render(ts);
  }

  // ---------- sprites (glow is pre-rendered; shadowBlur is too slow to run per frame on iOS) ----------
  sprite(key, w, h, draw) {
    let s = this.sprites[key];
    if (s) return s;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * this.k); c.height = Math.ceil(h * this.k);
    const g = c.getContext('2d');
    g.scale(this.k, this.k);
    draw(g, this.k);
    s = this.sprites[key] = { c, w, h };
    return s;
  }
  blit(g, s, x, y) { g.drawImage(s.c, x, y, s.w, s.h); }

  // Drawn in screen pixels: soft glow underneath, then sharp whole-pixel outlines.
  // Normal: one outline. Two hits: a second, inner outline until the first hit. Unbreakable: grey and striped.
  // Bomb: orange with the hits left written on it.
  brickSprite(hue, type, hits) {
    const key = `b${type}.${hits}.${type === SOLID || type === BOMB ? 0 : hue}`;
    if (this.sprites[key]) return this.sprites[key];
    const b = this.brPx, pad = Math.ceil(GLOW_PAD * this.k), lw = Math.max(1, Math.round(LINE_PT * this.dpr));
    const c = document.createElement('canvas');
    c.width = c.height = b + pad * 2;
    const g = c.getContext('2d');
    const outline = (x, y, s, colour) => {
      g.fillStyle = colour;
      g.fillRect(x, y, s, lw); g.fillRect(x, y + s - lw, s, lw);
      g.fillRect(x, y + lw, lw, s - 2 * lw); g.fillRect(x + s - lw, y + lw, lw, s - 2 * lw);
    };
    const glow = type === SOLID ? null : type === BOMB ? 'rgba(255,90,60,.9)' : hsl(hue, 100, 60);
    if (glow) {
      g.shadowColor = glow; g.shadowBlur = 9 * this.k;
      g.strokeStyle = type === BOMB ? 'rgba(255,106,60,.8)' : hsl(hue, 100, 60, 0.8); g.lineWidth = lw;
      g.strokeRect(pad + lw / 2, pad + lw / 2, b - lw, b - lw);
      g.shadowBlur = 0;
      g.clearRect(pad, pad, b, b);
    }
    if (type === SOLID) {
      g.fillStyle = '#1c1e29'; g.fillRect(pad, pad, b, b);
      g.save(); g.beginPath(); g.rect(pad, pad, b, b); g.clip();
      g.strokeStyle = '#353a4f'; g.lineWidth = Math.max(1, Math.round(this.dpr));
      const step = Math.max(3, Math.round(b * 0.2));
      g.beginPath();
      for (let k = -b; k < b; k += step) { g.moveTo(pad + k, pad + b); g.lineTo(pad + k + b, pad); }
      g.stroke(); g.restore();
      outline(pad, pad, b, '#9aa0b8');
    } else if (type === BOMB) {
      g.fillStyle = 'rgba(255,90,60,.35)'; g.fillRect(pad + lw, pad + lw, b - 2 * lw, b - 2 * lw);
      outline(pad, pad, b, '#ff6a3c');
      g.fillStyle = '#ffd9a0'; g.font = `800 ${Math.round(b * 0.58)}px -apple-system, system-ui, sans-serif`;
      g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(String(hits), pad + b / 2, pad + b / 2 + b * 0.04);
    } else {
      g.fillStyle = hsl(hue, 100, 60, 0.18); g.fillRect(pad + lw, pad + lw, b - 2 * lw, b - 2 * lw);
      outline(pad, pad, b, hsl(hue, 100, 66));
      if (type === TWO_HIT && hits > 1) { const d = lw * 3; outline(pad + d, pad + d, b - 2 * d, hsl(hue, 100, 72)); }
    }
    return (this.sprites[key] = { c, pad });
  }
  ballSprite() {
    const size = BALL_R * 2 + 28;
    return this.sprite('ball', size, size, (g, k) => {
      const c = size / 2;
      g.shadowColor = '#ff7bff'; g.shadowBlur = 12 * k;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(c, c, BALL_R, 0, 7); g.fill();
    });
  }
  paddleSprite() {
    const w = PW + 40, h = PH + 40;
    return this.sprite('paddle', w, h, (g, k) => {
      g.shadowColor = '#e040ff'; g.shadowBlur = 14 * k;
      g.strokeStyle = '#fff'; g.lineWidth = 1.6;
      g.beginPath(); g.roundRect(20, 20, PW, PH, 3); g.stroke();
    });
  }

  handSprite() { // one raised finger and a palm, outlined like the rest of the game
    return this.sprite('hand', 44, 62, (g, k) => {
      g.shadowColor = '#5ff'; g.shadowBlur = 8 * k;
      g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.fillStyle = 'rgba(10,6,20,.75)';
      g.beginPath(); g.roundRect(18, 8, 9, 30, 4.5); g.fill(); g.stroke();
      g.beginPath(); g.roundRect(11, 30, 23, 24, 8); g.fill(); g.stroke();
      g.shadowBlur = 0; g.fillStyle = 'rgb(10,6,20)'; g.fillRect(19, 29, 7, 3);
    });
  }

  buildBackground() {
    const w = this.canvas.width, h = this.canvas.height;
    const c = this.bg = document.createElement('canvas');
    c.width = w; c.height = h;
    const g = c.getContext('2d');
    g.fillStyle = BG; g.fillRect(0, 0, w, h);
    g.setTransform(this.k, 0, 0, this.k, this.offX * this.k, this.offY * this.k);
    // soft violet glow in the middle; the top edge stays the solid theme colour
    const rg = g.createRadialGradient(W / 2, this.H * 0.45, 5, W / 2, this.H * 0.45, this.H * 0.4);
    rg.addColorStop(0, 'rgba(60,24,110,.55)'); rg.addColorStop(1, 'rgba(60,24,110,0)');
    g.fillStyle = rg; g.fillRect(-this.offX, 0, W + this.offX * 2, this.H);
    // light streaks, as in the icon
    const flare = (x, y, len, ang, col) => {
      g.save(); g.translate(x, y); g.rotate(ang);
      const lg = g.createLinearGradient(-len, 0, len, 0);
      lg.addColorStop(0, 'rgba(0,0,0,0)'); lg.addColorStop(0.5, col); lg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = lg; g.fillRect(-len, -0.6, len * 2, 1.2); g.restore();
    };
    flare(30, this.gy + 20, 90, -0.6, 'rgba(255,0,200,.8)');
    flare(W - 30, this.gy + 60, 100, -0.5, 'rgba(255,200,0,.8)');
    flare(40, this.paddleY - 120, 80, -0.5, 'rgba(0,255,220,.7)');
    flare(W - 40, this.paddleY - 150, 60, 0.6, 'rgba(120,120,255,.7)');
  }

  rebuildLayer() { // the whole screen width in screen pixels, so it is copied 1:1 without blurring
    const height = Math.min(this.canvas.height, this.rowTopPx + this.rows * this.cellPx + Math.ceil(GLOW_PAD * this.k));
    if (!this.layer || this.layer.width !== this.canvas.width || this.layer.height !== height) {
      this.layer = document.createElement('canvas');
      this.layer.width = this.canvas.width; this.layer.height = height;
    }
    const g = this.layer.getContext('2d');
    g.clearRect(0, 0, this.layer.width, this.layer.height);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        if (!this.type[i]) continue;
        const sp = this.brickSprite(this.hue[i], this.type[i], this.hits[i]);
        g.drawImage(sp.c, this.colPx[c] - sp.pad, this.rowTopPx + r * this.cellPx - sp.pad);
      }
    }
    this.dirty = false;
  }

  // ---------- render ----------
  render(ts) {
    const g = this.g, k = this.k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    if (this.dirty) this.rebuildLayer();
    g.drawImage(this.layer, 0, 0);
    g.setTransform(k, 0, 0, k, this.offX * k, this.offY * k);

    // touch zone
    g.save(); g.setLineDash([2, 5]); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(8, this.paddleY - 44, W - 16, Math.max(60, this.H - this.paddleY + 36 - this.safe.bottom), 18); g.stroke();
    g.restore();

    // particles
    g.globalCompositeOperation = 'lighter';
    for (const p of this.particles) {
      if (!p.on) continue;
      g.fillStyle = hsl(p.hue, 100, 65, p.life / p.max);
      g.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
    }
    for (const f of this.flashes) { // white flash that grows out of the broken brick
      const a = f.life / FLASH_TIME, grow = (1 - a) * 5;
      g.fillStyle = hsl(f.hue, 100, 88, a * 0.9);
      g.fillRect(f.x - grow, f.y - grow, this.brW + grow * 2, this.brW + grow * 2);
    }
    g.globalCompositeOperation = 'source-over';

    // ball, trail, paddle
    if (this.state !== 'won' && this.state !== 'lost' && this.state !== 'idle') {
      const bs = this.ballSprite(), off = bs.w / 2;
      const n = this.trail.length / 2;
      for (let i = 0; i < n - 1; i++) {
        g.globalAlpha = (i / n) * 0.3;
        const sc = 0.35 + 0.4 * (i / n);
        g.drawImage(bs.c, this.trail[i * 2] - off * sc, this.trail[i * 2 + 1] - off * sc, bs.w * sc, bs.h * sc);
      }
      g.globalAlpha = 1;
      this.blit(g, bs, this.ball.x - off, this.ball.y - off);
      if (this.ballGlow > 0.02) { // brighter and bigger for a moment after a hit
        const sc = 1 + this.ballGlow * 0.7;
        g.globalCompositeOperation = 'lighter'; g.globalAlpha = this.ballGlow;
        g.drawImage(bs.c, this.ball.x - off * sc, this.ball.y - off * sc, bs.w * sc, bs.h * sc);
        g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
      }
      this.blit(g, this.paddleSprite(), this.paddle.x - PW / 2 - 20, this.paddleY - 20);
    }

    // HUD
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.font = '500 11px -apple-system, system-ui, sans-serif';
    g.textBaseline = 'middle'; g.textAlign = 'left';
    const hy = this.safe.top + 24;
    g.fillText(t('hud_level', { n: this.level.id }), 14, hy);
    g.fillStyle = '#fff';
    for (let i = 0; i < BALLS; i++) {
      g.globalAlpha = i < this.balls ? 1 : 0.2;
      g.beginPath(); g.arc(W / 2 - 12 + i * 12, hy, 2.6, 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    if (this.state === 'ready' && this.tutorial) this.renderTutorial(g, ts);
    else if (this.state === 'ready') {
      g.textAlign = 'center';
      g.globalAlpha = 0.5 + 0.4 * Math.sin(ts / 300);
      g.fillText(t('tap_to_launch'), W / 2, this.paddleY - 36);
      g.globalAlpha = 1;
    }
  }

  renderTutorial(g, ts) {
    const hand = this.handSprite(), cy = this.paddleY + 14;
    g.textAlign = 'center'; g.fillStyle = '#fff';
    g.font = '600 13px -apple-system, system-ui, sans-serif';
    g.fillText(t(this.tutorial === 1 ? 'tut_move' : 'tut_launch'), W / 2, this.paddleY - 62);
    if (this.tutorial === 1) { // the finger slides from side to side under the paddle
      const x = this.paddle.x + Math.sin(ts / 550) * 62;
      this.blit(g, hand, x - 22, cy - 8);
    } else { // the finger taps left, then right, and a dashed line shows where the ball goes
      const cycle = (ts / 1100) % 2, side = cycle < 1 ? -1 : 1, phase = cycle % 1;
      const x = W / 2 + side * 88, y = cy + 4, press = phase < 0.25 ? phase / 0.25 : 1;
      if (press === 1) {
        g.strokeStyle = `rgba(95,255,255,${(1 - phase) * 0.9})`; g.lineWidth = 1.4;
        g.beginPath(); g.arc(x, y, 5 + (phase - 0.25) * 26, 0, 7); g.stroke();
        const a = LAUNCH_MIN + LAUNCH_SPREAD / 2, dx = side * Math.sin(a), dy = -Math.cos(a);
        g.setLineDash([3, 5]); g.strokeStyle = 'rgba(255,255,255,.55)';
        g.beginPath(); g.moveTo(this.ball.x + dx * 10, this.ball.y + dy * 10); g.lineTo(this.ball.x + dx * 80, this.ball.y + dy * 80); g.stroke();
        g.setLineDash([]);
      }
      this.blit(g, hand, x - 22, y - 8 + (1 - press) * 8);
    }
  }
}

// A new colour layout every time a level starts: rows, columns, diagonals or rings, from a random starting hue.
// Hues are rounded to steps of 15 so the brick sprites can be shared.
function randomColours(rows) {
  const base = Math.random() * 360, mode = Math.floor(Math.random() * 4), cx = (COLS - 1) / 2, cy = (rows - 1) / 2;
  const raw = [
    (x, y) => y * 45,
    (x) => x * 17,
    (x, y) => (x + y) * 14,
    (x, y) => Math.hypot(x - cx, (y - cy) * 1.4) * 32,
  ][mode];
  return (x, y) => Math.round(((base + raw(x, y)) % 360) / 15) * 15 % 360;
}
