import { clamp } from '../core/math';
import type { WheelState } from './Vehicle';

export interface TractionControlResult {
  throttle: number;
  active: boolean;
}

/**
 * Cuts throttle when the most-loaded driven wheel's combined slip approaches
 * its own (load-dependent) peak. Combined slip, rather than a raw slip
 * ratio, tracks each wheel's actual grip margin: the peak slip ratio itself
 * grows and shrinks with instantaneous load (see TireModel's load-peak
 * factor), so a fixed slip-ratio threshold would fire far too late for a
 * lightly loaded wheel and too early for a heavily loaded one.
 */
export function applyTractionControl(
  wheels: WheelState[],
  level: number,
  throttle: number,
): TractionControlResult {
  if (level <= 0 || throttle <= 0.02) return { throttle, active: false };
  let worst = 0;
  for (const w of wheels) if (w.driven && w.contact) worst = Math.max(worst, w.force.combinedSlip);
  const threshold = level >= 2 ? 0.55 : 0.75;
  if (worst > threshold) {
    const cut = clamp(1 - (worst - threshold) / 0.5, 0.15, 1);
    return { throttle: throttle * cut, active: true };
  }
  return { throttle, active: false };
}

export interface BrakeParams {
  brakeInput: number;
  handbrake: boolean;
  absEnabled: boolean;
  torqueNm: number;
  bias: number;
}

/** Applies brake/handbrake torque to one wheel's spin; returns whether ABS released it. */
export function applyBrake(
  w: WheelState,
  front: boolean,
  p: BrakeParams,
  speed: number,
  dt: number,
  inertia: number,
): boolean {
  let torque = p.brakeInput * p.torqueNm * (front ? p.bias : 1 - p.bias) * 0.5;
  if (p.handbrake && !front) torque = Math.max(torque, p.torqueNm * 0.35);
  let absActive = false;
  if (p.absEnabled && torque > 0 && w.contact && Math.abs(speed) > 2) {
    const lock = -w.force.slipRatio;
    if (lock > 0.12) {
      torque *= clamp(1 - (lock - 0.12) / 0.15, 0.2, 1);
      absActive = true;
    }
  }
  w.brakeTorque = torque;
  if (torque > 0) {
    const dOmega = (torque / inertia) * dt;
    if (Math.abs(w.omega) <= dOmega) w.omega = 0;
    else w.omega -= Math.sign(w.omega) * dOmega;
  }
  return absActive;
}
