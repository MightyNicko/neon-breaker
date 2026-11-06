// Persistent state with validation. localStorage can throw or be blocked in Safari,
// so every access is wrapped and the game falls back to memory.
const KEY = 'neonbreaker.v1';

export const MAX_CORES = 5;

// Hidden developer mode (seven taps on the version number): on, and the tools it offers.
export const DEV_TOOLS = ['perf', 'seed', 'unlockAll', 'infiniteCores'];

export function defaults() {
  return { v: 1, cores: MAX_CORES, coreTs: null, unlocked: 1, lang: null, sound: true, tutorialDone: false,
    dev: { on: false, perf: false, seed: false, unlockAll: false, infiniteCores: false } };
}

// Never trust stored data: coerce every field into its valid range.
export function sanitize(raw, maxLevel, langs) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const int = (n, lo, hi, fb) => (Number.isInteger(n) && n >= lo && n <= hi ? n : fb);
  // Cores replaced lives: a saved game with lives keeps them as Cores.
  const ts = raw.coreTs ?? raw.lifeTs;
  d.cores = int(raw.cores ?? raw.lives, 0, MAX_CORES, d.cores);
  d.coreTs = Number.isFinite(ts) && ts > 0 ? ts : null;
  if (d.cores >= MAX_CORES) d.coreTs = null;
  if (d.cores < MAX_CORES && d.coreTs === null) d.coreTs = Date.now();
  d.unlocked = int(raw.unlocked, 1, maxLevel, 1);
  d.lang = typeof raw.lang === 'string' && langs.includes(raw.lang) ? raw.lang : null;
  d.sound = raw.sound !== false;
  d.tutorialDone = raw.tutorialDone === true;
  if (raw.dev && typeof raw.dev === 'object') {
    for (const k of ['on', ...DEV_TOOLS]) d.dev[k] = raw.dev[k] === true;
    if (raw.dev.infiniteLives === true) d.dev.infiniteCores = true;
  }
  return d;
}

let memory = null;

export function load(maxLevel, langs) {
  let raw = null;
  try {
    const s = localStorage.getItem(KEY);
    if (s) raw = JSON.parse(s);
  } catch (e) { /* blocked or corrupt: use defaults */ }
  return sanitize(raw ?? memory, maxLevel, langs);
}

export function save(state) {
  memory = state;
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* ignore */ }
}
