import { describe, it, expect } from 'vitest';
import { Track } from '../track/Track';
import { Vehicle, PHYSICS_DT } from './Vehicle';
import { CARS } from '../data/cars';
import { defaultTuning } from './Tuning';
import { AUTO_SHIFT_LOCKOUT } from './Drivetrain';
import { emptyInput } from '../core/Input';
import { ovalJson } from './testUtils';
import type { CarSpec } from '../core/types';

interface Shift {
  t: number;
  from: number;
  to: number;
  rpmBefore: number;
}
type Pedals = (t: number) => { throttle: number; brake: number };

/** Long straights and gentle 1.2 km-radius ends: no car has to slow for a corner in 25 s. */
const track = new Track(ovalJson(14, 2500, 1200));

function makeCar(spec: CarSpec, tcs: 0 | 1 | 2): Vehicle {
  // the synthetic driver below is a bare P-controller; the stability assist keeps light,
  // powerful cars from weaving under full throttle so the test measures the gearbox
  const v = new Vehicle(
    spec,
    defaultTuning(spec),
    track,
    { abs: true, tcs, stability: true, racingLine: false, autoBrake: false },
    'auto',
  );
  v.placeAt(20, 0);
  return v;
}

/** Drives straight for `seconds` and records every gear change. */
function drive(v: Vehicle, seconds: number, pedals: Pedals): Shift[] {
  const input = emptyInput();
  const shifts: Shift[] = [];
  let gear = v.gear;
  let rpm = v.rpm;
  const steps = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < steps; i++) {
    const t = i * PHYSICS_DT;
    const p = pedals(t);
    input.throttle = p.throttle;
    input.brake = p.brake;
    input.steer = -v.query.lateral * 0.03 - v.vel.dot(v.query.right) * 0.02;
    v.setControls(input, PHYSICS_DT);
    v.step(PHYSICS_DT);
    if (v.gear !== gear) {
      shifts.push({ t, from: gear, to: v.gear, rpmBefore: rpm });
      gear = v.gear;
    }
    rpm = v.rpm;
  }
  return shifts;
}

/**
 * A shift straight back to the gear we just left within `window` seconds,
 * unless it is an upshift made at high rpm (a kick-down followed by a normal
 * redline upshift is not hunting).
 */
function flickers(shifts: Shift[], redline: number, window = 1.5): Shift[] {
  return shifts.filter((s, i) => {
    if (i === 0 || s.to !== shifts[i - 1].from || s.t - shifts[i - 1].t >= window) return false;
    const honestUpshift = s.to > s.from && s.rpmBefore > redline * 0.8;
    return !honestUpshift;
  });
}
const describeShifts = (shifts: Shift[]): string =>
  shifts.map((s) => `${s.from}->${s.to}@${s.t.toFixed(2)}s/${s.rpmBefore | 0}rpm`).join(' ');
const minGap = (shifts: Shift[]): number =>
  shifts.reduce((m, s, i) => (i ? Math.min(m, s.t - shifts[i - 1].t) : m), Infinity);

const idle: Pedals = () => ({ throttle: 0, brake: 0 });
const flatOut: Pedals = () => ({ throttle: 1, brake: 0 });
const gentle: Pedals = () => ({ throttle: 0.3, brake: 0 });
/** Keyboard-like pumping between part and full throttle. */
const pumping: Pedals = (t) => ({ throttle: t % 1.2 < 0.6 ? 1 : 0.35, brake: 0 });
/** Brake hard, ease off while still slowing, coast, then pick the throttle up again. */
const trailBrake: Pedals = (t) => {
  if (t < 2) return { throttle: 0, brake: 1 };
  if (t < 3.5) return { throttle: 0, brake: 0.2 + 0.15 * Math.sin(t * 9) };
  if (t < 6) return { throttle: 0, brake: 0 };
  return { throttle: 1, brake: 0 };
};

