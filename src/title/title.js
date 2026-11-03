// Title screen: the name is built from small bricks, an auto-playing ball breaks a few of them.
const W = 336, MIN_H = 480, MAX_H = 760;
const GLOW = 8;
const BALL_R = 4, PW = 64;

const GLY = {
  N: ['10001', '11001', '10101', '10011', '10001'],
  E: ['11111', '10000', '11110', '10000', '11111'],
  O: ['01110', '10001', '10001', '10001', '01110'],
  B: ['11110', '10001', '11110', '10001', '11110'],
  R: ['11110', '10001', '11110', '10010', '10001'],
  A: ['01110', '10001', '11111', '10001', '10001'],
  K: ['10001', '10010', '11100', '10010', '10001'],
};

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

export class Title {
  constructor(canvas) {
    this.canvas = canvas;
    this.g = canvas.getContext('2d', { alpha: false });
    this.frame = this.frame.bind(this);
    this.pieces = Array.from({ length: 40 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, rot: 0, vr: 0, hue: 0, size: 6 }));
    this.parts = Array.from({ length: 80 }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, hue: 0 }));
    this.trail = [];
    this.running = false;
  }

  resize(safeTopPx = 0, safeBottomPx = 0) {
    this.safePx = [safeTopPx, safeBottomPx];
    const vw = window.innerWidth, vh = window.innerHeight;
    // The window can report size 0 while opening or in the background: keep the last layout.
    if (!vw || !vh) return;
    this.dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.s = Math.min(vw / W, vh / MIN_H);
    const visW = vw / this.s, visH = vh / this.s;
    this.H = Math.min(visH, MAX_H);
    this.offX = (visW - W) / 2; this.offY = (visH - this.H) / 2;
    this.k = this.s * this.dpr;
    this.safeTop = Math.max(0, safeTopPx / this.s - this.offY);
    this.safeBottom = Math.max(0, safeBottomPx / this.s - this.offY);
    this.canvas.width = Math.round(vw * this.dpr);
    this.canvas.height = Math.round(vh * this.dpr);
    this.sprites = {};
    this.paddleY = this.H - 56 - this.safeBottom;
    this.layoutBricks();
    this.buildBackground();
    if (!this.ball) this.resetBall();
    this.paddleX = this.paddleX ?? W / 2;
  }

  layoutBricks() {
    this.bricks = [];
    const top = Math.max(this.safeTop + 40, this.H * 0.13);
    const add = (word, cell, y0, hueBase) => {
      const cols = word.length * 6 - 1, x0 = (W - cols * cell) / 2;
      [...word].forEach((ch, wi) => GLY[ch].forEach((row, ry) => [...row].forEach((v, rx) => {
        if (v !== '1') return;
        const gx = wi * 6 + rx;
        this.bricks.push({ x: x0 + gx * cell, y: y0 + ry * cell, s: cell - 1.4, hue: Math.round((hueBase + gx * (300 / cols)) / 10) * 10 % 360, alive: true, born: -9, respawn: 0 });
      })));
    };
    add('NEON', 11, top, 300);
    add('BREAKER', 7.3, top + 55 + 16, 20);
    this.areaTop = top + 55 + 16 + 5 * 7.3 + 14;
  }

  resetBall() {
    this.ball = { x: W / 2, y: this.areaTop ? this.areaTop + 60 : 300, vx: 110, vy: 150 };
    this.trail.length = 0;
  }

  start() {
    this.running = true;
    this.now = 0;
    this.last = performance.now();
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(this.frame);
  }
  stop() { this.running = false; cancelAnimationFrame(this.raf); }

  // ---------- simulation ----------
  update(dt) {
    this.now += dt;
    const b = this.ball, speed = 190;
    const steps = 2, h = dt / steps;
    for (let i = 0; i < steps; i++) {
      b.x += b.vx * h;
      if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); }
      if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); }
      if (this.hit()) { b.x -= b.vx * h; b.vx = -b.vx; }
      b.y += b.vy * h;
      if (b.y < this.safeTop + 12) { b.y = this.safeTop + 12; b.vy = Math.abs(b.vy); }
      if (this.hit()) { b.y -= b.vy * h; b.vy = -b.vy; }
      if (b.vy > 0 && b.y + BALL_R >= this.paddleY && b.y < this.paddleY + 10 && Math.abs(b.x - this.paddleX) <= PW / 2 + BALL_R) {
        const off = Math.max(-1, Math.min(1, (b.x - this.paddleX) / (PW / 2)));
        b.y = this.paddleY - BALL_R; b.vx = speed * Math.sin(off * 1.0); b.vy = -speed * Math.cos(off * 1.0);
      }
      if (b.y > this.H + 10) this.resetBall();
    }
    // keep the ball moving in a lively direction
    const min = speed * 0.4;
    if (Math.abs(b.vy) < min) { b.vy = (b.vy < 0 ? -1 : 1) * min; }
    // paddle follows the ball with a slight lag
    const target = b.x + (Math.sin(this.now * 1.3) * 10);
    const dx = Math.max(-260 * dt, Math.min(260 * dt, target - this.paddleX));
    this.paddleX = Math.max(PW / 2, Math.min(W - PW / 2, this.paddleX + dx));

    for (const br of this.bricks) if (!br.alive && this.now >= br.respawn) { br.alive = true; br.born = this.now; }
    for (const p of this.pieces) if (p.on) {
      p.vy += 380 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.vr * dt;
      if (p.y > this.H + 10) p.on = false;
    }
    for (const p of this.parts) if (p.on) {
      p.life -= dt; if (p.life <= 0) { p.on = false; continue; }
      p.x += p.vx * dt; p.y += p.vy * dt; p.vx *= 0.97; p.vy *= 0.97;
    }
    this.trail.push(b.x, b.y); if (this.trail.length > 16) this.trail.splice(0, 2);
  }

  hit() {
    const b = this.ball;
    for (const br of this.bricks) {
      if (!br.alive) continue;
      const nx = Math.max(br.x, Math.min(b.x, br.x + br.s)), ny = Math.max(br.y, Math.min(b.y, br.y + br.s));
      const dx = b.x - nx, dy = b.y - ny;
      if (dx * dx + dy * dy < BALL_R * BALL_R) {
        br.alive = false; br.respawn = this.now + 4 + Math.random() * 4;
        this.spawn(br);
        return true;
      }
    }
    return false;
  }

  spawn(br) {
    const cx = br.x + br.s / 2, cy = br.y + br.s / 2;
    const p = this.pieces.find((q) => !q.on);
    if (p) Object.assign(p, { on: true, x: cx, y: cy, vx: (Math.random() - 0.5) * 60, vy: -40 + Math.random() * 30, rot: 0, vr: (Math.random() - 0.5) * 8, hue: br.hue, size: br.s });
    let n = 6;
    for (const q of this.parts) {
      if (q.on) continue;
      const a = Math.random() * 6.283, v = 30 + Math.random() * 60;
      Object.assign(q, { on: true, x: cx, y: cy, vx: Math.cos(a) * v, vy: Math.sin(a) * v, life: 0.35 + Math.random() * 0.3, max: 0.65, hue: br.hue });
      if (--n === 0) break;
    }
  }

  // ---------- drawing ----------
  frame(ts) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (!this.bg) { this.resize(...this.safePx); if (!this.bg) return; }
    const dt = Math.min(0.05, (ts - this.last) / 1000);
    this.last = ts;
    this.update(dt);
    this.render();
  }

  sprite(key, w, h, draw) {
    let s = this.sprites[key];
    if (s) return s;
    const c = document.createElement('canvas');
    c.width = Math.ceil(w * this.k); c.height = Math.ceil(h * this.k);
    const g = c.getContext('2d'); g.scale(this.k, this.k); draw(g, this.k);
    return (this.sprites[key] = { c, w, h });
  }

  brickSprite(hue, size) {
    const full = size + GLOW * 2;
    return this.sprite(`b${hue}_${size}`, full, full, (g, k) => {
      g.shadowColor = hsl(hue, 100, 60); g.shadowBlur = 7 * k;
      g.strokeStyle = hsl(hue, 100, 66); g.lineWidth = 1;
      g.strokeRect(GLOW + 0.7, GLOW + 0.7, size - 1.4, size - 1.4);
      g.shadowBlur = 0; g.fillStyle = hsl(hue, 100, 60, 0.25); g.fillRect(GLOW + 1.5, GLOW + 1.5, size - 3, size - 3);
    });
  }

  buildBackground() {
    const c = this.bg = document.createElement('canvas');
    c.width = this.canvas.width; c.height = this.canvas.height;
    const g = c.getContext('2d');
    g.fillStyle = '#0a0614'; g.fillRect(0, 0, c.width, c.height);
    g.setTransform(this.k, 0, 0, this.k, this.offX * this.k, this.offY * this.k);
    const lg = g.createLinearGradient(0, 0, 0, this.H);
    lg.addColorStop(0, 'rgba(26,12,52,0)'); lg.addColorStop(1, 'rgba(26,12,52,1)');
    g.fillStyle = lg; g.fillRect(-this.offX, 0, W + this.offX * 2, this.H);
    for (let i = 0; i < 50; i++) {
      g.fillStyle = `rgba(255,255,255,${0.06 + (i % 4) * 0.04})`;
      g.beginPath(); g.arc((i * 131) % W, 30 + (i * 211) % (this.H - 40), i % 6 === 0 ? 1.2 : 0.7, 0, 7); g.fill();
    }
  }

  render() {
    const g = this.g, k = this.k;
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.drawImage(this.bg, 0, 0);
    g.setTransform(k, 0, 0, k, this.offX * k, this.offY * k);

    for (const br of this.bricks) {
      if (!br.alive) continue;
      const sp = this.brickSprite(br.hue, +br.s.toFixed(1));
      const a = Math.min(1, (this.now - br.born) / 0.6);
      if (a < 1) g.globalAlpha = a;
      g.drawImage(sp.c, br.x - GLOW, br.y - GLOW, sp.w, sp.h);
      if (a < 1) g.globalAlpha = 1;
    }
    for (const p of this.pieces) {
      if (!p.on) continue;
      const sp = this.brickSprite(p.hue, +p.size.toFixed(1));
      g.save(); g.translate(p.x, p.y); g.rotate(p.rot); g.globalAlpha = 0.75;
      g.drawImage(sp.c, -sp.w / 2, -sp.h / 2, sp.w, sp.h); g.restore();
    }
    g.globalCompositeOperation = 'lighter';
    for (const p of this.parts) {
      if (!p.on) continue;
      g.fillStyle = hsl(p.hue, 100, 65, p.life / p.max); g.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
    }
    g.globalCompositeOperation = 'source-over';

    const ball = this.sprite('ball', 36, 36, (c, kk) => {
      c.shadowColor = '#ff7bff'; c.shadowBlur = 12 * kk; c.fillStyle = '#fff';
      c.beginPath(); c.arc(18, 18, BALL_R, 0, 7); c.fill();
    });
    const n = this.trail.length / 2;
    for (let i = 0; i < n - 1; i++) {
      g.globalAlpha = (i / n) * 0.3; const sc = 0.35 + 0.4 * (i / n);
      g.drawImage(ball.c, this.trail[i * 2] - 18 * sc, this.trail[i * 2 + 1] - 18 * sc, 36 * sc, 36 * sc);
    }
    g.globalAlpha = 1;
    g.drawImage(ball.c, this.ball.x - 18, this.ball.y - 18, 36, 36);

    const pad = this.sprite('paddle', PW + 40, 46, (c, kk) => {
      c.shadowColor = '#e040ff'; c.shadowBlur = 14 * kk; c.strokeStyle = '#fff'; c.lineWidth = 1.6;
      c.beginPath(); c.roundRect(20, 20, PW, 6, 3); c.stroke();
    });
    g.drawImage(pad.c, this.paddleX - PW / 2 - 20, this.paddleY - 20, pad.w, pad.h);
  }
}
