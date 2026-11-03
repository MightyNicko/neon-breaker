import test from 'node:test';
import assert from 'node:assert/strict';
import { LEVELS, COLS, countBricks } from '../src/game/levels.js';
import * as lives from '../src/core/lives.js';
import { sanitize, defaults, MAX_LIVES } from '../src/core/storage.js';

test('levels: 21 columns, only # and ., at least one brick, speeds increase', () => {
  let prev = 0;
  for (const l of LEVELS) {
    assert.ok(l.grid.length > 0 && l.grid.length <= 20);
    for (const row of l.grid) { assert.equal(row.length, COLS); assert.match(row, /^[#.]+$/); }
    assert.ok(countBricks(l) > 0);
    assert.ok(l.speed > prev); prev = l.speed;
  }
  assert.equal(LEVELS.length, 5);
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
