// Renders the Neon Breaker music loop to audio/neon-breaker-sid-loop.wav. Run: node tools/make-sid-loop.mjs
//
// Not a "chiptune-style" synth: this emulates the C64's SID chip cycle by cycle at the PAL clock, and the
// music is a 50 Hz register-writing play routine, like a real C64 tune. So there are only three voices and one
// shared filter, and all the tricks are the period's own: drums stolen from the bass voice, 50 Hz chord arpeggios,
// hard restart, pulse-width sweeps and ring modulation.
//
// Key: A minor. The game's brick sounds are C-D-E-G-A pentatonic (src/core/audio.js), so they cannot clash.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const CLK = 985248, FRAME = 19656, SPEED = 6, FRAMES_PER_BAR = 16 * SPEED; // about 125 BPM
const OUT_RATE = 44100, DECIM = 8, FADE_SECONDS = 0.015;

// ---------------------------------------------------------------- SID chip
const RATE = [9, 32, 63, 95, 149, 220, 267, 313, 392, 977, 1954, 3126, 3907, 11720, 19532, 31251];
// 6581 cutoff curve: register value -> Hz, including the chip's kink at 1024.
const FC_CURVE = [[0, 220], [128, 230], [256, 250], [384, 300], [512, 420], [640, 780], [768, 1600], [832, 2300], [896, 3200],
  [960, 4300], [992, 5000], [1008, 5400], [1016, 5700], [1023, 6000], [1024, 4600], [1032, 4800], [1056, 5300], [1088, 6000],
  [1120, 6600], [1152, 7200], [1280, 9500], [1408, 12000], [1536, 14500], [1664, 16000], [1792, 17100], [1920, 17700], [2047, 18000]];

function cutoffHz(fc) {
  for (let i = 1; i < FC_CURVE.length; i++) {
    const [x1, y1] = FC_CURVE[i];
    if (fc <= x1) { const [x0, y0] = FC_CURVE[i - 1]; return y0 + (y1 - y0) * (fc - x0) / (x1 - x0); }
  }
  return 18000;
}
const expPeriod = (env) => env > 93 ? 1 : env > 54 ? 2 : env > 26 ? 4 : env > 14 ? 8 : env > 6 ? 16 : env > 0 ? 30 : 1;

