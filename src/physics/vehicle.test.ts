import { describe, it, expect } from 'vitest';
import { Track } from '../track/Track';
import { Vehicle, PHYSICS_DT } from './Vehicle';
import { carById } from '../data/cars';
import { defaultTuning } from './Tuning';
import { emptyInput } from '../core/Input';
import { ovalJson as skidPadOval } from './testUtils';
import type { TrackJson, Assists } from '../core/types';

/** A 2 km oval: two 500 m straights joined by semicircles of radius ~159 m. */
function ovalJson(): TrackJson {
  const pts: [number, number, number][] = [];
  const r = 159.15;
  const straight = 500;
  const spacing = 4;
  const total = 2 * straight + 2 * Math.PI * r;
  const n = Math.round(total / spacing);
  for (let i = 0; i < n; i++) {
    const s = (i / n) * total;
    let x: number;
    let z: number;
    if (s < straight) {
      x = s - straight / 2;
      z = -r;
    } else if (s < straight + Math.PI * r) {
      const a = (s - straight) / r;
      x = straight / 2 + Math.sin(a) * r;
      z = -Math.cos(a) * r;
    } else if (s < 2 * straight + Math.PI * r) {
      x = straight / 2 - (s - straight - Math.PI * r);
      z = r;
    } else {
      const a = (s - 2 * straight - Math.PI * r) / r;
      x = -straight / 2 - Math.sin(a) * r;
      z = Math.cos(a) * r;
    }
    pts.push([x, 0, z]);
  }
  return {
    id: 'oval',
    name: 'Oval',
    country: 'Test',
    lengthM: total,
    direction: 'clockwise',
    sampleSpacingM: spacing,
    points: pts,
    widths: pts.map(() => 14),
    startIndex: 0,
    corners: [],
    pitLane: null,
    origin: { lat: 0, lon: 0 },
    source: 'test',
  };
}

const assists: Assists = {
  abs: true,
  tcs: 1,
  stability: false,
  racingLine: false,
  autoBrake: false,
};

function makeCar(id: string, transmission: 'auto' | 'manual' = 'auto'): Vehicle {
  const track = new Track(ovalJson());
  const spec = carById(id);
  const v = new Vehicle(spec, defaultTuning(spec), track, assists, transmission);
  v.placeAt(20, 0);
  return v;
}

function run(v: Vehicle, seconds: number, steer: number, throttle: number, brake: number): void {
  const input = emptyInput();
  input.steer = steer;
  input.throttle = throttle;
  input.brake = brake;
  const steps = Math.round(seconds / PHYSICS_DT);
  for (let i = 0; i < steps; i++) {
    v.setControls(input, PHYSICS_DT);
    v.step(PHYSICS_DT);
    if (!isFinite(v.pos.x) || !isFinite(v.vel.x)) throw new Error(`NaN at step ${i}`);
  }
}

