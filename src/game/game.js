// Core breakout engine: fixed-step physics, cached glow sprites.
// Three stacked canvases, so a frame only touches the pixels that move: the background (drawn once per resize),
// the bricks (only the cells that changed are redrawn) and, on top, the ball, paddle, effects and HUD
// (only the areas drawn in the previous frame are cleared).
import { COLS, LEVELS, HITS, EMPTY, NORMAL, TWO_HIT, SOLID, isBomb } from './levels.js';
import { t } from '../core/i18n.js';
import { drawCore, CORE_COLOUR } from '../ui/core-icon.js';
import { KINDS, BY_CODE, WARN_TIME, WIDE_W, SMALL_W, GUN_W, GUN_INTERVAL, GUN_MUZZLE, SHOT_SPEED, SLOW_FACTOR, FAST_FACTOR, SPLIT_ANGLE, MAX_BALLS, addEffect, tickEffects, rollCounts } from './powerups.js';

export const W = 336;            // logical width (21 columns x 16)
const CELL = W / COLS, BR = 14.5;
const MIN_H = 600, MAX_H = 760;  // logical height range; 600 leaves room for 25 rows above the paddle
const BALL_R = 4, PW = 64, PH = 6, STEP = 1 / 120;
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
// The explosion (chosen look E): a white flash and a ring of light from the bomb, and every brick in the blast
// breaks into 3 x 3 shards in its own colour that fly out from the bomb and fall.
const BLAST_TIME = 0.55, BLAST_RING = 42, SHARD_LIFE = 0.9, SHARD_FALL = 280, MAX_SHARDS = 360;
const BOMB_RADIUS = 1;            // a bomb clears the bricks around it, unbreakable ones too (provisional: 3 x 3)
// Power-ups (powerups.js) hide in random breakable bricks and fall out as a pill when the brick breaks.
const PILL_W = 20, PILL_H = 8, PILL_FALL = 65; // the falling pill; about a quarter of the ball's speed
const GROW_TIME = 0.25;          // the wider paddle grows or shrinks over this time
const FLOOR_GAP = 50;            // the floor power-up lies this far below the paddle (less on short screens)
const FENCE_POST = 5, FENCE_STEP = 10; // the floor's look: post width at each wall, beam spacing
const PICKUP_TIME = 1.2;
const GUN_MORPH = 0.45, MORPH_SPLIT = 0.55; // the paddle turning into the cannon: seconds, and when it shrinks no more and changes
const BG = '#0a0614';            // = theme-color; the top edge of the page must stay this solid colour

const hsl = (h, s, l, a = 1) => `hsla(${h},${s}%,${l}%,${a})`;

export class Game {
  constructor(canvas, hooks) {
    this.canvas = canvas;
    this.bgCanvas = addLayer(canvas);
    this.brickCanvas = addLayer(canvas);
    this.g = canvas.getContext('2d');
    this.drawn = [];              // screen-pixel rectangles drawn on the top canvas in the last frame
    this.changed = [];            // brick cells to redraw
    this.styles = {};             // colour strings by hue, so frames make no new strings
    this.perf = null;             // frame time statistics (?perf, or the developer mode)
    this.showSeed = false;        // developer mode: the start's seed in the HUD
    this.pills = [];              // falling power-ups
    this.pickups = [];            // the ring and name shown where a power-up was caught
    this.effects = {};            // running power-ups: { key: seconds left }
    this.floorHits = [];          // where balls bounced on the floor, for its flash
    this.shots = [];              // the machine gun's shots on their way up
    this.recoil = [0, 0];         // the two muzzles, 1 just after a shot
    this.blasts = [];             // bomb explosions: flash and ring
    this.shards = [];             // pieces of the bricks a bomb broke
    this.pw = PW;                 // paddle width, wider with the power-up
    this.balls = [];              // every ball in play; this.ball is the first
    this.hooks = hooks;           // { onEnd(won), onPause() }
    this.state = 'idle';          // idle | ready | playing | paused | won | lost
    this.safe = { top: 0, bottom: 0 };
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({ on: false, x: 0, y: 0, vx: 0, vy: 0, life: 0, max: 1, hue: 0 }));
    this.flashes = [];
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
    for (const c of [this.canvas, this.bgCanvas, this.brickCanvas]) { c.width = Math.round(vw * this.dpr); c.height = Math.round(vh * this.dpr); }
    this.drawn.length = 0;
    this.paddleY = Math.round(this.H - 84 - this.safe.bottom);
    this.floorY = Math.min(this.paddleY + FLOOR_GAP, this.H - this.safe.bottom - 6);
    this.layoutGrid();
    this.sprites = {};
    this.buildBackground();
    this.warmSprites();
    this.allBricks = true;
    if (this.paddle) this.clampPaddle();
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
    // Everything random about a start (colours, where power-ups hide) comes from this seed, so a start can be repeated.
    this.seed = Number.isInteger(opts.seed) ? opts.seed >>> 0 : Math.floor(Math.random() * 2 ** 32);
    const rand = mulberry32(this.seed);
    this.type = new Uint8Array(COLS * this.rows);  // EMPTY once a brick is gone
    this.carry = new Uint8Array(COLS * this.rows); // power-up hidden in the brick, 0 for none
    this.hits = new Uint8Array(COLS * this.rows);  // hits left
    this.hue = new Uint16Array(COLS * this.rows);
    this.remaining = 0;
    const colour = randomColours(this.rows, rand);
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
    const rolled = rollCounts(level.powerups, level.chances, rand);
    this.extra = rolled.extra;    // kinds that came along by chance this start
    this.hidePowerups(rolled.counts, rand);
    this.misses = 0;
    this.paddle = { x: W / 2 };
    this.particles.forEach((p) => { p.on = false; });
    this.blasts.length = 0; this.shards.length = 0;
    this.flashes.length = 0;
    this.warmSprites();
    this.allBricks = true;
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

  // Each power-up goes into a different breakable brick, picked at random; never an unbreakable one.
  hidePowerups(counts = {}, rand = Math.random) {
    const spots = [];
    for (let i = 0; i < this.type.length; i++) if (this.type[i] && this.type[i] !== SOLID) spots.push(i);
    for (const [key, n] of Object.entries(counts)) {
      if (!KINDS[key]) continue;
      for (let k = 0; k < n && spots.length; k++) this.carry[spots.splice(Math.floor(rand() * spots.length), 1)[0]] = KINDS[key].code;
    }
  }

