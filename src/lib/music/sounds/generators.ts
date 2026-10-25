import type { NatureBed, NoiseColor } from "./catalog";

/**
 * Sample generation for Moods & Sounds: noise colours and the noise beds the nature sounds are
 * shaped from. Pure functions over Float32Arrays so they run (and are tested) without Web Audio;
 * the engine copies them into looping AudioBuffers.
 */

/** A small seeded random source, so a loop sounds the same each time it's built. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    // xorshift32
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) / 0xffffffff) * 2 - 1;
  };
}

function normalize(data: Float32Array, peak = 0.9): Float32Array {
  let max = 0;
  for (let i = 0; i < data.length; i++) max = Math.max(max, Math.abs(data[i]));
  if (max > 0) {
    const k = peak / max;
    for (let i = 0; i < data.length; i++) data[i] *= k;
  }
  return data;
}

/** Remove the DC offset that integrating (brown) noise drifts into. */
function centre(data: Float32Array): Float32Array {
  let sum = 0;
  for (let i = 0; i < data.length; i++) sum += data[i];
  const mean = sum / (data.length || 1);
  for (let i = 0; i < data.length; i++) data[i] -= mean;
  return data;
}

/**
 * Fade the first and last few milliseconds toward each other so the loop point doesn't click:
 * the tail blends into the head's start.
 */
function seamless(data: Float32Array, sampleRate: number): Float32Array {
  const n = Math.min(Math.floor(sampleRate * 0.05), Math.floor(data.length / 4));
  for (let i = 0; i < n; i++) {
    const w = i / n;
    const tail = data.length - n + i;
    data[tail] = data[tail] * (1 - w) + data[i] * w;
  }
  return data;
}

/** One-pole low-pass, in place. */
function lowPass(data: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const a = dt / (rc + dt);
  let y = 0;
  for (let i = 0; i < data.length; i++) {
    y += a * (data[i] - y);
    data[i] = y;
  }
  return data;
}

/** One-pole high-pass, in place. */
function highPass(data: Float32Array, sampleRate: number, cutoffHz: number): Float32Array {
  const dt = 1 / sampleRate;
  const rc = 1 / (2 * Math.PI * cutoffHz);
  const a = rc / (rc + dt);
  let prevX = 0;
  let prevY = 0;
  for (let i = 0; i < data.length; i++) {
    const x = data[i];
    const y = a * (prevY + x - prevX);
    prevX = x;
    prevY = y;
    data[i] = y;
  }
  return data;
}

/** A noise colour, `length` samples long, normalised and ready to loop. */
export function noiseSamples(
  color: NoiseColor,
  length: number,
  sampleRate: number,
  seed = 1,
): Float32Array {
  const rand = seededRandom(seed);
  const out = new Float32Array(length);
  switch (color) {
    case "white":
      for (let i = 0; i < length; i++) out[i] = rand();
      break;
    case "pink": {
      // Paul Kellet's refined pink filter.
      let b0 = 0,
        b1 = 0,
        b2 = 0,
        b3 = 0,
        b4 = 0,
        b5 = 0,
        b6 = 0;
      for (let i = 0; i < length; i++) {
        const w = rand();
        b0 = 0.99886 * b0 + w * 0.0555179;
        b1 = 0.99332 * b1 + w * 0.0750759;
        b2 = 0.969 * b2 + w * 0.153852;
        b3 = 0.8665 * b3 + w * 0.3104856;
        b4 = 0.55 * b4 + w * 0.5329522;
        b5 = -0.7616 * b5 - w * 0.016898;
        out[i] = b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362;
        b6 = w * 0.115926;
      }
      break;
    }
    case "brown": {
      let last = 0;
      for (let i = 0; i < length; i++) {
        // Leaky integration keeps the walk from wandering off.
        last = (last + 0.02 * rand()) / 1.02;
        out[i] = last;
      }
      centre(out);
      break;
    }
    case "green": {
      // Pink noise band-limited around the middle of hearing (~500 Hz).
      out.set(noiseSamples("pink", length, sampleRate, seed));
      highPass(out, sampleRate, 250);
      lowPass(out, sampleRate, 1200);
      lowPass(out, sampleRate, 1200);
      break;
    }
    case "blue": {
      let prev = 0;
      for (let i = 0; i < length; i++) {
        const w = rand();
        out[i] = w - prev;
        prev = w;
      }
      break;
    }
    case "violet": {
      let prev = 0;
      let prevDiff = 0;
      for (let i = 0; i < length; i++) {
        const w = rand();
        const diff = w - prev;
        out[i] = diff - prevDiff;
        prev = w;
        prevDiff = diff;
      }
      break;
    }
  }
  return seamless(normalize(out), sampleRate);
}

