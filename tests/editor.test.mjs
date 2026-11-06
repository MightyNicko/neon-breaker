// The level editor's core: file format, drawing operations and the game layout it previews.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync, readdirSync } from 'node:fs';

const C = createRequire(import.meta.url)('../editor/core.js');
const levelsDir = new URL('../levels/', import.meta.url);

test('format: a level survives save and load, with every brick type and power-up', () => {
  const l = C.newLevel(7);
  l.speed = 285;
  l.cells = C.paint(l.cells, [[0, 0], [20, 0], [10, 5], [3, 22]], C.NORMAL);
  l.cells = C.paint(l.cells, [[1, 1]], C.TWO_HIT);
  l.cells = C.paint(l.cells, [[2, 2]], C.SOLID);
  l.cells = C.paint(l.cells, [[4, 4]], C.BOMB);
  l.cells = C.paint(l.cells, [[5, 4]], C.BOMB1); l.cells = C.paint(l.cells, [[6, 4]], C.BOMB2); l.cells = C.paint(l.cells, [[7, 4]], C.BOMB3);
  l.powerups.wide = 2; l.powerups.fast = 1; l.chances.multi = 10;
  const text = C.toFile(l), back = C.fromFile(text);
  assert.deepEqual(back.cells, l.cells);
  assert.equal(back.speed, 285);
  assert.deepEqual(back.powerups, l.powerups);
  assert.deepEqual(back.chances, { multi: 10 }, 'the chance survives a save and load');
  const f = JSON.parse(text);
  assert.equal(f.format, C.FORMAT);
  assert.equal(f.zone, 1);
  assert.equal(f.grid.length, 23, 'stores rows down to the last brick');
  assert.equal(f.grid[2], '..X..................');
  assert.equal(f.test, null);
});

test('format: empty rows at the bottom are not stored, rows at the top are', () => {
  const l = C.newLevel(1);
  l.cells = C.paint(l.cells, [[5, 3]], C.NORMAL);
  assert.equal(JSON.parse(C.toFile(l)).grid.length, 4);
  assert.equal(C.usedRows(C.newLevel(1).cells), 0);
});

test('format: bad files are refused with a message', () => {
  const ok = JSON.parse(C.toFile(C.newLevel(3)));
  const bad = (change, re) => assert.throws(() => C.fromFile(JSON.stringify({ ...ok, ...change })), re);
  assert.throws(() => C.fromFile('not json'), /JSON/);
  bad({ format: C.FORMAT + 1 }, /Update the editor/);
  bad({ id: 0 }, /level number/);
  bad({ grid: Array(26).fill('.'.repeat(21)) }, /at most 25/);
  bad({ grid: ['....'] }, /21 characters/);
  bad({ grid: ['#'.repeat(21)] }, /Unknown character/);
});

test('format: out-of-range numbers are clamped or ignored, the test result is kept', () => {
  const f = JSON.parse(C.toFile(C.newLevel(2)));
  f.speed = 9999; f.powerups.wide = -3; f.powerups.multi = 4; f.test = { playable: true, difficulty: 3 };
  const l = C.fromFile(JSON.stringify(f));
  assert.equal(l.speed, C.SPEED.max);
  assert.equal(l.powerups.wide, 0);
  assert.equal(l.powerups.multi, 4);
  assert.deepEqual(l.test, { playable: true, difficulty: 3 });
});

test('the converted levels in levels/ load and match the index', () => {
  const files = readdirSync(levelsDir).filter((n) => /^level-\d{3}\.json$/.test(n));
  assert.ok(files.length >= 1);
  const ids = files.map((n) => {
    const text = readFileSync(new URL(n, levelsDir), 'utf8'), l = C.fromFile(text);
    assert.equal(n, C.fileName(l.id));
    assert.equal(C.toFile(l), text.replace(/\r\n/g, '\n'), `${n} is written exactly as the editor writes it`);
    assert.ok(C.stats(l.cells).total > 0);
    return l.id;
  });
  const index = JSON.parse(readFileSync(new URL('index.json', levelsDir), 'utf8'));
  assert.deepEqual(index.levels, ids.sort((a, b) => a - b));
});

test('drawing: line, rectangle, mirror, fill and shift', () => {
  assert.deepEqual(C.line(0, 0, 3, 1), [[0, 0], [1, 0], [2, 1], [3, 1]]);
  assert.equal(C.rect(2, 2, 4, 3).length, 6);
  assert.deepEqual(C.withMirror([[0, 5], [10, 5]], true), [[0, 5], [10, 5], [20, 5]], 'the middle column is not doubled');
  let cells = C.paint(C.newLevel(1).cells, C.rect(0, 0, 20, 0), C.SOLID);
  assert.equal(C.fillArea(cells, 5, 5).length, 21 * (C.ROWS - 1), 'fill stops at the wall of solid bricks');
  assert.equal(C.fillArea(cells, 0, 0).length, 21);
  cells = C.paint(C.newLevel(1).cells, [[0, 0], [20, 22]], C.NORMAL);
  const moved = C.shift(cells, 1, 1);
  assert.equal(moved[C.idx(1, 1)], C.NORMAL);
  assert.equal(C.stats(moved).total, 1, 'the brick pushed off the grid is dropped');
});

test('stats: counts per type and the bricks that can carry power-ups', () => {
  let cells = C.newLevel(1).cells;
  cells = C.paint(cells, [[0, 0], [1, 0]], C.NORMAL);
  cells = C.paint(cells, [[2, 0]], C.TWO_HIT);
  cells = C.paint(cells, [[3, 0]], C.SOLID);
  cells = C.paint(cells, [[4, 0]], C.BOMB);
  assert.deepEqual(C.stats(cells), { normal: 2, twoHit: 1, solid: 1, bomb: 1, total: 5, carriers: 4 });
});

test('preview layout: row 1 has a fixed place against the ceiling, and 25 full rows still leave room to play', () => {
  const L = C.gameLayout(C.IPHONE_15);
  assert.equal(L.ceiling, L.gy, 'the top row lies against the ceiling');
  assert.equal(C.ROWS, 25);
  const free = (l) => l.paddleY - (l.gy + C.ROWS * 16);
  assert.ok(free(L) * L.s > 120, `${Math.round(free(L) * L.s)} points between a full grid and the paddle`);
  const se = C.gameLayout({ w: 375, h: 667, safeTop: 20, safeBottom: 0 });
  assert.ok(free(se) > 0, 'a full grid still ends above the paddle on an iPhone SE');
});
