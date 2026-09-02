import type { CarAudioState } from './AudioContract';

export type EngineKind = CarAudioState['engine'];

/** One firing event's deviation from perfectly even spacing/loudness. */
export interface FiringPulse {
  /** multiplies the nominal 1/firingFrequency gap before this pulse */
  mult: number;
  /** relative peak loudness of this pulse */
  amp: number;
}

/** Per-engine-character synthesis tuning for the physically-inspired exhaust model. */
export interface EnginePreset {
  /** pulses per crank/rotor revolution; firingFreq = rpm/60 * pulsesPerRev */
  pulsesPerRev: number;
  /** repeating cylinder-order pattern (uneven cross-plane V8 burble, even I4/I6, ...) */
  firePattern: FiringPulse[];
  /** exhaust pulse attack time in ms (~1ms) */
  attackMs: number;
  /** exhaust pulse exponential decay time in ms (4-10ms; rotary rounder/longer) */
  decayMs: number;
  /** per-pulse timing/amplitude jitter fraction at idle (more) and high rpm (less) */
  jitterIdle: number;
  jitterHigh: number;
  /** exhaust pipe fundamental resonance (~80-140Hz for a 3-5m pipe) */
  exhaustFundamentalHz: number;
  /** body/cabin resonance (~200-400Hz) */
  bodyResonanceHz: number;
  filterBaseHz: number;
  filterRpmHz: number;
  filterThrottleHz: number;
  /** waveshaper drive for combustion crackle */
  saturation: number;
  /** intake roar resonance base (600-1500Hz range, rises with rpm) */
  intakeBaseHz: number;
  /** i4 and v6 get a turbo whistle + blow-off chirp */
  turbo: boolean;
  /** amount of pops/bangs on a high-rpm throttle lift, decaying over ~1.5s */
  overrunCrackle: number;
  /** quiet high-passed click train at 2x firing rate; 0 for rotary (no poppet valves) */
  valvetrainTick: number;
  /** v8hybrid adds a rising electric whine at 8x firing frequency */
  hybridWhine: boolean;
  /** Stallion GT500's supercharger: harmonic-rich whine at ~5x crank rpm */
  supercharger: boolean;
}

const preset = (p: EnginePreset): EnginePreset => p;
const even = (n: number): FiringPulse[] => Array.from({ length: n }, () => ({ mult: 1, amp: 1 }));

/** Classic cross-plane V8 double-pulse "burble": alternating short/long gaps. */
const crossPlaneV8: FiringPulse[] = [
  { mult: 0.72, amp: 1.15 },
  { mult: 1.28, amp: 0.85 },
  { mult: 0.82, amp: 1.1 },
  { mult: 1.18, amp: 0.9 },
];

const mildV6: FiringPulse[] = [
  { mult: 0.92, amp: 1.05 },
  { mult: 1.08, amp: 0.95 },
  { mult: 1.0, amp: 1.0 },
];

const mildFlat6: FiringPulse[] = [
  { mult: 0.95, amp: 1.05 },
  { mult: 1.05, amp: 0.95 },
  { mult: 1.0, amp: 1.0 },
];