  // What is left on the board, for the editor's test play: bricks by type, and per power-up in the level file
  // how many are still hidden. built: false for the kinds the game does not have yet (they are never hidden).
  status() {
    const bricks = { normal: 0, twoHit: 0, cracked: 0, bomb: 0, solid: 0 };
    for (let i = 0; i < this.type.length; i++) {
      const t = this.type[i];
      if (t === NORMAL) bricks.normal++;
      else if (t === TWO_HIT) { bricks.twoHit++; if (this.hits[i] < HITS[TWO_HIT]) bricks.cracked++; }
      else if (isBomb(t)) bricks.bomb++;
      else if (t === SOLID) bricks.solid++;
    }
    const powerups = {}, chances = this.level.chances || {};
    for (const key of new Set([...Object.keys(this.level.powerups || {}), ...Object.keys(chances)])) {
      const fixed = this.level.powerups?.[key] || 0, chance = chances[key] || 0;
      if (!fixed && !chance) continue;
      const code = KINDS[key]?.code, extra = this.extra?.[key] || 0;
      powerups[key] = { total: fixed + extra, fixed, chance, extra, built: !!code,
        hidden: code ? this.carry.filter((c) => c === code).length : 0,
        falling: code ? this.pills.filter((p) => p.kind === code).length : 0 };
    }
    const effects = {};
    for (const [key, left] of Object.entries(this.effects)) effects[key] = Math.ceil(left);
    return { state: this.state, misses: this.misses, balls: this.balls.length, remaining: this.remaining, seed: this.seed,
      bricks, powerups, effects };
  }

  clampPaddle() { this.paddle.x = Math.min(Math.max(this.paddle.x, this.pw / 2), W - this.pw / 2); }

  get ball() { return this.balls[0]; }

  newBall(x, y, vx = 0, vy = 0) {
    // px, py: where it was before the last step; dx, dy: where it is drawn; loop: recent paddle hits (loop breaker)
    // glow: brighter for a moment after this ball broke a brick
    return { x, y, vx, vy, px: x, py: y, dx: x, dy: y, trail: [], loop: [], glow: 0 };
  }

  endPowerups() { this.pills.length = 0; this.shots.length = 0; this.effects = {}; this.morph = null; this.pw = PW; this.clampPaddle(); }

  resetBall() { // a new ball also ends the power-ups and drops the pills still falling
    this.endPowerups();
    this.balls = [this.newBall(this.paddle.x, this.paddleY - BALL_R - 1)];
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
    this.paddle.x += dx;
    this.clampPaddle();
  }
  onUp(e, cancelled) {
    const ptr = this.pointer;
    if (!ptr || ptr.id !== e.pointerId) return;
    this.pointer = null;
    if (!cancelled && this.state === 'ready' && ptr.moved < 8 && performance.now() - ptr.t < 350) this.launch(ptr.startX >= W / 2 ? 1 : -1);
  }

  // ---------- physics ----------
  step(dt) {
    this.rampSpeed(dt);
    this.stepPowerups(dt);
    this.stepShots(dt);
    for (let i = this.balls.length - 1; i >= 0 && this.state === 'playing'; i--) {
      if (this.stepBall(this.balls[i], dt)) this.balls.splice(i, 1); // fell out
    }
    if (this.state === 'playing' && !this.balls.length) this.loseBall();
  }

  // Moves one ball; true when it has left the field.
  stepBall(b, dt) {
    b.px = b.x; b.py = b.y; // where the ball was, so frames can draw it between two steps
    // x axis
    b.x += b.vx * dt;
    if (b.x < BALL_R) { b.x = BALL_R; b.vx = Math.abs(b.vx); this.sfx('wall'); }
    else if (b.x > W - BALL_R) { b.x = W - BALL_R; b.vx = -Math.abs(b.vx); this.sfx('wall'); }
    if (this.hitBrick(b)) { b.x -= b.vx * dt; b.vx = -b.vx; }
    // y axis
    b.y += b.vy * dt;
    const ceiling = this.safe.top + TOP + BALL_R;
    if (b.y < ceiling) { b.y = ceiling; b.vy = Math.abs(b.vy); this.keepAngle(b); this.sfx('wall'); }
    if (this.hitBrick(b)) { b.y -= b.vy * dt; b.vy = -b.vy; this.keepAngle(b); }
    this.hitPaddle(b);
    if (this.effects.floor && b.vy > 0 && b.y + BALL_R >= this.floorY) { // the floor power-up sends every ball back up
      b.y = this.floorY - BALL_R; b.vy = -Math.abs(b.vy); this.keepAngle(b);
      this.floorHits.push({ x: b.x, life: 0.4 });
      this.sfx('floorHit');
    }
    return b.y - BALL_R > this.H;
  }

  stepPowerups(dt) {
    for (let i = this.pills.length - 1; i >= 0; i--) {
      const p = this.pills[i];
      p.y += PILL_FALL * dt;
      p.phase += dt * 4.2; // rolls about 0.7 turns a second
      const caught = Math.abs(p.x - this.paddle.x) <= this.pw / 2 + PILL_W / 2
        && p.y + PILL_H / 2 >= this.paddleY && p.y - PILL_H / 2 <= this.paddleY + PH;
      if (caught) { this.pills.splice(i, 1); this.applyPowerup(BY_CODE[p.kind], p.x); }
      else if (p.y - PILL_H / 2 > this.H) this.pills.splice(i, 1);
    }
    tickEffects(this.effects, dt);
    if (this.morph && !this.effects.gun) this.morph = null; // replaced, or over
    if (this.morph) { // the paddle shrinks to the cannon's width, then turns into the cannon with a burst of sparks
      const m = this.morph;
      m.t = Math.min(1, m.t + dt / GUN_MORPH);
      const k = Math.min(1, m.t / MORPH_SPLIT), ease = 1 - (1 - k) ** 3;
      this.pw = m.from + (GUN_W - m.from) * ease;
      this.clampPaddle();
      if (m.t >= MORPH_SPLIT && !m.burst) {
        m.burst = true;
        for (const side of [-1, 1]) this.burst(this.paddle.x + side * (GUN_W / 2 - 7), this.paddleY + 3, 275);
        this.sfx('morph');
      }
      if (m.t >= 1) this.morph = null;
      return;
    }
    const fx = this.effects, target = fx.wide ? WIDE_W : fx.small ? SMALL_W : fx.gun ? GUN_W : PW, rate = (WIDE_W - PW) / GROW_TIME * dt;
    if (this.pw !== target) {
      this.pw = this.pw < target ? Math.min(target, this.pw + rate) : Math.max(target, this.pw - rate);
      this.clampPaddle();
    }
  }

  // The machine gun fires by itself while it runs: one shot every GUN_INTERVAL, the muzzles taking turns.
  // A shot hits a brick like a ball does once, and is gone; an unbreakable brick just stops it.
  stepShots(dt) {
    for (let i = 0; i < 2; i++) this.recoil[i] = Math.max(0, this.recoil[i] - dt * 8);
    if (this.effects.gun && !this.morph) {
      this.gunTimer = (this.gunTimer ?? 0) - dt;
      if (this.gunTimer <= 0) {
        this.gunTimer += GUN_INTERVAL;
        const side = this.gunSide = 1 - (this.gunSide ?? 1);
        this.shots.push({ x: this.paddle.x + (side ? GUN_MUZZLE : -GUN_MUZZLE), y: this.paddleY - 4 });
        this.recoil[side] = 1;
        this.sfx('shot');
      }
    } else this.gunTimer = 0; // the first shot comes at once
    for (let i = this.shots.length - 1; i >= 0 && this.state === 'playing'; i--) {
      const s = this.shots[i];
      s.y -= SHOT_SPEED * dt;
      if (s.y < this.safe.top + TOP || this.shotHits(s)) this.shots.splice(i, 1);
    }
  }