export class SID {
  constructor() {
    this.freq = new Int32Array(3); this.pw = new Int32Array(3); this.ctrl = new Int32Array(3);
    this.ad = new Int32Array(3); this.sr = new Int32Array(3);
    this.acc = new Int32Array(3); this.lfsr = new Int32Array(3).fill(0x7ffff8);
    this.env = new Int32Array(3); this.state = new Int32Array(3).fill(2);   // 0 attack, 1 decay/sustain, 2 release
    this.rateCount = new Int32Array(3); this.ratePeriod = new Int32Array(3).fill(RATE[0]);
    this.expCount = new Int32Array(3); this.holdZero = new Int32Array(3).fill(1);
    this.route = 0; this.mode = 1; this.volume = 15; this.w = 0.01; this.q = 1;
    this.lp = 0; this.bp = 0; this.rc = 0; this.dc = 0; this.box = 0; this.boxN = 0;
  }
  setFilter(fc, res, route, mode = 1) {
    this.w = Math.min(2 * Math.PI * cutoffHz(fc) / CLK, 0.9);
    this.q = 1 / (0.707 + res / 15); this.route = route; this.mode = mode;
  }
  #updateRate(v) {
    const s = this.state[v];
    this.ratePeriod[v] = RATE[s === 0 ? this.ad[v] >> 4 : s === 1 ? this.ad[v] & 15 : this.sr[v] & 15];
  }
  setVoice(v, { freq, pw, ctrl, ad, sr }) {
    if (freq !== undefined) this.freq[v] = freq & 0xffff;
    if (pw !== undefined) this.pw[v] = pw & 0xfff;
    if (ad !== undefined) this.ad[v] = ad;
    if (sr !== undefined) this.sr[v] = sr;
    if (ctrl !== undefined) {
      const was = this.ctrl[v] & 1, now = ctrl & 1;
      if (!was && now) { this.state[v] = 0; this.holdZero[v] = 0; }
      else if (was && !now) this.state[v] = 2;
      this.ctrl[v] = ctrl;
    }
    this.#updateRate(v);
  }
  // Clocks the chip; every DECIM cycles the averaged output goes to out[pos++]. Returns the new pos.
  run(cycles, out, pos) {
    const { freq, pw, ctrl, ad, sr, acc, lfsr, env, state, rateCount, ratePeriod, expCount, holdZero } = this;
    const rise = [0, 0, 0];
    const RC = 1 - Math.exp(-2 * Math.PI * 16000 / CLK), DC = 2 * Math.PI * 16 / CLK; // the C64's output stage
    let { lp, bp, rc, dc, box, boxN } = this;
    const w = this.w, q = this.q, route = this.route, mode = this.mode, vol = this.volume / 15;
    for (let c = 0; c < cycles; c++) {
      let filtIn = 0, direct = 0;
      for (let v = 0; v < 3; v++) {
        const before = acc[v];
        const now = (before + freq[v]) & 0xffffff;
        acc[v] = now;
        rise[v] = !(before & 0x800000) && (now & 0x800000) ? 1 : 0;
        if (!(before & 0x080000) && (now & 0x080000)) {
          const l = lfsr[v];
          lfsr[v] = ((l << 1) | (((l >> 22) ^ (l >> 17)) & 1)) & 0x7fffff;
        }
      }
      for (let v = 0; v < 3; v++) {
        const src = (v + 2) % 3;
        if ((ctrl[v] & 2) && rise[src]) acc[v] = 0;       // hard sync
        // Envelope, with the real 15-bit rate counter (so also the real "ADSR bug" without hard restart).
        rateCount[v] = (rateCount[v] + 1) & 0x7fff;
        if (rateCount[v] === ratePeriod[v]) {
          rateCount[v] = 0;
          const s = state[v];
          if (s === 0 || ++expCount[v] >= expPeriod(env[v])) {
            expCount[v] = 0;
            if (!holdZero[v]) {
              if (s === 0) {
                env[v]++;
                if (env[v] >= 255) { env[v] = 255; state[v] = 1; ratePeriod[v] = RATE[ad[v] & 15]; }
              } else if (s === 1) {
                if (env[v] !== (sr[v] >> 4) * 17) env[v]--;
              } else env[v]--;
              if (env[v] <= 0) { env[v] = 0; holdZero[v] = 1; }
            }
          }
        }
        // Waveforms: 12-bit DAC values; combined waveforms approximated by AND.
        const a = acc[v], cr = ctrl[v];
        let wave = 0xfff;
        if (cr & 0x10) {
          let msb = a & 0x800000;
          if (cr & 4) msb ^= acc[src] & 0x800000;          // ring modulation
          wave &= ((msb ? ~a : a) >> 11) & 0xfff;
        }
        if (cr & 0x20) wave &= a >> 12;
        if (cr & 0x40) wave &= (a >> 12) >= pw[v] ? 0xfff : 0;
        if (cr & 0x80) {
          const l = lfsr[v];
          wave &= ((l >> 9) & 0x800) | ((l >> 8) & 0x400) | ((l >> 5) & 0x200) | ((l >> 3) & 0x100)
            | ((l >> 2) & 0x080) | ((l << 1) & 0x040) | ((l << 3) & 0x020) | ((l << 4) & 0x010);
        }
        if (!(cr & 0xf0)) wave = 0x700;
        const s = (wave - 0x700) * env[v] / (255 * 2048);
        if (route & (1 << v)) filtIn += s; else direct += s;
      }
      // Two-integrator state-variable filter, slightly saturating like the 6581.
      lp += w * bp;
      const hp = filtIn - lp - q * bp;
      bp += w * hp;
      bp *= 1 - 0.012 * bp * bp;
      if (bp > 4) bp = 4; else if (bp < -4) bp = -4;
      const filt = (mode & 1 ? lp : 0) + (mode & 2 ? bp : 0) + (mode & 4 ? hp : 0);
      const mix = (direct + filt) * vol;
      rc += RC * (mix - rc);
      dc += DC * (rc - dc);
      box += rc - dc;
      if (++boxN === DECIM) { out[pos++] = box / DECIM; box = 0; boxN = 0; }
    }
    Object.assign(this, { lp, bp, rc, dc, box, boxN });
    return pos;
  }
}

