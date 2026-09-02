import type { CarAudioState } from './AudioContract';

export type EngineKind = CarAudioState['engine'];

/** Per-engine-character synthesis tuning. Values are ears-first, not physically derived. */
export interface EnginePreset {
  /** firing pulses per revolution basis: f = rpm/60 * cylinders/2 */
  cylinders: number;
  /** relative mix of the three tonal oscillators */
  mix: { saw: number; square: number; sub: number; pulse: number };
  /** harmonic count for the exhaust pulse periodic wave; higher = buzzier */
  harmonics: number;
  detuneCents: number;
  filterBaseHz: number;
  filterRpmHz: number;
  filterThrottleHz: number;
  saturation: number;
  /** i4 and v6 get a turbo whistle + blow-off hiss */
  turbo: boolean;
  /** amount of crackle/pop on a high-rpm throttle lift */
  overrunCrackle: number;
  /** >1 rounds off the waveform (rotary); <1 leaves it coarser */
  smoothness: number;
  /** v8hybrid adds a rising electric whine at 8x rpm */
  hybridWhine: boolean;
}

const preset = (p: EnginePreset): EnginePreset => p;

export const ENGINE_PRESETS: Record<EngineKind, EnginePreset> = {
  i4: preset({
    cylinders: 4,
    mix: { saw: 0.6, square: 0.4, sub: 0.25, pulse: 0.5 },
    harmonics: 10,
    detuneCents: 6,
    filterBaseHz: 800,
    filterRpmHz: 3.2,
    filterThrottleHz: 2200,
    saturation: 0.35,
    turbo: true,
    overrunCrackle: 0.35,
    smoothness: 1,
    hybridWhine: false,
  }),
  i6: preset({
    cylinders: 6,
    mix: { saw: 0.55, square: 0.3, sub: 0.3, pulse: 0.45 },
    harmonics: 14,
    detuneCents: 4,
    filterBaseHz: 900,
    filterRpmHz: 3.0,
    filterThrottleHz: 2400,
    saturation: 0.3,
    turbo: false,
    overrunCrackle: 0.25,
    smoothness: 1.1,
    hybridWhine: false,
  }),
  v6: preset({
    cylinders: 6,
    mix: { saw: 0.6, square: 0.45, sub: 0.2, pulse: 0.5 },
    harmonics: 11,
    detuneCents: 7,
    filterBaseHz: 750,
    filterRpmHz: 3.3,
    filterThrottleHz: 2100,
    saturation: 0.4,
    turbo: true,
    overrunCrackle: 0.3,
    smoothness: 0.95,
    hybridWhine: false,
  }),
  v8: preset({
    cylinders: 8,
    mix: { saw: 0.65, square: 0.5, sub: 0.35, pulse: 0.6 },
    harmonics: 16,
    detuneCents: 8,
    filterBaseHz: 700,
    filterRpmHz: 3.6,
    filterThrottleHz: 2600,
    saturation: 0.5,
    turbo: false,
    overrunCrackle: 0.55,
    smoothness: 0.9,
    hybridWhine: false,
  }),
  rotary: preset({
    cylinders: 3,
    mix: { saw: 0.75, square: 0.15, sub: 0.1, pulse: 0.3 },
    harmonics: 22,
    detuneCents: 3,
    filterBaseHz: 1000,
    filterRpmHz: 2.8,
    filterThrottleHz: 2000,
    saturation: 0.22,
    turbo: false,
    overrunCrackle: 0.15,
    smoothness: 1.4,
    hybridWhine: false,
  }),
  flat6: preset({
    cylinders: 6,
    mix: { saw: 0.5, square: 0.35, sub: 0.3, pulse: 0.45 },
    harmonics: 13,
    detuneCents: 5,
    filterBaseHz: 850,
    filterRpmHz: 3.1,
    filterThrottleHz: 2300,
    saturation: 0.32,
    turbo: false,
    overrunCrackle: 0.45,
    smoothness: 1.0,
    hybridWhine: false,
  }),
  v8hybrid: preset({
    cylinders: 8,
    mix: { saw: 0.6, square: 0.45, sub: 0.3, pulse: 0.55 },
    harmonics: 15,
    detuneCents: 7,
    filterBaseHz: 700,
    filterRpmHz: 3.4,
    filterThrottleHz: 2400,
    saturation: 0.4,
    turbo: false,
    overrunCrackle: 0.4,
    smoothness: 1.0,
    hybridWhine: true,
  }),
};

/** Firing (exhaust pulse) frequency in Hz for a given rpm and engine character. */
export function firingFrequency(rpm: number, kind: EngineKind): number {
  const cylinders = ENGINE_PRESETS[kind].cylinders;
  return Math.max(0.5, rpm / 60) * (cylinders / 2);
}