describe('Vehicle', () => {
  it('settles on its suspension at rest', () => {
    const v = makeCar('sakura_86');
    run(v, 2, 0, 0, 0);
    expect(Math.abs(v.vel.length())).toBeLessThan(0.05);
    const loads = v.wheels.map((w) => w.fz);
    const total = loads.reduce((a, b) => a + b, 0);
    expect(total).toBeGreaterThan(970 * 9.81 * 0.9);
    expect(total).toBeLessThan(970 * 9.81 * 1.1);
    expect(v.wheels.every((w) => w.contact)).toBe(true);
  });

  it('accelerates in a straight line to a plausible speed', () => {
    const v = makeCar('sakura_86');
    run(v, 1, 0, 0, 0);
    run(v, 8, 0, 1, 0);
    const kmh = v.speedKmh;
    expect(kmh).toBeGreaterThan(80);
    expect(kmh).toBeLessThan(170);
    expect(Math.abs(v.query.lateral)).toBeLessThan(1.5);
    expect(v.gear).toBeGreaterThan(1);
  });

  it('a GT3 car reaches 0-100 km/h in under 4 seconds and brakes hard', () => {
    const v = makeCar('aurelia_gt3');
    run(v, 1, 0, 0, 0);
    let t = 0;
    const input = emptyInput();
    input.throttle = 1;
    while (v.speedKmh < 100 && t < 10) {
      v.setControls(input, PHYSICS_DT);
      v.step(PHYSICS_DT);
      t += PHYSICS_DT;
    }
    expect(t).toBeLessThan(4);
    run(v, 3, 0, 1, 0);
    const before = v.speedKmh;
    run(v, 1, 0, 0, 1);
    expect(before - v.speedKmh).toBeGreaterThan(45);
  });

  it('turns when steered and holds the road', () => {
    const v = makeCar('kaizen_rx7');
    run(v, 1, 0, 0, 0);
    run(v, 5, 0, 1, 0);
    const headingBefore = Math.atan2(v.forward.x, v.forward.z);
    run(v, 1.5, 0.5, 0.3, 0);
    const headingAfter = Math.atan2(v.forward.x, v.forward.z);
    expect(Math.abs(headingAfter - headingBefore)).toBeGreaterThan(0.15);
    expect(v.up.y).toBeGreaterThan(0.95);
  });

  it('never leaves the barriers even at full throttle for a lap', () => {
    const v = makeCar('shinsei_gtr');
    run(v, 1, 0, 0, 0);
    let maxLat = 0;
    const input = emptyInput();
    input.throttle = 1;
    for (let i = 0; i < 240 * 30; i++) {
      v.setControls(input, PHYSICS_DT);
      v.step(PHYSICS_DT);
      maxLat = Math.max(maxLat, Math.abs(v.query.lateral));
    }
    expect(maxLat).toBeLessThan(7 + 7 + 1);
    expect(v.up.y).toBeGreaterThan(0.8);
  });

  it('manual gearbox shifts on command', () => {
    const v = makeCar('bavaria_m4', 'manual');
    run(v, 1, 0, 0, 0);
    expect(v.gear).toBe(1);
    const input = emptyInput();
    input.throttle = 1;
    input.shiftUp = true;
    v.setControls(input, PHYSICS_DT);
    expect(v.gear).toBe(2);
  });
});

interface SkidPadResult {
  mean: number;
  std: number;
  peak: number;
}

/**
 * Builds speed in a straight line, then holds a fixed steer input for
 * `seconds` and records the body yaw rate throughout.
 */
function runSkidPad(steerFraction: number, seconds: number): SkidPadResult {
  // A real skid pad is a wide paved area, not a single racing lane: use a
  // wide version of the spec's oval (same straight/radius) so the car has
  // room to settle into a steady turn instead of running onto the grass
  // within a couple of seconds.
  const track = new Track(skidPadOval(300, 2500, 1200));
  const spec = carById('kaizen_rx7');
  const v = new Vehicle(spec, defaultTuning(spec), track, assists, 'auto');
  v.placeAt(20, 0);
  const input = emptyInput();
  input.throttle = 0.5;
  let buildT = 0;
  while (v.speedKmh < 70 && buildT < 20) {
    v.setControls(input, PHYSICS_DT);
    v.step(PHYSICS_DT);
    buildT += PHYSICS_DT;
  }
  expect(v.speedKmh).toBeGreaterThanOrEqual(65);

  input.steer = steerFraction;
  input.throttle = 0.25;
  const steps = Math.round(seconds / PHYSICS_DT);
  const settleStart = Math.round((seconds - 3) / PHYSICS_DT);
  const settled: number[] = [];
  let peak = 0;
  for (let i = 0; i < steps; i++) {
    v.setControls(input, PHYSICS_DT);
    v.step(PHYSICS_DT);
    const yaw = v.angVel.y;
    peak = Math.max(peak, Math.abs(yaw));
    if (i >= settleStart) settled.push(yaw);
  }
  const mean = settled.reduce((a, b) => a + b, 0) / settled.length;
  const variance = settled.reduce((a, b) => a + (b - mean) * (b - mean), 0) / settled.length;
  return { mean, std: Math.sqrt(variance), peak };
}

describe('Vehicle skid-pad', () => {
  it('a fixed steer input settles into a steady, non-weaving yaw rate', () => {
    const { mean, std, peak } = runSkidPad(0.25, 10);
    // actually turning, not just crawling along the centreline
    expect(Math.abs(mean)).toBeGreaterThan(0.02);
    // no weave: the yaw rate barely wobbles once settled
    expect(std).toBeLessThan(0.15 * Math.abs(mean));
    // step-steer overshoot: the transient peak stays close to the steady value
    const overshoot = (peak - Math.abs(mean)) / Math.abs(mean);
    expect(overshoot).toBeLessThan(0.35);
  });
});
