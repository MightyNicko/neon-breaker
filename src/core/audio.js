// Sound effects are synthesised with Web Audio. The music is a WAV (made by tools/make-sid-loop.mjs), played through
// Web Audio because a looping AudioBufferSource has no gap at the loop point, unlike an <audio> element.
// Browsers only allow audio after a user gesture: main.js calls unlock() from gesture events.
const VOLUME = 0.28, MIN_GAP = 0.04; // seconds before the same sound can play again
const SCALE = [261.63, 293.66, 329.63, 392, 440]; // pentatonic, so brick hits never clash
const MUSIC_URL = new URL('../../audio/neon-breaker-sid-loop.wav', import.meta.url);
const MUSIC_VOLUME = 0.55, MUSIC_FADE = 0.06; // below the effects; the fade avoids clicks when it starts or stops

let ctx = null, master = null, enabled = true;
const lastPlayed = {};
let musicWanted = false, musicBuffer = null, musicLoading = false;
let musicSource = null, musicGain = null, musicStartedAt = 0, musicOffset = 0;

export function setEnabled(on) { enabled = on; syncMusic(); }

// on = the game wants music now. The sound setting, a hidden page and a locked AudioContext can still keep it silent.
export function setMusic(on) { musicWanted = on; syncMusic(); }

function loadMusic() {
  if (musicBuffer || musicLoading) return;
  musicLoading = true;
  fetch(MUSIC_URL)
    .then((res) => { if (!res.ok) throw new Error(res.status); return res.arrayBuffer(); })
    .then((data) => ctx.decodeAudioData(data))
    .then((buffer) => { musicBuffer = buffer; syncMusic(); })
    .catch(() => {}) // the game works without music; the next gesture tries again
    .finally(() => { musicLoading = false; });
}

function startMusic() {
  const t0 = ctx.currentTime;
  musicSource = ctx.createBufferSource();
  musicSource.buffer = musicBuffer;
  musicSource.loop = true;
  musicGain = ctx.createGain();
  musicGain.gain.setValueAtTime(0.0001, t0);
  musicGain.gain.exponentialRampToValueAtTime(MUSIC_VOLUME, t0 + MUSIC_FADE);
  musicSource.connect(musicGain).connect(master);
  musicSource.start(t0, musicOffset);
  musicStartedAt = t0;
}

// Remembers the position, so the song continues instead of replaying its opening at every level.
function stopMusic() {
  const t0 = ctx.currentTime;
  musicOffset = (musicOffset + t0 - musicStartedAt) % musicBuffer.duration;
  musicGain.gain.setValueAtTime(musicGain.gain.value, t0);
  musicGain.gain.exponentialRampToValueAtTime(0.0001, t0 + MUSIC_FADE);
  musicSource.stop(t0 + MUSIC_FADE);
  musicSource = null;
}

function syncMusic() {
  if (!ctx || !musicBuffer) return;
  const audible = musicWanted && enabled && ctx.state === 'running' && !document.hidden;
  if (audible && !musicSource) startMusic();
  else if (!audible && musicSource) stopMusic();
}

export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
    ctx.addEventListener('statechange', syncMusic);
    document.addEventListener('visibilitychange', syncMusic);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
  loadMusic();
}

function tone(freq, dur, { type = 'sine', vol = 1, to = freq, delay = 0 } = {}) {
  const t0 = ctx.currentTime + delay;
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  osc.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(vol, t0 + 0.005);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur + 0.02);
}

const SOUNDS = {
  brick(row = 0) { // higher rows ring an octave up
    const f = SCALE[row % SCALE.length] * (row % 10 < 5 ? 2 : 4);
    tone(f, 0.13, { type: 'triangle', vol: 0.7 });
    tone(f * 2, 0.07, { vol: 0.25 });
  },
  paddle() { tone(196, 0.09, { type: 'square', vol: 0.3, to: 247 }); },
  wall() { tone(130, 0.04, { type: 'square', vol: 0.12 }); },
  launch() { tone(220, 0.16, { type: 'triangle', vol: 0.6, to: 660 }); },
  lose() { tone(330, 0.32, { type: 'sawtooth', vol: 0.3, to: 90 }); },
  gameover() {
    [330, 262, 196].forEach((f, i) => tone(f, 0.26, { type: 'triangle', vol: 0.6, delay: i * 0.16 }));
  },
  win() {
    [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.24, { type: 'triangle', vol: 0.6, delay: i * 0.1 }));
  },
};

export function play(name, arg) {
  if (!enabled || !ctx || ctx.state !== 'running' || !SOUNDS[name]) return;
  if (ctx.currentTime - (lastPlayed[name] ?? -1) < MIN_GAP) return;
  lastPlayed[name] = ctx.currentTime;
  SOUNDS[name](arg);
}
