// Persistent state with validation. localStorage can throw or be blocked in Safari,
// so every access is wrapped and the game falls back to memory.
const KEY = 'neonbreaker.v1';

export const MAX_LIVES = 5;

export function defaults() {
  return { v: 1, lives: MAX_LIVES, lifeTs: null, unlocked: 1, lang: null };
}

// Never trust stored data: coerce every field into its valid range.
export function sanitize(raw, maxLevel, langs) {
  const d = defaults();
  if (!raw || typeof raw !== 'object') return d;
  const int = (n, lo, hi, fb) => (Number.isInteger(n) && n >= lo && n <= hi ? n : fb);
  d.lives = int(raw.lives, 0, MAX_LIVES, d.lives);
  d.lifeTs = Number.isFinite(raw.lifeTs) && raw.lifeTs > 0 ? raw.lifeTs : null;
  if (d.lives >= MAX_LIVES) d.lifeTs = null;
  if (d.lives < MAX_LIVES && d.lifeTs === null) d.lifeTs = Date.now();
  d.unlocked = int(raw.unlocked, 1, maxLevel, 1);
  d.lang = typeof raw.lang === 'string' && langs.includes(raw.lang) ? raw.lang : null;
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