function everyCarScenarios(spec: CarSpec): void {
  const top = spec.gearRatios.length;

  it(`${spec.id}: flat out only ever shifts up, at high rpm`, () => {
    const v = makeCar(spec, 1);
    const shifts = drive(v, 1, idle).concat(drive(v, 22, flatOut));
    const info = describeShifts(shifts);
    expect(
      shifts.every((s) => s.to === s.from + 1),
      info,
    ).toBe(true);
    expect(shifts.length, info).toBeLessThanOrEqual(top - 1);
    expect(shifts.length, info).toBeGreaterThanOrEqual(2);
    for (const s of shifts) expect(s.rpmBefore, info).toBeGreaterThan(spec.redlineRpm * 0.75);
    expect(minGap(shifts), info).toBeGreaterThanOrEqual(AUTO_SHIFT_LOCKOUT * 0.95);
  });

  it(`${spec.id}: pumping the throttle never flickers between gears`, () => {
    const v = makeCar(spec, 1);
    drive(v, 1, idle);
    const shifts = drive(v, 22, pumping);
    const info = describeShifts(shifts);
    expect(flickers(shifts, spec.redlineRpm), info).toEqual([]);
    expect(minGap(shifts), info).toBeGreaterThanOrEqual(AUTO_SHIFT_LOCKOUT * 0.95);
    expect(shifts.filter((s) => s.to < s.from).length, info).toBeLessThanOrEqual(2);
  });
}

function detailedScenarios(spec: CarSpec): void {
  const id = spec.id;

  it(`${id}: wheelspin with traction control off does not cause hunting`, () => {
    const v = makeCar(spec, 0);
    drive(v, 1, idle);
    const shifts = drive(v, 20, flatOut);
    const info = describeShifts(shifts);
    expect(
      shifts.every((s) => s.to === s.from + 1),
      info,
    ).toBe(true);
    expect(minGap(shifts), info).toBeGreaterThanOrEqual(AUTO_SHIFT_LOCKOUT * 0.95);
  });

  it(`${id}: gentle throttle short-shifts without hunting`, () => {
    const v = makeCar(spec, 1);
    drive(v, 1, idle);
    const shifts = drive(v, 25, gentle);
    const info = describeShifts(shifts);
    expect(
      shifts.every((s) => s.to === s.from + 1),
      info,
    ).toBe(true);
    expect(shifts.length, info).toBeGreaterThanOrEqual(1);
    for (const s of shifts) expect(s.rpmBefore, info).toBeLessThan(spec.redlineRpm * 0.85);
  });

  it(`${id}: trail braking, coasting and re-applying the throttle never flickers`, () => {
    const v = makeCar(spec, 1);
    drive(v, 1, idle);
    drive(v, 12, flatOut);
    const shifts = drive(v, 11, trailBrake);
    const info = describeShifts(shifts);
    expect(flickers(shifts, spec.redlineRpm, 2), info).toEqual([]);
    const coastUps = shifts.filter((s) => s.t >= 2 && s.t < 6 && s.to > s.from);
    expect(coastUps, info).toEqual([]);
    expect(minGap(shifts), info).toBeGreaterThanOrEqual(AUTO_SHIFT_LOCKOUT * 0.95);
  });

  it(`${id}: braking to a stop steps down gear by gear and ends in first`, () => {
    const v = makeCar(spec, 1);
    drive(v, 1, idle);
    drive(v, 14, flatOut);
    const before = v.gear;
    const shifts: Shift[] = [];
    // brake until stopped (holding the brake at a standstill would engage reverse by design)
    for (let i = 0; i < 240 * 12 && v.speedKmh > 1; i++) {
      shifts.push(...drive(v, PHYSICS_DT, () => ({ throttle: 0, brake: 1 })));
    }
    const info = describeShifts(shifts);
    expect(before, info).toBeGreaterThanOrEqual(3);
    expect(
      shifts.every((s) => s.to === s.from - 1),
      info,
    ).toBe(true);
    expect(v.speedKmh, info).toBeLessThanOrEqual(1);
    expect(v.gear, info).toBe(1);
  });
}

describe('automatic gearbox', () => {
  for (const spec of CARS) everyCarScenarios(spec);
  for (const id of ['sakura_86', 'stallion_gt', 'aurelia_gt3', 'lyon_lmp']) {
    const spec = CARS.find((c) => c.id === id);
    if (spec) detailedScenarios(spec);
  }
});
