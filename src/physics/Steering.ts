import { Vector3 } from 'three';
import { clamp } from '../core/math';
import { loadPeakFactor, type TyreParams } from './TireModel';
import type { EffectiveSpec } from './Tuning';

export interface AckermannAngles {
  left: number;
  right: number;
}

/**
 * Per-wheel Ackermann steer angles from the bicycle-model steer angle `steer`
 * (rad, positive = right turn). The inner wheel (index 1 / FR for a right
 * turn) always angles more than the outer wheel (index 0 / FL); sign of the
 * turn is preserved on both.
 */
export function ackermannAngles(steer: number, wheelbase: number, track: number): AckermannAngles {
  if (Math.abs(steer) < 1e-4) return { left: 0, right: 0 };
  const mag = Math.abs(steer);
  const cot = wheelbase / Math.tan(mag);
  const innerMag = Math.atan(wheelbase / (cot - track / 2));
  const outerMag = Math.atan(wheelbase / (cot + track / 2));
  const sign = Math.sign(steer);
  // for a right turn (sign > 0) the inner wheel is FR (right); for a left
  // turn the inner wheel is FL (left)
  return sign > 0
    ? { left: sign * outerMag, right: sign * innerMag }
    : { left: sign * innerMag, right: sign * outerMag };
}

/**
 * Road-wheel angle (rad) per unit of steering input at the current speed.
 * Direct (wheel) input keeps full lock; pad/keyboard input reduces lock with
 * speed but never below a floor sized to the tyre's own peak slip angle.
 */
export function steerScale(
  spec: EffectiveSpec,
  tyres: TyreParams,
  speed: number,
  directSteer: boolean,
): number {
  const lock = (spec.steerLockDeg * Math.PI) / 180;
  if (directSteer) return lock;
  const v = Math.abs(speed);
  const floor = clamp((2.2 * tyres.peakSlipAngle) / lock, 0.12, 0.3);
  const factor = 1 / (1 + Math.pow(v / 22, 1.35));
  return lock * Math.max(floor, factor);
}

/** Steering rate (rad/s): quick returning to centre or counter-steering, gentler winding on. */
function steeringRate(
  directSteer: boolean,
  speed: number,
  current: number,
  target: number,
): number {
  if (directSteer) return 12;
  const counterSteering =
    current !== 0 && Math.sign(target) !== 0 && Math.sign(target) !== Math.sign(current);
  const returningToCentre = Math.abs(target) < Math.abs(current);
  if (counterSteering || returningToCentre) return 10;
  return Math.max(5, 5 + speed * 0.04);
}

export interface SteeringStepInput {
  spec: EffectiveSpec;
  tyres: TyreParams;
  speed: number;
  yawRate: number;
  directSteer: boolean;
  steerInput: number;
  currentAngle: number;
  /** average load (N) on the front axle, for the yaw-rate feed-forward cap */
  frontAxleFz: number;
  dt: number;
}

/**
 * Advances the driver-commanded steer angle by one control step: applies the
 * speed-sensitive scale, a yaw-rate feed-forward cap (pad/keyboard only, above
 * walking pace) so the front tyres can't be over-saturated, then rate-limits
 * the approach to the target.
 */
export function stepSteering(input: SteeringStepInput): number {
  const { spec, tyres, speed, directSteer, currentAngle, dt } = input;
  const v = Math.abs(speed);
  let target = input.steerInput * steerScale(spec, tyres, speed, directSteer);
  // Only cap steer that winds further into the car's existing rotation
  // (same sign as yaw rate) — a driver correcting/counter-steering against
  // an existing yaw must stay free to command full lock.
  const windingOn = Math.sign(target) !== 0 && Math.sign(target) === Math.sign(input.yawRate);
  if (!directSteer && v > 8 && windingOn) {
    const peakSlipAngleEff =
      tyres.peakSlipAngle * loadPeakFactor(input.frontAxleFz, tyres.nominalLoad);
    const cap =
      Math.abs(Math.atan((spec.wheelbaseM * input.yawRate) / Math.max(v, 3))) +
      1.6 * peakSlipAngleEff;
    target = clamp(target, -cap, cap);
  }
  const rate = steeringRate(directSteer, v, currentAngle, target);
  const delta = clamp(target - currentAngle, -rate * dt, rate * dt);
  return currentAngle + delta;
}

/** Wheel-plane forward/right directions for a given road-wheel steer angle. */
export function wheelDirs(
  forward: Vector3,
  right: Vector3,
  steer: number,
  fw: Vector3,
  rw: Vector3,
): { fw: Vector3; rw: Vector3 } {
  const c = Math.cos(steer);
  const sn = Math.sin(steer);
  fw.copy(forward).multiplyScalar(c).addScaledVector(right, sn);
  rw.copy(right).multiplyScalar(c).addScaledVector(forward, -sn);
  return { fw, rw };
}
