// Levels are read from levels/*.json, the files the editor (editor/index.html) writes; levels/index.json lists them.
// Grid rows are text: '.' empty, '1' normal, '2' two hits, '3' three hits, 'X' unbreakable, and bombs that blow after
// 'a' 1 hit, 'b' 2 hits, 'c' 3 hits or 'B' 5 hits.
// Row 1 always has the same place on screen, so a level looks exactly as drawn in the editor.
export const COLS = 21, ROWS = 25, FORMAT = 1;
export const EMPTY = 0, NORMAL = 1, TWO_HIT = 2, SOLID = 3, BOMB = 4, BOMB1 = 5, BOMB2 = 6, BOMB3 = 7, THREE_HIT = 8;
const CHARS = '.12XBabc3';
export const HITS = [0, 1, 2, 0, 5, 1, 2, 3, 3]; // hits each type takes; unbreakable bricks never break
export const isBomb = (t) => t === BOMB || t === BOMB1 || t === BOMB2 || t === BOMB3;
const SPEED = { min: 150, max: 450, start: 270 };

export let LEVELS = [];                 // sorted by number; filled by loadLevels()
export function setLevels(list) { LEVELS = list; }

export const fileName = (id) => `levels/level-${String(id).padStart(3, '0')}.json`;

// Never trust a file: check every field and refuse what the game cannot play.
export function parseLevel(text) {
  const f = JSON.parse(text);
  if (!f || !Number.isInteger(f.format) || f.format < 1 || f.format > FORMAT) throw new Error('unknown level format');
  if (!Number.isInteger(f.id) || f.id < 1) throw new Error('level number missing');
  if (!Array.isArray(f.grid) || f.grid.length > ROWS) throw new Error(`more than ${ROWS} rows`);
  const grid = f.grid.map((row, y) => {
    if (typeof row !== 'string' || row.length !== COLS || [...row].some((ch) => !CHARS.includes(ch))) throw new Error(`bad row ${y + 1}`);
    return [...row].map((ch) => CHARS.indexOf(ch));
  });
  const speed = Number.isFinite(f.speed) ? Math.min(SPEED.max, Math.max(SPEED.min, Math.round(f.speed))) : SPEED.start;
  const powerups = {};
  for (const [k, n] of Object.entries(f.powerups || {})) if (Number.isInteger(n) && n >= 0 && n <= 99) powerups[k] = n;
  // chances: per power-up, the percent chance that a start hides one more (optional; older files have none)
  const chances = {};
  for (const [k, n] of Object.entries(f.chances || {})) if (Number.isInteger(n) && n > 0 && n <= 100) chances[k] = n;
  return { id: f.id, speed, grid, powerups, chances };
}

// read(path) returns the file's text; in the browser it fetches, in tests it reads from disk.
const fetchText = (p) => fetch(p, { cache: 'no-cache' }).then((r) => { if (!r.ok) throw new Error(`${p}: ${r.status}`); return r.text(); });
export async function loadLevels(read = fetchText) {
  const index = JSON.parse(await read('levels/index.json'));  // read may return text or a promise of it
  const ids = (Array.isArray(index.levels) ? index.levels : []).filter((id) => Number.isInteger(id) && id > 0);
  const levels = await Promise.all(ids.map(async (id) => parseLevel(await read(fileName(id)))));
  LEVELS = levels.filter((l) => countBricks(l) > 0).sort((a, b) => a.id - b.id);
  return LEVELS;
}

// bricks that must be broken to clear the level
export function countBricks(level) {
  return level.grid.reduce((n, row) => n + row.filter((t) => t !== EMPTY && t !== SOLID).length, 0);
}
