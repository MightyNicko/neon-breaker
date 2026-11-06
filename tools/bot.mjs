// The bot shared by tools/sim.mjs and tools/test-levels.mjs: plays a level without a screen, the way a quick player
// would, and checks the physics after every step. run() plays one start; the same seed always plays the same game.
// The bot goes for the ball that reaches the paddle first, aims at a random spot on the paddle so the bounce angles
// vary, moves the paddle at most 900 points a second, catches falling power-ups when it has time, and now and
// then misses on purpose so the miss and "continue" path runs too.
import { fileURLToPath } from 'node:url';
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.window = { innerWidth: 393, innerHeight: 852, devicePixelRatio: 1 };
globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const { Game, W } = await import('file:///' + root + '/src/game/game.js');
export const levelsModule = await import('file:///' + root + '/src/game/levels.js');
const { COLS, SOLID, isBomb } = levelsModule;
const { KINDS, MAX_BALLS } = await import('file:///' + root + '/src/game/powerups.js');
export { Game, W, KINDS };
export const ROOT = root;
const STEP = 1 / 120, R = 4, CELL = 16, EPS = 0.5, MAXV = 900;
export const LIMIT = 600; // seconds a run may take before the bot gives up
export const SCREENS = [[393, 852], [375, 667], [430, 932], [820, 1180]]; // iPhone 15, SE, 15 Pro Max, iPad Air