  shotHits(s) {
    const r = Math.floor((s.y - this.rowY0) / CELL);
    if (r < 0 || r >= this.rows || s.y - (this.rowY0 + r * CELL) > this.brW) return false;
    for (let c = 0; c < COLS; c++) {
      if (s.x < this.colX[c] || s.x > this.colX[c] + this.brW) continue;
      const i = r * COLS + c;
      if (!this.type[i]) return false;
      if (this.type[i] === SOLID) { this.sfx('wall'); return true; }
      this.damageBrick(i, null);
      return true;
    }
    return false;
  }

  applyPowerup(kind, x) {
    const hadGun = !!this.effects.gun;
    addEffect(this.effects, kind); // a second pill of the same kind starts its time again
    // the paddle turns into the cannon (see GUN_MORPH), which starts firing when it is done; a second gun pill only adds time
    if (kind.key === 'gun' && !this.morph && !hadGun) { this.morph = { t: 0, from: this.pw, burst: false }; this.gunTimer = 0; }
    if (kind.key === 'multi') this.splitBall();
    this.pickups.push({ x, y: this.paddleY, life: PICKUP_TIME, label: t(kind.label), hue: kind.hue });
    this.sfx(kind.sound);
  }

  // Multiball: one ball becomes three. The two new ones leave at a slightly different angle each, so the three
  // do not fly the same path. The ball split is the highest one, which is the one furthest from being lost.
  splitBall() {
    if (!this.balls.length) return;
    const b = this.balls.reduce((a, c) => (c.y < a.y ? c : a));
    for (const turn of [-SPLIT_ANGLE, SPLIT_ANGLE]) {
      if (this.balls.length >= MAX_BALLS) break;
      const cos = Math.cos(turn), sin = Math.sin(turn);
      const nb = this.newBall(b.x, b.y, b.vx * cos - b.vy * sin, b.vx * sin + b.vy * cos);
      this.keepAngle(nb);
      this.balls.push(nb);
    }
  }

  rampSpeed(dt) {
    this.playTime += dt;
    const effect = this.effects.slow ? SLOW_FACTOR : this.effects.fast ? FAST_FACTOR : 1;
    const speed = this.level.speed * effect * Math.min(1, START_SPEED + (1 - START_SPEED) * this.playTime / RAMP_TIME);
    const k = speed / this.speed;
    for (const b of this.balls) { b.vx *= k; b.vy *= k; }
    this.speed = speed;
  }

  hitPaddle(b = this.ball) {
    const px = this.paddle.x, py = this.paddleY, half = this.pw / 2;
    const dx = b.x - Math.max(px - half, Math.min(b.x, px + half));
    const dy = b.y - Math.max(py, Math.min(b.y, py + PH));
    if (dx * dx + dy * dy >= BALL_R * BALL_R) return;
    if (b.y <= py) { // top: the bounce angle follows where the ball lands
      if (b.vy <= 0) return;
      const off = Math.max(-1, Math.min(1, (b.x - px) / half));
      const ang = this.breakLoop(off * MAX_ANGLE, b.x, b);
      b.y = py - BALL_R;
      b.vx = this.speed * Math.sin(ang);
      b.vy = -this.speed * Math.cos(ang);
      this.sfx('paddle');
    } else if (dy > 0 && dx === 0) { // underside: a ball coming up from the floor bounces down; one the paddle slid over keeps falling
      b.y = py + PH + BALL_R;
      if (b.vy < 0) this.sfx('wall');
      b.vy = Math.abs(b.vy);
    } else { // side: bounces off but stays below the top edge, so the ball is still lost
      const side = dx !== 0 ? Math.sign(dx) : (b.x >= px ? 1 : -1);
      b.x = Math.max(BALL_R, Math.min(W - BALL_R, px + side * (half + BALL_R)));
      b.vx = side * Math.abs(b.vx);
      this.sfx('wall');
    }
  }

  breakLoop(ang, x, b = this.ball) {
    const h = b.loop;
    const loop = h.length >= LOOP_HITS - 1
      && h.slice(1 - LOOP_HITS).every((p) => Math.abs(p.x - x) < LOOP_X && Math.abs(p.ang - ang) < LOOP_ANGLE);
    h.push({ x, ang });
    if (h.length > LOOP_HITS) h.shift();
    if (!loop) return ang;
    h.length = 0;
    const nudge = (LOOP_NUDGE[0] + Math.random() * (LOOP_NUDGE[1] - LOOP_NUDGE[0])) * (Math.random() < 0.5 ? -1 : 1);
    return Math.max(-MAX_ANGLE, Math.min(MAX_ANGLE, ang + nudge));
  }

  keepAngle(b = this.ball) { // avoid near-horizontal ping-pong
    const min = this.speed * 0.28;
    if (Math.abs(b.vy) < min) {
      b.vy = (b.vy < 0 ? -1 : 1) * min;
      const vx = Math.sqrt(Math.max(0, this.speed * this.speed - b.vy * b.vy));
      b.vx = (b.vx < 0 ? -1 : 1) * vx;
    }
  }

