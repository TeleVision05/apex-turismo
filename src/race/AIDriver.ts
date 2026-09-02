import { Vector3 } from 'three';
import type { Vehicle } from '../physics/Vehicle';
import type { RacingLine } from '../track/RacingLine';
import type { InputState } from '../core/types';
import { clamp, damp, wrapIndex, makeRng } from '../core/math';

const tmp = new Vector3();
const local = new Vector3();

/**
 * Bot driver: follows the precomputed racing line with pure-pursuit steering,
 * a speed profile scaled by skill and car grip, and simple overtaking/avoidance.
 */
export class AIDriver {
  private avoidOffset = 0;
  private stuckTimer = 0;
  private reverseTimer = 0;
  private noise = 1;
  private noiseTimer = 0;
  private readonly rng: () => number;
  private readonly carFactor: number;

  constructor(
    readonly vehicle: Vehicle,
    readonly line: RacingLine,
    readonly skill: number,
    seed: number,
  ) {
    this.rng = makeRng(seed);
    const s = vehicle.spec;
    const grip = vehicle.tyres.mu * 0.97;
    const aero = (s.downforceFront + s.downforceRear) * s.downforceMul;
    this.carFactor = Math.sqrt(grip / 1.38) * (1 + Math.min(0.14, aero * 0.025));
  }

  update(dt: number, others: Vehicle[], out: InputState): void {
    const v = this.vehicle;
    const q = v.query;
    const track = v.track;
    const n = track.n;
    this.updateNoise(dt);
    const speed = Math.max(0, v.speed);
    const lookAhead = clamp(4 + speed * 0.45, 6, 30);
    const aheadIdx = wrapIndex(q.index + Math.round(lookAhead / track.spacing), n);
    const lateralTarget = this.computeAvoidance(dt, others, aheadIdx);
    tmp.copy(track.points[aheadIdx]).addScaledVector(track.rights[aheadIdx], lateralTarget);
    local.copy(tmp).sub(v.pos);
    const x = local.dot(v.right);
    const z = local.dot(v.forward);
    // Stanley-style steering: heading error to the line tangent, cross-track term and curvature feed-forward
    const tangent = this.lineTangent(aheadIdx);
    const headingErr = Math.atan2(tangent.dot(v.right), Math.max(0.05, tangent.dot(v.forward)));
    const crossTrack = Math.atan((1.4 * x) / (speed + 3));
    const ffIdx = wrapIndex(q.index + Math.round((speed * 0.9 + 6) / track.spacing), n);
    const feedForward = Math.atan(v.spec.wheelbaseM * this.lineCurvature(ffIdx));
    let wheelAngle = headingErr + crossTrack + feedForward - v.angVel.y * -0.02;
    // never ask the front tyres for more lateral acceleration than the car can produce
    const aMax = 9.81 * v.tyres.mu * 0.95 * (1 + this.aeroBoost(speed));
    const maxAngle =
      Math.atan((v.spec.wheelbaseM * aMax) / Math.max(25, speed * speed)) * 1.35 + 0.03;
    wheelAngle = clamp(wheelAngle, -maxAngle, maxAngle);
    let steer = clamp(wheelAngle / v.steerScale(), -1, 1);
    // counter-steer into a slide: positive body slip (nose left of travel) needs right steer
    if (Math.abs(v.slipAngle) > 0.06)
      steer += clamp((v.slipAngle - Math.sign(v.slipAngle) * 0.06) * 1.4, -0.6, 0.6);
    const wrongWay = z < 0 && q.lateral * q.lateral < 400;
    if (wrongWay) steer = x >= 0 ? 1 : -1;
    // speed control, capped by the car directly ahead so the pack keeps a gap
    const targetSpeed = Math.min(this.targetSpeed(q.index, speed) * this.noise, this.followCap);
    const err = targetSpeed - speed;
    let throttle = 0;
    let brake = 0;
    if (err > 0) throttle = clamp(0.25 + err * 0.45, 0, 1);
    else brake = clamp(-err * 0.3, 0, 1);
    throttle *= this.tractionLimit(speed);
    if (this.blockedAhead > 0) {
      throttle = Math.min(throttle, 1 - this.blockedAhead);
      brake = Math.max(brake, this.blockedAhead > 0.7 ? this.blockedAhead - 0.4 : 0);
    }
    this.handleStuck(dt, speed);
    if (this.reverseTimer > 0) {
      throttle = 0;
      brake = 1;
      steer = -steer;
    }
    out.steer = clamp(steer, -1, 1);
    out.throttle = throttle;
    out.brake = brake;
    out.handbrake = false;
    out.shiftUp = out.shiftDown = false;
  }

  private blockedAhead = 0;
  private followCap = Infinity;

  private readonly tangentTmp = new Vector3();

  /** Unit tangent of the racing line at a sample (signed curvature is derived from neighbours). */
  private lineTangent(idx: number): Vector3 {
    const pts = this.line.points;
    const n = pts.length;
    return this.tangentTmp
      .subVectors(pts[wrapIndex(idx + 1, n)], pts[wrapIndex(idx - 1, n)])
      .setY(0)
      .normalize();
  }

