// Runs the real Game class without a screen: canvas, window and animation frames are stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';

const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.window = { innerWidth: 820, innerHeight: 1180, devicePixelRatio: 1 };
globalThis.requestAnimationFrame = () => 0;
globalThis.cancelAnimationFrame = () => {};
globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };

const { Game, W } = await import('../src/game/game.js');
const { setLevels, NORMAL, TWO_HIT, SOLID, BOMB } = await import('../src/game/levels.js');
const STEP = 1 / 120, BALL_R = 4, PW = 64, PH = 6, MAX_ANGLE = 1.08;

// Test levels, so the tests do not depend on the levels being designed in levels/ (these are the five first drafts).
const grid = (rows, fn) => Array.from({ length: rows }, (_, y) => Array.from({ length: 21 }, (_, x) => (fn(x, y) ? NORMAL : 0)));
const hex = (x, y, cy) => { const dx = Math.abs(x - 10), dy = Math.abs(y - cy); return Math.max(dy * 0.866 + dx * 0.5, dx); };
const TEST_LEVELS = [
  { id: 1, speed: 250, grid: grid(9, (x, y) => y % 2 === 1 && x >= 2 && x <= 18) },
  { id: 2, speed: 262, grid: grid(13, (x, y) => (x + y) % 2 === 0 && Math.abs(x - 10) * 0.7 + Math.abs(y - 6) <= 6.6) },
  { id: 3, speed: 275, grid: grid(17, (x, y) => { const d = hex(x, y, 8); return (d >= 8.2 && d < 9.6) || (d >= 4.4 && d < 5.8); }) },
  { id: 4, speed: 290, grid: grid(16, (x, y) => { const px = (x - 10) / 8.6, py = (8.2 - y) / 7.4 + 0.15; return Math.pow(px * px + py * py - 1, 3) - px * px * py * py * py <= 0; }) },
  { id: 5, speed: 305, grid: grid(15, (x, y) => { const layer = Math.min(x, y, 20 - x, 14 - y); return layer % 2 === 0 && layer <= 6 && !(y === 14 - layer && Math.abs(x - 10) <= 1 && (layer / 2) % 2 === 0) && !(y === layer && Math.abs(x - 10) <= 1 && (layer / 2) % 2 === 1); }) },
].map((l) => ({ ...l, powerups: {} }));
setLevels(TEST_LEVELS);

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

