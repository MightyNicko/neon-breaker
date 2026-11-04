// Sound effects synthesised with Web Audio, so there are no files to download or cache.
// Browsers only allow audio after a user gesture: main.js calls unlock() from gesture events.
const VOLUME = 0.28, MIN_GAP = 0.04; // seconds before the same sound can play again
const SCALE = [261.63, 293.66, 329.63, 392, 440]; // pentatonic, so brick hits never clash

let ctx = null, master = null, enabled = true;
const lastPlayed = {};

export function setEnabled(on) { enabled = on; }

export function unlock() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!ctx) {
    ctx = new AC();
    master = ctx.createGain();
    master.gain.value = VOLUME;
    master.connect(ctx.destination);
  }
  if (ctx.state !== 'running') ctx.resume().catch(() => {});
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