  /** Signed curvature of the racing line (positive = turning right). */
  private lineCurvature(idx: number): number {
    const pts = this.line.points;
    const n = pts.length;
    const a = pts[wrapIndex(idx - 2, n)];
    const b = pts[idx];
    const c = pts[wrapIndex(idx + 2, n)];
    const abx = b.x - a.x;
    const abz = b.z - a.z;
    const bcx = c.x - b.x;
    const bcz = c.z - b.z;
    const cross = abx * bcz - abz * bcx; // y-up: positive cross = left turn
    const len = Math.hypot(abx, abz) * Math.hypot(bcx, bcz);
    if (len < 1e-6) return 0;
    const angle = Math.asin(clamp(cross / len, -1, 1));
    return -angle / (2 * this.line.track.spacing);
  }

  /** Extra grip fraction from downforce at a given speed (relative to weight). */
  private aeroBoost(speed: number): number {
    const s = this.vehicle.spec;
    const df = 0.5 * 1.2 * speed * speed * (s.downforceFront + s.downforceRear) * s.downforceMul;
    return Math.min(1.2, df / (s.massKg * 9.81));
  }

  /** Feeds the power in progressively and backs off when the car starts to slide. */
  private tractionLimit(speed: number): number {
    const v = this.vehicle;
    const launch = clamp(0.45 + speed / 18, 0, 1);
    const slide = clamp(1 - (Math.abs(v.slipAngle) - 0.05) / 0.2, 0.15, 1);
    const steerLoad =
      speed < 8 ? 1 : clamp(1 - (Math.abs(v.steerAngle) / v.steerScale() - 0.35) * 0.9, 0.35, 1);
    let spin = 0;
    for (const w of v.wheels) if (w.driven && w.contact) spin = Math.max(spin, w.force.slipRatio);
    const spinLimit = clamp(1 - (spin - 0.1) / 0.15, 0.2, 1);
    return launch * slide * steerLoad * spinLimit;
  }

  private targetSpeed(index: number, speed: number): number {
    const ahead = 8 + speed * 2.4;
    const base = this.line.minSpeedAhead(index, ahead);
    return base * this.skill * this.carFactor;
  }

  private updateNoise(dt: number): void {
    this.noiseTimer -= dt;
    if (this.noiseTimer <= 0) {
      this.noiseTimer = 2 + this.rng() * 4;
      const spread = (1 - this.skill) * 0.12 + 0.015;
      this.noise = 1 + (this.rng() * 2 - 1) * spread;
    }
  }

  /** Returns the desired lateral offset (metres from centreline) at the look-ahead point. */
  private computeAvoidance(dt: number, others: Vehicle[], aheadIdx: number): number {
    const v = this.vehicle;
    const track = v.track;
    const q = v.query;
    let desired = this.line.offsets[aheadIdx];
    let blocked = 0;
    let followCap = Infinity;
    const halfW = q.halfWidth - 1.4;
    for (const o of others) {
      if (o === v) continue;
      const ds = track.deltaS(q.s, o.query.s);
      const dl = o.query.lateral - q.lateral;
      const closing = Math.max(0, v.speed - o.speed);
      if (ds > 0 && ds < 60 && Math.abs(dl) < 2.4) {
        // car-following: hold roughly 0.7 s behind the car ahead when sharing its lane
        const gap = 4 + Math.max(0, v.speed) * 0.7;
        followCap = Math.min(followCap, Math.max(2, o.speed + (ds - gap) * 0.5));
      }
      if (ds > -6 && ds < 45 && Math.abs(dl) < 3.2) {
        // car ahead in our lane: pick the freer side
        const roomLeft = o.query.lateral + halfW;
        const roomRight = halfW - o.query.lateral;
        const side = roomLeft > roomRight ? -1 : 1;
        const want = clamp(o.query.lateral + side * 3.0, -halfW, halfW);
        const weight = clamp(1 - ds / 45, 0, 1);
        desired = desired * (1 - weight) + want * weight;
        const timeToHit = closing > 0.5 ? ds / closing : 99;
        if (ds > 0 && timeToHit < 1.6 && Math.abs(dl) < 2.4)
          blocked = Math.max(blocked, clamp(1 - timeToHit / 1.6, 0, 1));
      } else if (Math.abs(ds) < 5.5 && Math.abs(dl) < 2.6) {
        // side by side: hold a lane away from the other car
        const want = clamp(o.query.lateral - Math.sign(dl || 1) * 2.4, -halfW, halfW);
        desired = desired * 0.4 + want * 0.6;
      }
    }
    this.followCap = followCap;
    this.blockedAhead = damp(this.blockedAhead, blocked, 0.15, dt);
    const maxStep = 3.5 * dt; // lateral target moves at most 3.5 m/s
    const target = damp(this.avoidOffset, desired, 0.4, dt);
    this.avoidOffset += clamp(target - this.avoidOffset, -maxStep, maxStep);
    return this.avoidOffset;
  }

  private handleStuck(dt: number, speed: number): void {
    if (this.reverseTimer > 0) {
      this.reverseTimer -= dt;
      return;
    }
    const v = this.vehicle;
    const stuck =
      speed < 1.0 &&
      (v.wallContact > 0 ||
        v.offTrackWheels >= 2 ||
        Math.abs(v.query.lateral) > v.query.halfWidth + 2);
    this.stuckTimer = stuck ? this.stuckTimer + dt : 0;
    if (this.stuckTimer > 2.5) {
      this.reverseTimer = 1.4;
      this.stuckTimer = 0;
    }
  }
}
