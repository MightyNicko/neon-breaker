// The Core icon, from the same shapes in the page (SVG) and in the game (canvas), in a 24 x 24 box.
// The hexagon core, chosen from the mockups (G13).
export const CORE_COLOUR = '#5ff';
const EMPTY = '#4a4060';
const dot = (cx, cy, r) => `M${cx - r} ${cy} a${r} ${r} 0 1 0 ${r * 2} 0 a${r} ${r} 0 1 0 ${-r * 2} 0`;

// full: lit, with fill; empty: a dim outline
function parts(full) {
  const c = CORE_COLOUR;
  return [
    { d: 'M12 2 L20.7 7 V17 L12 22 L3.3 17 V7 Z', fill: full ? 'rgba(85,255,255,.14)' : null, stroke: full ? c : EMPTY, width: 1.6 },
    { d: 'M12 7.2 L16.2 9.6 V14.4 L12 16.8 L7.8 14.4 V9.6 Z', fill: full ? c : null, stroke: full ? '#fff' : EMPTY, width: full ? 0.8 : 1.2 },
    ...(full ? [{ d: dot(12, 12, 1.8), fill: '#fff' }] : []),
  ];
}

const NS = 'http://www.w3.org/2000/svg';
export function coreSvg(full) {
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('aria-hidden', 'true');
  svg.classList.add('core-icon');
  if (full) svg.classList.add('full');
  for (const p of parts(full)) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', p.d);
    path.setAttribute('fill', p.fill ?? 'none');
    if (p.stroke) { path.setAttribute('stroke', p.stroke); path.setAttribute('stroke-width', p.width); path.setAttribute('stroke-linejoin', 'round'); }
    svg.append(path);
  }
  return svg;
}

// Draws a lit Core in the 24 x 24 box at the canvas's current transform.
export function drawCore(g) {
  if (typeof Path2D === 'undefined') return; // tests and the level tool run without a canvas
  for (const p of parts(true)) {
    const path = new Path2D(p.d);
    if (p.fill) { g.fillStyle = p.fill; g.fill(path); }
    if (p.stroke) { g.strokeStyle = p.stroke; g.lineWidth = p.width; g.lineJoin = 'round'; g.stroke(path); }
  }
}