  hitBrick(b = this.ball) {
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
        b.loop.length = 0; // the path has changed, so it is no loop
        if (this.effects.fire) { // the fireball burns through: every brick it touches breaks at once, and it does not bounce
          this.hits[i] = 0;
          this.breakBrick(i, b);
          if (this.remaining === 0) { this.state = 'won'; this.endTimer = 0.7; this.sfx('win'); return false; }
          continue;
        }
        this.damageBrick(i, b);
        return true;
      }
    }
    return false;
  }

  // One hit on a brick, from a ball or a shot: a two-hit brick or a bomb counts down, the rest break.
  damageBrick(i, ball) {
    const c = i % COLS, r = (i - c) / COLS;
    if (--this.hits[i] > 0) {
      this.changed.push(i);
      this.flashes.push({ x: this.colX[c], y: this.rowY0 + r * CELL, hue: this.hue[i], life: FLASH_TIME * 0.6 });
      this.sfx('brick', r);
      return;
    }
    this.breakBrick(i, ball);
    if (this.remaining === 0) { this.state = 'won'; this.endTimer = 0.7; this.sfx('win'); }
  }

  // removes a brick; a bomb takes the bricks around it with it, unbreakable ones and other bombs too
  // blast: the centre of the bomb that broke it, if a bomb did; such bricks shatter instead of the usual sparks
  breakBrick(i, ball = null, blast = null) {
    const t = this.type[i], c = i % COLS, r = Math.floor(i / COLS);
    const rx = this.colX[c], ry = this.rowY0 + r * CELL, bw = this.brW, mx = rx + bw / 2, my = ry + bw / 2;
    this.type[i] = EMPTY; this.hits[i] = 0;
    if (this.carry[i]) { this.pills.push({ x: mx, y: my, kind: this.carry[i], phase: 0 }); this.carry[i] = 0; }
    if (t !== SOLID) this.remaining--;
    this.changed.push(i);
    const hue = t === SOLID ? -1 : isBomb(t) ? 15 : this.hue[i]; // -1: grey shards
    if (blast || isBomb(t)) this.shatter(mx, my, blast || { x: mx, y: my }, hue);
    else { this.burst(mx, my, this.hue[i]); this.flashes.push({ x: rx, y: ry, hue: this.hue[i], life: FLASH_TIME }); }
    if (ball) ball.glow = 1;
    if (!isBomb(t)) { if (!blast) this.sfx('brick', r); return; }
    this.sfx('bomb');
    const centre = { x: mx, y: my };
    this.blasts.push({ x: mx, y: my, life: BLAST_TIME });
    for (let y = r - BOMB_RADIUS; y <= r + BOMB_RADIUS; y++) for (let x = c - BOMB_RADIUS; x <= c + BOMB_RADIUS; x++) {
      if (x < 0 || x >= COLS || y < 0 || y >= this.rows) continue;
      if (this.type[y * COLS + x]) this.breakBrick(y * COLS + x, ball, centre);
    }
  }

  // A brick breaks into 3 x 3 shards that fly away from the bomb, spin and fall.
  shatter(x, y, from, hue) {
    const s = this.brW / 3;
    for (let k = 0; k < 9 && this.shards.length < MAX_SHARDS; k++) {
      const sx = x - s + (k % 3) * s, sy = y - s + Math.floor(k / 3) * s;
      let dx = sx - from.x + (Math.random() - 0.5) * 6, dy = sy - from.y + (Math.random() - 0.5) * 6;
      const len = Math.hypot(dx, dy) || 1, v = 70 + Math.random() * 60;
      this.shards.push({ x: sx, y: sy, vx: dx / len * v, vy: dy / len * v, a: 0, spin: (Math.random() - 0.5) * 12, hue, life: SHARD_LIFE });
    }
  }

  // A miss stops play; the page asks whether to use a Core to go on (hooks.onMiss), then calls continueBall().
  loseBall() {
    this.misses++;
    this.sfx('lose');
    this.state = 'missed';
    this.endPowerups();
    this.hooks.onMiss?.();
  }

  continueBall() { if (this.state === 'missed') this.resetBall(); }

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
    for (let i = this.pickups.length - 1; i >= 0; i--) {
      if ((this.pickups[i].life -= dt) <= 0) this.pickups.splice(i, 1);
    }
    for (let i = this.flashes.length - 1; i >= 0; i--) {
      if ((this.flashes[i].life -= dt) <= 0) this.flashes.splice(i, 1);
    }
    for (let i = this.blasts.length - 1; i >= 0; i--) if ((this.blasts[i].life -= dt) <= 0) this.blasts.splice(i, 1);
    for (let i = this.shards.length - 1; i >= 0; i--) {
      const p = this.shards[i];
      if ((p.life -= dt) <= 0) { this.shards.splice(i, 1); continue; }
      p.vy += SHARD_FALL * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.spin * dt;
    }
    for (let i = this.floorHits.length - 1; i >= 0; i--) {
      if ((this.floorHits[i].life -= dt) <= 0) this.floorHits.splice(i, 1);
    }
    const fade = Math.pow(0.001, dt); // about 1/1000 left after a second
    for (const b of this.balls) b.glow *= fade;
  }

  // ---------- loop ----------
  frame(ts) {
    if (!this.running) return;
    this.raf = requestAnimationFrame(this.frame);
    if (this.perf) this.perf.gap(ts - this.last);
    let dt = (ts - this.last) / 1000;
    this.last = ts;
    if (dt > 0.1) dt = 0.1;
    if (this.state === 'paused') { this.render(ts); return; }
    if (this.state === 'playing') {
      this.acc += dt;
      while (this.acc >= STEP && this.state === 'playing') { this.step(STEP); this.acc -= STEP; }
    } else if (this.state === 'ready') {
      this.ball.x = this.ball.px = this.paddle.x;
    }
    // Physics runs in fixed steps of 1/120 s, which do not line up with the screen's frames: a frame can come after
    // zero, one or two steps. Drawing each ball between its last two positions keeps its motion even.
    const a = this.state === 'playing' ? Math.min(1, this.acc / STEP) : 1;
    for (const b of this.balls) {
      b.dx = b.px + (b.x - b.px) * a;
      b.dy = b.py + (b.y - b.py) * a;
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
      for (const b of this.balls) {
        b.trail.push(b.dx, b.dy);
        if (b.trail.length > 16) b.trail.splice(0, 2);
      }
    }
    const t0 = this.perf ? performance.now() : 0;
    this.render(ts);
    if (this.perf) this.perf.work(performance.now() - t0);
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
    const bomb = isBomb(type); // every bomb looks the same and shows the hits it has left
    const key = bomb ? `bomb.${hits}` : `b${type}.${hits}.${type === SOLID ? 0 : hue}`;
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
    const glow = type === SOLID ? null : bomb ? 'rgba(255,90,60,.9)' : hsl(hue, 100, 60);
    if (glow) {
      g.shadowColor = glow; g.shadowBlur = 9 * this.k;
      g.strokeStyle = bomb ? 'rgba(255,106,60,.8)' : hsl(hue, 100, 60, 0.8); g.lineWidth = lw;
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
    } else if (bomb) {
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
  // Makes every sprite the level can need before play starts: the soft glow is slow to draw on iOS,
  // so making one in the middle of play (a two-hit brick's first hit, a bomb counting down) would stall a frame.
  warmSprites() {
    if (!this.type || !this.k) return;
    for (let i = 0; i < this.type.length; i++) {
      const t = this.type[i];
      if (!t) continue;
      for (let h = this.hits[i]; h >= Math.min(1, this.hits[i]); h--) this.brickSprite(this.hue[i], t, h);
    }
    this.ballSprite(); this.paddleSprite();
    for (const kind of Object.values(KINDS)) this.pillGlow(kind.hue);
    this.fireSprite(); this.cannonSprite(); this.sightSprite(); this.shotSprite();
    this.floorBeams(); this.floorPosts();
  }

  ballSprite() {
    const size = BALL_R * 2 + 28;
    return this.sprite('ball', size, size, (g, k) => {
      const c = size / 2;
      g.shadowColor = '#ff7bff'; g.shadowBlur = 12 * k;
      g.fillStyle = '#fff'; g.beginPath(); g.arc(c, c, BALL_R, 0, 7); g.fill();
    });
  }
  paddleSprite() { // only the glow: the shape is drawn far outside and its shadow is moved into the sprite
    const w = PW + 40, h = PH + 40;
    return this.sprite('paddle', w, h, (g, k) => {
      g.shadowColor = '#e040ff'; g.shadowBlur = 14 * k; g.shadowOffsetX = 1000 * k;
      g.strokeStyle = '#fff'; g.lineWidth = 1.6;
      g.beginPath(); g.roundRect(20 - 1000, 20, PW, PH, 3); g.stroke();
    });
  }

  // The soft glow comes from the sprite in three slices, so the round ends keep their shape at any width;
  // the sharp outline is drawn directly, so it has no seams.
  drawPaddle(g, x, y, w) {
    const s = this.paddleSprite(), k = this.k, cap = 28, mid = PW + 40 - cap * 2, ch = s.c.height;
    const left = x - w / 2 - 20, top = y - 20;
    g.drawImage(s.c, 0, 0, cap * k, ch, left, top, cap, s.h);
    g.drawImage(s.c, cap * k, 0, mid * k, ch, left + cap, top, w + 40 - cap * 2, s.h);
    g.drawImage(s.c, (cap + mid) * k, 0, cap * k, ch, left + w + 40 - cap, top, cap, s.h);
    g.strokeStyle = '#fff'; g.lineWidth = 1.6;
    g.beginPath(); g.roundRect(x - w / 2, y, w, PH, 3); g.stroke();
  }

  pillGlow(hue) {
    return this.sprite(`pillglow${hue}`, PILL_W + 16, PILL_H + 16, (g, k) => {
      g.shadowColor = hsl(hue, 100, 60); g.shadowBlur = 8 * k;
      g.fillStyle = hsl(hue, 90, 45);
      g.beginPath(); g.roundRect(8, 8, PILL_W, PILL_H, PILL_H / 2); g.fill();
    });
  }

  // The classic pill: two colours, a white letter and a shine. The line between the colours and the letter roll round it.
  drawPill(g, x, y, phase, kind) {
    const hue = kind.hue, glow = this.pillGlow(hue);
    this.blit(g, glow, x - glow.w / 2, y - glow.h / 2);
    g.save();
    g.translate(x, y);
    g.beginPath(); g.roundRect(-PILL_W / 2, -PILL_H / 2, PILL_W, PILL_H, PILL_H / 2); g.clip();
    g.fillStyle = this.style(hue, 45); g.fillRect(-PILL_W / 2, -PILL_H / 2, PILL_W, PILL_H);
    const split = Math.sin(phase) * PILL_H / 2;
    g.fillStyle = kind.negative ? 'rgba(20,4,8,.75)' : this.style((hue + 40) % 360, 58);
    if (Math.cos(phase) > 0) g.fillRect(-PILL_W / 2, -PILL_H / 2, PILL_W, split + PILL_H / 2);
    else g.fillRect(-PILL_W / 2, split, PILL_W, PILL_H / 2 - split);
    g.fillStyle = this.pillShade ??= (() => {
      const s = g.createLinearGradient(0, -PILL_H / 2, 0, PILL_H / 2);
      s.addColorStop(0, 'rgba(255,255,255,.45)'); s.addColorStop(0.35, 'rgba(255,255,255,0)');
      s.addColorStop(0.75, 'rgba(0,0,0,0)'); s.addColorStop(1, 'rgba(0,0,0,.45)');
      return s;
    })();
    g.fillRect(-PILL_W / 2, -PILL_H / 2, PILL_W, PILL_H);
    g.fillStyle = '#fff'; g.font = '800 6.6px -apple-system, system-ui, sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (const a of [phase, phase + Math.PI]) { // the letter is on two opposite sides, so one is always coming round
      const sy = Math.cos(a);
      if (sy <= 0.05) continue;
      g.globalAlpha = 0.4 + 0.6 * sy;
      g.save(); g.translate(0, Math.sin(a) * PILL_H * 0.42); g.scale(1, sy);
      g.fillText(kind.letter, 0, 0.3);
      g.restore();
    }
    g.globalAlpha = 1;
    g.restore();
  }

  // A glowing ball with a flickering tail of flames behind it: the fireball pickup as it plunges down, and every ball
  // while the fireball power-up runs. (vx, vy): the direction it moves; the flames trail the other way.
  // Returns the box it drew in, for the clearing of the next frame.
  drawFireball(g, x, y, ts, vx = 0, vy = 1) {
    const t = ts / 1000, len = Math.hypot(vx, vy) || 1, ux = -vx / len, uy = -vy / len; // towards the tail
    for (let i = 8; i >= 1; i--) {
      const k = i / 9, wob = Math.sin(t * 18 + i) * 1.2 * k;
      g.globalAlpha = 0.85 * (1 - k);
      g.fillStyle = this.style(Math.round(40 - k * 30), Math.round(60 - k * 15));
      g.beginPath(); g.arc(x + ux * i * 2.2 - uy * wob, y + uy * i * 2.2 + ux * wob, 4.2 * (1 - k * 0.7), 0, 7); g.fill();
    }
    g.globalAlpha = 1;
    const s = this.fireSprite();
    this.blit(g, s, x - s.w / 2, y - s.h / 2);
    // the box holds the glow sprite around the ball (12 each way) and the end of the tail
    const tx = x + ux * 18, ty = y + uy * 18, x0 = Math.min(x, tx) - 12, y0 = Math.min(y, ty) - 12;
    return [x0, y0, Math.max(x, tx) + 12 - x0, Math.max(y, ty) + 12 - y0];
  }
  fireSprite() { // the burning ball with its glow
    return this.sprite('fire', 24, 24, (g, k) => {
      g.shadowColor = '#ff7a1a'; g.shadowBlur = 10 * k;
      const rg = g.createRadialGradient(11, 11, 0.5, 12, 12, 5);
      rg.addColorStop(0, '#fff8d0'); rg.addColorStop(0.45, '#ffc23a'); rg.addColorStop(1, '#ff4a10');
      g.fillStyle = rg; g.beginPath(); g.arc(12, 12, 4.6, 0, 7); g.fill();
    });
  }
  // The machine gun paddle: two capsules with a crackling energy coil between them, and a muzzle on each.
  // The glow of the capsules is a sprite; the coil and the muzzles move, so they are drawn each frame.
  drawCannon(g, x, y, ts) {
    const s = this.cannonSprite(), t = ts / 1000;
    this.blit(g, s, x - s.w / 2, y - 12);
    g.lineWidth = 1; g.strokeStyle = `hsla(270,100%,75%,${0.6 + 0.4 * Math.sin(t * 20)})`;
    g.beginPath();
    for (let k = 0; k <= 14; k++) { const yy = y + 3 + Math.sin(k * 1.6 + t * 30) * 1.6; k ? g.lineTo(x - 7 + k, yy) : g.moveTo(x - 7, yy); }
    g.stroke();
    g.fillStyle = '#efe4ff';
    for (const [i, side] of [[0, -1], [1, 1]]) {
      const mx = x + side * GUN_MUZZLE, my = y - 2 + this.recoil[i];
      g.beginPath(); g.arc(mx, my, 1.8, 0, 7); g.fill();
      if (this.recoil[i] > 0.6) { // muzzle flash
        g.globalAlpha = (this.recoil[i] - 0.6) / 0.4; g.fillStyle = '#fff';
        g.beginPath(); g.arc(mx, y - 6, 2.4, 0, 7); g.fill();
        g.globalAlpha = 1; g.fillStyle = '#efe4ff';
      }
    }
  }
  cannonSprite() {
    return this.sprite('cannon', GUN_W + 24, 26, (g, k) => {
      g.shadowColor = '#a46bff'; g.shadowBlur = 11 * k;
      g.strokeStyle = '#d9c0ff'; g.lineWidth = 1.4;
      const o = 12; // the sprite's left edge is 12 points left of the paddle, its top 12 above
      g.beginPath(); g.roundRect(o, 11, 15, 8, 3); g.stroke();
      g.beginPath(); g.roundRect(o + GUN_W - 15, 11, 15, 8, 3); g.stroke();
    });
  }
  shotSprite() { // a plasma bolt
    return this.sprite('shot', 8, 14, (g, k) => {
      g.shadowColor = '#c9a0ff'; g.shadowBlur = 6 * k;
      g.fillStyle = '#e6d6ff'; g.fillRect(3.2, 3, 1.6, 7);
    });
  }
  // The machine gun pickup: a red gun sight turning as it falls, with a pulsing dot in the middle.
  drawSight(g, x, y, ts) {
    const s = this.sightSprite(), t = ts / 1000;
    g.save(); g.translate(x, y); g.rotate(t * 1.5);
    g.drawImage(s.c, -s.w / 2, -s.h / 2, s.w, s.h);
    g.restore();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 1 + 0.4 * Math.sin(t * 10), 0, 7); g.fill();
  }
  sightSprite() {
    return this.sprite('sight', 24, 24, (g, k) => {
      g.translate(12, 12);
      g.shadowColor = '#ff5f6d'; g.shadowBlur = 7 * k;
      g.strokeStyle = '#ff7d88'; g.lineWidth = 1;
      g.beginPath(); g.arc(0, 0, 5.5, 0, 7); g.stroke();
      for (let q = 0; q < 4; q++) { g.rotate(Math.PI / 2); g.beginPath(); g.moveTo(0, -7.5); g.lineTo(0, -3.5); g.stroke(); }
    });
  }

  drawExplosions(g) {
    if (this.shards.length) {
      let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
      g.lineWidth = 0.7;
      for (const p of this.shards) {
        const c = Math.cos(p.a), sn = Math.sin(p.a), k = this.k;
        g.setTransform(c * k, sn * k, -sn * k, c * k, (p.x + this.offX) * k, (p.y + this.offY) * k);
        g.globalAlpha = p.life / SHARD_LIFE;
        g.fillStyle = p.hue < 0 ? 'rgba(154,160,184,.35)' : this.style(p.hue, 60, 0.3);
        g.fillRect(-1.9, -1.9, 3.8, 3.8);
        g.strokeStyle = p.hue < 0 ? '#9aa0b8' : this.style(p.hue, 70);
        g.strokeRect(-1.9, -1.9, 3.8, 3.8);
        if (p.x < x0) x0 = p.x;
        if (p.x > x1) x1 = p.x;
        if (p.y < y0) y0 = p.y;
        if (p.y > y1) y1 = p.y;
      }
      g.setTransform(this.k, 0, 0, this.k, this.offX * this.k, this.offY * this.k);
      g.globalAlpha = 1;
      this.mark(x0 - 4, y0 - 4, x1 - x0 + 8, y1 - y0 + 8);
    }
    if (!this.blasts.length) return;
    g.globalCompositeOperation = 'lighter';
    for (const b of this.blasts) {
      const k = 1 - b.life / BLAST_TIME, r = 6 + k * BLAST_RING;
      g.globalAlpha = (1 - k) ** 3; g.fillStyle = '#fff0dc';
      g.beginPath(); g.arc(b.x, b.y, 6 + k * 10, 0, 7); g.fill();
      g.globalAlpha = (1 - k) * 0.35; g.strokeStyle = '#ffb070'; g.lineWidth = 3 * (1 - k) + 4; // the ring's soft glow
      g.beginPath(); g.arc(b.x, b.y, r, 0, 7); g.stroke();
      g.globalAlpha = 1 - k; g.strokeStyle = '#ffc896'; g.lineWidth = 2.2 * (1 - k) + 0.5;
      g.beginPath(); g.arc(b.x, b.y, r, 0, 7); g.stroke();
      this.mark(b.x - BLAST_RING - 12, b.y - BLAST_RING - 12, BLAST_RING * 2 + 24, BLAST_RING * 2 + 24);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
  }

  drawHitGlow(g, bs, b, off) { // brighter and bigger for a moment after the ball broke a brick
    const sc = 1 + b.glow * 0.7;
    g.globalCompositeOperation = 'lighter'; g.globalAlpha = b.glow;
    g.drawImage(bs.c, b.dx - off * sc, b.dy - off * sc, bs.w * sc, bs.h * sc);
    g.globalCompositeOperation = 'source-over'; g.globalAlpha = 1;
    this.mark(b.dx - off * sc, b.dy - off * sc, bs.w * sc, bs.h * sc);
  }

  coreSprite() { // 17 points, with a glow that fits inside the sprite
    return this.sprite('core', 27, 27, (g, k) => {
      g.translate(5, 5); g.scale(17 / 24, 17 / 24);
      g.shadowColor = CORE_COLOUR; g.shadowBlur = 5 * k;
      drawCore(g);
    });
  }

  // The floor power-up as a laser fence: a bright post at each wall and short beams sliding between them.
  // The glow is drawn once into sprites; only the beams' sliding offset changes per frame.
  drawFloor(g, ts) {
    const left = this.effects.floor;
    if (!left) return;
    const y = this.floorY;
    this.mark(0, y - 12, W, 24);
    if (left < WARN_TIME && Math.floor(left * 6) % 2 === 0) return; // blinks before it ends
    const beams = this.floorBeams(), posts = this.floorPosts(), off = (ts / 1000 * 30) % FENCE_STEP;
    g.save();
    g.beginPath(); g.rect(FENCE_POST, y - 8, W - FENCE_POST * 2, 16); g.clip();
    g.drawImage(beams.c, FENCE_POST - off, y - beams.h / 2, beams.w, beams.h);
    g.restore();
    g.drawImage(posts.c, 0, y - posts.h / 2, posts.w, posts.h);
    for (const h of this.floorHits) { // a flash where a ball bounced
      g.globalAlpha = h.life / 0.4; g.fillStyle = this.style(KINDS.floor.hue, 85);
      g.fillRect(h.x - 10, y - 1.5, 20, 3);
    }
    g.globalAlpha = 1;
  }
  floorBeams() {
    return this.sprite('floorbeams', W + FENCE_STEP, 16, (g, k) => {
      g.shadowColor = hsl(KINDS.floor.hue, 100, 55); g.shadowBlur = 6 * k;
      g.fillStyle = hsl(KINDS.floor.hue, 100, 70, 0.9);
      for (let x = 0; x < W + FENCE_STEP; x += FENCE_STEP) g.fillRect(x, 7.4, FENCE_STEP * 0.6, 1.2);
    });
  }
  floorPosts() {
    return this.sprite('floorposts', W, 24, (g, k) => {
      g.shadowColor = hsl(KINDS.floor.hue, 100, 55); g.shadowBlur = 8 * k;
      g.fillStyle = hsl(KINDS.floor.hue, 100, 60);
      g.fillRect(1.5, 7, 3, 10); g.fillRect(W - 4.5, 7, 3, 10);
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

  buildBackground() { // also the touch zone, which never moves
    const w = this.bgCanvas.width, h = this.bgCanvas.height;
    const g = this.bgCanvas.getContext('2d', { alpha: false });
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
    g.setLineDash([2, 5]); g.strokeStyle = 'rgba(255,255,255,.14)'; g.lineWidth = 1;
    g.beginPath(); g.roundRect(8, this.paddleY - 44, W - 16, Math.max(60, this.H - this.paddleY + 36 - this.safe.bottom), 18); g.stroke();
  }

  drawBrick(g, i) {
    const c = i % COLS, r = (i - c) / COLS;
    const sp = this.brickSprite(this.hue[i], this.type[i], this.hits[i]);
    g.drawImage(sp.c, this.colPx[c] - sp.pad, this.rowTopPx + r * this.cellPx - sp.pad);
  }

  // All bricks after a start or resize; afterwards only the changed cells, with the glow of the bricks next to them.
  // Drawn in the same order as the full redraw, so a patched cell looks exactly as if everything had been redrawn.
  updateBricks() {
    const g = this.brickCanvas.getContext('2d');
    if (this.allBricks) {
      g.clearRect(0, 0, this.brickCanvas.width, this.brickCanvas.height);
      for (let i = 0; i < this.type.length; i++) if (this.type[i]) this.drawBrick(g, i);
      this.allBricks = false; this.changed.length = 0;
      return;
    }
    const pad = Math.ceil(GLOW_PAD * this.k), reach = 2; // a glow reaches less than two cells
    for (const i of this.changed) {
      const c = i % COLS, r = (i - c) / COLS;
      const x = this.colPx[c] - pad, y = this.rowTopPx + r * this.cellPx - pad, size = this.brPx + pad * 2;
      g.save();
      g.beginPath(); g.rect(x, y, size, size); g.clip();
      g.clearRect(x, y, size, size);
      for (let rr = Math.max(0, r - reach); rr <= Math.min(this.rows - 1, r + reach); rr++) {
        for (let cc = Math.max(0, c - reach); cc <= Math.min(COLS - 1, c + reach); cc++) {
          if (this.type[rr * COLS + cc]) this.drawBrick(g, rr * COLS + cc);
        }
      }
      g.restore();
    }
    this.changed.length = 0;
  }

  // Records a logical rectangle drawn on the top canvas, to clear at the start of the next frame.
  mark(x, y, w, h) {
    const k = this.k, px = this.canvas.width, py = this.canvas.height;
    const x0 = Math.max(0, Math.floor((x + this.offX) * k) - 2), y0 = Math.max(0, Math.floor((y + this.offY) * k) - 2);
    const x1 = Math.min(px, Math.ceil((x + w + this.offX) * k) + 2), y1 = Math.min(py, Math.ceil((y + h + this.offY) * k) + 2);
    if (x1 > x0 && y1 > y0) this.drawn.push(x0, y0, x1 - x0, y1 - y0);
  }

  style(hue, light, a = 1) { const key = (hue * 101 + light) * 11 + Math.round(a * 10); return this.styles[key] ??= hsl(hue, 100, light, a); } // a number key: no new strings per frame

  // ---------- render ----------
  render(ts) {
    const g = this.g, k = this.k;
    if (this.allBricks || this.changed.length) this.updateBricks();
    g.setTransform(1, 0, 0, 1, 0, 0);
    const d = this.drawn;
    for (let i = 0; i < d.length; i += 4) g.clearRect(d[i], d[i + 1], d[i + 2], d[i + 3]);
    d.length = 0;
    g.setTransform(k, 0, 0, k, this.offX * k, this.offY * k);

    this.drawExplosions(g);

    // particles
    g.globalCompositeOperation = 'lighter';
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    for (const p of this.particles) {
      if (!p.on) continue;
      g.globalAlpha = p.life / p.max;
      g.fillStyle = this.style(p.hue, 65);
      g.fillRect(p.x - 1.2, p.y - 1.2, 2.4, 2.4);
      if (p.x < x0) x0 = p.x;
      if (p.x > x1) x1 = p.x;
      if (p.y < y0) y0 = p.y;
      if (p.y > y1) y1 = p.y;
    }
    if (x1 >= x0) this.mark(x0 - 2, y0 - 2, x1 - x0 + 4, y1 - y0 + 4);
    for (const f of this.flashes) { // white flash that grows out of the broken brick
      const a = f.life / FLASH_TIME, grow = (1 - a) * 5;
      g.globalAlpha = Math.min(1, a * 0.9);
      g.fillStyle = this.style(f.hue, 88);
      g.fillRect(f.x - grow, f.y - grow, this.brW + grow * 2, this.brW + grow * 2);
      this.mark(f.x - grow, f.y - grow, this.brW + grow * 2, this.brW + grow * 2);
    }
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';

    if (this.shots.length) {
      const sp = this.shotSprite();
      for (const s of this.shots) { this.blit(g, sp, s.x - sp.w / 2, s.y - 3); this.mark(s.x - sp.w / 2, s.y - 3, sp.w, sp.h); }
    }

    // balls with their trails, the floor, the paddle
    if (this.state === 'playing' || this.state === 'ready' || this.state === 'paused') {
      const fire = !!this.effects.fire; // every ball burns, also the ones a multiball adds while it runs
      const bs = fire ? this.fireSprite() : this.ballSprite(), off = bs.w / 2, reach = off * 1.7; // the glow after a hit makes the sprite up to 1.7 times as big
      for (const b of this.balls) {
        if (fire) {
          this.mark(...this.drawFireball(g, b.dx, b.dy, ts, b.vx, b.vy));
          if (b.glow > 0.02) this.drawHitGlow(g, bs, b, off);
          continue;
        }
        const n = b.trail.length / 2;
        for (let i = 0; i < n - 1; i++) {
          g.globalAlpha = (i / n) * 0.3;
          const sc = 0.35 + 0.4 * (i / n);
          g.drawImage(bs.c, b.trail[i * 2] - off * sc, b.trail[i * 2 + 1] - off * sc, bs.w * sc, bs.h * sc);
        }
        g.globalAlpha = 1;
        this.blit(g, bs, b.dx - off, b.dy - off);
        let bx0 = b.dx, bx1 = bx0, by0 = b.dy, by1 = by0;
        for (let i = 0; i < b.trail.length; i += 2) {
          const tx = b.trail[i], ty = b.trail[i + 1];
          if (tx < bx0) bx0 = tx;
          if (tx > bx1) bx1 = tx;
          if (ty < by0) by0 = ty;
          if (ty > by1) by1 = ty;
        }
        this.mark(bx0 - reach, by0 - reach, bx1 - bx0 + reach * 2, by1 - by0 + reach * 2);
        if (b.glow > 0.02) this.drawHitGlow(g, bs, b, off);
      }
      this.drawFloor(g, ts);
      // the wider paddle blinks during its last seconds
      const left = this.effects.wide || this.effects.small || this.effects.gun, blink = left && left < WARN_TIME && Math.floor(left * 6) % 2 === 0;
      if (blink) g.globalAlpha = 0.4;
      const m = this.effects.gun ? this.morph : null;
      if (!this.effects.gun || (m && m.t < MORPH_SPLIT)) this.drawPaddle(g, this.paddle.x, this.paddleY, this.pw);
      else if (m) { // the paddle fades into the cannon
        const c = (m.t - MORPH_SPLIT) / (1 - MORPH_SPLIT), a = g.globalAlpha;
        g.globalAlpha = a * (1 - c); this.drawPaddle(g, this.paddle.x, this.paddleY, this.pw);
        g.globalAlpha = a * c; this.drawCannon(g, this.paddle.x, this.paddleY, ts);
        g.globalAlpha = a;
      } else this.drawCannon(g, this.paddle.x, this.paddleY, ts);
      g.globalAlpha = 1;
      this.mark(this.paddle.x - this.pw / 2 - 20, this.paddleY - 20, this.pw + 40, PH + 40); // also covers the cannon
    }
    for (const p of this.pills) {
      const kind = BY_CODE[p.kind];
      if (kind.look === 'fireball') { this.mark(...this.drawFireball(g, p.x, p.y, ts)); continue; }
      if (kind.look === 'sight') { this.drawSight(g, p.x, p.y, ts); this.mark(p.x - 13, p.y - 13, 26, 26); continue; }
      this.drawPill(g, p.x, p.y, p.phase, kind);
      this.mark(p.x - PILL_W / 2 - 8, p.y - PILL_H / 2 - 8, PILL_W + 16, PILL_H + 16); // = the glow sprite
    }
    for (const p of this.pickups) { // a ring where it was caught, and the name floating up
      const age = PICKUP_TIME - p.life;
      if (age < 0.45) {
        g.strokeStyle = this.style(p.hue, 75); g.globalAlpha = 1 - age / 0.45; g.lineWidth = 1.2;
        g.beginPath(); g.ellipse(p.x, p.y + 2, 14 + age * 90, 3 + age * 14, 0, 0, 7); g.stroke();
      }
      g.globalAlpha = Math.max(0, p.life / PICKUP_TIME);
      g.fillStyle = '#fff'; g.font = '700 10px -apple-system, system-ui, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillText(p.label, p.x, p.y - 14 - age * 18);
      g.globalAlpha = 1;
      this.mark(p.x - 60, p.y - 50, 120, 62);
    }

    // HUD
    g.fillStyle = 'rgba(255,255,255,.85)';
    g.font = '500 11px -apple-system, system-ui, sans-serif';
    g.textBaseline = 'middle'; g.textAlign = 'left';
    const hy = this.safe.top + 24;
    // everything drawn in the HUD row must lie inside this cleared band, or its glow piles up frame after frame
    this.mark(-this.offX, hy - 15, W + this.offX * 2, 30);
    g.fillText(t('hud_level', { n: this.level.id }), 14, hy);
    if (this.perf || this.showSeed) {
      const line = [this.perf?.text, this.showSeed ? `seed ${this.seed}` : ''].filter(Boolean).join(' · ');
      g.fillText(line, 14, hy + 16); this.mark(0, hy + 7, W, 18);
    }
    const cores = this.hooks.cores?.() ?? '';
    if (cores !== '') { // the Core icon and how many the player has
      const icon = this.coreSprite();
      this.blit(g, icon, W / 2 - 12 - icon.w / 2, hy - icon.h / 2);
      g.fillStyle = '#fff'; g.textAlign = 'left'; g.font = '600 13px -apple-system, system-ui, sans-serif';
      g.fillText(String(cores), W / 2 - 1, hy + 0.5);
    }
    if (this.state === 'ready' && this.tutorial) { this.mark(0, this.paddleY - 80, W, this.H - this.paddleY + 80); this.renderTutorial(g, ts); }
    else if (this.state === 'ready') {
      this.mark(0, this.paddleY - 46, W, 20);
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

// A canvas under the game canvas, in the same place on screen. Without a page (tests, the level tool) it stays offscreen.
function addLayer(canvas) {
  const c = document.createElement('canvas');
  if (canvas.parentNode) { c.className = 'game-layer'; c.setAttribute('aria-hidden', 'true'); canvas.parentNode.insertBefore(c, canvas); }
  return c;
}

// Frame statistics for ?perf: time between frames and time spent drawing, over the last two seconds.
export class PerfMeter {
  constructor() { this.gaps = []; this.works = []; this.text = ''; this.next = 0; }
  gap(ms) { this.gaps.push(ms); if (this.gaps.length > 120) this.gaps.shift(); }
  work(ms) {
    this.works.push(ms);
    if (this.works.length > 120) this.works.shift();
    if (performance.now() < this.next) return;
    this.next = performance.now() + 500;
    const avg = (a) => a.reduce((x, y) => x + y, 0) / a.length, max = (a) => Math.max(...a);
    const slow = this.gaps.filter((g) => g > 25).length;
    this.text = `${Math.round(1000 / avg(this.gaps))} fps · max ${max(this.gaps).toFixed(0)} ms · draw ${avg(this.works).toFixed(1)}/${max(this.works).toFixed(1)} ms · slow ${slow}`;
  }
}

// A small seeded random generator: the same seed gives the same numbers.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A new colour layout every time a level starts: rows, columns, diagonals or rings, from a random starting hue.
// Hues are rounded to steps of 15 so the brick sprites can be shared.
function randomColours(rows, rand = Math.random) {
  const base = rand() * 360, mode = Math.floor(rand() * 4), cx = (COLS - 1) / 2, cy = (rows - 1) / 2;
  const raw = [
    (x, y) => y * 45,
    (x) => x * 17,
    (x, y) => (x + y) * 14,
    (x, y) => Math.hypot(x - cx, (y - cy) * 1.4) * 32,
  ][mode];
  return (x, y) => Math.round(((base + raw(x, y)) % 360) / 15) * 15 % 360;
}
