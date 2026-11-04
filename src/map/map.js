// Level map: zones stacked upwards, each with its own road type, node shape and look.
// Drawn as SVG built with DOM APIs only.
import { t } from '../core/i18n.js';
import { ZONES, ZONE_SIZE, TOTAL_LEVELS } from '../data/zones.js';
import { ROADS } from './roads.js';

const NS = 'http://www.w3.org/2000/svg';
const MIN_W = 360, MAX_W = 800, NODE_SCALE = 4 / 3; // the map's logical width follows the screen so nodes keep their size
const TRANS = 110, PAD_TOP = 150, PAD_BOTTOM = 90;

function el(name, attrs, parent) {
  const e = document.createElementNS(NS, name);
  for (const k in attrs) e.setAttribute(k, attrs[k]);
  if (parent) parent.append(e);
  return e;
}

const hsl = (c, a = 1, l = c.l) => `hsla(${c.h},${c.s}%,${l}%,${a})`;

function shape(parent, kind, x, y, r, attrs) {
  if (kind === 'circle') return el('circle', { cx: x, cy: y, r, ...attrs }, parent);
  if (kind === 'square') return el('rect', { x: x - r * 0.9, y: y - r * 0.9, width: r * 1.8, height: r * 1.8, rx: 5, ...attrs }, parent);
  const pts = kind === 'hex'
    ? Array.from({ length: 6 }, (_, k) => [x + r * 1.15 * Math.cos(Math.PI / 3 * k), y + r * 1.15 * Math.sin(Math.PI / 3 * k)])
    : [[x, y - r * 1.2], [x + r * 1.2, y], [x, y + r * 1.2], [x - r * 1.2, y]];
  return el('polygon', { points: pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '), ...attrs }, parent);
}

// opts: { playable: number of levels that exist, dev: also show "current" in zones without levels, screenW: CSS pixels }
export function buildMap(svg, unlocked, onSelect, opts = {}) {
  svg.replaceChildren();
  const playable = opts.playable ?? TOTAL_LEVELS;
  const VW = Math.round(Math.max(MIN_W, Math.min(MAX_W, (opts.screenW || MIN_W) / NODE_SCALE)));

  // layout: zone blocks stacked bottom-up with a transition band between them
  const heights = ZONES.map((z) => ROADS[z.road].height(ZONE_SIZE));
  const H = PAD_BOTTOM + heights.reduce((a, b) => a + b, 0) + TRANS * (ZONES.length - 1) + PAD_TOP;
  svg.setAttribute('viewBox', `0 0 ${VW} ${H}`);
  svg.setAttribute('width', VW);
  svg.setAttribute('height', H);
  let base = 0;
  const blocks = ZONES.map((z, i) => {
    const bottom = H - PAD_BOTTOM - base, top = bottom - heights[i];
    base += heights[i] + TRANS;
    return { z, bottom, top, place: (x, yUp) => [x, bottom - yUp] };
  });

  const defs = el('defs', {}, svg);
  const f = el('filter', { id: 'glow', x: '-60%', y: '-60%', width: '220%', height: '220%' }, defs);
  el('feGaussianBlur', { stdDeviation: '3', result: 'b' }, f);
  const m = el('feMerge', {}, f);
  el('feMergeNode', { in: 'b' }, m); el('feMergeNode', { in: 'SourceGraphic' }, m);

  // zone backgrounds: higher zones first, lower zones on top and fading out upwards into them
  const gBg = el('g', {}, svg);
  for (let i = ZONES.length - 1; i >= 0; i--) {
    const { z, top, bottom } = blocks[i];
    const last = i === ZONES.length - 1;
    const y0 = last ? 0 : top - TRANS, y1 = i === 0 ? H : bottom + TRANS;
    const gr = el('linearGradient', { id: `bg${z.id}`, x1: 0, y1: 0, x2: 0, y2: 1 }, defs);
    if (!last) el('stop', { offset: 0, 'stop-color': z.bg.top, 'stop-opacity': 0 }, gr);
    el('stop', { offset: last ? 0 : TRANS / (y1 - y0), 'stop-color': z.bg.top }, gr);
    el('stop', { offset: 1, 'stop-color': z.bg.bottom }, gr);
    el('rect', { x: 0, y: y0, width: VW, height: y1 - y0, fill: `url(#bg${z.id})` }, gBg);
    if (z.style === 'thin') { // hairline zone: faint grid
      const pat = el('pattern', { id: 'grid', width: 14, height: 14, patternUnits: 'userSpaceOnUse' }, defs);
      el('path', { d: 'M14 0H0V14', fill: 'none', stroke: 'rgba(255,255,255,.05)', 'stroke-width': 0.5 }, pat);
      el('rect', { x: 0, y: top - TRANS / 2, width: VW, height: heights[i] + TRANS, fill: 'url(#grid)' }, gBg);
    }
  }

  const gDeco = el('g', {}, svg);
  const gRoad = el('g', {}, svg);
  const gLabel = el('g', {}, svg);
  const gNode = el('g', {}, svg);

  // build each zone's road
  const roads = blocks.map((b) => ROADS[b.z.road].build(ZONE_SIZE, b.place, el, gDeco, VW));
  const nodeAt = (n) => roads[Math.floor((n - 1) / ZONE_SIZE)].nodes[(n - 1) % ZONE_SIZE];
  const colorOf = (n) => ZONES[Math.floor((n - 1) / ZONE_SIZE)].color(n);

  // road segments: bright when the destination level is reached
  const drawSeg = (pts, n) => {
    const reached = n <= unlocked, c = colorOf(n);
    const attrs = reached
      ? { stroke: hsl(c, 0.9), 'stroke-width': 1.5, ...(blocks[Math.floor((n - 1) / ZONE_SIZE)].z.style === 'thin' ? { 'stroke-width': 0.9 } : { filter: 'url(#glow)' }) }
      : { stroke: 'rgba(255,255,255,.22)', 'stroke-width': 1.1, 'stroke-dasharray': '2 7' };
    el('polyline', { points: pts.map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' '), fill: 'none', 'stroke-linecap': 'round', ...attrs }, gRoad);
  };
  roads.forEach((rd, zi) => {
    for (let i = 0; i < ZONE_SIZE - 1; i++) drawSeg(rd.seg(i), zi * ZONE_SIZE + i + 2);
    if (zi < ZONES.length - 1) drawSeg([rd.nodes[ZONE_SIZE - 1], roads[zi + 1].nodes[0]], (zi + 1) * ZONE_SIZE + 1);
  });

  // zone labels
  blocks.forEach((b, i) => {
    const y = i === 0 ? H - 34 : b.bottom + TRANS / 2 + 4;
    const c = { h: b.z.label[0], s: b.z.label[1], l: b.z.label[2] };
    if (i > 0) {
      const lg = el('linearGradient', { id: `ln${i}`, x1: 0, y1: 0, x2: 1, y2: 0 }, defs);
      el('stop', { offset: 0, 'stop-color': hsl(c, 0) }, lg); el('stop', { offset: 0.5, 'stop-color': hsl(c, 0.8) }, lg); el('stop', { offset: 1, 'stop-color': hsl(c, 0) }, lg);
      el('rect', { x: 0, y: y - 18, width: VW, height: 1, fill: `url(#ln${i})` }, gLabel);
    }
    const tx = el('text', { x: VW / 2, y, 'text-anchor': 'middle', fill: hsl(c, 0.85), 'font-size': 11, 'letter-spacing': 3 }, gLabel);
    tx.textContent = t(b.z.nameKey).toUpperCase();
  });

  // "more levels soon" marker after the last existing level
  if (playable < TOTAL_LEVELS) {
    const [sx, sy] = nodeAt(playable + 1);
    const cs = el('text', { x: sx, y: sy + 36, 'text-anchor': 'middle', fill: 'rgba(255,255,255,.45)', 'font-size': 10 }, gLabel);
    cs.textContent = t('coming_soon');
  }

  // nodes
  let focusY = 0;
  for (let n = 1; n <= TOTAL_LEVELS; n++) {
    const [x, y] = nodeAt(n);
    const z = ZONES[Math.floor((n - 1) / ZONE_SIZE)], c = z.color(n);
    const exists = n <= playable;
    const state = n < unlocked ? 'done' : (n === unlocked && (exists || opts.dev)) ? 'cur' : 'lock';
    if (state === 'cur') focusY = y;
    const g = el('g', { class: 'node ' + state }, gNode);
    const r = state === 'cur' ? 24 : 20, thin = z.style === 'thin', glass = z.style === 'glass';
    if (state === 'cur') {
      shape(g, z.node, x, y, r * 1.9, { fill: 'none', stroke: hsl(c, 0.3), 'stroke-width': 1 });
      shape(g, z.node, x, y, r * 2.5, { fill: 'none', stroke: hsl(c, 0.15), 'stroke-width': 1 });
      shape(g, z.node, x, y, r * 1.2, { fill: hsl(c, thin ? 0.12 : 0.4), stroke: '#fff', 'stroke-width': thin ? 1 : 1.6, ...(thin ? {} : { filter: 'url(#glow)' }) });
    } else if (state === 'done') {
      if (glass) {
        shape(g, z.node, x - 0.8, y - 0.8, r * 0.95, { fill: 'none', stroke: 'rgba(255,0,90,.35)', 'stroke-width': 0.8 });
        shape(g, z.node, x + 0.8, y + 0.8, r * 0.95, { fill: 'none', stroke: 'rgba(0,200,255,.35)', 'stroke-width': 0.8 });
      }
      shape(g, z.node, x, y, r * 0.95, { fill: hsl(c, glass ? 0.32 : thin ? 0.06 : 0.22), stroke: glass ? 'rgba(255,255,255,.8)' : hsl(c), 'stroke-width': thin ? 0.8 : 1.3, ...(thin ? {} : { filter: 'url(#glow)' }) });
      for (let s = 0; s < 3; s++) el('circle', { cx: x + (s - 1) * 8, cy: y + r + 9, r: 2.2, fill: '#ffe9a8' }, g);
    } else {
      shape(g, z.node, x, y, 17, { fill: 'none', stroke: hsl(c, 0.3, 50), 'stroke-width': 1 });
    }
    const tx = el('text', { x, y: y + 1, 'text-anchor': 'middle', 'dominant-baseline': 'middle', fill: state === 'lock' ? 'rgba(255,255,255,.4)' : '#fff', 'font-size': state === 'cur' ? 20 : 15, 'font-weight': 600 }, g);
    tx.textContent = n;
    if (state !== 'lock') g.addEventListener('click', () => onSelect(n));
  }
  return { nodeY: focusY || nodeAt(Math.min(Math.max(unlocked, 1), TOTAL_LEVELS))[1], height: H, width: VW };
}
