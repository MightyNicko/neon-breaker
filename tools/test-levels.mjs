// Tests every level file and writes the result into its "test" field, in the editor's own format.
// Checks: every breakable brick can be reached, power-ups fit, and the bot of tools/bot.mjs plays the level many times
// on an iPhone 15 with its own power-ups; it also reports any physics problem it finds.
// Usage: node tools/test-levels.mjs [runs per level] [date]   (defaults: 30 runs, today)
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { run, time, ROOT as root, levelsModule } from './bot.mjs';
const RUNS = Number(process.argv[2] || 30), LIMIT = 900, DATE = process.argv[3] || new Date().toISOString().slice(0, 10);
const SCREEN = [393, 852]; // iPhone 15
const E = createRequire(import.meta.url)(root + '/editor/core.js');
const levels = await levelsModule.loadLevels((p) => readFileSync(root + '/' + p, 'utf8'));
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
  // the bot of tools/bot.mjs, with the level's own power-ups; the seeds are fixed, so the same level gives the same result
  const runs = Array.from({ length: RUNS }, (_, k) => { const seed = (id * 7919 + k * 104729) >>> 0; return { seed, ...run(li, seed, { limit: LIMIT, screen: SCREEN }) }; });
  const done = runs.filter((r) => r.done), share = done.length / RUNS;
  const fastest = done.length ? Math.min(...done.map((r) => r.t)) : 0, slowest = done.length ? Math.max(...done.map((r) => r.t)) : 0;
  const avg = done.reduce((a, r) => a + r.t, 0) / (done.length || 1), gap = Math.max(...runs.map((r) => r.gap));
  const misses = runs.reduce((a, r) => a + r.misses, 0), mostBalls = Math.max(...runs.map((r) => r.maxBalls));
  const problems = runs.flatMap((r) => r.issues.map((i) => `${i.what} (seed ${r.seed} at ${time(i.t)})`));
  // a ticked chance can add one more, so count it in the check against the bricks that can carry power-ups
  const blocked = unreachable(level.cells);
  const pus = Object.values(level.powerups).reduce((a, b) => a + b, 0) + Object.values(level.chances || {}).filter((n) => n > 0).length;
  const playable = blocked === 0 && share >= 0.8;
  // difficulty from how long the bot needs, one step up for a fast ball
  let difficulty = !playable ? 5 : avg < 120 ? 1 : avg < 180 ? 2 : avg < 240 ? 3 : avg < 300 ? 4 : 5;
  if (playable && level.speed >= 300 && difficulty < 5) difficulty++;
  const notes = [];
  if (blocked) notes.push(`${blocked} brick${blocked === 1 ? ' is' : 's are'} closed in by unbreakable bricks and cannot be reached.`);
  if (!playable && !blocked) notes.push(`${done.length ? 'Too hard' : 'Practically impossible'}: the bot cleared it in ${done.length} of ${RUNS} tries within ${LIMIT / 60} minutes.`);
  if (pus > st.carriers) notes.push(`${pus} power-ups but only ${st.carriers} bricks that can carry them.`);
  if (playable && gap > 30) notes.push(`Long waits between bricks: up to ${Math.round(gap)} s.`);
  if (problems.length) notes.push(`Physics problems found by the bot (${problems.length}): ${problems.slice(0, 3).join('; ')}. Replay with node tools/sim.mjs --plain --only ${id} --seed N.`);
  level.test = {
    date: DATE, playable, difficulty, notes,
    bot: { runs: RUNS, cleared: done.length, fastestSeconds: Math.round(fastest), averageSeconds: Math.round(avg), slowestSeconds: Math.round(slowest), longestGapSeconds: Math.round(gap),
      notCleared: RUNS - done.length, limitSeconds: LIMIT, misses, mostBalls, problems: problems.length },
  };
  if (playable) notes.push(`Bot: cleared ${done.length} of ${RUNS}. Fastest ${mmss(fastest)}, average ${mmss(avg)}, slowest ${mmss(slowest)}.`);
  writeFileSync(path, E.toFile(level));
  console.log([`level ${id}: cleared ${done.length}/${RUNS}, playable ${playable}, difficulty ${difficulty}`,
    ...(done.length ? [`average ${time(avg)}, fastest ${time(fastest)}, slowest ${time(slowest)}`] : []),
    ...(done.length < RUNS ? [`not cleared ${RUNS - done.length} (stopped at ${time(LIMIT)})`] : []),
    `misses ${misses}`, `most balls ${mostBalls}`, `longest wait ${time(gap)}`, `unreachable bricks ${blocked}`,
    problems.length ? `${problems.length} physics problems` : 'no problems found'].join('\n') + '\n');
}