export const ENGINE_PRESETS: Record<EngineKind, EnginePreset> = {
  i4: preset({
    pulsesPerRev: 2,
    firePattern: even(2),
    attackMs: 1,
    decayMs: 7,
    jitterIdle: 0.05,
    jitterHigh: 0.025,
    exhaustFundamentalHz: 130,
    bodyResonanceHz: 280,
    filterBaseHz: 800,
    filterRpmHz: 3.2,
    filterThrottleHz: 2200,
    saturation: 0.22,
    intakeBaseHz: 650,
    turbo: true,
    overrunCrackle: 0.35,
    valvetrainTick: 0.35,
    hybridWhine: false,
    supercharger: false,
  }),
  i6: preset({
    pulsesPerRev: 3,
    firePattern: even(3),
    attackMs: 1,
    decayMs: 8,
    jitterIdle: 0.045,
    jitterHigh: 0.02,
    exhaustFundamentalHz: 115,
    bodyResonanceHz: 260,
    filterBaseHz: 900,
    filterRpmHz: 3.0,
    filterThrottleHz: 2400,
    saturation: 0.19,
    intakeBaseHz: 700,
    turbo: false,
    overrunCrackle: 0.25,
    valvetrainTick: 0.3,
    hybridWhine: false,
    supercharger: false,
  }),
  v6: preset({
    pulsesPerRev: 3,
    firePattern: mildV6,
    attackMs: 1,
    decayMs: 7,
    jitterIdle: 0.05,
    jitterHigh: 0.025,
    exhaustFundamentalHz: 105,
    bodyResonanceHz: 250,
    filterBaseHz: 750,
    filterRpmHz: 3.3,
    filterThrottleHz: 2100,
    saturation: 0.25,
    intakeBaseHz: 680,
    turbo: true,
    overrunCrackle: 0.3,
    valvetrainTick: 0.3,
    hybridWhine: false,
    supercharger: false,
  }),
  v8: preset({
    pulsesPerRev: 4,
    firePattern: crossPlaneV8,
    attackMs: 1.2,
    decayMs: 11,
    jitterIdle: 0.06,
    jitterHigh: 0.03,
    exhaustFundamentalHz: 85,
    bodyResonanceHz: 230,
    filterBaseHz: 700,
    filterRpmHz: 3.6,
    filterThrottleHz: 2600,
    saturation: 0.32,
    intakeBaseHz: 620,
    turbo: false,
    overrunCrackle: 0.6,
    valvetrainTick: 0.4,
    hybridWhine: false,
    supercharger: true,
  }),
  rotary: preset({
    pulsesPerRev: 3,
    firePattern: even(3),
    attackMs: 2,
    decayMs: 12,
    jitterIdle: 0.03,
    jitterHigh: 0.015,
    exhaustFundamentalHz: 140,
    bodyResonanceHz: 320,
    filterBaseHz: 1000,
    filterRpmHz: 2.8,
    filterThrottleHz: 2000,
    saturation: 0.14,
    intakeBaseHz: 750,
    turbo: false,
    overrunCrackle: 0.15,
    valvetrainTick: 0,
    hybridWhine: false,
    supercharger: false,
  }),
  flat6: preset({
    pulsesPerRev: 3,
    firePattern: mildFlat6,
    attackMs: 1,
    decayMs: 9,
    jitterIdle: 0.05,
    jitterHigh: 0.025,
    exhaustFundamentalHz: 100,
    bodyResonanceHz: 240,
    filterBaseHz: 850,
    filterRpmHz: 3.1,
    filterThrottleHz: 2300,
    saturation: 0.2,
    intakeBaseHz: 700,
    turbo: false,
    overrunCrackle: 0.5,
    valvetrainTick: 0.3,
    hybridWhine: false,
    supercharger: false,
  }),
  v8hybrid: preset({
    pulsesPerRev: 4,
    firePattern: [
      { mult: 0.8, amp: 1.1 },
      { mult: 1.2, amp: 0.9 },
      { mult: 0.85, amp: 1.05 },
      { mult: 1.15, amp: 0.95 },
    ],
    attackMs: 1.1,
    decayMs: 10,
    jitterIdle: 0.055,
    jitterHigh: 0.028,
    exhaustFundamentalHz: 90,
    bodyResonanceHz: 235,
    filterBaseHz: 700,
    filterRpmHz: 3.4,
    filterThrottleHz: 2400,
    saturation: 0.25,
    intakeBaseHz: 640,
    turbo: false,
    overrunCrackle: 0.55,
    valvetrainTick: 0.35,
    hybridWhine: true,
    supercharger: false,
  }),
};

/** Firing (exhaust pulse) frequency in Hz for a given rpm and engine character. */
export function firingFrequency(rpm: number, kind: EngineKind): number {
  return Math.max(0.5, rpm / 60) * ENGINE_PRESETS[kind].pulsesPerRev;
}

/** Jitter fraction (timing/amplitude irregularity) interpolated by how close rpm is to redline. */
export function jitterAt(kind: EngineKind, rpmFrac: number): number {
  const p = ENGINE_PRESETS[kind];
  const t = Math.min(1, Math.max(0, rpmFrac));
  return p.jitterIdle + (p.jitterHigh - p.jitterIdle) * t;
}