const mulberry = (a) => () => { a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
const reflect = (x) => { const span = W - 2 * R, p = ((x - R) % (2 * span) + 2 * span) % (2 * span); return R + (p > span ? 2 * span - p : p); };

export function run(li, seed, { limit = LIMIT, screen = null, maxIssues = 5 } = {}) {
  const rnd = mulberry(seed ^ 0x9e3779b9), realRandom = Math.random;
  Math.random = mulberry(seed);
  const [w, h] = screen || SCREENS[seed % SCREENS.length];
  window.innerWidth = w; window.innerHeight = h;
  const issues = [], caught = {};
  const g = new Game({ getContext: () => ctx, addEventListener() {}, width: 0, height: 0 }, { onEnd() {} });
  g.resize(59, 34); g.start(li, { seed }); g.launch();
  const apply = g.applyPowerup.bind(g);
  g.applyPowerup = (kind, x) => { caught[kind.key] = (caught[kind.key] || 0) + 1; apply(kind, x); };
  const breakIt = g.breakBrick.bind(g);
  g.breakBrick = (i, ball, blast) => {
    if (isBomb(g.type[i])) caught.bomb = (caught.bomb || 0) + 1;
    if (blast && isBomb(g.type[i])) caught.chain = (caught.chain || 0) + 1;
    if (ball && !blast && g.effects.fire) caught.burnt = (caught.burnt || 0) + 1;
    return breakIt(i, ball, blast);
  };
  const bad = (what, t) => { if (issues.length < maxIssues) issues.push({ what, t: Math.round(t * 10) / 10 }); };
  let t = 0, lastChange = 0, rem = g.remaining, maxBalls = 1, morphT = 0, gap = 0;
  while (g.remaining > 0 && t < limit) {
    if (g.state === 'missed') g.continueBall();
    if (g.state === 'ready') g.launch();
    // the bot: go for the ball that reaches the paddle first, otherwise for a falling power-up
    let best = null, bestT = Infinity;
    for (const b of g.balls) { if (b.vy <= 0) continue; const bt = (g.paddleY - R - b.y) / b.vy; if (bt >= 0 && bt < bestT) { bestT = bt; best = b; } }
    // each ball gets its aim when it starts to fall: a random spot on the paddle, so the bounce angles vary,
    // and now and then a spot just past the edge, so the miss and "continue" path runs too
    for (const b of g.balls) {
      if (b.vy > 0 && !(b.lastVy > 0)) b.aim = rnd() < 0.03 ? g.pw / 2 + R + 2 : (rnd() - 0.5) * g.pw * 0.8;
      b.lastVy = b.vy;
    }
    let target = best ? reflect(best.x + best.vx * bestT) - (best.aim || 0) : W / 2;
    if (bestT > 0.7) {
      const pill = g.pills.reduce((a, p) => (!a || p.y > a.y ? p : a), null);
      if (pill) target = pill.x;
    }
    const d = Math.max(-MAXV * STEP, Math.min(MAXV * STEP, target - g.paddle.x));
    g.paddle.x += d; g.clampPaddle();
    g.step(STEP); t += STEP;
    if (g.remaining !== rem || g.changed.length) { rem = g.remaining; lastChange = t; g.changed.length = 0; }
    if (g.state !== 'playing') continue;
    // checks
    const ceiling = g.safe.top + 48 + R;
    maxBalls = Math.max(maxBalls, g.balls.length);
    if (g.balls.length > MAX_BALLS) bad(`${g.balls.length} balls`, t);
    for (const b of g.balls) {
      if (![b.x, b.y, b.vx, b.vy].every(Number.isFinite)) { bad('ball position or speed is not a number', t); continue; }
      if (b.x < R - EPS || b.x > W - R + EPS) bad(`ball outside the side walls (x ${b.x.toFixed(1)})`, t);
      if (b.y < ceiling - EPS) bad(`ball above the ceiling (y ${b.y.toFixed(1)})`, t);
      const v = Math.hypot(b.vx, b.vy);
      if (Math.abs(v - g.speed) > g.speed * 0.02) bad(`ball speed ${v.toFixed(0)}, should be ${g.speed.toFixed(0)}`, t);
      const c0 = Math.max(0, Math.floor(b.x / CELL) - 2), c1 = Math.min(COLS - 1, Math.floor(b.x / CELL) + 2);
      const r0 = Math.max(0, Math.floor((b.y - g.gy) / CELL) - 2), r1 = Math.min(g.rows - 1, Math.floor((b.y - g.gy) / CELL) + 2);
      for (let r = r0; r <= r1; r++) for (let c = c0; c <= c1; c++) {
        if (!g.type[r * COLS + c]) continue;
        const rx = g.colX[c], ry = g.rowY0 + r * CELL;
        const dx = b.x - Math.max(rx, Math.min(b.x, rx + g.brW)), dy = b.y - Math.max(ry, Math.min(b.y, ry + g.brW));
        if (Math.hypot(dx, dy) < R - EPS) bad(`ball inside ${g.type[r * COLS + c] === SOLID ? 'an unbreakable' : 'a'} brick (row ${r + 1}, column ${c + 1})`, t);
      }
    }
    for (const s of g.shots) for (let r = 0; r < g.rows; r++) for (let c = 0; c < COLS; c++) {
      if (g.type[r * COLS + c] && s.x > g.colX[c] + 1 && s.x < g.colX[c] + g.brW - 1 && s.y > g.rowY0 + r * CELL + 3 && s.y < g.rowY0 + r * CELL + g.brW - 3) bad('a shot went into a brick', t);
    }
    let count = 0; for (let i = 0; i < g.type.length; i++) if (g.type[i] && g.type[i] !== SOLID) count++;
    if (count !== g.remaining) bad(`brick count ${g.remaining}, but ${count} bricks are left`, t);
    const groups = Object.keys(g.effects).map((k) => KINDS[k]?.group).filter(Boolean);
    if (new Set(groups).size !== groups.length) bad(`clashing power-ups at once: ${Object.keys(g.effects).join(', ')}`, t);
    morphT = g.morph ? morphT + STEP : 0;
    if (morphT > 1) bad('the paddle is stuck turning into the cannon', t);
    if (!g.morph && (g.pw < 43.9 || g.pw > 96.1)) bad(`paddle width ${g.pw.toFixed(1)}`, t);
    gap = Math.max(gap, t - lastChange); // a long wait is no error (a maze can take time), so it is only reported
  }
  Math.random = realRandom;
  return { done: g.remaining === 0, t, misses: g.misses, issues, caught, maxBalls, gap };
}

// 203 -> "3m 23s", 600 -> "10m", 45 -> "45s"
export const time = (sec) => { const n = Math.round(sec), m = Math.floor(n / 60), r = n % 60; return m ? (r ? `${m}m ${r}s` : `${m}m`) : `${r}s`; };
