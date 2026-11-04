// Road layouts, one per zone. Local coordinates: x 0..w, y grows upwards from the block bottom.
// build(count, place, el, deco, w) returns { nodes: [[x,y]...], seg(i): points from node i to i+1 }
// `place(x, yUp)` converts to map (SVG) coordinates, `el(name, attrs, parent)` creates SVG elements,
// `deco` is the group for faint background decoration.

const dust = (el, deco, place, h, n, seed, w) => {
  for (let k = 0; k < n * w / 360; k++) {
    const [x, y] = place((k * 97 * seed) % (w - 10) + 4, (k * 173 * seed) % (h - 20) + 10);
    el('rect', { x, y, width: 3, height: 3, fill: 'rgba(255,255,255,.07)' }, deco);
  }
};

const winding = {
  height: (count) => count * 72 + 60,
  build(count, place, el, deco, w) {
    const P = (t) => place(w / 2 + (w / 2 - 85) * Math.sin(t * 0.85 + 0.3), 40 + t * 72);
    dust(el, deco, place, this.height(count), 24, 1, w);
    return {
      nodes: Array.from({ length: count }, (_, i) => P(i)),
      seg: (i) => Array.from({ length: 15 }, (_, s) => P(i + s / 14)),
    };
  },
};

const R = 36, HS = R * Math.sqrt(3) / 2; // honeycomb cell radius and half row height
const hexPts = (x, y, r) => Array.from({ length: 6 }, (_, k) => `${(x + r * Math.cos(Math.PI / 3 * k)).toFixed(1)},${(y + r * Math.sin(Math.PI / 3 * k)).toFixed(1)}`).join(' ');
function honeyPath(count) {
  const steps = [1, 1, 2];
  let c = 2, h = 0, dir = 1;
  const cells = [[c, h]];
  for (let i = 0; i < count - 1; i++) {
    const s = steps[i % 3];
    if (s === 1) { if (c + dir < 0 || c + dir > 5) dir = -dir; c += dir; if (i % 3 === 1) dir = -dir; }
    h += s; cells.push([c, h]);
  }
  return cells;
}
const honeycomb = {
  height: (count) => honeyPath(count).at(-1)[1] * HS + 90,
  build(count, place, el, deco, w) {
    const cells = honeyPath(count), maxH = cells.at(-1)[1];
    const CELL_W = 1.5 * R, MID = 3; // column 3 is the middle of the screen
    const at = (c, h) => place(w / 2 + (c - MID) * CELL_W, 40 + h * HS);
    const reach = Math.ceil((w / 2 + R) / CELL_W);
    const widest = Math.max(1, Math.floor((w / 2 - 70) / CELL_W));
    const spread = widest % 2 ? widest : widest - 1; // odd, so the road stays on the honeycomb's cells
    for (let c = MID - reach; c <= MID + reach; c++) for (let h = -2; h <= maxH + 2; h++) {
      if ((c + h) % 2) continue;
      const [x, y] = at(c, h);
      el('polygon', { points: hexPts(x, y, R * 0.96), fill: 'none', stroke: 'rgba(120,160,255,.13)', 'stroke-width': 0.6 }, deco);
    }
    const nodes = cells.map(([c, h]) => at(MID + (c - MID) * spread, h));
    return { nodes, seg: (i) => [nodes[i], nodes[i + 1]] };
  },
};

const circle = {
  height: (count) => Math.ceil(count / 4) * 124 + 80,
  build(count, place, el, deco, w) {
    const rx = w / 2 - 100, stretch = rx / 80; // tracks are round on a phone and wider ovals on a tablet
    const P = (u) => {
      const k = Math.floor(u), th = Math.PI * (u - k), s = k % 2 ? -1 : 1;
      return place(w / 2 + s * rx * Math.sin(th), 102 + k * 124 - 62 * Math.cos(th));
    };
    for (let k = 0; k < Math.ceil(count / 4); k++) {
      const [cx, cy] = place(w / 2, 102 + k * 124);
      for (let r = 24; r <= 80; r += 16) el('ellipse', { cx, cy, rx: r * stretch, ry: r, fill: 'none', stroke: 'rgba(255,255,255,.07)', 'stroke-width': 0.6 }, deco);
    }
    return {
      nodes: Array.from({ length: count }, (_, i) => P(i / 4)),
      seg: (i) => Array.from({ length: 11 }, (_, s) => P((i + s / 10) / 4)),
    };
  },
};

const constellation = {
  height: (count) => count * 52 + 80,
  build(count, place, el, deco, w) {
    const h = this.height(count);
    const loc = Array.from({ length: count }, (_, i) =>
      [w / 2 + (w / 2 - 70) * Math.sin(i * 2.1 + 1) * (0.6 + 0.4 * Math.cos(i * 0.7)), 44 + i * 52 + 5 * Math.sin(i * 3.3)]);
    const nodes = loc.map(([x, y]) => place(x, y));
    for (let i = 0; i + 2 < count; i++) { // faint extra lines between near neighbours
      if (Math.hypot(loc[i][0] - loc[i + 2][0], loc[i][1] - loc[i + 2][1]) < 130 * w / 360)
        el('line', { x1: nodes[i][0], y1: nodes[i][1], x2: nodes[i + 2][0], y2: nodes[i + 2][1], stroke: 'rgba(255,255,255,.08)', 'stroke-width': 0.6 }, deco);
    }
    for (let k = 0; k < 70 * w / 360; k++) {
      const [x, y] = place((k * 131) % (w - 4) + 2, (k * 211) % (h - 10) + 5);
      el('circle', { cx: x, cy: y, r: k % 5 === 0 ? 1.3 : 0.7, fill: `rgba(255,255,255,${0.1 + (k % 4) * 0.06})` }, deco);
    }
    return { nodes, seg: (i) => [nodes[i], nodes[i + 1]] };
  },
};

export const ROADS = { winding, honeycomb, circle, constellation };
