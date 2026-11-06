// The power-up kinds the game has built. The key is the one in the level files and the editor.
// time: seconds the effect lasts (0 = happens once, at the catch). group: kinds that change the same thing clash,
// and the newest one wins with a fresh timer; kinds without a group, or in different groups, work together.
// letter and hue: the falling pill. sound: played at the catch. label: the text shown at the catch (i18n key).
export const KINDS = {
  wide: { code: 1, time: 20, group: 'paddle', letter: 'E', hue: 320, sound: 'stretch', label: 'pu_wide' },
  multi: { code: 2, time: 0, letter: 'M', hue: 185, sound: 'multi', label: 'pu_multi' },
  floor: { code: 3, time: 15, letter: 'F', hue: 40, sound: 'floor', label: 'pu_floor' }, // amber, as its laser fence
};

export const BY_CODE = [];
for (const [key, kind] of Object.entries(KINDS)) { kind.key = key; BY_CODE[kind.code] = kind; }

export const WARN_TIME = 2;      // a timed effect blinks during its last seconds
export const WIDE_W = 96;        // the wider paddle, against 64
export const SPLIT_ANGLE = 0.35; // multiball: the two new balls leave about 20 degrees to each side of the first
export const MAX_BALLS = 12;     // more would only crowd the screen

// Adds a caught kind to the running effects ({ key: seconds left }). Kinds in the same group replace each other.
export function addEffect(effects, kind) {
  if (!kind.time) return effects;
  if (kind.group) for (const key of Object.keys(effects)) if (KINDS[key]?.group === kind.group && key !== kind.key) delete effects[key];
  effects[kind.key] = kind.time;
  return effects;
}

// Counts down the running effects and drops the ones that are over.
export function tickEffects(effects, dt) {
  for (const key of Object.keys(effects)) if ((effects[key] -= dt) <= 0) delete effects[key];
  return effects;
}

// The power-ups a start hides: the fixed counts, plus one more of a kind whose chance comes up.
// rand is the start's seeded random generator, so the same seed hides the same ones.
export function rollCounts(counts = {}, chances = {}, rand = Math.random) {
  const out = {};
  for (const [key, n] of Object.entries(counts)) if (KINDS[key] && n > 0) out[key] = n;
  const extra = {};
  for (const [key, pct] of Object.entries(chances)) {
    if (!KINDS[key] || !(pct > 0)) continue;
    if (rand() * 100 < pct) { out[key] = (out[key] || 0) + 1; extra[key] = 1; }
  }
  return { counts: out, extra };
}