test('ceiling: the ball turns at the top of the first brick row, so it cannot pass above the top row', () => {
  const g = newGame();
  const top = g.safe.top + 48;
  Object.assign(g.ball, { x: 2, y: top + BALL_R + 1, vx: 0, vy: -g.speed });
  for (let i = 0; i < 4; i++) g.step(STEP);
  assert.ok(g.ball.vy > 0, 'bounced down');
  assert.ok(g.ball.y - BALL_R >= top - 1e-9, 'never above the ceiling');
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

test('layout: row 1 sits against the ceiling on every level, and 25 rows end above the paddle', () => {
  for (const [w, h] of [[393, 852], [375, 667], [820, 1180]]) {
    Object.assign(globalThis.window, { innerWidth: w, innerHeight: h });
    for (let level = 0; level < 5; level++) {
      const g = newGame(level);
      assert.equal(g.gy, Math.round(g.safe.top + 48), 'the same place whatever the level');
      assert.ok(g.gy + 25 * 16 <= g.paddleY - 40, `${w}x${h}: ${g.paddleY - g.gy - 400} units between a full grid and the paddle`);
    }
  }
  Object.assign(globalThis.window, { innerWidth: 820, innerHeight: 1180 });
});

// a one-brick-high test level with the given bricks in row 0
function rowLevel(cells) {
  const row = Array(21).fill(0);
  for (const [x, t] of cells) row[x] = t;
  setLevels([{ id: 1, speed: 270, grid: [row, Array(21).fill(0)], powerups: {} }]);
  const g = newGame(0);
  setLevels(TEST_LEVELS);
  return g;
}
const hitAt = (g, x) => { Object.assign(g.ball, { x: g.colX[x] + g.brW / 2, y: g.rowY0 + g.brW / 2, vx: 0, vy: -10 }); return g.hitBrick(); };

test('brick types: two hits, unbreakable, and a bomb that clears what is around it', () => {
  let g = rowLevel([[5, TWO_HIT], [6, NORMAL]]);
  assert.equal(g.remaining, 2);
  assert.ok(hitAt(g, 5)); assert.equal(g.type[5], TWO_HIT, 'still there after one hit');
  assert.ok(hitAt(g, 5)); assert.equal(g.type[5], 0, 'gone after two');
  assert.equal(g.remaining, 1);

  g = rowLevel([[3, SOLID], [4, NORMAL]]);
  assert.equal(g.remaining, 1, 'unbreakable bricks do not count');
  for (let i = 0; i < 20; i++) assert.ok(hitAt(g, 3), 'the ball bounces off it');
  assert.equal(g.type[3], SOLID, 'and it never breaks');
  hitAt(g, 4);
  assert.equal(g.state, 'won', 'the level is cleared with the unbreakable brick left');

  g = rowLevel([[10, BOMB], [9, SOLID], [11, NORMAL], [12, NORMAL], [14, BOMB], [16, NORMAL]]);
  for (let i = 0; i < 4; i++) { hitAt(g, 10); assert.equal(g.type[10], BOMB, `bomb holds after ${i + 1} hits`); }
  hitAt(g, 10);
  assert.deepEqual([9, 10, 11].map((x) => g.type[x]), [0, 0, 0], 'the bomb took its neighbours, the unbreakable one too');
  assert.equal(g.type[12], NORMAL, 'two columns away is outside the blast');
  assert.equal(g.remaining, 3);
});

test('brick types: a bomb in a blast goes off too', () => {
  const g = rowLevel([[4, BOMB], [5, BOMB], [6, BOMB], [7, NORMAL], [8, NORMAL]]);
  for (let i = 0; i < 5; i++) hitAt(g, 4);
  assert.deepEqual([4, 5, 6, 7].map((x) => g.type[x]), [0, 0, 0, 0], 'the chain reaches column 7');
  assert.equal(g.type[8], NORMAL);
  g.render(0); // every brick type can be drawn
});

test('colours: a new random layout each start, in steps of 15', () => {
  const layouts = new Set();
  for (let i = 0; i < 20; i++) {
    const g = newGame(2);
    const hues = [...g.hue].filter((h, k) => g.type[k]);
    assert.ok(hues.every((h) => h % 15 === 0 && h >= 0 && h < 360));
    layouts.add(hues.join());
  }
  assert.ok(layouts.size > 10, `${layouts.size} different layouts in 20 starts`);
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
  const i = g.type.findIndex((t) => t === NORMAL), r = Math.floor(i / 21), c = i % 21;
  Object.assign(g.ball, { x: g.colX[c] + g.brW / 2, y: g.rowY0 + r * 16 + g.brW / 2, vx: 0, vy: 10 });
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
    if (g.fullWidth) { // phones: the outer bricks reach the screen edges
      assert.equal(g.colPx[0], 0, `${where}: first brick at the left edge`);
      assert.equal(g.colPx[20] + g.brPx, g.canvas.width, `${where}: last brick at the right edge`);
    } else assert.ok(w > 700, `${where}: only tablets get side margins`);
    const gaps = g.colPx.slice(1).map((x, c) => x - g.colPx[c] - g.brPx);
    assert.ok(Math.max(...gaps) - Math.min(...gaps) <= 1, `${where}: gaps ${Math.min(...gaps)}..${Math.max(...gaps)}`);
    assert.ok(Math.max(...gaps) < 2 * BALL_R * g.k, `${where}: the ball cannot fit between bricks`);
    assert.ok(Number.isInteger(g.rowTopPx));
    assert.ok(Math.abs((g.colX[0] + g.offX) * g.k - g.colPx[0]) < 1e-6, `${where}: physics matches the drawing`);
    assert.ok(g.colX[0] <= 1 / g.k && g.colX[20] + g.brW >= W - 1 / g.k, `${where}: no room between the outer bricks and the walls`);
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

test('loop breaker: the paddle decides the angle; only the same hit three times in a row gets a small nudge', () => {
  const g = newGame();
  for (let i = 0; i < 2; i++) assert.equal(g.breakLoop(0.3, 100), 0.3, 'the first two identical hits are left alone');
  const nudged = g.breakLoop(0.3, 100);
  const deg = Math.abs(nudged - 0.3) * 180 / Math.PI;
  assert.ok(deg >= 2.8 && deg <= 5.8, `the third is nudged ${deg.toFixed(1)} degrees`);
  assert.equal(g.breakLoop(0.3, 100), 0.3, 'and then it starts counting again');
  // a moving paddle, or a different landing spot, is never touched
  const g2 = newGame();
  for (let i = 0; i < 20; i++) assert.equal(g2.breakLoop(0.3, 100 + i * 3), 0.3);
  for (let i = 0; i < 20; i++) assert.equal(g2.breakLoop(i % 2 ? 0.3 : -0.3, 100), i % 2 ? 0.3 : -0.3);
});

test('loop breaker: a hit at the end of the paddle always gives a steep bounce, however long since a brick broke', () => {
  const g = newGame();
  for (let i = 0; i < 10; i++) {
    g.playTime = 100;
    Object.assign(g.ball, { x: g.paddle.x + 31 + (i % 2) * 0.01, y: g.paddleY - 3, vx: 0, vy: g.speed });
    g.hitPaddle();
    const deg = Math.atan2(g.ball.vx, -g.ball.vy) * 180 / Math.PI;
    assert.ok(deg > 50, `${deg.toFixed(0)} degrees`);
  }
});

test('loop breaker: a paddle that always hits dead centre still clears every level', () => {
  for (let level = 0; level < 5; level++) {
    const g = newGame(level);
    g.launch();
    let t = 0;
    while (g.remaining > 0 && t < 7200) {
      g.paddle.x = Math.min(Math.max(g.ball.x, PW / 2), W - PW / 2);
      g.step(STEP);
      t += STEP;
    }
    assert.equal(g.remaining, 0, `level ${level + 1} not cleared after ${t.toFixed(0)}s`);
  }
});

test('drawing: a hit redraws only its cell, and every sprite the level needs is made before play', () => {
  const g = rowLevel([[4, BOMB], [5, TWO_HIT], [7, NORMAL]]);
  const keys = Object.keys(g.sprites);
  for (let h = 1; h <= 5; h++) assert.ok(keys.includes(`b${BOMB}.${h}.0`), `bomb with ${h} hits left is ready`);
  assert.ok(keys.some((k) => k.startsWith(`b${TWO_HIT}.1.`)), 'the cracked two-hit brick is ready');
  g.render(0);
  assert.equal(g.allBricks, false);
  hitAt(g, 7);
  assert.deepEqual(g.changed, [7]);
  g.render(0);
  assert.deepEqual(g.changed, [], 'drawn and cleared');
  assert.equal(Object.keys(g.sprites).length, keys.length, 'no sprite was made during play');
});

function wideLevel(n, cells) {
  const row = Array(21).fill(0);
  for (const [x, t] of cells) row[x] = t;
  setLevels([{ id: 1, speed: 270, grid: [row, Array(21).fill(0)], powerups: { wide: n, slow: 2 } }]);
}

test('power-ups: hidden in different breakable bricks, never unbreakable ones, the same for the same seed', () => {
  wideLevel(3, [[2, SOLID], [3, SOLID], [4, NORMAL], [5, TWO_HIT], [6, BOMB], [7, NORMAL]]);
  const placed = (seed) => { const g = new Game({ getContext: () => ctx, addEventListener() {}, width: 0, height: 0 }, {}); g.resize(0, 0); g.start(0, { seed }); return [...g.carry].join(''); };
  for (let s = 1; s < 30; s++) {
    const c = placed(s);
    assert.equal([...c].filter((x) => x === '1').length, 3, 'three wide pills, the unbuilt kinds are skipped');
    assert.ok(c[2] === '0' && c[3] === '0', 'never in an unbreakable brick');
    assert.equal(placed(s), c, 'the same seed gives the same places');
  }
  setLevels(TEST_LEVELS);
});

test('power-ups: the pill falls from the broken brick, the paddle catches it and grows, for a while', () => {
  wideLevel(1, [[10, NORMAL]]);
  const g = newGame(0);
  setLevels(TEST_LEVELS);
  hitAt(g, 10);
  assert.equal(g.pills.length, 1, 'a pill falls out');
  g.paddle.x = g.pills[0].x;
  g.ball.vx = 0; g.ball.vy = 0; g.ball.y = 100; // keep the ball out of the way
  let t = 0;
  while (g.pills.length && t < 20) { g.stepPowerups(STEP); t += STEP; }
  assert.ok(t > 5, `it falls slowly (${t.toFixed(1)} s)`);
  assert.ok(g.wideLeft > 0, 'caught');
  for (let i = 0; i < 60; i++) g.stepPowerups(STEP);
  assert.equal(g.pw, 96, 'wider after a moment');
  g.wideLeft = 0.01;
  for (let i = 0; i < 60; i++) g.stepPowerups(STEP);
  assert.equal(g.pw, PW, 'and back when the time is up');
  g.wideLeft = 10; g.pw = 96;
  g.loseBall();
  assert.equal(g.pw, PW, 'a lost ball ends it');
});

test('smooth motion: the ball is drawn between its last two physics positions', () => {
  const g = newGame();
  g.launch();
  g.last = 0;
  g.running = true;
  g.frame(1000 / 60 * 1.5); // a frame half-way between two steps
  const b = g.ball;
  assert.ok(Math.min(b.px, b.x) <= g.drawX && g.drawX <= Math.max(b.px, b.x));
  assert.ok(Math.min(b.py, b.y) <= g.drawY && g.drawY <= Math.max(b.py, b.y));
});

test('test play status: bricks left by type and power-ups left to find', () => {
  wideLevel(2, [[2, SOLID], [3, NORMAL], [4, TWO_HIT], [5, BOMB], [6, NORMAL]]);
  const g = newGame(0);
  setLevels(TEST_LEVELS);
  let s = g.status();
  assert.deepEqual(s.bricks, { normal: 2, twoHit: 1, cracked: 0, bomb: 1, solid: 1 });
  assert.equal(s.remaining, 4);
  assert.deepEqual(s.powerups.wide, { total: 2, built: true, hidden: 2, falling: 0 });
  assert.equal(s.powerups.slow.built, false, 'kinds the game does not have yet are reported, never hidden');
  hitAt(g, 4);
  assert.equal(g.status().bricks.cracked, 1);
  for (const x of [3, 4, 6]) if (g.type[x]) hitAt(g, x);
  for (const x of [3, 4, 6]) if (g.type[x]) hitAt(g, x);
  s = g.status();
  assert.equal(s.powerups.wide.hidden, [...g.carry].filter(Boolean).length);
  assert.equal(s.powerups.wide.falling, g.pills.length);
});