/**
 * The noise bed a nature sound is shaped from. The engine adds the motion (waves swelling, wind
 * gusting, thunder rolls); this is the steady texture under it.
 */
export function natureSamples(
  bed: NatureBed,
  length: number,
  sampleRate: number,
  seed = 7,
): Float32Array {
  const rand = seededRandom(seed);
  let out: Float32Array;
  switch (bed) {
    case "rain": {
      out = noiseSamples("pink", length, sampleRate, seed);
      highPass(out, sampleRate, 400);
      // Scattered drops: short bright ticks on top of the hiss.
      for (let i = 0; i < length; i += Math.floor(sampleRate * (0.004 + 0.02 * Math.abs(rand())))) {
        const amp = 0.4 + 0.5 * Math.abs(rand());
        for (let k = 0; k < 40 && i + k < length; k++)
          out[i + k] += amp * rand() * Math.exp(-k / 6);
      }
      break;
    }
    case "ocean":
      out = noiseSamples("brown", length, sampleRate, seed);
      break;
    case "wind":
      out = noiseSamples("pink", length, sampleRate, seed);
      lowPass(out, sampleRate, 700);
      break;
    case "river": {
      out = noiseSamples("white", length, sampleRate, seed);
      highPass(out, sampleRate, 300);
      lowPass(out, sampleRate, 2500);
      break;
    }
    case "fire": {
      out = noiseSamples("brown", length, sampleRate, seed);
      for (let i = 0; i < length; i++) out[i] *= 0.5;
      // Crackles: sparse sharp pops.
      let i = 0;
      while (i < length) {
        i += Math.floor(sampleRate * (0.03 + 0.25 * Math.abs(rand())));
        const amp = 0.5 + 0.5 * Math.abs(rand());
        const len = 20 + Math.floor(80 * Math.abs(rand()));
        for (let k = 0; k < len && i + k < length; k++)
          out[i + k] += amp * rand() * Math.exp(-k / (len / 4));
      }
      break;
    }
    case "thunder": {
      out = natureSamples("rain", length, sampleRate, seed);
      break;
    }
  }
  return seamless(normalize(out), sampleRate);
}

/**
 * The share of a signal's energy below `hz`, measured with a simple low-pass. Used by the tests
 * to check each colour leans the right way (brown low, blue and violet high).
 */
export function lowBandShare(data: Float32Array, sampleRate: number, hz: number): number {
  const low = lowPass(Float32Array.from(data), sampleRate, hz);
  let total = 0;
  let lows = 0;
  for (let i = 0; i < data.length; i++) {
    total += data[i] * data[i];
    lows += low[i] * low[i];
  }
  return total > 0 ? lows / total : 0;
}

/** Sleep-timer fade: the master gain at `elapsed` seconds into a fade lasting `duration`. */
export function fadeGain(elapsed: number, duration: number): number {
  if (duration <= 0) return 0;
  const x = Math.min(1, Math.max(0, elapsed / duration));
  // Equal-power curve: gentle at first, then down to silence.
  return Math.cos((x * Math.PI) / 2);
}
