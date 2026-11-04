// Runs the real Game class without a screen: canvas, window and animation frames are stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';

const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.window = { innerWidth: 820, innerHeight: 1180, devicePixelRatio: 1 };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };

const { Game, W } = await import('../src/game/game.js');
const STEP = 1 / 120, BALL_R = 4, PW = 64, PH = 6, MAX_ANGLE = 1.08;

function newGame(level = 0) {
  const g = new Game({ getContext: () => ctx, addEventListener() {}, width: 0, height: 0 }, { onEnd() {}, onPause() {} });
  g.resize(0, 0);
  g.start(level);
  g.state = 'playing';
  g.paddle.x = W / 2;
  return g;
}

test('paddle top: the ball bounces up at an angle that follows the hit position', () => {
  const g = newGame();
  Object.assign(g.ball, { x: W / 2 + 16, y: g.paddleY - BALL_R - 1, vx: 0, vy: g.speed });
  g.step(STEP);
  assert.ok(g.ball.vy < 0);
  assert.ok(g.ball.vx > 0);
  assert.ok(Math.abs(Math.hypot(g.ball.vx, g.ball.vy) - g.speed) < 1e-9);
});

test('paddle side: a ball coming from either side bounces away instead of passing through', () => {
  for (const side of [-1, 1]) {
    const g = newGame();
    const vx = -side * 100, vy = 150;
    Object.assign(g.ball, { x: W / 2 + side * (PW / 2 + BALL_R + 0.5), y: g.paddleY + PH / 2, vx, vy });
    g.step(STEP);
    assert.equal(Math.sign(g.ball.vx), side, 'moves away from the paddle');
    assert.ok(g.ball.vy > 0, 'still falling');
    assert.ok(Math.abs(g.ball.x - W / 2) >= PW / 2 + BALL_R - 1e-9, 'outside the paddle');
  }
});

test('paddle side: sliding the paddle into a falling ball pushes the ball off', () => {
  const g = newGame();
  Object.assign(g.ball, { x: W / 2 + PW / 2 + 6, y: g.paddleY + PH / 2, vx: 0, vy: 150 });
  g.paddle.x += 10;
  g.step(STEP);
  assert.ok(g.ball.x >= g.paddle.x + PW / 2 + BALL_R - 1e-9);
});

test('paddle side at a wall: the ball stays on the field and is then lost', () => {
  const g = newGame();
  g.paddle.x = W - PW / 2;
  Object.assign(g.ball, { x: W - BALL_R, y: g.paddleY + PH / 2, vx: 50, vy: 150 });
  const balls = g.balls;
  for (let i = 0; i < 600 && g.balls === balls; i++) {
    g.step(STEP);
    if (g.balls === balls) assert.ok(g.ball.x >= BALL_R && g.ball.x <= W - BALL_R);
  }
  assert.equal(g.balls, balls - 1);
});

test('paddle underside: a ball below the paddle keeps falling and is lost', () => {
  const g = newGame();
  Object.assign(g.ball, { x: W / 2, y: g.paddleY + PH + BALL_R - 1, vx: 0, vy: 150 });
  g.step(STEP);
  assert.ok(g.ball.vy > 0);
  assert.ok(g.ball.y >= g.paddleY + PH + BALL_R);
});

test('a rising ball is not caught by the paddle', () => {
  const g = newGame();
  Object.assign(g.ball, { x: W / 2, y: g.paddleY - BALL_R + 1, vx: 0, vy: -g.speed });
  g.step(STEP);
  assert.equal(g.ball.vy, -g.speed);
});

test('anti-stall: no change before the limit, aims at a brick after it, never too shallow', () => {
  const g = newGame();
  g.sinceHit = 7;
  assert.equal(g.antiStall(0.3), 0.3);
  g.sinceHit = 60;
  for (let i = 0; i < 200; i++) assert.ok(Math.abs(g.antiStall(0)) <= MAX_ANGLE);
  g.alive.fill(0);
  assert.equal(g.antiStall(0.3), 0.3, 'nothing to aim at');
});

test('anti-stall: a paddle that always hits dead centre still clears every level', () => {
  for (let level = 0; level < 5; level++) {
    const g = newGame(level);
    g.launch();
    let t = 0, last = 0, rem = g.remaining, worst = 0;
    while (g.remaining > 0 && t < 7200) {
      g.paddle.x = Math.min(Math.max(g.ball.x, PW / 2), W - PW / 2);
      g.step(STEP);
      t += STEP;
      if (g.remaining < rem) { rem = g.remaining; worst = Math.max(worst, t - last); last = t; }
    }
    assert.equal(g.remaining, 0, `level ${level + 1} not cleared after ${t.toFixed(0)}s`);
    assert.ok(worst < 40, `level ${level + 1} had ${worst.toFixed(0)}s between bricks`);
  }
});