// ---------------------------------------------------------------- the song
const midi = (name) => {
  const m = /^([A-G])(#?)(\d)$/.exec(name);
  if (!m) throw new Error(`bad note ${name}`);
  return { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1]] + (m[2] ? 1 : 0) + 12 * (Number(m[3]) + 1);
};
const CHORDS = { Am: [57, 60, 64, 33], F: [53, 57, 60, 29], G: [55, 59, 62, 31], C: [55, 60, 64, 36], E: [56, 59, 64, 28], Dm: [57, 62, 65, 38] };
// Two chords per bar. The last bar's E pulls back to Am at the loop point.
const A = 'Am Am Am Am F F G G Am Am Am Am F F G E'.split(' ');
const B = 'F F G G Am Am C C F F G G Am Am E E'.split(' ');
const C = 'Am Am F F Dm Dm E E Am Am F F G G E E'.split(' ');
const HARMONY = [...A, ...A, ...B, ...C];
const BARS = HARMONY.length / 2, TICKS = BARS * 16;
export const LOOP_FRAMES = BARS * FRAMES_PER_BAR;
const chordAt = (tick) => CHORDS[HARMONY[Math.floor(tick / 8)]];

// Melody: "note:length" in sixteenths, r = rest. Every bar must add up to 16.
const REST4 = ['r:16', 'r:16', 'r:16', 'r:16'];
const LEAD_A = ['E5:4 E5:2 D5:2 C5:4 D5:2 E5:2', 'A4:6 C5:2 r:2 C5:2 D5:2 E5:2', 'F5:4 E5:2 D5:2 C5:4 A4:2 C5:2', 'D5:6 B4:2 G4:4 B4:2 D5:2',
  'E5:4 E5:2 G5:2 A5:4 G5:2 E5:2', 'C5:4 E5:4 A4:6 r:2', 'F5:4 A5:2 G5:2 F5:4 E5:2 D5:2', 'D5:4 B4:4 G#4:4 B4:2 E5:2'];
const SOFT = [...REST4, 'A5:8 G5:4 E5:4', 'C5:12 r:4', 'F5:8 E5:4 C5:4', 'D5:4 B4:4 G#4:4 B4:4'];
// The melody carries on over new chords: same rhythms and motifs as LEAD_A, other notes, a little higher in the second half.
const LEAD_B = ['F5:4 F5:2 E5:2 C5:4 D5:2 F5:2', 'G5:6 D5:2 B4:4 D5:2 E5:2', 'E5:4 E5:2 G5:2 A5:4 G5:2 E5:2', 'G5:4 E5:4 C5:6 r:2',
  'A5:4 C6:2 A5:2 F5:4 E5:2 F5:2', 'G5:4 B5:2 A5:2 G5:4 F5:2 D5:2', 'E5:4 A5:2 G5:2 E5:4 D5:2 C5:2', 'B4:6 E5:2 G#4:4 B4:2 E5:2'];
const BELLS = ['A5:4 E6:4 C6:4 E5:4', 'F5:4 C6:4 A5:4 C5:4', 'D5:4 A5:4 F5:4 D6:4', 'E5:4 B5:4 G#5:4 E6:4'];
const PLUCK = ['A5:2 C6:2 E6:2 A5:2 C6:2 E6:2 A6:4', 'F5:2 A5:2 C6:2 F5:2 A5:2 C6:2 F6:4',
  'G5:2 B5:2 D6:2 G5:2 B5:2 D6:2 G6:4', 'E6:2 B5:2 G#5:2 E5:2 B4:2 G#4:2 E4:4'];

