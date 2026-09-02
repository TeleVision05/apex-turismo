/**
 * AudioContext lifecycle, master bus wiring and small synthesis helpers
 * shared by every voice/effect module. Nothing here creates nodes per
 * frame; callers are expected to build a node graph once and only touch
 * AudioParams afterwards.
 */

export interface AudioCore {
  ctx: AudioContext;
  /** category buses feeding the master chain */
  engineBus: GainNode;
  effectsBus: GainNode;
  musicBus: GainNode;
  masterGain: GainNode;
  compressor: DynamicsCompressorNode;
  /** exposed for a debug/preview page; may be null in a minimal mock context */
  analyser: AnalyserNode | null;
  /** engine voices connect here; muted as a group by setRaceActive(false) */
  raceEngineGain: GainNode;
  /** tyre/wind/ambience loops connect here; muted with the engine on pause */
  raceLoopGain: GainNode;
  /** global -12dB/oct ceiling on every engine voice, opens slightly with throttle */
  engineLowpass: BiquadFilterNode;
}

function resolveCtor(): (new () => AudioContext) | null {
  const g = globalThis as unknown as {
    AudioContext?: new () => AudioContext;
    webkitAudioContext?: new () => AudioContext;
  };
  return g.AudioContext ?? g.webkitAudioContext ?? null;
}

/** Builds the AudioContext + master chain. Returns null if Web Audio is unavailable. */
export function createAudioCore(): AudioCore | null {
  try {
    const Ctor = resolveCtor();
    if (!Ctor) return null;
    const ctx = new Ctor();

    const engineBus = ctx.createGain();
    const effectsBus = ctx.createGain();
    const musicBus = ctx.createGain();
    const masterGain = ctx.createGain();
    const compressor = ctx.createDynamicsCompressor();
    const raceEngineGain = ctx.createGain();
    const raceLoopGain = ctx.createGain();
    const engineLowpass = ctx.createBiquadFilter();
    // gentle master-bus high-shelf cut so the whole mix sits a touch darker,
    // on top of the per-voice shaping already done in the engine chain.
    const masterHighShelf = ctx.createBiquadFilter();

    engineBus.gain.value = 1;
    effectsBus.gain.value = 1;
    musicBus.gain.value = 1;
    masterGain.gain.value = 1;
    raceEngineGain.gain.value = 1;
    raceLoopGain.gain.value = 1;
    compressor.threshold.value = -20;
    compressor.knee.value = 24;
    compressor.ratio.value = 3;
    compressor.attack.value = 0.006;
    compressor.release.value = 0.25;
    engineLowpass.type = 'lowpass';
    engineLowpass.frequency.value = 3800;
    engineLowpass.Q.value = 0.7;
    masterHighShelf.type = 'highshelf';
    masterHighShelf.frequency.value = 2500;
    masterHighShelf.gain.value = -6;

    raceEngineGain.connect(engineLowpass).connect(engineBus);
    raceLoopGain.connect(effectsBus);
    engineBus.connect(masterGain);
    effectsBus.connect(masterGain);
    musicBus.connect(masterGain);
    masterGain.connect(masterHighShelf).connect(compressor);

    let analyser: AnalyserNode | null = null;
    if (typeof ctx.createAnalyser === 'function') {
      try {
        analyser = ctx.createAnalyser();
        analyser.fftSize = 2048;
      } catch {
        analyser = null;
      }
    }
    if (analyser) {
      compressor.connect(analyser);
      analyser.connect(ctx.destination);
    } else {
      compressor.connect(ctx.destination);
    }

    return {
      ctx,
      engineBus,
      effectsBus,
      musicBus,
      masterGain,
      compressor,
      analyser,
      raceEngineGain,
      raceLoopGain,
      engineLowpass,
    };
  } catch {
    return null;
  }
}

export function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

