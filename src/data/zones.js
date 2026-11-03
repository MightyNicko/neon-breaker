// Zone definitions. Each zone holds ZONE_SIZE levels and has its own node shape, road type and look.
export const ZONE_SIZE = 20;

export const ZONES = [
  { id: 1, nameKey: 'zone1', node: 'square', road: 'winding', style: 'glow',
    bg: { top: '#0a0618', bottom: '#1a0b30' }, label: [300, 100, 70],
    color: (n) => ({ h: (n * 37) % 360, s: 100, l: 62 }) },
  { id: 2, nameKey: 'zone2', node: 'hex', road: 'honeycomb', style: 'glow',
    bg: { top: '#050f26', bottom: '#0a1a3c' }, label: [190, 100, 70],
    color: (n) => ({ h: n % 2 ? 310 : 190, s: 100, l: 62 }) },
  { id: 3, nameKey: 'zone3', node: 'circle', road: 'circle', style: 'thin',
    bg: { top: '#050506', bottom: '#0d0d10' }, label: [35, 100, 68],
    color: (n) => ({ h: n % 2 ? 330 : 35, s: 100, l: 66 }) },
  { id: 4, nameKey: 'zone4', node: 'diamond', road: 'constellation', style: 'glass',
    bg: { top: '#0a0614', bottom: '#241048' }, label: [270, 90, 78],
    color: (n) => ({ h: (n * 23 + 260) % 360, s: 90, l: 72 }) },
];

export const TOTAL_LEVELS = ZONES.length * ZONE_SIZE;

export function zoneOf(level) {
  return ZONES[Math.min(ZONES.length - 1, Math.floor((level - 1) / ZONE_SIZE))];
}