// Voice 1 shares bass and drums. K kick (falls into the bass note), L the same but quieter, S snare, H hat, . bass note, _ hold.
const P_SPARSE = 'K...S_.HK...S_.H', P_FULL = 'K.H.S_H.K.H.S_H.', P_FILL = 'K.H.S_H.K.S_S.SS', P_DRIVE = 'K.H.S_H.KKH.S_H.',
  P_FILL2 = 'K.H.S_H.S_S_SSSS', P_LONG = 'L_______L_______', P_LONG2 = 'L_______L___S_S_', P_FOUR = 'K.H.K.H.K.H.K.H.', P_ROLL = 'S_S_S_S_S.S.SSSS';
const DRUMS = [
  P_SPARSE, P_SPARSE, P_SPARSE, P_SPARSE, P_FULL, P_FULL, P_FULL, P_FILL,
  P_FULL, P_FULL, P_FULL, P_FULL, P_FULL, P_FULL, P_FULL, P_FILL,
  P_DRIVE, P_DRIVE, P_DRIVE, P_DRIVE, P_DRIVE, P_DRIVE, P_DRIVE, P_FILL2,
  P_LONG, P_LONG, P_LONG, P_LONG2, P_FOUR, P_FOUR, P_FOUR, P_ROLL];
const OCTAVE = [0, 0, 0, 12, 0, 0, 0, 0, 0, 0, 0, 12, 0, 0, 0, 12];
const ARP_GATES = 'x..x..x.x..x..x.';

const hzOf = (m) => 440 * 2 ** ((m - 69) / 12);
const reg = (hz) => Math.min(0xffff, Math.round(hz * 16777216 / CLK));
const tri = (x) => { const p = x - Math.floor(x); return p < 0.5 ? p * 2 : 2 - p * 2; };
const pwm = (frame, period, lo = 0x300, hi = 0xd00) => Math.round(lo + (hi - lo) * tri(frame / period));
const vibrato = (f, delay, depth) => f < delay ? 0 : depth * Math.min(1, (f - delay) / 10) * Math.sin(2 * Math.PI * f / 7);

// ---- Instruments: called every frame with f = frames since the note started. Waves: 0x10 tri, 0x20 saw, 0x40 pulse, 0x80 noise.
const bassBody = (e) => ({ hz: hzOf(e.note), wave: e.f < 1 ? 0x20 : 0x40, pw: 0x500 + (pwm(e.frame, 170) >> 2), filt: true });
const INST = {
  bass: { ad: 0x06, sr: 0x83, play: bassBody },
  kick: { ad: 0x07, sr: 0xa3, play: (e) => e.f === 0 ? { freq: 0x4000, wave: 0x80 }
    : e.f < 3 ? { hz: [0, 190, 110][e.f], wave: 0x10 } : { ...bassBody(e), wave: 0x40 } },
  kickSoft: { ad: 0x07, sr: 0x53, play: (e) => INST.kick.play(e) }, // leaves room for the bells in the breakdown
  snare: { ad: 0x07, sr: 0x02, play: (e) => e.f === 0 ? { hz: 330, wave: 0x40, pw: 0x800 } : e.f === 2 ? { hz: 196, wave: 0x40, pw: 0x800 }
    : { freq: Math.max(0x5000, 0xd000 - e.f * 0x0c00), wave: 0x80 } },
  hat: { ad: 0x01, sr: 0x00, play: () => ({ freq: 0xf000, wave: 0x80 }) },
  arp: { ad: 0x07, sr: 0x53, play: (e) => {
    const ch = chordAt(e.tick), filtered = e.bar < 8 || e.bar >= 28;
    return { hz: hzOf(ch[e.frame % 3] + 12), wave: 0x40, pw: pwm(e.frame, 128), filt: filtered };
  } },
  soft: { ad: 0x28, sr: 0x96, play: (e) => ({ hz: hzOf(e.note + vibrato(e.f, 16, 0.22)), wave: 0x10 }) },
  lead: { ad: 0x08, sr: 0xa4, play: (e) => ({ hz: hzOf(e.note - Math.max(0, 0.6 - e.f * 0.3) + vibrato(e.f, 14, 0.28)),
    wave: e.f < 1 ? 0x20 : 0x40, pw: pwm(e.frame, 96, 0x400, 0xc00) }) },
  // Ring modulation: voice 3's triangle is multiplied by a silent voice 2 an octave up and slightly detuned.
  bell: { ad: 0x09, sr: 0x06, play: (e) => ({ hz: hzOf(e.note), wave: 0x10, ring: true }) },
  ringSource: { ad: 0x00, sr: 0x00, silent: true, play: (e) => ({ hz: hzOf(e.note) * 2.004, wave: 0x10 }) },
  pluck: { ad: 0x07, sr: 0x53, play: (e) => ({ hz: hzOf(e.note), wave: 0x40, pw: pwm(e.frame, 80) }) },
  rest: { ad: 0x00, sr: 0x04, silent: true, play: () => ({ wave: 0x10 }) },
};

