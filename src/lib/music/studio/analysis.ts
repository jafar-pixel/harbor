/**
 * Track analysis for the DJ Studio: tempo and first-beat offset (the beat grid), and the colour
 * waveform. Runs once per track on the decoded audio. Plain module, no I/O.
 */

export type Waveform = {
  /** Bins per second of audio. */
  rate: number;
  /** Loudness per bin, 0-1, for the whole signal and for its bass, mids and highs. */
  peak: Float32Array;
  low: Float32Array;
  mid: Float32Array;
  high: Float32Array;
};

export type BeatGrid = { bpm: number; offset: number };

const WAVE_RATE = 150;

/** Mono mix of the first two channels. */
function mono(buffer: AudioBuffer): Float32Array {
  const a = buffer.getChannelData(0);
  if (buffer.numberOfChannels < 2) return a;
  const b = buffer.getChannelData(1);
  const out = new Float32Array(a.length);
  for (let i = 0; i < a.length; i++) out[i] = (a[i] + b[i]) / 2;
  return out;
}

export function waveform(buffer: AudioBuffer): Waveform {
  const data = mono(buffer);
  const sr = buffer.sampleRate;
  const hop = Math.max(1, Math.floor(sr / WAVE_RATE));
  const bins = Math.ceil(data.length / hop);
  const peak = new Float32Array(bins);
  const low = new Float32Array(bins);
  const mid = new Float32Array(bins);
  const high = new Float32Array(bins);
  // Two one-pole low-passes split the signal: under 250 Hz, 250 Hz-2.5 kHz, and above.
  const a1 = 1 - Math.exp((-2 * Math.PI * 250) / sr);
  const a2 = 1 - Math.exp((-2 * Math.PI * 2500) / sr);
  let lp1 = 0;
  let lp2 = 0;
  let top = 1e-6;
  for (let b = 0; b < bins; b++) {
    let p = 0;
    let l = 0;
    let m = 0;
    let h = 0;
    const end = Math.min(data.length, (b + 1) * hop);
    for (let i = b * hop; i < end; i++) {
      const v = data[i];
      lp1 += a1 * (v - lp1);
      lp2 += a2 * (v - lp2);
      const av = Math.abs(v);
      const al = Math.abs(lp1);
      const am = Math.abs(lp2 - lp1);
      const ah = Math.abs(v - lp2);
      if (av > p) p = av;
      if (al > l) l = al;
      if (am > m) m = am;
      if (ah > h) h = ah;
    }
    peak[b] = p;
    low[b] = l;
    mid[b] = m;
    high[b] = h;
    if (p > top) top = p;
  }
  for (let b = 0; b < bins; b++) {
    peak[b] /= top;
    low[b] = Math.min(1, low[b] / top);
    mid[b] = Math.min(1, (mid[b] / top) * 1.3);
    high[b] = Math.min(1, (high[b] / top) * 1.8);
  }
  return { rate: WAVE_RATE, peak, low, mid, high };
}

/**
 * Tempo by autocorrelation of the onset envelope (bass-weighted), folded into 70-180 BPM, and
 * the offset of the first beat. Good on steady dance, hip-hop and pop; live recordings drift.
 */
export function beatGrid(buffer: AudioBuffer): BeatGrid {
  const data = mono(buffer);
  const sr = buffer.sampleRate;
  const hop = Math.floor(sr / 200); // about 5 ms frames
  // The real frame rate: 22050 / 110 is 200.45, and that 0.2% would put every tempo off.
  const fps = sr / hop;
  const frames = Math.floor(data.length / hop);
  // One-pole low-pass keeps the kick and bass that carry the beat.
  const alpha = 1 - Math.exp((-2 * Math.PI * 150) / sr);
  let lp = 0;
  const energy = new Float32Array(frames);
  for (let f = 0; f < frames; f++) {
    let sum = 0;
    for (let i = f * hop; i < (f + 1) * hop; i++) {
      lp += alpha * (data[i] - lp);
      sum += lp * lp + data[i] * data[i] * 0.15;
    }
    energy[f] = Math.sqrt(sum / hop);
  }
  const onset = new Float32Array(frames);
  for (let f = 1; f < frames; f++) onset[f] = Math.max(0, energy[f] - energy[f - 1]);

  // Analyse up to two minutes from 15% in, past most intros.
  const from = Math.floor(frames * 0.15);
  const to = Math.min(frames, from + Math.round(fps * 120));
  const minLag = Math.floor((60 / 180) * fps);
  const maxLag = Math.ceil((60 / 70) * fps);
  const corr = (lag: number) => {
    let sum = 0;
    for (let f = from; f + lag < to; f++) sum += onset[f] * onset[f + lag];
    // Also reward the double period, which steadies the pick between n and 2n.
    for (let f = from; f + 2 * lag < to; f += 2) sum += 0.5 * onset[f] * onset[f + 2 * lag];
    return sum;
  };
  let bestLag = 0;
  let best = -1;
  for (let lag = minLag; lag <= maxLag; lag++) {
    const sum = corr(lag);
    if (sum > best) {
      best = sum;
      bestLag = lag;
    }
  }
  if (!bestLag) return { bpm: 0, offset: 0 };
  // A 5 ms frame is coarse at fast tempos: refine the peak between neighbouring lags.
  const before = corr(bestLag - 1);
  const after = corr(bestLag + 1);
  const curve = before - 2 * best + after;
  const lag = curve < 0 ? bestLag + (0.5 * (before - after)) / curve : bestLag;
  let bpm = (60 * fps) / lag;
  while (bpm < 70) bpm *= 2;
  while (bpm > 180) bpm /= 2;

  // Fine pass: comb every candidate tempo and phase against the onsets of the whole window, so
  // a synced pair of tracks stays locked for minutes, not seconds.
  let bestScore = -1;
  let fineBpm = bpm;
  let fineOffset = 0;
  for (let cand = bpm - 1.5; cand <= bpm + 1.5; cand += 0.05) {
    const period = (60 / cand) * fps;
    const steps = Math.max(1, Math.round(period / 2));
    for (let p = 0; p < steps; p++) {
      const phase = (p / steps) * period;
      let sum = 0;
      for (let f = from + phase; f < to; f += period) {
        const i = Math.round(f);
        sum += onset[i] + 0.5 * (onset[i - 1] + onset[i + 1]);
      }
      if (sum > bestScore) {
        bestScore = sum;
        fineBpm = cand;
        fineOffset = phase / fps;
      }
    }
  }
  // Produced music is nearly always on a whole BPM.
  const whole = Math.round(fineBpm);
  const finalBpm = Math.abs(fineBpm - whole) <= 0.2 ? whole : Math.round(fineBpm * 100) / 100;
  const beatLen = 60 / finalBpm;
  const offset = (((from / fps + fineOffset) % beatLen) + beatLen) % beatLen;
  return { bpm: finalBpm, offset };
}

