// Level editor core: the level file format and the drawing operations, without any DOM.
// A classic script (not a module) so the editor also works when opened straight from disk;
// in Node it is loaded with require() for the tests.
(function (root) {
  'use strict';

  const FORMAT = 1;                 // bump when the file format changes; older editors refuse newer files
  const COLS = 21, ROWS = 25, ZONE_SIZE = 20;
  // cell types and how they are written in the file
  // bombs blow after 1, 2, 3 or 5 hits: 'a', 'b', 'c', 'B' in the file
  const EMPTY = 0, NORMAL = 1, TWO_HIT = 2, SOLID = 3, BOMB = 4, BOMB1 = 5, BOMB2 = 6, BOMB3 = 7;
  const CHARS = ['.', '1', '2', 'X', 'B', 'a', 'b', 'c'];
  const HITS = [0, 1, 2, 0, 5, 1, 2, 3];
  const isBomb = (t) => t === BOMB || t === BOMB1 || t === BOMB2 || t === BOMB3;
  const TYPES = [
    { t: NORMAL, name: 'Normal', key: '1' },
    { t: TWO_HIT, name: '2 hits', key: '2' },
    { t: SOLID, name: 'Unbreakable', key: '3' },
    { t: BOMB1, name: 'Bomb · 1 hit', key: '5' },
    { t: BOMB2, name: 'Bomb · 2 hits', key: '6' },
    { t: BOMB3, name: 'Bomb · 3 hits', key: '7' },
    { t: BOMB, name: 'Bomb · 5 hits', key: '4' },
  ];
  const POWERUPS = [
    { key: 'wide', name: 'Wider paddle' },
    { key: 'slow', name: 'Slow motion' },
    { key: 'multi', name: 'Multiball ×3' },
    { key: 'floor', name: 'Floor shield' },
    { key: 'fire', name: 'Fireball' },
    { key: 'gun', name: 'Machine gun' },
    { key: 'small', name: 'Smaller paddle', negative: true },
    { key: 'fast', name: 'Faster ball', negative: true },
  ];
  const SPEED = { min: 150, max: 450, start: 270 };
  const SPEED_PRESETS = [{ name: 'Calm', v: 240 }, { name: 'Normal', v: 270 }, { name: 'Fast', v: 300 }, { name: 'Very fast', v: 330 }];

  const zoneOf = (id) => Math.ceil(id / ZONE_SIZE);
  const fileName = (id) => `level-${String(id).padStart(3, '0')}.json`;
  const idx = (x, y) => y * COLS + x;
  const inside = (x, y) => x >= 0 && x < COLS && y >= 0 && y < ROWS;

  function newLevel(id) {
    return { id, speed: SPEED.start, cells: new Array(COLS * ROWS).fill(EMPTY), powerups: emptyPowerups(), chances: {}, test: null };
  }
  function emptyPowerups() {
    const p = {};
    for (const pu of POWERUPS) p[pu.key] = 0;
    return p;
  }
  function copyLevel(level, id) {
    return { id, speed: level.speed, cells: level.cells.slice(), powerups: { ...level.powerups }, chances: { ...level.chances }, test: null };
  }

  // rows that hold at least one brick, counted from the top; the file stores only these
  function usedRows(cells) {
    for (let y = ROWS - 1; y >= 0; y--) for (let x = 0; x < COLS; x++) if (cells[idx(x, y)]) return y + 1;
    return 0;
  }

  // ---------- file format ----------
  function toFile(level) {
    const rows = [];
    for (let y = 0; y < usedRows(level.cells); y++) {
      let s = '';
      for (let x = 0; x < COLS; x++) s += CHARS[level.cells[idx(x, y)]];
      rows.push(s);
    }
    const file = {
      format: FORMAT,
      id: level.id,
      zone: zoneOf(level.id),
      speed: level.speed,
      grid: rows,
      powerups: { ...level.powerups },
      // percent chance per power-up that a start hides one more; only the ticked ones are written
      chances: Object.fromEntries(Object.entries(level.chances || {}).filter(([, n]) => n > 0)),
      test: level.test ?? null, // filled in by Claude after testing: playable, difficulty, notes
    };
    return JSON.stringify(file, null, 2) + '\n';
  }

  function fromFile(text) {
    let f;
    try { f = JSON.parse(text); } catch (e) { throw new Error('The file is not valid JSON'); }
    if (!f || typeof f !== 'object') throw new Error('The file is empty');
    if (!Number.isInteger(f.format) || f.format < 1) throw new Error('The format version is missing');
    if (f.format > FORMAT) throw new Error(`The file has format ${f.format}, this editor reads up to ${FORMAT}. Update the editor.`);
    if (!Number.isInteger(f.id) || f.id < 1) throw new Error('The level number is missing');
    if (!Array.isArray(f.grid) || f.grid.length > ROWS) throw new Error(`The grid can have at most ${ROWS} rows`);
    const level = newLevel(f.id);
    f.grid.forEach((row, y) => {
      if (typeof row !== 'string' || row.length !== COLS) throw new Error(`Row ${y + 1} must have ${COLS} characters`);
      for (let x = 0; x < COLS; x++) {
        const t = CHARS.indexOf(row[x]);
        if (t < 0) throw new Error(`Unknown character "${row[x]}" in row ${y + 1}`);
        level.cells[idx(x, y)] = t;
      }
    });
    if (Number.isFinite(f.speed)) level.speed = Math.min(SPEED.max, Math.max(SPEED.min, Math.round(f.speed)));
    for (const pu of POWERUPS) {
      const n = f.powerups?.[pu.key];
      if (Number.isInteger(n) && n >= 0 && n <= 99) level.powerups[pu.key] = n;
      const c = f.chances?.[pu.key];
      if (Number.isInteger(c) && c > 0 && c <= 100) level.chances[pu.key] = c;
    }
    level.test = f.test && typeof f.test === 'object' ? f.test : null;
    return level;
  }

  function indexFile(ids) {
    return JSON.stringify({ format: FORMAT, levels: [...ids].sort((a, b) => a - b) }, null, 2) + '\n';
  }

  // ---------- drawing ----------
  const mirrorX = (x) => COLS - 1 - x;

  // points to paint, with their mirror images when mirroring is on
  function withMirror(points, mirror) {
    if (!mirror) return points;
    const out = points.slice();
    for (const [x, y] of points) if (mirrorX(x) !== x) out.push([mirrorX(x), y]);
    return out;
  }

  function line(x0, y0, x1, y1) { // Bresenham, both ends included
    const pts = [], dx = Math.abs(x1 - x0), dy = -Math.abs(y1 - y0), sx = x0 < x1 ? 1 : -1, sy = y0 < y1 ? 1 : -1;
    let err = dx + dy, x = x0, y = y0;
    for (;;) {
      pts.push([x, y]);
      if (x === x1 && y === y1) return pts;
      const e2 = 2 * err;
      if (e2 >= dy) { err += dy; x += sx; }
      if (e2 <= dx) { err += dx; y += sy; }
    }
  }

  function rect(x0, y0, x1, y1) {
    const pts = [];
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) pts.push([x, y]);
    return pts;
  }

  // the connected area of the same type as the start cell (4 neighbours)
  function fillArea(cells, x0, y0) {
    const from = cells[idx(x0, y0)], seen = new Set([idx(x0, y0)]), pts = [], stack = [[x0, y0]];
    while (stack.length) {
      const [x, y] = stack.pop();
      pts.push([x, y]);
      for (const [nx, ny] of [[x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]]) {
        if (!inside(nx, ny) || seen.has(idx(nx, ny)) || cells[idx(nx, ny)] !== from) continue;
        seen.add(idx(nx, ny));
        stack.push([nx, ny]);
      }
    }
    return pts;
  }

  function paint(cells, points, type) {
    const out = cells.slice();
    for (const [x, y] of points) if (inside(x, y)) out[idx(x, y)] = type;
    return out;
  }

  function shift(cells, dx, dy) { // bricks moved off the grid are dropped
    const out = new Array(COLS * ROWS).fill(EMPTY);
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      const t = cells[idx(x, y)];
      if (t && inside(x + dx, y + dy)) out[idx(x + dx, y + dy)] = t;
    }
    return out;
  }

  function stats(cells) {
    const n = [0, 0, 0, 0, 0, 0, 0, 0];
    for (const t of cells) n[t]++;
    const bomb = n[BOMB] + n[BOMB1] + n[BOMB2] + n[BOMB3];
    return { normal: n[NORMAL], twoHit: n[TWO_HIT], solid: n[SOLID], bomb,
      total: n[NORMAL] + n[TWO_HIT] + n[SOLID] + bomb, carriers: n[NORMAL] + n[TWO_HIT] + bomb };
  }

  // ---------- where the game puts things (mirrors resize in src/game/game.js) ----------
  // Row 1 of the editor's grid always starts at the same place on the phone, so the grid is the phone 1:1.
  // The ceiling is the top of row 1, so the top row lies against it like the outer columns lie against the walls.
  // (The game moves short formula levels down today; levels from files will use these fixed rows.)
  const GAME = { W: 336, CELL: 16, BR: 14.5, MIN_H: 600, MAX_H: 760 };
  function gameLayout(screen) {
    const { W, CELL, MIN_H, MAX_H } = GAME;
    const s = Math.min(screen.w / W, screen.h / MIN_H);
    const visW = screen.w / s, visH = screen.h / s, H = Math.min(visH, MAX_H);
    const offX = (visW - W) / 2, offY = (visH - H) / 2;
    const safeTop = Math.max(0, screen.safeTop / s - offY), safeBottom = Math.max(0, screen.safeBottom / s - offY);
    const paddleY = Math.round(H - 84 - safeBottom), gy = Math.round(safeTop + 48);
    return { s, H, offX, offY, safeTop, safeBottom, paddleY, gy, ceiling: gy, CELL };
  }
  const IPHONE_15 = { w: 393, h: 852, safeTop: 59, safeBottom: 34 };

  const api = {
    FORMAT, COLS, ROWS, ZONE_SIZE, EMPTY, NORMAL, TWO_HIT, SOLID, BOMB, BOMB1, BOMB2, BOMB3, HITS, isBomb, CHARS, TYPES, POWERUPS, SPEED, SPEED_PRESETS, GAME, IPHONE_15,
    zoneOf, fileName, idx, inside, newLevel, copyLevel, usedRows, toFile, fromFile, indexFile,
    withMirror, line, rect, fillArea, paint, shift, stats, gameLayout,
  };
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.EditorCore = api;
})(typeof self !== 'undefined' ? self : this);
