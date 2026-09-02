import type { CarSpec, CarTuning } from '../core/types';
import { clamp } from '../core/math';

export interface EffectiveSpec extends CarSpec {
  powerMul: number;
  downforceMul: number;
}

export const POWER_STAGES = [1.0, 1.08, 1.17, 1.28];
export const WEIGHT_STAGES = [1.0, 0.97, 0.94, 0.9];

/** Applies tuning-shop upgrades and settings to a base car specification. */
export function applyTuning(base: CarSpec, t: CarTuning): EffectiveSpec {
  const stiff = 1 + clamp(t.suspension, -1, 1) * 0.3;
  const mass = base.massKg * WEIGHT_STAGES[t.weightStage];
  const hasAero = base.downforceFront + base.downforceRear > 0.2;
  return {
    ...base,
    massKg: mass,
    springFront: base.springFront * stiff,
    springRear: base.springRear * stiff,
    damperFront: base.damperFront * Math.sqrt(stiff),
    damperRear: base.damperRear * Math.sqrt(stiff),
    antiRollFront: base.antiRollFront * stiff,
    antiRollRear: base.antiRollRear * stiff,
    brakeBias: clamp(t.brakeBias || base.brakeBias, 0.5, 0.72),
    tyres: t.tyres,
    powerMul: POWER_STAGES[t.powerStage],
    downforceMul: hasAero ? 1 + clamp(t.downforce, -1, 1) * 0.35 : 1,
  };
}

/** Peak power in kW from a torque curve. */
export function peakPowerKw(spec: CarSpec, powerMul = 1): number {
  let best = 0;
  for (const p of spec.torqueCurve) best = Math.max(best, (p.nm * powerMul * p.rpm) / 9549);
  return best;
}

/**
 * Performance Points: a single number summarising pace, in the spirit of
 * GT7's PP. Calibrated so a 130 hp coupe is ~335 PP and a GT3 car ~650 PP.
 */
export function performancePoints(spec: CarSpec, t: CarTuning): number {
  const eff = applyTuning(spec, t);
  const kw = peakPowerKw(spec, eff.powerMul);
  const powerToWeight = kw / eff.massKg; // kW per kg
  const tyreMul = { comfort: 0.88, sport: 1.0, racing: 1.16 }[t.tyres];
  const grip = eff.tyreGrip * tyreMul;
  const aero = (eff.downforceFront + eff.downforceRear) * eff.downforceMul;
  const pp = 100 + powerToWeight * 850 + grip * 170 + aero * 14;
  return Math.round(pp);
}

export function defaultTuning(spec: CarSpec): CarTuning {
  return {
    powerStage: 0,
    weightStage: 0,
    tyres: spec.tyres,
    suspension: 0,
    downforce: 0,
    finalDriveMul: 1,
    brakeBias: spec.brakeBias,
    color: spec.defaultColor,
  };
}
