// Life regeneration, Candy Crush style. Pure functions on a state object so they are testable.
import { MAX_LIVES } from './storage.js';

export const REGEN_MS = 20 * 60 * 1000;

// Applies elapsed regeneration to state (mutates) and returns it.
export function refresh(state, now = Date.now()) {
  if (state.lives >= MAX_LIVES) { state.lives = MAX_LIVES; state.lifeTs = null; return state; }
  if (state.lifeTs === null || state.lifeTs > now) state.lifeTs = now; // clock moved back: restart timer
  const gained = Math.floor((now - state.lifeTs) / REGEN_MS);
  if (gained > 0) {
    state.lives = Math.min(MAX_LIVES, state.lives + gained);
    state.lifeTs = state.lives >= MAX_LIVES ? null : state.lifeTs + gained * REGEN_MS;
  }
  return state;
}

export function loseLife(state, now = Date.now()) {
  refresh(state, now);
  if (state.lives <= 0) return state;
  if (state.lives === MAX_LIVES) state.lifeTs = now;
  state.lives -= 1;
  return state;
}

export function addLife(state, now = Date.now()) {
  refresh(state, now);
  state.lives = Math.min(MAX_LIVES, state.lives + 1);
  if (state.lives >= MAX_LIVES) state.lifeTs = null;
  return state;
}

// Milliseconds until the next life, or 0 when full.
export function msToNext(state, now = Date.now()) {
  if (state.lives >= MAX_LIVES || state.lifeTs === null) return 0;
  return Math.max(0, REGEN_MS - (now - state.lifeTs));
}

export function formatMs(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
