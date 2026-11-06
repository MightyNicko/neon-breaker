// Simulation bot: plays every level without a screen, with all power-ups hidden in it, and checks the physics after
// every step (ball inside a brick, outside the field, wrong speed, stuck, wrong brick count ...). Never writes files.
// Besides the levels in levels/ it plays three test boards of its own (A, B, C) with every brick type, bomb chains,
// pockets of unbreakable bricks and a ball at the top speed, so the mechanics are tried even if no level uses them.
// Usage: node tools/sim.mjs [runs per board] [--plain] [--only 3|A] [--seed N]
//   --plain: the levels as they are, without the extra power-ups   --only: one board   --seed: replay one run
// Each run has its own seed; a reported problem names board and seed, and --only and --seed replay that exact run.
import { readFileSync } from 'node:fs';
import { run, time, LIMIT, ROOT as root, levelsModule } from './bot.mjs';
const { loadLevels, setLevels, parseLevel, COLS } = levelsModule;
const args = process.argv.slice(2), opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : undefined; };
const PLAIN = args.includes('--plain'), ONLY = opt('--only'), SEED = opt('--seed');
const RUNS = Number(args.find((a, i) => /^\d+$/.test(a) && !['--only', '--seed'].includes(args[i - 1])) || 10);
const STRESS = { wide: 2, multi: 3, floor: 2, slow: 2, fast: 2, small: 2, fire: 2, gun: 3 };
const real = await loadLevels((p) => readFileSync(root + '/' + p, 'utf8'));
// the test boards: fn(x, y) gives the character for each cell, as in the level files
const board = (name, speed, fn) => ({ name, level: parseLevel(JSON.stringify({ format: 1, id: 900 + name.charCodeAt(0), speed,
  grid: Array.from({ length: 25 }, (_, y) => Array.from({ length: COLS }, (_, x) => fn(x, y) || '.').join('')) })) });
const TEST_BOARDS = [
  // A: every brick type mixed, with single unbreakable bricks between them
  board('A', 300, (x, y) => y >= 12 ? '' : x % 5 === 0 && y % 3 === 0 ? 'X' : (x + y) % 11 === 0 ? 'B' : '1123abc'[(x + 2 * y) % 7]),
  // B: a block of bombs in an unbreakable box that is open at the bottom, so the blasts chain and break the box
  board('B', 270, (x, y) => y < 2 || y > 12 || x < 2 || x > 18 ? '' : (x === 2 || x === 18 || y === 2) ? 'X' : y === 12 ? '' : (x + y) % 3 ? 'a' : (x + y) % 2 ? 'b' : '3'),
  // C: unbreakable shelves with narrow gaps, bricks down to the last row near the paddle, and the top speed
  board('C', 450, (x, y) => y % 6 === 5 ? (Math.abs(x - (y % 12 === 5 ? 4 : 16)) <= 1 ? '' : 'X') : y >= 21 ? '1' : (x + y) % 4 === 0 ? '2' : (x * y) % 7 === 1 ? '3' : ''),
];
const boards = [...real.map((l) => ({ name: String(l.id), level: l })), ...TEST_BOARDS]
  .map((b) => ({ ...b, level: { ...b.level, powerups: PLAIN && b.level.id < 900 ? b.level.powerups : { ...STRESS } } }));
setLevels(boards.map((b) => b.level));

let failed = 0, played = 0;
for (let li = 0; li < boards.length; li++) {
  const name = boards[li].name;
  if (ONLY && ONLY !== name) continue;
  const res = [];
  const seeds = SEED ? [Number(SEED) >>> 0] : Array.from({ length: RUNS }, (_, k) => (boards[li].level.id * 7919 + k * 104729) >>> 0);
  for (const seed of seeds) res.push({ seed, ...run(li, seed, { maxIssues: SEED ? 30 : 5 }) });
  const done = res.filter((r) => r.done), caught = {};
  for (const r of res) for (const [k, n] of Object.entries(r.caught)) caught[k] = (caught[k] || 0) + n;
  const times = done.map((r) => r.t), avg = times.reduce((a, b) => a + b, 0) / (times.length || 1);
  const lines = [`${/^[A-Z]$/.test(name) ? 'test board' : 'level'} ${name}: cleared ${done.length}/${res.length}`];
  if (done.length) lines.push(`average ${time(avg)}, fastest ${time(Math.min(...times))}, slowest ${time(Math.max(...times))}`);
  if (done.length < res.length) lines.push(`not cleared ${res.length - done.length} (stopped at ${time(LIMIT)})`);
  lines.push(`misses ${res.reduce((a, r) => a + r.misses, 0)}`, `most balls ${Math.max(...res.map((r) => r.maxBalls))}`,
    `longest wait ${time(Math.max(...res.map((r) => r.gap)))}`,
    `caught ${Object.entries(caught).map(([k, n]) => `${k} ${n}`).join(', ') || 'nothing'}`);
  const problems = res.flatMap((r) => r.issues.map((i) => `PROBLEM seed ${r.seed} at ${time(i.t)}: ${i.what}   (replay: --only ${name} --seed ${r.seed})`));
  lines.push(...(problems.length ? problems : ['no problems found']));
  console.log(lines.join('\n') + '\n');
  failed += problems.length; played++;
}
console.log(failed ? `${failed} problems found` : played === 1 ? "no problems found" : `all ${played} boards: no problems found`);
process.exit(failed ? 1 : 0);
