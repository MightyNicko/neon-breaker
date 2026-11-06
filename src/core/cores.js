// Cores: the player's energy, at most MAX_CORES, one more every 20 minutes. Continuing a level after a miss costs one.
// Pure functions on a state object so they are testable.
import { MAX_CORES } from './storage.js';

export const REGEN_MS = 20 * 60 * 1000;

// Applies elapsed regeneration to state (mutates) and returns it.
export function refresh(state, now = Date.now()) {
  if (state.cores >= MAX_CORES) { state.cores = MAX_CORES; state.coreTs = null; return state; }
  if (state.coreTs === null || state.coreTs > now) state.coreTs = now; // clock moved back: restart timer
  const gained = Math.floor((now - state.coreTs) / REGEN_MS);
  if (gained > 0) {
    state.cores = Math.min(MAX_CORES, state.cores + gained);
    state.coreTs = state.cores >= MAX_CORES ? null : state.coreTs + gained * REGEN_MS;
  }
  return state;
}

export function spendCore(state, now = Date.now()) {
  refresh(state, now);
  if (state.cores <= 0) return state;
  if (state.cores === MAX_CORES) state.coreTs = now;
  state.cores -= 1;
  return state;
}

export function addCore(state, now = Date.now()) {
  refresh(state, now);
  state.cores = Math.min(MAX_CORES, state.cores + 1);
  if (state.cores >= MAX_CORES) state.coreTs = null;
  return state;
}

// Milliseconds until the next Core, or 0 when full.
export function msToNext(state, now = Date.now()) {
  if (state.cores >= MAX_CORES || state.coreTs === null) return 0;
  return Math.max(0, REGEN_MS - (now - state.coreTs));
}

export function formatMs(ms) {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
