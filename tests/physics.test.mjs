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
  assert.ok(Math.abs(g.ball.vy + g.speed) < 1e-9);
});

test('speed: each ball starts at 75 %, reaches the level speed after 30 s and then stays there', () => {
  const g = newGame();
  const full = g.level.speed;
  assert.equal(g.speed, full * 0.75);
  g.launch(1);
  const run = (seconds) => {
    for (let i = 0; i < seconds * 120 && g.state === 'playing'; i++) {
      g.paddle.x = Math.min(Math.max(g.ball.x, PW / 2), W - PW / 2);
      g.step(STEP);
    }
  };
  run(15);
  assert.ok(Math.abs(g.speed - full * 0.875) < 1, `halfway ${g.speed}`);
  assert.ok(Math.abs(Math.hypot(g.ball.vx, g.ball.vy) - g.speed) < 1e-6, 'the ball follows the ramp');
  run(20);
  assert.equal(g.speed, full);
  g.loseBall();
  assert.equal(g.speed, full * 0.75, 'a new ball starts slow again');
});

test('launch: goes to the side that was tapped', () => {
  for (let i = 0; i < 50; i++) {
    for (const side of [-1, 1]) {
      const g = newGame();
      g.launch(side);
      assert.equal(Math.sign(g.ball.vx), side);
      assert.ok(g.ball.vy < 0);
    }
  }
});

test('input: tapping the left or right half of the screen launches that way, from anywhere before launch', () => {
  for (const [clientX, side] of [[100, -1], [700, 1]]) {
    const g = newGame();
    g.resetBall();
    g.canvas.setPointerCapture = () => {};
    const e = { pointerId: 1, clientX, clientY: 200, preventDefault() {} }; // far above the paddle zone
    g.onDown(e);
    g.onUp(e);
    assert.equal(g.state, 'playing');
    assert.equal(Math.sign(g.ball.vx), side);
  }
});

test('input: while playing, only the zone around the paddle moves it', () => {
  const g = newGame();
  g.canvas.setPointerCapture = () => {};
  g.onDown({ pointerId: 1, clientX: 400, clientY: 100, preventDefault() {} });
  assert.equal(g.pointer, null);
});

test('layout: short patterns move down, tall ones stay clear of the paddle', () => {
  for (let level = 0; level < 5; level++) {
    const g = newGame(level);
    assert.ok(g.gy >= g.safe.top + 48);
    assert.ok(g.gy + g.rows * 16 <= g.paddleY - 60, `level ${level + 1}`);
  }
});

test('tutorial: dragging moves on to the launch step, launching finishes it once', () => {
  let done = 0;
  const g = new Game({ getContext: () => ctx, addEventListener() {}, setPointerCapture() {}, width: 0, height: 0 }, { onTutorialDone() { done++; } });
  g.resize(0, 0);
  g.start(0, { tutorial: true });
  assert.equal(g.tutorial, 1);
  g.onDown({ pointerId: 1, clientX: 400, clientY: 1000, preventDefault() {} });
  g.onMove({ pointerId: 1, clientX: 500, clientY: 1000 });
  assert.equal(g.tutorial, 2);
  g.onUp({ pointerId: 1, clientX: 500, clientY: 1000 });
  assert.equal(g.state, 'ready', 'a drag does not launch');
  g.onDown({ pointerId: 2, clientX: 700, clientY: 1000, preventDefault() {} });
  g.onUp({ pointerId: 2, clientX: 700, clientY: 1000 });
  assert.equal(g.state, 'playing');
  assert.equal(g.tutorial, 0);
  assert.equal(done, 1);
  g.render(0);
  const plain = newGame();
  assert.equal(plain.tutorial, 0);
});

test('effects: a brick hit reports its sound and sets off the flash, a paddle hit its own', () => {
  const sounds = [];
  const g = new Game({ getContext: () => ctx, addEventListener() {}, width: 0, height: 0 }, { sfx: (n) => sounds.push(n) });
  g.resize(0, 0);
  g.start(0);
  g.state = 'playing';
  const i = g.alive.indexOf(1), r = Math.floor(i / 21), c = i % 21;
  Object.assign(g.ball, { x: (c + 0.5) * 16, y: g.gy + (r + 0.5) * 16, vx: 0, vy: 10 });
  assert.ok(g.hitBrick());
  assert.deepEqual(sounds, ['brick']);
  assert.equal(g.flashes.length, 1);
  assert.equal(g.ballGlow, 1);
  g.render(0);
  g.updateParticles(0.5);
  assert.equal(g.flashes.length, 0);
  assert.ok(g.ballGlow < 0.1);
  g.paddle.x = W / 2;
  Object.assign(g.ball, { x: W / 2, y: g.paddleY - BALL_R + 1, vx: 0, vy: 100 });
  g.hitPaddle();
  assert.equal(sounds.at(-1), 'paddle');
  assert.equal(g.paddlePulse, undefined, 'the paddle does not move when hit');
  assert.equal(g.shake, undefined, 'there is no screen shake');
});

test('sharp bricks: whole screen pixels, outer bricks at the screen edges, gaps differ by at most one pixel', () => {
  for (const [w, h, dpr] of [[393, 852, 3], [375, 667, 2], [430, 932, 3], [820, 1180, 2]]) {
    Object.assign(globalThis.window, { innerWidth: w, innerHeight: h, devicePixelRatio: dpr });
    const g = newGame();
    const where = `${w}x${h}@${dpr}`;
    assert.ok(Number.isInteger(16 * g.k), `${where}: a cell is whole pixels`);
    assert.equal(g.colPx[0], 0, `${where}: first brick at the left edge`);
    assert.equal(g.colPx[20] + g.brPx, g.canvas.width, `${where}: last brick at the right edge`);
    const gaps = g.colPx.slice(1).map((x, c) => x - g.colPx[c] - g.brPx);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `${where}: gaps ${Math.min(...gaps)}..${Math.max(...gaps)}`);
    assert.ok(Math.max(...gaps) < 2 * BALL_R * g.k, `${where}: the ball cannot fit between bricks`);
    assert.ok(Number.isInteger(g.rowTopPx));
    assert.ok(Math.abs(g.colX[0] * g.k + g.offX * g.k) < 1e-6, `${where}: physics matches the drawing`);
    assert.ok(g.colX[0] <= 0 && g.colX[20] + g.brW >= W, `${where}: no room between the outer bricks and the walls`);
  }
  Object.assign(globalThis.window, { innerWidth: 820, innerHeight: 1180, devicePixelRatio: 1 });
});

test('map roads: every node stays on the map at phone, tablet and desktop widths', async () => {
  const { ROADS } = await import('../src/map/roads.js');
  const el = () => ({});
  for (const w of [360, 615, 800]) {
    for (const name of Object.keys(ROADS)) {
      const { nodes } = ROADS[name].build(20, (x, y) => [x, 1000 - y], el, {}, w);
      const xs = nodes.map((n) => n[0]);
      assert.ok(Math.min(...xs) >= 30 && Math.max(...xs) <= w - 30, `${name} at ${w}: ${Math.min(...xs)}..${Math.max(...xs)}`);
      if (w > 360) assert.ok(Math.max(...xs) - Math.min(...xs) > w * 0.45, `${name} uses the width at ${w}`);
    }
  }
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
