// Renders the app icon (neon double hexagon) to PNG without dependencies.
import { deflateSync } from 'node:zlib';
import { writeFileSync } from 'node:fs';

function crc32(buf) {
  let c, crc = ~0;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return ~crc >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
function png(w, h, rgb) {
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) { raw[y * (w * 3 + 1)] = 0; rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3); }
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}
function hsl2rgb(h, s, l) {
  const a = s * Math.min(l, 1 - l), f = (n) => { const k = (n + h / 30) % 12; return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1)); };
  return [f(0), f(8), f(4)];
}

function render(size) {
  const buf = Buffer.alloc(size * size * 3);
  const apo = [0, 1, 2].map((i) => { const a = Math.PI / 3 * i + Math.PI / 6; return [Math.cos(a), Math.sin(a)]; }); // edge normals (flat sides top/bottom => vertices left/right)
  const hexNorm = (x, y) => Math.max(...apo.map(([nx, ny]) => Math.abs(x * nx + y * ny)));
  for (let py = 0; py < size; py++) for (let px = 0; px < size; px++) {
    const x = (px + 0.5) / size - 0.5, y = (py + 0.5) / size - 0.5;
    let r = 0.04, g = 0.024, b = 0.08; // #0a0614
    const vg = Math.max(0, 1 - Math.hypot(x, y) * 2); r += vg * 0.05; g += vg * 0.02; b += vg * 0.12;
    const ang = (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
    const [cr, cg, cb] = hsl2rgb((ang + 300) % 360, 1, 0.6);
    for (const apothem of [0.34, 0.2]) {
      const d = Math.abs(hexNorm(x, y) - apothem * 0.866);
      const core = Math.exp(-Math.pow(d / 0.012, 2)), glow = Math.exp(-Math.pow(d / 0.04, 2)) * 0.5;
      const k = core + glow;
      r += cr * k; g += cg * k; b += cb * k;
      r += core * 0.5; g += core * 0.5; b += core * 0.5; // white-hot core
    }
    // light streaks
    for (const [sx, sy, len] of [[-0.28, -0.34, 0.2], [0.3, 0.3, 0.16]]) {
      const dx = x - sx, dy = y - sy, t = (dx + dy * 0.6) / (len * 2); // diagonal-ish
      const along = Math.abs(dx * 0.86 - dy * 0.5), across = Math.abs(dx * 0.5 + dy * 0.86);
      const k = Math.exp(-Math.pow(across / 0.006, 2)) * Math.max(0, 1 - along / len);
      r += k * 0.9; g += k * 0.8; b += k * 1; void t;
    }
    const o = (py * size + px) * 3;
    buf[o] = Math.min(255, r * 255); buf[o + 1] = Math.min(255, g * 255); buf[o + 2] = Math.min(255, b * 255);
  }
  return png(size, size, buf);
}

for (const [name, size] of [['icon-192.png', 192], ['icon-512.png', 512], ['apple-touch-icon.png', 180]]) {
  writeFileSync(new URL(`../icons/${name}`, import.meta.url), render(size));
  console.log('wrote', name);
}
