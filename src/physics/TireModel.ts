import type { Surface } from '../track/Track';

/** Grip multiplier and rolling resistance of each surface type. */
export const SURFACE_GRIP: Record<Surface, number> = {
  asphalt: 1.0,
  curb: 0.92,
  grass: 0.55,
  gravel: 0.6,
};
export const SURFACE_ROLLING: Record<Surface, number> = {
  asphalt: 0.013,
  curb: 0.02,
  grass: 0.06,
  gravel: 0.14,
};

export interface TyreParams {
  /** peak friction coefficient on dry asphalt at nominal load */
  mu: number;
  /** slip ratio at which longitudinal force peaks */
  peakSlipRatio: number;
  /** slip angle (rad) at which lateral force peaks */
  peakSlipAngle: number;
  /** nominal vertical load (N) for load sensitivity */
  nominalLoad: number;
  /** grip lost per unit of (Fz / nominalLoad - 1); models load sensitivity */
  loadSensitivity: number;
  /** ratio of sliding friction to peak friction */
  slideRatio: number;
}

export interface TyreForce {
  fx: number; // along wheel forward, N (positive pushes the car forward)
  fy: number; // along wheel right, N
  combinedSlip: number; // normalised slip magnitude (1 = peak)
  slipRatio: number;
  slipAngle: number;
  /** dFx/d(omega) in N*s/rad, >= 0; lets the wheel integrator be semi-implicit */
  stiffness: number;
}

/**
 * Normalised friction curve: brush-like rise to a peak of 1 at s = 1 and a
 * gentle decay toward the sliding ratio beyond it. Smooth at the peak.
 */
export function frictionCurve(s: number, slideRatio: number): number {
  if (s <= 0) return 0;
  if (s < 1) return s * (3 - 3 * s + s * s);
  return 1 - (1 - slideRatio) * (1 - Math.exp(-(s - 1) * 1.8));
}

/** Derivative of frictionCurve with respect to s (0 beyond the peak, for stability). */
export function frictionSlope(s: number): number {
  if (s <= 0) return 3;
  if (s < 1) return 3 - 6 * s + 3 * s * s;
  return 0;
}

/**
 * Combined-slip tyre model. `vx`/`vy` are contact-patch velocities in the
 * wheel frame, `omega` the wheel spin rate (rad/s), `radius` the rolling radius.
 */
export function tyreForce(
  p: TyreParams,
  fz: number,
  vx: number,
  vy: number,
  omega: number,
  radius: number,
  surfaceGrip: number,
  out: TyreForce,
): TyreForce {
  if (fz <= 0) {
    out.fx = out.fy = out.combinedSlip = out.slipRatio = out.slipAngle = out.stiffness = 0;
    return out;
  }
  const vLow = 3.0;
  const denom = Math.max(Math.abs(vx), vLow);
  const slipRatio = (omega * radius - vx) / denom;
  const slipAngle = Math.atan2(-vy, Math.max(Math.abs(vx), 1.5));
  const sx = slipRatio / p.peakSlipRatio;
  const sy = slipAngle / p.peakSlipAngle;
  const s = Math.hypot(sx, sy);
  const loadFactor = Math.max(0.6, 1 - p.loadSensitivity * (fz / p.nominalLoad - 1));
  const mu = p.mu * loadFactor * surfaceGrip;
  const mag = mu * fz * frictionCurve(s, p.slideRatio);
  const speedFade = Math.min(1, (Math.abs(vx) + Math.abs(omega * radius)) / 0.6);
  if (s > 1e-6) {
    out.fx = (mag * sx) / s;
    out.fy = (mag * sy) / s;
  } else {
    out.fx = out.fy = 0;
  }
  // at a standstill the model would otherwise creep; fade lateral force in with speed
  out.fy *= Math.max(0.15, speedFade);
  out.combinedSlip = s;
  out.slipRatio = slipRatio;
  out.slipAngle = slipAngle;
  out.stiffness = (mu * fz * frictionSlope(s) * radius) / (p.peakSlipRatio * denom);
  return out;
}

export function tyreParamsFor(
  compound: 'comfort' | 'sport' | 'racing',
  baseGrip: number,
): TyreParams {
  const table = {
    comfort: { mul: 0.88, kappa: 0.13, alpha: 0.15, slide: 0.86 },
    sport: { mul: 1.0, kappa: 0.11, alpha: 0.125, slide: 0.84 },
    racing: { mul: 1.16, kappa: 0.095, alpha: 0.105, slide: 0.82 },
  }[compound];
  return {
    mu: baseGrip * table.mul,
    peakSlipRatio: table.kappa,
    peakSlipAngle: table.alpha,
    nominalLoad: 4000,
    loadSensitivity: 0.09,
    slideRatio: table.slide,
  };
}