function melody(bars, inst, firstBar, track) {
  bars.forEach((line, i) => {
    let tick = (firstBar + i) * 16, used = 0;
    for (const tok of line.split(' ')) {
      const [name, len] = tok.split(':');
      track[tick + used] = name === 'r' ? { inst: INST.rest, note: 60 } : { inst, note: midi(name) };
      used += Number(len);
    }
    if (used !== 16) throw new Error(`bar ${firstBar + i + 1} adds up to ${used}: ${line}`);
  });
}

export function buildTracks() {
  const v1 = new Array(TICKS).fill(null), v2 = new Array(TICKS).fill(null), v3 = new Array(TICKS).fill(null);
  if (DRUMS.length !== BARS) throw new Error('drum list length');
  DRUMS.forEach((pattern, bar) => {
    if (pattern.length !== 16) throw new Error(`drum pattern ${pattern}`);
    [...pattern].forEach((ch, step) => {
      const tick = bar * 16 + step, root = chordAt(tick)[3];
      const note = root + 12 + (ch === '.' ? OCTAVE[step] : 0);
      const inst = { K: INST.kick, L: INST.kickSoft, S: INST.snare, H: INST.hat, '.': INST.bass }[ch];
      if (inst) v1[tick] = { inst, note };
    });
  });
  melody(SOFT, INST.soft, 0, v3);
  melody(LEAD_A, INST.lead, 8, v3);
  melody(LEAD_B, INST.lead, 16, v3);
  melody(BELLS, INST.bell, 24, v3);
  melody(PLUCK, INST.pluck, 28, v3);
  for (let bar = 0; bar < BARS; bar++) {
    for (let step = 0; step < 16; step++) {
      const tick = bar * 16 + step, lead = v3[tick];
      if (bar >= 24 && bar < 28) { if (lead) v2[tick] = { inst: INST.ringSource, note: lead.note }; }
      else if (ARP_GATES[step] === 'x') v2[tick] = { inst: INST.arp, note: 60 };
    }
  }
  return [v1, v2, v3];
}

// The one shared filter, played like an instrument across the song.
function filterAt(frame) {
  const bar = frame / FRAMES_PER_BAR;
  if (bar < 8) return { fc: 620 + 380 * bar / 8, res: 9, both: true };
  if (bar < 24) return { fc: 780 + 130 * Math.sin(2 * Math.PI * bar / 2), res: 10, both: false };
  if (bar < 28) return { fc: 430 + 530 * (bar - 24) / 4, res: 14, both: false };
  return { fc: 620 + 390 * (bar - 28) / 4, res: 11, both: true };
}

