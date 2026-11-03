// Levels are ASCII grids ('#' brick, '.' empty), 21 columns wide.
// `hue` picks how bricks are coloured: 'row' | 'angle' (around the grid centre).
export const COLS = 21;

const build = (rows, fn) =>
  Array.from({ length: rows }, (_, y) =>
    Array.from({ length: COLS }, (_, x) => (fn(x, y) ? '#' : '.')).join(''));

const hex = (x, y, cy) => {
  const dx = Math.abs(x - 10), dy = Math.abs(y - cy);
  return Math.max(dy * 0.866 + dx * 0.5, dx);
};

export const LEVELS = [
  { id: 1, speed: 250, hue: 'row',
    grid: build(9, (x, y) => y % 2 === 1 && x >= 2 && x <= 18) },
  { id: 2, speed: 262, hue: 'angle',
    grid: build(13, (x, y) => (x + y) % 2 === 0 && Math.abs(x - 10) * 0.7 + Math.abs(y - 6) <= 6.6) },
  { id: 3, speed: 275, hue: 'angle',
    grid: build(17, (x, y) => {
      const d = hex(x, y, 8);
      return (d >= 8.2 && d < 9.6) || (d >= 4.4 && d < 5.8);
    }) },
  { id: 4, speed: 290, hue: 'angle',
    grid: build(16, (x, y) => {
      const px = (x - 10) / 8.6, py = (8.2 - y) / 7.4 + 0.15;
      return Math.pow(px * px + py * py - 1, 3) - px * px * py * py * py <= 0;
    }) },
  { id: 5, speed: 305, hue: 'angle',
    grid: build(15, (x, y) => {
      const layer = Math.min(x, y, COLS - 1 - x, 14 - y);
      if (layer % 2 !== 0 || layer > 6) return false;
      const gapSide = (layer / 2) % 2; // alternate which side has the opening
      if (gapSide === 0 && y === 14 - layer && Math.abs(x - 10) <= 1) return false;
      if (gapSide === 1 && y === layer && Math.abs(x - 10) <= 1) return false;
      return true;
    }) },
];

export function countBricks(level) {
  return level.grid.reduce((n, row) => n + [...row].filter((c) => c === '#').length, 0);
}
