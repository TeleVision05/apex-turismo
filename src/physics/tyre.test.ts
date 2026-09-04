import { describe, it, expect } from 'vitest';
import {
  frictionCurve,
  tyreForce,
  tyreParamsFor,
  effectiveMu,
  updateSlipAngleLag,
  type TyreForce,
} from './TireModel';
import { ackermannAngles } from './Steering';

const newForce = (): TyreForce => ({
  fx: 0,
  fy: 0,
  combinedSlip: 0,
  slipRatio: 0,
  slipAngle: 0,
  stiffness: 0,
});

describe('frictionCurve', () => {
  it('rises monotonically to exactly 1 at s = 1 and decays toward slideRatio', () => {
    const slideRatio = 0.85;
    let prev = -Infinity;
    for (let s = 0; s <= 1; s += 0.05) {
      const v = frictionCurve(s, slideRatio);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    expect(frictionCurve(1, slideRatio)).toBeCloseTo(1, 10);
    // decays toward the sliding ratio and never overshoots it
    let prevPastPeak = 1;
    for (let s = 1; s <= 6; s += 0.5) {
      const v = frictionCurve(s, slideRatio);
      expect(v).toBeLessThanOrEqual(prevPastPeak + 1e-9);
      expect(v).toBeGreaterThanOrEqual(slideRatio - 1e-9);
      prevPastPeak = v;
    }
    expect(frictionCurve(50, slideRatio)).toBeCloseTo(slideRatio, 2);
  });
});

describe('load sensitivity', () => {
  const p = tyreParamsFor('sport', 1.0);

  it('mu falls as load rises above nominal', () => {
    const muNominal = effectiveMu(p, p.nominalLoad);
    const muDouble = effectiveMu(p, 2 * p.nominalLoad);
    expect(muDouble).toBeLessThan(muNominal);
  });

  it('an unevenly loaded pair produces less total lateral force than an evenly loaded one', () => {
    const slipAngle = 0.03; // small, well below peak for either load
    const vx = 20;
    const vy = -Math.tan(slipAngle) * vx;
    const fyAt = (fz: number): number => tyreForce(p, fz, vx, vy, 0, 0.32, 1, newForce()).fy;
    const fNominal = fyAt(p.nominalLoad);
    const fLight = fyAt(p.nominalLoad - 1500);
    const fHeavy = fyAt(p.nominalLoad + 1500);
    expect(fLight + fHeavy).toBeLessThan(2 * fNominal);
  });
});

describe('peak slip angle grows with load', () => {
  it('force at a small fixed slip angle, divided by load, falls as load rises', () => {
    const p = tyreParamsFor('sport', 1.0);
    const slipAngle = 0.02;
    const vx = 25;
    const vy = -Math.tan(slipAngle) * vx;
    const ratioAt = (fz: number): number =>
      tyreForce(p, fz, vx, vy, 0, 0.32, 1, newForce()).fy / fz;
    const r1 = ratioAt(2000);
    const r2 = ratioAt(4000);
    const r3 = ratioAt(8000);
    expect(r2).toBeLessThan(r1);
    expect(r3).toBeLessThan(r2);
  });
});

describe('lateral relaxation', () => {
  it('reaches ~63% of a step target after travelling about one relaxation length', () => {
    const p = tyreParamsFor('sport', 1.0);
    const vx = 20;
    const target = 0.1;
    const sdt = 1 / 960; // matches the vehicle's 240 Hz / 4 sub-steps
    const distance = p.relaxationLength;
    const steps = Math.round(distance / vx / sdt);
    let lag = 0;
    for (let i = 0; i < steps; i++) {
      lag = updateSlipAngleLag(lag, target, vx, sdt, p.relaxationLength);
    }
    const frac = lag / target;
    expect(frac).toBeGreaterThan(0.632 * 0.75);
    expect(frac).toBeLessThan(0.632 * 1.25);
  });
});

describe('Ackermann steering', () => {
  it('the inner wheel angles at least 2 degrees more than the outer wheel at 20 degrees of lock', () => {
    const wheelbase = 2.43;
    const track = 1.46;
    const steer = (20 * Math.PI) / 180;
    const { left, right } = ackermannAngles(steer, wheelbase, track);
    // positive (right) steer: the inner wheel is the right (FR) wheel
    expect(right).toBeGreaterThan(left);
    expect(((right - left) * 180) / Math.PI).toBeGreaterThanOrEqual(2);
  });
});
