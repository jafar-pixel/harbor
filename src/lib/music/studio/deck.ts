import { beatAt, timeOfBeat, type BeatGrid, type MusicalKey, type Waveform } from "./analysis";

/** A track loaded on a deck: decoded audio plus its analysis. */
export type StudioTrack = {
  id: string;
  title: string;
  artist: string;
  art?: string;
  buffer: AudioBuffer;
  grid: BeatGrid;
  wave: Waveform;
  key: MusicalKey | null;
};

export type XfadeSide = "A" | "B" | "thru";
export const HOT_CUES = 8;

/**
 * One DJ deck on the Web Audio graph: playback with pitch (vinyl-style rate), cue and hot cues,
 * beat loops, sync, 3-band EQ, a one-knob filter, trim and channel fader. Playback is an
 * AudioBufferSourceNode that is replaced on every seek, so position is tracked here.
 */
export class StudioDeck {
  track: StudioTrack | null = null;
  playing = false;
  /** Pitch fader: 1 = original tempo. */
  rate = 1;
  /** Temporary push from the jog wheel or nudge buttons. */
  bend = 0;
  cue = 0;
  hotCues: (number | null)[] = Array(HOT_CUES).fill(null);
  loop: { start: number; end: number; beats: number } | null = null;
  side: XfadeSide;
  /** Values the mixer shows; the nodes hold the real state. */
  mix = { trim: 1, low: 0, mid: 0, high: 0, filter: 0, fader: 0.85 };

  readonly analyser: AnalyserNode;
  readonly output: GainNode;
  private readonly trimNode: GainNode;
  private readonly lowNode: BiquadFilterNode;
  private readonly midNode: BiquadFilterNode;
  private readonly highNode: BiquadFilterNode;
  private readonly lpNode: BiquadFilterNode;
  private readonly hpNode: BiquadFilterNode;
  private readonly faderNode: GainNode;
  private source: AudioBufferSourceNode | null = null;
  private anchorTime = 0;
  private anchorPos = 0;
  private listeners = new Set<() => void>();

  private readonly ctx: AudioContext;
  readonly index: number;

  constructor(ctx: AudioContext, index: number, destination: AudioNode) {
    this.ctx = ctx;
    this.index = index;
    this.side = index % 2 === 0 ? "A" : "B";
    this.trimNode = ctx.createGain();
    this.lowNode = shelf(ctx, "lowshelf", 220);
    this.midNode = shelf(ctx, "peaking", 1100);
    this.midNode.Q.value = 0.8;
    this.highNode = shelf(ctx, "highshelf", 3800);
    this.lpNode = ctx.createBiquadFilter();
    this.lpNode.type = "lowpass";
    this.lpNode.frequency.value = 22050;
    this.hpNode = ctx.createBiquadFilter();
    this.hpNode.type = "highpass";
    this.hpNode.frequency.value = 10;
    this.faderNode = ctx.createGain();
    this.faderNode.gain.value = this.mix.fader;
    this.output = ctx.createGain();
    this.analyser = ctx.createAnalyser();
    this.analyser.fftSize = 1024;
    this.trimNode
      .connect(this.lowNode)
      .connect(this.midNode)
      .connect(this.highNode)
      .connect(this.lpNode)
      .connect(this.hpNode)
      .connect(this.faderNode)
      .connect(this.output)
      .connect(destination);
    this.faderNode.connect(this.analyser);
  }

