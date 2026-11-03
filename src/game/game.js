// Core breakout engine: fixed-step physics, cached glow sprites, cached brick layer.
import { COLS, LEVELS } from './levels.js';
import { t } from '../core/i18n.js';

export const W = 336;            // logical width (21 columns x 16)
const CELL = W / COLS, BR = 13, OFF = (CELL - BR) / 2;
const MIN_H = 480, MAX_H = 760;  // logical height range; real height follows the screen shape
const BALL_R = 4, PW = 64, PH = 6, STEP = 1 / 120, BALLS = 3;
const GLOW_PAD = 9;
const MAX_PARTICLES = 160;
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
    this.trail = [];
    this.sprites = {};
    this.running = false;
    this.pointer = null;
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
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.s = Math.min(vw / W, vh / MIN_H);
    const visW = vw / this.s, visH = vh / this.s;
    this.H = Math.min(visH, MAX_H);
    this.offX = (visW - W) / 2;
    this.offY = (visH - this.H) / 2;
    this.k = this.s * this.dpr;
    this.safe.top = Math.max(0, safeTopPx / this.s - this.offY);
    this.safe.bottom = Math.max(0, safeBottomPx / this.s - this.offY);
    this.canvas.width = Math.round(vw * this.dpr);
    this.canvas.height = Math.round(vh * this.dpr);
    this.gy = Math.round(this.safe.top + 48);
    this.paddleY = Math.round(this.H - 84 - this.safe.bottom);
    this.sprites = {};
    this.buildBackground();
    this.layer = null;
    this.dirty = true;
    if (this.paddle) this.paddle.x = Math.min(Math.max(this.paddle.x, PW / 2), W - PW / 2);
  }

  // ---------- level ----------
  start(levelIndex) {
    const level = LEVELS[levelIndex];
    this.level = level;
    this.rows = level.grid.length;
    this.alive = new Uint8Array(COLS * this.rows);
    this.hue = new Uint16Array(COLS * this.rows);
    this.remaining = 0;
    level.grid.forEach((row, y) => {
      for (let x = 0; x < COLS; x++) {
        if (row[x] !== '#') continue;
        const i = y * COLS + x;
        this.alive[i] = 1;
        this.remaining++;
        let h;
        if (level.hue === 'row') h = (y * 45 + 300) % 360;
        else h = (Math.atan2(y - (this.rows - 1) / 2, x - (COLS - 1) / 2) * 180 / Math.PI + 360) % 360;
        this.hue[i] = (Math.round(h / 15) * 15) % 360;
      }
    });
    this.speed = level.speed;
    this.balls = BALLS;
    this.paddle = { x: W / 2 };
    this.particles.forEach((p) => { p.on = false; });
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
    this.state = 'ready';
  }

  pause() {
    if (this.state === 'playing' || this.state === 'ready') { this.resumeState = this.state; this.state = 'paused'; }
  }
  resume() {
    if (this.state === 'paused') { this.state = this.resumeState; this.last = performance.now(); this.acc = 0; }
  }

  launch() {
    const a = (Math.random() - 0.5) * 0.5;
    this.ball.vx = this.speed * Math.sin(a);
    this.ball.vy = -this.speed * Math.cos(a);
    this.state = 'playing';
  }

  // ---------- input (relative drag, must start in the zone around the paddle) ----------
  toLogical(e) { return { x: e.clientX / this.s - this.offX, y: e.clientY / this.s - this.offY }; }
  inZone(p) { return p.y >= this.paddleY - 44; }

  onDown(e) {
    e.preventDefault();
    if (this.pointer || (this.state !== 'ready' && this.state !== 'playing')) return;
    const p = this.toLogical(e);
    if (!this.inZone(p)) return;
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
    this.paddle.x = Math.min(Math.max(this.paddle.x + dx, PW / 2), W - PW / 2);
  }
  onUp(e, cancelled) {
    const ptr = this.pointer;
    if (!ptr || ptr.id !== e.pointerId) return;
    this.pointer = null;
    if (!cancelled && this.state === 'ready' && ptr.moved < 8 && performance.now() - ptr.t < 350) this.launch();
  }

  // ---------- physics ----------
  step(dt) {
    const b = this.ball;
    // x axis
    b.x += b.vx * dt;
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
    else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); }
    if (this.hitBrick()) { b.x -= b.vx * dt; b.vx = -b.vx; }
    // y axis
    const prevY = b.y;
    b.y += b.vy * dt;
    if (b.y < this.safe.top + BALL_R + 30) { b.y = this.safe.top + BALL_R + 30; b.vy = Math.abs(b.vy); this.keepAngle(); }
    if (this.hitBrick()) { b.y -= b.vy * dt; b.vy = -b.vy; this.keepAngle(); }
    // paddle
    const py = this.paddleY;
    if (b.vy > 0 && prevY + BALL_R <= py + 2 && b.y + BALL_R >= py && Math.abs(b.x - this.paddle.x) <= PW / 2 + BALL_R * 0.8) {
      const off = Math.max(-1, Math.min(1, (b.x - this.paddle.x) / (PW / 2)));
      const ang = off * 1.08;
      b.y = py - BALL_R;
      b.vx = this.speed * Math.sin(ang);
      b.vy = -this.speed * Math.cos(ang);
    }
    if (b.y - BALL_R > this.H) this.loseBall();
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
    const c0 = Math.max(0, Math.floor((b.x - BALL_R) / CELL)), c1 = Math.min(COLS - 1, Math.floor((b.x + BALL_R) / CELL));
    const r0 = Math.max(0, Math.floor((b.y - BALL_R - this.gy) / CELL)), r1 = Math.min(this.rows - 1, Math.floor((b.y + BALL_R - this.gy) / CELL));
    for (let r = r0; r <= r1; r++) {
      for (let c = c0; c <= c1; c++) {
        const i = r * COLS + c;
        if (!this.alive[i]) continue;
        const rx = c * CELL + OFF, ry = this.gy + r * CELL + OFF;
        const nx = Math.max(rx, Math.min(b.x, rx + BR)), ny = Math.max(ry, Math.min(b.y, ry + BR));
        const dx = b.x - nx, dy = b.y - ny;
        if (dx * dx + dy * dy < BALL_R * BALL_R) {
          this.alive[i] = 0;
          this.remaining--;
          this.dirty = true;
          this.burst(rx + BR / 2, ry + BR / 2, this.hue[i]);
          if (this.remaining === 0) { this.state = 'won'; this.endTimer = 0.7; }
          return true;
        }
      }
    }
    return false;
  }

  loseBall() {
    this.balls--;
    if (this.balls > 0) { this.resetBall(); return; }
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

  brickSprite(hue) {
    const size = BR + GLOW_PAD * 2;
    return this.sprite('b' + hue, size, size, (g, k) => {
      g.shadowColor = hsl(hue, 100, 60); g.shadowBlur = 9 * k;
      g.strokeStyle = hsl(hue, 100, 66); g.lineWidth = 1.2;
      g.strokeRect(GLOW_PAD + 0.6, GLOW_PAD + 0.6, BR - 1.2, BR - 1.2);
      g.shadowBlur = 0;
      g.fillStyle = hsl(hue, 100, 60, 0.18); g.fillRect(GLOW_PAD + 1, GLOW_PAD + 1, BR - 2, BR - 2);
    });
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

  rebuildLayer() {
    if (!this.layer) {
      this.layer = document.createElement('canvas');
      this.layer.width = Math.ceil(W * this.k); this.layer.height = Math.ceil(this.H * this.k);
    }
    const g = this.layer.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, this.layer.width, this.layer.height);
    g.setTransform(this.k, 0, 0, this.k, 0, 0);
    for (let r = 0; r < this.rows; r++) {
      for (let c = 0; c < COLS; c++) {
        const i = r * COLS + c;
        if (this.alive[i]) this.blit(g, this.brickSprite(this.hue[i]), c * CELL + OFF - GLOW_PAD, this.gy + r * CELL + OFF - GLOW_PAD);
      }
    }
    this.dirty = false;
  }

  // ---------- render ----------
  render(ts) {
    const g = this.g, k = this.k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    g.setTransform(k, 0, 0, k, this.offX * k, this.offY * k);
    if (this.dirty) this.rebuildLayer();
    g.drawImage(this.layer, 0, 0, W, this.H);

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
    if (this.state === 'ready') {
      g.textAlign = 'center';
      g.globalAlpha = 0.5 + 0.4 * Math.sin(ts / 300);
      g.fillText(t('tap_to_launch'), W / 2, this.paddleY - 36);
      g.globalAlpha = 1;
    }
  }
}
