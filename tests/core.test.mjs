import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { loadLevels, parseLevel, COLS, ROWS, SOLID, countBricks } from '../src/game/levels.js';
import * as lives from '../src/core/lives.js';
import { sanitize, defaults, MAX_LIVES } from '../src/core/storage.js';

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

test('lives: regenerate one per 20 minutes and stop at max', () => {
  const t0 = 1_000_000;
  const s = { ...defaults() };
  lives.loseLife(s, t0); lives.loseLife(s, t0);
  assert.equal(s.lives, MAX_LIVES - 2);
  lives.refresh(s, t0 + lives.REGEN_MS - 1); assert.equal(s.lives, MAX_LIVES - 2);
  lives.refresh(s, t0 + lives.REGEN_MS); assert.equal(s.lives, MAX_LIVES - 1);
  lives.refresh(s, t0 + 10 * lives.REGEN_MS); assert.equal(s.lives, MAX_LIVES); assert.equal(s.lifeTs, null);
});

test('lives: cannot go below zero, clock moving backwards does not grant lives', () => {
  const s = { ...defaults() }; const t0 = 5_000_000;
  for (let i = 0; i < 8; i++) lives.loseLife(s, t0);
  assert.equal(s.lives, 0);
  lives.refresh(s, t0 - 10 * lives.REGEN_MS); assert.equal(s.lives, 0);
  lives.addLife(s, t0 - 10 * lives.REGEN_MS); assert.equal(s.lives, 1);
});

test('storage: garbage input is sanitised', () => {
  const d = sanitize({ lives: 99, lifeTs: 'x', unlocked: -4, lang: '<script>' }, 6, ['en', 'sv']);
  assert.equal(d.lives, MAX_LIVES); assert.equal(d.lifeTs, null); assert.equal(d.unlocked, 1); assert.equal(d.lang, null);
  assert.deepEqual(sanitize(null, 6, ['en']).lives, MAX_LIVES);
  assert.equal(sanitize({ lives: 2, lifeTs: 123, unlocked: 3, lang: 'sv' }, 6, ['en', 'sv']).lang, 'sv');
});

test('storage: developer mode is off by default and only takes true/false', () => {
  assert.equal(defaults().dev.on, false);
  const d = sanitize({ dev: { on: true, perf: 'yes', seed: true, unlockAll: 1, hack: true } }, 6, ['en']);
  assert.deepEqual(d.dev, { on: true, perf: false, seed: true, unlockAll: false, infiniteLives: false });
});