  subscribe(fn: () => void): () => void {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  private changed() {
    for (const fn of this.listeners) fn();
  }

  get duration(): number {
    return this.track?.buffer.duration ?? 0;
  }

  get bpm(): number {
    return this.track?.grid.bpm ?? 0;
  }

  /** Tempo as heard, after the pitch fader. */
  get liveBpm(): number {
    return this.bpm * this.rate;
  }

  get position(): number {
    if (!this.playing) return this.anchorPos;
    let pos = this.anchorPos + (this.ctx.currentTime - this.anchorTime) * this.speed();
    if (this.loop && pos >= this.loop.end) {
      const len = this.loop.end - this.loop.start;
      pos = this.loop.start + ((pos - this.loop.start) % len);
    }
    return Math.min(pos, this.duration);
  }

  /** Beat number under the playhead. */
  get beat(): number {
    return this.track ? beatAt(this.track.grid, this.position) : 0;
  }

  private speed() {
    return Math.max(0.05, this.rate + this.bend);
  }

  load(track: StudioTrack) {
    this.stopSource();
    this.track = track;
    this.playing = false;
    this.rate = 1;
    this.bend = 0;
    this.loop = null;
    this.hotCues = Array(HOT_CUES).fill(null);
    // Cue on the first beat.
    this.cue = track.grid.bpm ? track.grid.offset : 0;
    this.anchorPos = this.cue;
    this.changed();
  }

  eject() {
    this.stopSource();
    this.track = null;
    this.playing = false;
    this.anchorPos = 0;
    this.loop = null;
    this.changed();
  }

  private stopSource() {
    if (!this.source) return;
    this.source.onended = null;
    try {
      this.source.stop();
    } catch {
      /* already stopped */
    }
    this.source.disconnect();
    this.source = null;
  }

  private startSource(at: number) {
    if (!this.track) return;
    this.stopSource();
    const src = this.ctx.createBufferSource();
    src.buffer = this.track.buffer;
    src.playbackRate.value = this.speed();
    if (this.loop) {
      src.loop = true;
      src.loopStart = this.loop.start;
      src.loopEnd = this.loop.end;
    }
    src.connect(this.trimNode);
    src.onended = () => {
      if (this.source !== src) return;
      this.anchorPos = this.duration;
      this.playing = false;
      this.source = null;
      this.changed();
    };
    this.anchorTime = this.ctx.currentTime;
    this.anchorPos = at;
    src.start(0, Math.max(0, Math.min(at, this.duration)));
    this.source = src;
  }

  play() {
    if (!this.track || this.playing) return;
    void this.ctx.resume();
    if (this.anchorPos >= this.duration - 0.05) this.anchorPos = this.cue;
    this.playing = true;
    this.startSource(this.anchorPos);
    this.changed();
  }

  pause() {
    if (!this.playing) return;
    this.anchorPos = this.position;
    this.playing = false;
    this.stopSource();
    this.changed();
  }

  toggle() {
    if (this.playing) this.pause();
    else this.play();
  }

  seek(seconds: number) {
    const at = Math.max(0, Math.min(seconds, this.duration));
    if (this.loop && (at < this.loop.start || at > this.loop.end)) this.loop = null;
    if (this.playing) this.startSource(at);
    else this.anchorPos = at;
    this.changed();
  }

  /** Jump by a number of beats (or seconds without a grid), keeping time. */
  skipBeats(beats: number) {
    const bpm = this.bpm || 120;
    this.seek(this.position + (beats * 60) / bpm);
  }

  /** Snap a time to the nearest beat when the track has a grid. */
  snap(seconds: number): number {
    const grid = this.track?.grid;
    if (!grid?.bpm) return seconds;
    return Math.max(0, timeOfBeat(grid, Math.round(beatAt(grid, seconds))));
  }

  /** CUE: while playing, back to the cue point and stop; while stopped, set it here. */
  cuePress() {
    if (this.playing) {
      this.pause();
      this.seek(this.cue);
    } else {
      this.cue = this.snap(this.position);
      this.seek(this.cue);
    }
    this.changed();
  }

  hotCue(n: number) {
    const at = this.hotCues[n];
    if (at == null) {
      this.hotCues[n] = this.snap(this.position);
      this.changed();
      return;
    }
    this.seek(at);
    if (!this.playing) this.play();
  }

  clearHotCue(n: number) {
    this.hotCues[n] = null;
    this.changed();
  }

  /** A loop of `beats` from the beat under the playhead; the same size again exits it. */
  setLoop(beats: number) {
    if (!this.track) return;
    if (this.loop?.beats === beats) {
      this.exitLoop();
      return;
    }
    const bpm = this.bpm || 120;
    const start = this.bpm ? this.snap(this.position - 0.02) : this.position;
    const end = Math.min(this.duration, start + (beats * 60) / bpm);
    const pos = this.position;
    this.loop = { start, end, beats };
    if (this.playing) this.startSource(pos < start || pos >= end ? start : pos);
    this.changed();
  }

  exitLoop() {
    if (!this.loop) return;
    const pos = this.position;
    this.loop = null;
    if (this.playing) this.startSource(pos);
    this.changed();
  }

  /** Halve or double the active loop. */
  resizeLoop(factor: 0.5 | 2) {
    if (!this.loop) return;
    const beats = Math.max(1 / 16, Math.min(64, this.loop.beats * factor));
    const start = this.loop.start;
    const pos = this.position;
    this.loop = null;
    const bpm = this.bpm || 120;
    this.loop = { start, end: Math.min(this.duration, start + (beats * 60) / bpm), beats };
    if (this.playing) this.startSource(pos >= this.loop.end ? start : pos);
    this.changed();
  }

  setRate(rate: number) {
    const pos = this.position;
    this.rate = Math.max(0.25, Math.min(1.75, rate));
    this.applySpeed(pos);
    this.changed();
  }

  /** Jog wheel / nudge: a temporary speed push (playing) or a scrub (stopped). */
  setBend(bend: number) {
    const pos = this.position;
    this.bend = bend;
    this.applySpeed(pos);
  }

  private applySpeed(pos: number) {
    if (!this.playing || !this.source) return;
    this.anchorPos = pos;
    this.anchorTime = this.ctx.currentTime;
    this.source.playbackRate.setValueAtTime(this.speed(), this.ctx.currentTime);
  }

  /** Match tempo to another deck, then line the beats up. */
  syncTo(master: StudioDeck) {
    if (!this.bpm || !master.bpm || !this.track || !master.track) return;
    let target = master.liveBpm;
    // Half or double time when that is closer (a 70 BPM track against 140).
    if (Math.abs(target / 2 - this.bpm) < Math.abs(target - this.bpm)) target /= 2;
    if (Math.abs(target * 2 - this.bpm) < Math.abs(target - this.bpm)) target *= 2;
    this.setRate(target / this.bpm);
    if (!this.playing || !master.playing) return;
    const phaseMaster = master.beat - Math.floor(master.beat);
    const phaseThis = this.beat - Math.floor(this.beat);
    let delta = phaseMaster - phaseThis;
    if (delta > 0.5) delta -= 1;
    if (delta < -0.5) delta += 1;
    this.seek(this.position + (delta * 60) / this.bpm);
  }

  setMix(patch: Partial<StudioDeck["mix"]>) {
    this.mix = { ...this.mix, ...patch };
    const t = this.ctx.currentTime;
    const ramp = (param: AudioParam, value: number) => param.setTargetAtTime(value, t, 0.012);
    ramp(this.trimNode.gain, this.mix.trim);
    ramp(this.lowNode.gain, this.mix.low);
    ramp(this.midNode.gain, this.mix.mid);
    ramp(this.highNode.gain, this.mix.high);
    ramp(this.faderNode.gain, this.mix.fader * this.mix.fader);
    // One filter knob: left sweeps a low-pass down, right sweeps a high-pass up.
    const f = this.mix.filter;
    ramp(this.lpNode.frequency, f < 0 ? 22050 * Math.pow(0.004, -f) : 22050);
    ramp(this.hpNode.frequency, f > 0 ? 10 * Math.pow(800, f) : 10);
    this.lpNode.Q.value = this.hpNode.Q.value = Math.abs(f) > 0.02 ? 1.2 : 0.7;
    this.changed();
  }

  setSide(side: XfadeSide) {
    this.side = side;
    this.changed();
  }

  /** Current loudness 0-1 for the level meter. */
  level(scratch: Float32Array<ArrayBuffer>): number {
    this.analyser.getFloatTimeDomainData(scratch);
    let peak = 0;
    for (let i = 0; i < scratch.length; i++) {
      const v = Math.abs(scratch[i]);
      if (v > peak) peak = v;
    }
    return Math.min(1, peak);
  }
}

function shelf(ctx: AudioContext, type: BiquadFilterType, frequency: number): BiquadFilterNode {
  const node = ctx.createBiquadFilter();
  node.type = type;
  node.frequency.value = frequency;
  node.gain.value = 0;
  return node;
}