// The 50 Hz play routine. Returns a function that performs one frame's register writes.
export function makePlayer(sid) {
  const tracks = buildTracks();
  const cur = [null, null, null], since = [0, 0, 0];
  for (let v = 0; v < 3; v++) cur[v] = { inst: INST.rest, note: 60 };
  return (frame) => {
    const wrapped = frame % LOOP_FRAMES, tick = Math.floor(wrapped / SPEED), sub = wrapped % SPEED, bar = Math.floor(tick / 16);
    let route = 0;
    for (let v = 0; v < 3; v++) {
      const event = sub === 0 ? tracks[v][tick] : null;
      if (event) { cur[v] = event; since[v] = 0; }
      const next = tracks[v][(tick + 1) % TICKS];
      const hardRestart = sub >= SPEED - 2 && next && !next.inst.silent;
      const c = cur[v];
      const e = { f: since[v], note: c.note, tick, frame: wrapped, bar };
      const p = c.inst.play(e);
      const freq = p.freq ?? (p.hz !== undefined ? reg(p.hz) : undefined);
      const ctrl = p.wave | (p.ring ? 4 : 0);
      if (hardRestart) sid.setVoice(v, { freq, pw: p.pw, ad: 0, sr: 0, ctrl });
      else sid.setVoice(v, { freq, pw: p.pw, ad: c.inst.ad, sr: c.inst.sr, ctrl: ctrl | (c.inst.silent ? 0 : 1) });
      if (p.filt) route |= 1 << v;
      since[v]++;
    }
    const fl = filterAt(wrapped);
    if (!fl.both) route &= 1;
    sid.setFilter(Math.round(fl.fc), fl.res, route);
  };
}

// ---------------------------------------------------------------- rendering
function sinc(x) { return x === 0 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x); }

// Renders the song twice and cuts the second pass, so filter, envelopes and tails are already "in the loop".
export function render() {
  const sid = new SID();
  const play = makePlayer(sid);
  const loopCycles = LOOP_FRAMES * FRAME, loopIn = loopCycles / DECIM;
  const buf = new Float32Array(loopIn * 2 + 64);
  let pos = 0;
  for (let frame = 0; frame < LOOP_FRAMES * 2; frame++) { play(frame); pos = sid.run(FRAME, buf, pos); }

  const L = Math.round(loopCycles / CLK * OUT_RATE), step = loopIn / L, half = 40;
  const cutoff = 20000 / (CLK / DECIM) * 2;
  const read = (p) => {
    const i = Math.floor(p);
    let sum = 0;
    for (let k = i - half + 1; k <= i + half; k++) {
      if (k < 0 || k >= pos) continue;
      const d = k - p, t = d / half;
      sum += buf[k] * cutoff * sinc(cutoff * d) * (0.42 + 0.5 * Math.cos(Math.PI * t) + 0.08 * Math.cos(2 * Math.PI * t));
    }
    return sum;
  };
  // The oscillators' phases do not line up after a pass, so the last 15 ms crossfade into the end of the
  // previous pass, which by construction runs straight into the loop's first sample.
  const out = new Float32Array(L), fade = Math.round(FADE_SECONDS * OUT_RATE);
  for (let n = 0; n < L; n++) {
    const p = loopIn + n * step;
    const toEnd = L - n;
    if (toEnd > fade) { out[n] = read(p); continue; }
    const a = (1 - toEnd / fade) * Math.PI / 2;
    out[n] = read(p) * Math.cos(a) + read(p - loopIn) * Math.sin(a);
  }
  let peak = 0;
  for (const s of out) peak = Math.max(peak, Math.abs(s));
  // Soft knee for the few drum peaks, like an overdriven output stage, then -1 dBFS.
  const knee = 0.6 * peak, room = 0.25 * peak, gain = 0.89 / (knee + room);
  for (let n = 0; n < L; n++) {
    const a = Math.abs(out[n]);
    const y = a <= knee ? a : knee + room * Math.tanh((a - knee) / room);
    out[n] = Math.sign(out[n]) * y * gain;
  }
  return out;
}

export function wavBytes(samples, rate = OUT_RATE) {
  const b = Buffer.alloc(44 + samples.length * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + samples.length * 2, 4); b.write('WAVEfmt ', 8);
  b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22); b.writeUInt32LE(rate, 24);
  b.writeUInt32LE(rate * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(samples.length * 2, 40);
  samples.forEach((s, i) => b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(s * 32767))), 44 + i * 2));
  return b;
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const t0 = Date.now();
  const samples = render();
  const path = fileURLToPath(new URL('../audio/neon-breaker-sid-loop.wav', import.meta.url));
  writeFileSync(path, wavBytes(samples));
  console.log(`${path}\n${(samples.length / OUT_RATE).toFixed(2)} s, ${samples.length} samples, rendered in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
}
