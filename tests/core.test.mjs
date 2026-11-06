import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLevels, parseLevel, COLS, ROWS, SOLID, countBricks } from '../src/game/levels.js';
import * as cores from '../src/core/cores.js';
import { sanitize, defaults, MAX_CORES } from '../src/core/storage.js';

test('levels: every file in levels/ loads, in number order, with something to break', async () => {
  const read = (p) => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  const levels = await loadLevels(read);
  const index = JSON.parse(read('levels/index.json')).levels;
  assert.ok(levels.length > 0);
  assert.deepEqual(levels.map((l) => l.id), [...index].sort((a, b) => a - b));
  for (const l of levels) {
    assert.ok(l.grid.length <= ROWS);
    for (const row of l.grid) assert.equal(row.length, COLS);
    assert.ok(countBricks(l) > 0, `level ${l.id} has a brick to break`);
  }
});

test('levels: bad files are refused, unbreakable bricks are not counted', () => {
  const ok = { format: 1, id: 3, speed: 270, grid: ['.'.repeat(20) + '1', 'X'.repeat(21)], powerups: { wide: 2 } };
  const l = parseLevel(JSON.stringify(ok));
  assert.equal(l.grid[1][0], SOLID);
  assert.equal(countBricks(l), 1);
  assert.deepEqual(l.powerups, { wide: 2 });
  const bad = (change) => assert.throws(() => parseLevel(JSON.stringify({ ...ok, ...change })));
  bad({ format: 2 });
  bad({ id: 0 });
  bad({ grid: Array(26).fill('.'.repeat(21)) });
  bad({ grid: ['.'.repeat(20)] });
  bad({ grid: ['#'.repeat(21)] });
});

test('cores: regenerate one per 20 minutes and stop at max', () => {
  const t0 = 1_000_000;
  const s = { ...defaults() };
  cores.spendCore(s, t0); cores.spendCore(s, t0);
  assert.equal(s.cores, MAX_CORES - 2);
  cores.refresh(s, t0 + cores.REGEN_MS - 1); assert.equal(s.cores, MAX_CORES - 2);
  cores.refresh(s, t0 + cores.REGEN_MS); assert.equal(s.cores, MAX_CORES - 1);
  cores.refresh(s, t0 + 10 * cores.REGEN_MS); assert.equal(s.cores, MAX_CORES); assert.equal(s.coreTs, null);
});

test('cores: cannot go below zero, clock moving backwards does not grant Cores', () => {
  const s = { ...defaults() }; const t0 = 5_000_000;
  for (let i = 0; i < 8; i++) cores.spendCore(s, t0);
  assert.equal(s.cores, 0);
  cores.refresh(s, t0 - 10 * cores.REGEN_MS); assert.equal(s.cores, 0);
  cores.addCore(s, t0 - 10 * cores.REGEN_MS); assert.equal(s.cores, 1);
});

test('storage: garbage input is sanitised', () => {
  const d = sanitize({ cores: 99, coreTs: 'x', unlocked: -4, lang: '<script>' }, 6, ['en', 'sv']);
  assert.equal(d.cores, MAX_CORES); assert.equal(d.coreTs, null); assert.equal(d.unlocked, 1); assert.equal(d.lang, null);
  assert.deepEqual(sanitize(null, 6, ['en']).cores, MAX_CORES);
  assert.equal(sanitize({ cores: 2, coreTs: 123, unlocked: 3, lang: 'sv' }, 6, ['en', 'sv']).lang, 'sv');
});

test('storage: a saved game from before Cores keeps its lives as Cores', () => {
  const d = sanitize({ lives: 2, lifeTs: 123, dev: { on: true, infiniteLives: true } }, 6, ['en']);
  assert.equal(d.cores, 2); assert.equal(d.coreTs, 123);
  assert.equal(d.dev.infiniteCores, true);
});

test('storage: developer mode is off by default and only takes true/false', () => {
  assert.equal(defaults().dev.on, false);
  const d = sanitize({ dev: { on: true, perf: 'yes', seed: true, unlockAll: 1, hack: true } }, 6, ['en']);
  assert.deepEqual(d.dev, { on: true, perf: false, seed: true, unlockAll: false, infiniteCores: false });
});
