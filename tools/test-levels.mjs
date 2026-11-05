// Tests every level file and writes the result into its "test" field, in the editor's own format.
// Checks: every breakable brick can be reached, power-ups fit, and a bot plays the level many times on an iPhone 15.
// Usage: node tools/test-levels.mjs [runs per level] [date]   (defaults: 30 runs, today)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : () => ctx), set: (t, k, v) => { t[k] = v; return true; } });
globalThis.window = { innerWidth: 393, innerHeight: 852, devicePixelRatio: 1 };
globalThis.requestAnimationFrame = () => 0; globalThis.cancelAnimationFrame = () => {};
globalThis.document = { createElement: () => ({ getContext: () => ctx, width: 0, height: 0 }) };
const root = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]+$/, '');
const RUNS = Number(process.argv[2] || 30), LIMIT = 900, DATE = process.argv[3] || new Date().toISOString().slice(0, 10);
const E = createRequire(import.meta.url)(root + '/editor/core.js');
const { Game, W } = await import('file:///' + root + '/src/game/game.js');
const { loadLevels } = await import('file:///' + root + '/src/game/levels.js');
const levels = await loadLevels((p) => readFileSync(root + '/' + p, 'utf8'));
const STEP = 1 / 120, PW = 64;
const mmss = (sec) => { const s = Math.round(sec); return s >= 60 ? `${Math.floor(s / 60)} min ${s % 60} s` : `${s} s`; };

// A breakable brick can be reached if a path that avoids unbreakable bricks leads to it from the open space
// below the grid. Other breakable bricks do not block, since they break on the way.
function unreachable(cells) {
  const seen = new Set(), stack = [];
  for (let x = 0; x < E.COLS; x++) { const i = E.idx(x, E.ROWS - 1); if (cells[i] !== E.SOLID) { seen.add(i); stack.push([x, E.ROWS - 1]); } }
  while (stack.length) {
    const [x, y] = stack.pop();
    for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
      const i = E.idx(nx, ny);
      if (E.inside(nx, ny) && cells[i] !== E.SOLID && !seen.has(i)) { seen.add(i); stack.push([nx, ny]); }
    }
  }
  let n = 0;
  for (let i = 0; i < cells.length; i++) if (cells[i] && cells[i] !== E.SOLID && !seen.has(i)) n++;
  return n;
}

for (let li = 0; li < levels.length; li++) {
  const id = levels[li].id, path = `${root}/levels/${E.fileName(id)}`;
  const level = E.fromFile(readFileSync(path, 'utf8')), st = E.stats(level.cells);
  const runs = [];
  for (let run = 0; run < RUNS; run++) {
    const g = new Game({ getContext: () => ctx, addEventListener() {}, width: 0, height: 0 }, { onEnd() {} });
    g.resize(59, 34); g.start(li); g.launch();
    let t = 0, last = 0, rem = g.remaining, worst = 0, offset = 0, prevVy = 0;
    while (g.remaining > 0 && t < LIMIT) {
      if (g.state === 'ready') g.launch();
      const b = g.ball;
      if (prevVy < 0 && b.vy > 0) offset = (Math.random() - 0.5) * PW * 0.8;
      prevVy = b.vy;
      g.paddle.x = Math.min(Math.max(b.x - offset, PW / 2), W - PW / 2);
      g.balls = 3; g.step(STEP); t += STEP;
      if (g.remaining < rem) { rem = g.remaining; worst = Math.max(worst, t - last); last = t; }
    }
    runs.push({ done: g.remaining === 0, t, worst: g.remaining ? Math.max(worst, t - last) : worst });
  }
  const done = runs.filter((r) => r.done), share = done.length / RUNS;
  const avg = done.reduce((a, r) => a + r.t, 0) / (done.length || 1), gap = Math.max(...runs.map((r) => r.worst));
  const blocked = unreachable(level.cells), pus = Object.values(level.powerups).reduce((a, b) => a + b, 0);
  const playable = blocked === 0 && share >= 0.8;
  // difficulty from how long the bot needs, one step up for a fast ball
  let difficulty = !playable ? 5 : avg < 120 ? 1 : avg < 180 ? 2 : avg < 240 ? 3 : avg < 300 ? 4 : 5;
  if (playable && level.speed >= 300 && difficulty < 5) difficulty++;
  const notes = [];
  if (blocked) notes.push(`${blocked} brick${blocked === 1 ? ' is' : 's are'} closed in by unbreakable bricks and cannot be reached.`);
  if (!playable && !blocked) notes.push(`Practically impossible: the bot cleared it in ${done.length} of ${RUNS} tries within ${LIMIT / 60} minutes.`);
  if (pus > st.carriers) notes.push(`${pus} power-ups but only ${st.carriers} bricks that can carry them.`);
  if (playable && gap > 30) notes.push(`Long waits between bricks: up to ${Math.round(gap)} s.`);
  level.test = {
    date: DATE, playable, difficulty, notes,
    bot: { runs: RUNS, cleared: done.length, averageSeconds: Math.round(avg), longestGapSeconds: Math.round(gap) },
  };
  if (playable) notes.push(`Bot: cleared ${done.length} of ${RUNS}, ${mmss(avg)} on average.`);
  writeFileSync(path, E.toFile(level));
  console.log(`level ${id}: playable ${playable}, difficulty ${difficulty}, cleared ${done.length}/${RUNS}, avg ${mmss(avg)}, longest gap ${Math.round(gap)} s, unreachable ${blocked}`);
}