/** Beat number (fractional) at a time on the grid. */
export function beatAt(grid: BeatGrid, seconds: number): number {
  return grid.bpm ? ((seconds - grid.offset) * grid.bpm) / 60 : 0;
}

/** Time of a beat number on the grid. */
export function timeOfBeat(grid: BeatGrid, beat: number): number {
  return grid.bpm ? grid.offset + (beat * 60) / grid.bpm : 0;
}

export type MusicalKey = { name: string; camelot: string };

const NOTES = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
// Krumhansl-Kessler key profiles, from C.
const MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];
// Camelot numbers by tonic pitch class.
const CAMELOT_MAJOR = [8, 3, 10, 5, 12, 7, 2, 9, 4, 11, 6, 1];
const CAMELOT_MINOR = [5, 12, 7, 2, 9, 4, 11, 6, 1, 8, 3, 10];

/** In-place radix-2 FFT. */
function fft(re: Float32Array, im: Float32Array) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) {
      [re[i], re[j]] = [re[j], re[i]];
      [im[i], im[j]] = [im[j], im[i]];
    }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (-2 * Math.PI) / len;
    const wr = Math.cos(ang);
    const wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1;
      let ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k;
        const b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci;
        const ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr;
        im[b] = im[a] - ti;
        re[a] += tr;
        im[a] += ti;
        const nr = cr * wr - ci * wi;
        ci = cr * wi + ci * wr;
        cr = nr;
      }
    }
  }
}

/**
 * The song's key, from a chroma profile (energy per pitch class) of up to 90 seconds from the
 * middle, matched against major and minor key profiles. Shown as a name (Dm) and Camelot (7A).
 */
export function musicalKey(buffer: AudioBuffer): MusicalKey | null {
  const data = mono(buffer);
  const step = Math.max(1, Math.floor(buffer.sampleRate / 11025));
  const sr = buffer.sampleRate / step;
  const size = 4096;
  const total = Math.floor(data.length / step);
  const span = Math.min(total, Math.floor(sr * 90));
  const from = Math.max(0, Math.floor((total - span) / 2));
  const chroma = new Float64Array(12);
  const window = new Float32Array(size);
  for (let i = 0; i < size; i++) window[i] = 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / size);
  const re = new Float32Array(size);
  const im = new Float32Array(size);
  const binPc = new Int8Array(size / 2).fill(-1);
  for (let k = 1; k < size / 2; k++) {
    const f = (k * sr) / size;
    if (f < 55 || f > 2000) continue;
    binPc[k] = (((Math.round(12 * Math.log2(f / 440)) + 9) % 12) + 12) % 12;
  }
  for (let start = from; start + size <= from + span; start += size) {
    for (let i = 0; i < size; i++) {
      re[i] = data[(start + i) * step] * window[i];
      im[i] = 0;
    }
    fft(re, im);
    for (let k = 1; k < size / 2; k++) {
      const pc = binPc[k];
      if (pc >= 0) chroma[pc] += Math.log1p(Math.hypot(re[k], im[k]));
    }
  }
  if (chroma.every((v) => v === 0)) return null;
  const corr = (profile: number[], tonic: number) => {
    let sx = 0;
    let sy = 0;
    for (let i = 0; i < 12; i++) {
      sx += chroma[(i + tonic) % 12];
      sy += profile[i];
    }
    const mx = sx / 12;
    const my = sy / 12;
    let num = 0;
    let dx = 0;
    let dy = 0;
    for (let i = 0; i < 12; i++) {
      const x = chroma[(i + tonic) % 12] - mx;
      const y = profile[i] - my;
      num += x * y;
      dx += x * x;
      dy += y * y;
    }
    return num / Math.sqrt(dx * dy || 1);
  };
  let best = { score: -2, tonic: 0, minor: false };
  for (let tonic = 0; tonic < 12; tonic++) {
    const major = corr(MAJOR, tonic);
    const minor = corr(MINOR, tonic);
    if (major > best.score) best = { score: major, tonic, minor: false };
    if (minor > best.score) best = { score: minor, tonic, minor: true };
  }
  return best.minor
    ? { name: `${NOTES[best.tonic]}m`, camelot: `${CAMELOT_MINOR[best.tonic]}A` }
    : { name: NOTES[best.tonic], camelot: `${CAMELOT_MAJOR[best.tonic]}B` };
}
