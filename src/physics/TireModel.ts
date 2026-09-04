import type { Surface } from '../track/Track';
import { clamp } from '../core/math';

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

/** Exponent of the load-vs-peak-slip growth law shared by slip angle and slip ratio. */
const PEAK_LOAD_EXPONENT = 0.35;

export interface TyreParams {
  /** peak friction coefficient on dry asphalt at nominal load */
  mu: number;
  /** slip ratio at which longitudinal force peaks (at nominal load) */
  peakSlipRatio: number;
  /** slip angle (rad) at which lateral force peaks (at nominal load) */
  peakSlipAngle: number;
  /** nominal vertical load (N) for load sensitivity */
  nominalLoad: number;
  /** exponent of the load-sensitivity power law: mu ~ (fz/nominalLoad)^-loadSensitivity */
  loadSensitivity: number;
  /** ratio of sliding friction to peak friction */
  slideRatio: number;
  /** distance (m) of travel over which lateral force builds toward its target */
  relaxationLength: number;
}

export interface TyreForce {
  fx: number; // along wheel forward, N (positive pushes the car forward)
  fy: number; // along wheel right, N
  combinedSlip: number; // normalised slip magnitude (1 = peak)
  slipRatio: number;
  slipAngle: number; // the (possibly lagged) slip angle actually used for fy, rad
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

/** Geometric (instantaneous) slip angle from contact-patch velocities. */
export function computeSlipAngle(vx: number, vy: number): number {
  return Math.atan2(-vy, Math.max(Math.abs(vx), 1.5));
}

/**
 * Growth factor applied to the nominal peak slip angle/ratio as load moves
 * away from `nominalLoad`: cornering (and longitudinal) stiffness saturates
 * with load rather than scaling linearly.
 */
export function loadPeakFactor(fz: number, nominalLoad: number): number {
  return clamp(Math.pow(fz / nominalLoad, PEAK_LOAD_EXPONENT), 0.7, 1.4);
}

/**
 * Effective peak friction coefficient at a given load: a power-law load
 * sensitivity, so an unevenly loaded axle produces less total force than an
 * evenly loaded one at the same combined load.
 */
export function effectiveMu(p: TyreParams, fz: number, surfaceGrip = 1): number {
  const muLoadFactor = clamp(
    Math.pow(Math.max(fz, 200) / p.nominalLoad, -p.loadSensitivity),
    0.7,
    1.3,
  );
  return p.mu * muLoadFactor * surfaceGrip;
}

/**
 * One Euler step of the lateral relaxation filter: the lateral slip angle
 * lags the geometric target over `relaxationLength` metres of travel.
 */
export function updateSlipAngleLag(
  lag: number,
  target: number,
  vx: number,
  sdt: number,
  relaxationLength: number,
): number {
  const rate = Math.min(1, (Math.max(Math.abs(vx), 0.5) * sdt) / relaxationLength);
  return lag + (target - lag) * rate;
}

/**
 * Combined-slip tyre model. `vx`/`vy` are contact-patch velocities in the
 * wheel frame, `omega` the wheel spin rate (rad/s), `radius` the rolling radius.
 * `slipAngleUsed`, when given, overrides the geometric slip angle for the
 * lateral force (e.g. a relaxation-lagged value); the longitudinal path
 * always uses the instantaneous slip ratio.
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
  slipAngleUsed?: number,
): TyreForce {
  if (fz <= 0) {
    out.fx = out.fy = out.combinedSlip = out.slipRatio = out.slipAngle = out.stiffness = 0;
    return out;
  }
  const vLow = 3.0;
  const denom = Math.max(Math.abs(vx), vLow);
  const slipRatio = (omega * radius - vx) / denom;
  const slipAngle = slipAngleUsed ?? computeSlipAngle(vx, vy);
  const peakFactor = loadPeakFactor(fz, p.nominalLoad);
  const peakSlipRatioEff = p.peakSlipRatio * peakFactor;
  const peakSlipAngleEff = p.peakSlipAngle * peakFactor;
  const sx = slipRatio / peakSlipRatioEff;
  const sy = slipAngle / peakSlipAngleEff;
  const s = Math.hypot(sx, sy);
  const mu = effectiveMu(p, fz, surfaceGrip);
  const mag = mu * fz * frictionCurve(s, p.slideRatio);
  let dirX = 0;
  let dirY = 0;
  if (s > 1e-6) {
    dirX = sx / s;
    dirY = sy / s;
    // beyond the peak, blend toward the direction opposing the contact-patch
    // slip velocity so a big slide scrubs speed in the direction it travels
    if (s > 1) {
      const svx = omega * radius - vx;
      const svy = -vy;
      const slen = Math.hypot(svx, svy);
      if (slen > 1e-6) {
        const blend = Math.min(1, s - 1);
        const nvx = svx / slen;
        const nvy = svy / slen;
        dirX = dirX * (1 - blend) + nvx * blend;
        dirY = dirY * (1 - blend) + nvy * blend;
        const dlen = Math.hypot(dirX, dirY);
        if (dlen > 1e-6) {
          dirX /= dlen;
          dirY /= dlen;
        }
      }
    }
  }
  const speedFade = Math.min(1, (Math.abs(vx) + Math.abs(omega * radius)) / 0.6);
  out.fx = mag * dirX;
  out.fy = mag * dirY * Math.max(0.15, speedFade);
  out.combinedSlip = s;
  out.slipRatio = slipRatio;
  out.slipAngle = slipAngle;
  out.stiffness = (mu * fz * frictionSlope(s) * radius) / (peakSlipRatioEff * denom);
  return out;
}

export function tyreParamsFor(
  compound: 'comfort' | 'sport' | 'racing',
  baseGrip: number,
): TyreParams {
  const table = {
    comfort: { mul: 0.88, kappa: 0.13, alpha: 0.15, slide: 0.86, loadSens: 0.08, relax: 0.5 },
    sport: { mul: 1.0, kappa: 0.11, alpha: 0.125, slide: 0.84, loadSens: 0.1, relax: 0.4 },
    racing: { mul: 1.16, kappa: 0.095, alpha: 0.105, slide: 0.82, loadSens: 0.12, relax: 0.3 },
  }[compound];
  return {
    mu: baseGrip * table.mul,
    peakSlipRatio: table.kappa,
    peakSlipAngle: table.alpha,
    nominalLoad: 4000,
    loadSensitivity: table.loadSens,
    slideRatio: table.slide,
    relaxationLength: table.relax,
  };
}