/** Smoothly approach `value` without zippering; safe no-op on bad input. */
export function ramp(
  param: AudioParam,
  value: number,
  ctx: BaseAudioContext,
  timeConstant = 0.05,
): void {
  if (!Number.isFinite(value)) return;
  try {
    param.setTargetAtTime(value, ctx.currentTime, Math.max(0.001, timeConstant));
  } catch {
    /* context may be closed */
  }
}

/** Instant param set at "now", for scheduling discrete/percussive events. */
export function setNow(param: AudioParam, value: number, ctx: BaseAudioContext): void {
  try {
    param.setValueAtTime(value, ctx.currentTime);
  } catch {
    /* context may be closed */
  }
}

export type NoiseColor = 'white' | 'brown';

/** A short looping noise buffer; call once per node, never per frame. */
export function noiseBuffer(
  ctx: BaseAudioContext,
  seconds: number,
  color: NoiseColor = 'white',
): AudioBuffer {
  const length = Math.max(1, Math.floor(ctx.sampleRate * seconds));
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  if (color === 'white') {
    for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  } else {
    let last = 0;
    for (let i = 0; i < length; i++) {
      const white = Math.random() * 2 - 1;
      last = (last + 0.02 * white) / 1.02;
      data[i] = last * 3.5;
    }
  }
  return buffer;
}

/** A persistent, looping noise source through a filter — the common intake/tyre/wind building block. */
export function loopingNoise(
  ctx: BaseAudioContext,
  seconds: number,
  color: NoiseColor,
): AudioBufferSourceNode {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, seconds, color);
  src.loop = true;
  src.start();
  return src;
}

/** A buzzy, harmonic-rich periodic wave used as the exhaust pulse-train oscillator. */
export function pulseWave(ctx: BaseAudioContext, harmonics = 18): PeriodicWave {
  const real = new Float32Array(harmonics + 1);
  const imag = new Float32Array(harmonics + 1);
  for (let n = 1; n <= harmonics; n++) {
    imag[n] = 1 / n;
  }
  return ctx.createPeriodicWave(real, imag, { disableNormalization: false });
}

/** Soft tanh-style saturation curve for the waveshaper stage. */
export function saturationCurve(amount = 0.4): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(n);
  const drive = 1 + amount * 5;
  const norm = Math.tanh(drive);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.tanh(x * drive) / norm;
  }
  return curve;
}

/** Rectifies+shapes a sine LFO into narrow pulses, for rhythmic amplitude modulation (curb thuds). */
export function pulseShapeCurve(sharpness = 6): Float32Array<ArrayBuffer> {
  const n = 256;
  const curve = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    curve[i] = Math.pow(Math.max(0, x), sharpness);
  }
  return curve;
}

export interface SpatialParams {
  pan: number;
  gain: number;
  cutoff: number;
  distance: number;
}

/** Shared pan/attenuation/low-pass math for any voice positioned relative to the listener. */
export function computeSpatial(relX: number, relZ: number, isPlayer: boolean): SpatialParams {
  if (isPlayer) return { pan: 0, gain: 1, cutoff: 20000, distance: 0 };
  const distance = Math.hypot(relX, relZ);
  const pan = clamp(relX / 20, -1, 1);
  const gain = 1 / Math.pow(1 + distance / 12, 1.6);
  const cutoff = clamp(9000 / (1 + distance / 15), 300, 9000);
  return { pan, gain, cutoff, distance };
}

/** Simple exponential smoother for per-frame scalar values (skid, throttle edges, ...). */
export class Smoother {
  private v: number;
  constructor(
    initial = 0,
    private rate = 8,
  ) {
    this.v = initial;
  }
  update(target: number, dt: number): number {
    const a = 1 - Math.exp(-this.rate * Math.max(0, dt));
    this.v += (target - this.v) * a;
    return this.v;
  }
  reset(value: number): void {
    this.v = value;
  }
  get value(): number {
    return this.v;
  }
}
