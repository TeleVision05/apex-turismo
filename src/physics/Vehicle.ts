import { Vector3, Quaternion, Matrix3 } from 'three';
import type { CarSpec, CarTuning, Assists, InputState, Transmission } from '../core/types';
import { Track, type TrackQuery, type Surface } from '../track/Track';
import { Drivetrain } from './Drivetrain';
import {
  tyreForce,
  tyreParamsFor,
  SURFACE_GRIP,
  SURFACE_ROLLING,
  type TyreParams,
  type TyreForce,
} from './TireModel';
import { clamp } from '../core/math';
import { applyTuning, type EffectiveSpec } from './Tuning';

export const PHYSICS_DT = 1 / 240;
const GRAVITY = 9.81;
const AIR_DENSITY = 1.2;
const REST_SUSPENSION = 0.28;

export interface WheelState {
  /** wheel centre at rest in car space */
  local: Vector3;
  radius: number;
  omega: number;
  steer: number;
  compression: number;
  compressionVel: number;
  contact: boolean;
  fz: number;
  surface: Surface;
  force: TyreForce;
  driven: boolean;
  brakeTorque: number;
  /** world contact point (valid when contact) */
  contactPoint: Vector3;
  worldCenter: Vector3;
  skid: number; // 0..1 how much the tyre is sliding
  /** spring compression that carries the static load (preload) */
  restCompression: number;
}

export interface VehicleControls {
  steer: number;
  throttle: number;
  brake: number;
  handbrake: boolean;
}

/**
 * Rigid-body vehicle with four spring/damper wheels, a combined-slip tyre
 * model and a coupled engine. Integrated at PHYSICS_DT; wheels sub-stepped.
 */
export class Vehicle {
  readonly spec: EffectiveSpec;
  readonly tyres: TyreParams;
  readonly drivetrain: Drivetrain;
  readonly pos = new Vector3();
  readonly quat = new Quaternion();
  readonly vel = new Vector3();
  readonly angVel = new Vector3();
  readonly wheels: WheelState[] = [];
  readonly mass: number;
  readonly invInertiaLocal = new Matrix3();
  readonly inertiaLocal = new Vector3();
  readonly controls: VehicleControls = { steer: 0, throttle: 0, brake: 0, handbrake: false };
  assists: Assists;
  transmission: Transmission;
  /** last centreline query for the body */
  readonly query: TrackQuery;
  trackHint: number | null = null;
  absActive = false;
  /** true when driven by a physical steering wheel: no speed-sensitive reduction */
  directSteer = false;
  tcsActive = false;
  steerAngle = 0;
  speed = 0; // forward speed m/s
  slipAngle = 0; // body slip angle rad
  lateralG = 0;
  longitudinalG = 0;
  offTrackWheels = 0;
  wallContact = 0;
  readonly forward = new Vector3(0, 0, -1);
  readonly right = new Vector3(1, 0, 0);
  readonly up = new Vector3(0, 1, 0);
  private readonly force = new Vector3();
  private readonly torque = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly tmp3 = new Vector3();
  private readonly wheelQuery: TrackQuery;
  private lastVel = new Vector3();
  private readonly invQuat = new Quaternion();

  constructor(
    base: CarSpec,
    tuning: CarTuning,
    readonly track: Track,
    assists: Assists,
    transmission: Transmission,
  ) {
    this.spec = applyTuning(base, tuning);
    const s = this.spec;
    this.tyres = tyreParamsFor(tuning.tyres, s.tyreGrip);
    this.drivetrain = new Drivetrain(base, tuning.finalDriveMul);
    this.drivetrain.powerMul = s.powerMul;
    this.assists = assists;
    this.transmission = transmission;
    this.mass = s.massKg;
    const w = s.widthM;
    const l = s.lengthM;
    const h = s.heightM;
    this.inertiaLocal.set(
      (this.mass / 12) * (h * h + l * l) * 0.9,
      (this.mass / 12) * (w * w + l * l) * 1.0,
      (this.mass / 12) * (w * w + h * h) * 0.9,
    );
    this.invInertiaLocal.set(
      1 / this.inertiaLocal.x,
      0,
      0,
      0,
      1 / this.inertiaLocal.y,
      0,
      0,
      0,
      1 / this.inertiaLocal.z,
    );
    const fb = s.frontWeightBias;
    const fx = s.wheelbaseM * (1 - fb);
    const rx = -s.wheelbaseM * fb;
    const driven = drivenMask(s.drivetrain);
    const mk = (x: number, z: number, i: number): WheelState => ({
      local: new Vector3(x, s.wheelRadiusM - s.cgHeightM, z),
      radius: s.wheelRadiusM,
      omega: 0,
      steer: 0,
      compression: 0,
      compressionVel: 0,
      contact: false,
      fz: 0,
      surface: 'asphalt',
      force: { fx: 0, fy: 0, combinedSlip: 0, slipRatio: 0, slipAngle: 0, stiffness: 0 },
      driven: driven[i],
      brakeTorque: 0,
      contactPoint: new Vector3(),
      worldCenter: new Vector3(),
      skid: 0,
      restCompression: 0,
    });
    // order: FL, FR, RL, RR (car forward is -Z, so the front axle sits at -fx)
    this.wheels.push(
      mk(-s.trackM / 2, -fx, 0),
      mk(s.trackM / 2, -fx, 1),
      mk(-s.trackM / 2, -rx, 2),
      mk(s.trackM / 2, -rx, 3),
    );
    this.wheels.forEach((w, i) => {
      const share = i < 2 ? fb / 2 : (1 - fb) / 2;
      w.restCompression = (this.mass * GRAVITY * share) / (i < 2 ? s.springFront : s.springRear);
      w.compression = w.restCompression;
    });
    this.query = this.track.query(this.pos, null);
    this.wheelQuery = this.track.query(this.pos, null);
  }

  /** Places the car on the track at arc length `s`, offset laterally, facing forward. */
  placeAt(s: number, lateral: number, extraYaw = 0): void {
    const t = this.track;
    const idx = t.indexAt(s);
    const p = t.pointAt(s, this.tmp);
    const f = t.forwards[idx];
    const r = t.rights[idx];
    this.pos.copy(p).addScaledVector(r, lateral);
    this.pos.y += this.spec.cgHeightM + 0.01;
    const yaw = Math.atan2(-f.x, -f.z) + extraYaw;
    this.quat.setFromAxisAngle(new Vector3(0, 1, 0), yaw);
    this.vel.set(0, 0, 0);
    this.angVel.set(0, 0, 0);
    this.trackHint = idx;
    this.drivetrain.gear = 1;
    this.drivetrain.rpm = this.drivetrain.idle;
    for (const w of this.wheels) {
      w.omega = 0;
      w.compression = w.restCompression;
    }
    this.updateAxes();
    this.track.query(this.pos, this.trackHint, this.query);
    this.trackHint = this.query.index;
  }

  /** Resets the car onto the racing surface near where it is (recovery). */
  resetToTrack(): void {
    const q = this.track.query(this.pos, this.trackHint);
    this.placeAt(q.s, clamp(q.lateral, -q.halfWidth + 2, q.halfWidth - 2));
  }

  setControls(input: InputState, dt: number): void {
    const c = this.controls;
    const auto = this.transmission === 'auto';
    const reversing = this.drivetrain.gear === -1 && auto;
    c.throttle = reversing ? input.brake : input.throttle;
    c.brake = reversing ? input.throttle : input.brake;
    c.handbrake = input.handbrake;
    c.steer = input.steer;
    this.directSteer = input.steerIsDirect;
    if (!auto) {
      if (input.shiftUp) this.drivetrain.shiftUp();
      if (input.shiftDown) this.drivetrain.shiftDown();
    }
    this.applySteering(dt);
  }

  /** Radians of road-wheel angle per unit of steering input at the current speed. */
  steerScale(): number {
    const s = this.spec;
    const v = Math.abs(this.speed);
    const lock = (s.steerLockDeg * Math.PI) / 180;
    if (this.directSteer) return lock;
    // speed-sensitive lock so pad/keyboard remain controllable at high speed
    const factor = 1 / (1 + Math.pow(v / 22, 1.35));
    return lock * Math.max(0.17, factor);
  }

  private applySteering(dt: number): void {
    const v = Math.abs(this.speed);
    const target = this.controls.steer * this.steerScale();
    const rate = this.directSteer ? 12 : 6 + v * 0.05;
    const delta = clamp(target - this.steerAngle, -rate * dt, rate * dt);
    this.steerAngle += delta;
  }

  updateAxes(): void {
    this.forward.set(0, 0, -1).applyQuaternion(this.quat);
    this.right.set(1, 0, 0).applyQuaternion(this.quat);
    this.up.set(0, 1, 0).applyQuaternion(this.quat);
  }

  /** One fixed physics step. */
  step(dt: number): void {
    this.updateAxes();
    this.force.set(0, -GRAVITY * this.mass, 0);
    this.torque.set(0, 0, 0);
    this.track.query(this.pos, this.trackHint, this.query);
    this.trackHint = this.query.index;
    this.speed = this.vel.dot(this.forward);
    const lat = this.vel.dot(this.right);
    this.slipAngle = Math.abs(this.speed) > 2 ? Math.atan2(lat, Math.abs(this.speed)) : 0;
    this.updateSuspension(dt);
    this.updateDrivetrainAndWheels(dt);
    this.applyAero();
    this.integrate(dt);
    this.resolveBarriers();
    this.lateralG = this.vel.clone().sub(this.lastVel).divideScalar(dt).dot(this.right) / GRAVITY;
    this.longitudinalG =
      this.vel.clone().sub(this.lastVel).divideScalar(dt).dot(this.forward) / GRAVITY;
    this.lastVel.copy(this.vel);
  }

  private updateSuspension(dt: number): void {
    const s = this.spec;
    this.offTrackWheels = 0;
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      const front = i < 2;
      const k = front ? s.springFront : s.springRear;
      const c = front ? s.damperFront : s.damperRear;
      // attachment point (top of strut) in world space; at rest the spring already carries the static load
      const attach = this.tmp
        .set(w.local.x, w.local.y + REST_SUSPENSION - w.restCompression, w.local.z)
        .applyQuaternion(this.quat)
        .add(this.pos);
      const q = this.track.query(attach, this.trackHint, this.wheelQuery);
      w.surface = this.track.surfaceAt(q.lateral, q.halfWidth, q.index);
      if (w.surface !== 'asphalt' && w.surface !== 'curb') this.offTrackWheels++;
      const curbBump = w.surface === 'curb' ? 0.03 * Math.sin(q.s * 6.0) : 0;
      const groundY = q.height + curbBump;
      const cosTilt = Math.max(0.5, this.up.y);
      const gap = (attach.y - groundY) / cosTilt;
      const maxLen = REST_SUSPENSION + w.radius;
      const prevComp = w.compression;
      if (gap >= maxLen) {
        w.contact = false;
        w.compression = 0;
        w.compressionVel = 0;
        w.fz = 0;
        w.worldCenter.copy(attach).addScaledVector(this.up, -REST_SUSPENSION);
        continue;
      }
      w.contact = true;
      const maxComp = w.restCompression + s.suspensionTravelM;
      w.compression = clamp(maxLen - gap, 0, maxComp);
      w.compressionVel = (w.compression - prevComp) / dt;
      let fz = k * w.compression + c * w.compressionVel;
      if (maxLen - gap > maxComp) fz += (maxLen - gap - maxComp) * k * 12;
      // anti-roll bar couples left/right compression
      const other = this.wheels[i ^ 1];
      const arb = front ? s.antiRollFront : s.antiRollRear;
      fz += arb * (w.compression - other.compression);
      w.fz = Math.max(0, fz);
      const susLen = REST_SUSPENSION - w.compression;
      w.worldCenter.copy(attach).addScaledVector(this.up, -susLen);
      w.contactPoint.copy(w.worldCenter).addScaledVector(this.up, -w.radius);
      this.tmp2.copy(this.up).multiplyScalar(w.fz);
      this.addForceAt(this.tmp2, attach);
    }
  }

  private updateDrivetrainAndWheels(dt: number): void {
    const s = this.spec;
    const dtr = this.drivetrain;
    let drivenSum = 0;
    let drivenCount = 0;
    for (const w of this.wheels) {
      if (w.driven) {
        drivenSum += w.omega;
        drivenCount++;
      }
    }
    const drivenOmega = drivenCount ? drivenSum / drivenCount : 0;
    this.wheels[0].steer = this.wheels[1].steer = this.steerAngle;
    let throttle = this.controls.throttle;
    if (this.transmission === 'auto')
      dtr.autoShift(throttle, this.controls.brake, this.speed, drivenOmega);
    throttle = this.applyTractionControl(throttle);
    dtr.update(dt, throttle, drivenOmega);
    const axleTorque = dtr.axleTorque(throttle);
    const reflected = dtr.reflectedInertia();
    const frontSplit = s.drivetrain === '4WD' ? s.frontTorqueSplit : s.drivetrain === 'FF' ? 1 : 0;
    const sub = 4;
    const sdt = dt / sub;
    const wheelInertia = 1.1;
    for (let k = 0; k < sub; k++) {
      for (let i = 0; i < 4; i++) {
        const w = this.wheels[i];
        if (!w.driven && !w.contact && Math.abs(w.omega) < 0.1) continue;
        const front = i < 2;
        const sideShare = 0.5;
        let drive = 0;
        if (w.driven) {
          drive = axleTorque * (front ? frontSplit : 1 - frontSplit) * sideShare;
          // viscous limited-slip differential pulls the two sides together
          const other = this.wheels[i ^ 1];
          drive -= 45 * (w.omega - other.omega);
        }
        const inertia = wheelInertia + (w.driven ? reflected / Math.max(1, drivenCount) : 0);
        const tf = this.computeTyreForce(w, i);
        const rolling = w.contact
          ? SURFACE_ROLLING[w.surface] * w.fz * w.radius * Math.sign(w.omega)
          : 0;
        const net = drive - tf.fx * w.radius - rolling;
        // semi-implicit: the tyre reaction is linearised in omega so stiff tyres stay stable
        w.omega += (net * sdt) / (inertia + sdt * tf.stiffness * w.radius);
        this.applyBrake(w, i, sdt, inertia);
        if (k === sub - 1 && w.contact) {
          this.tmp
            .copy(this.wheelDirs(w.steer, this.tmp2, this.tmp3).fw)
            .multiplyScalar(tf.fx)
            .addScaledVector(this.tmp3, tf.fy);
          this.addForceAt(this.tmp, w.contactPoint);
          w.skid = clamp((tf.combinedSlip - 1.0) / 1.2, 0, 1) * Math.min(1, w.fz / 1500);
        }
      }
    }
  }

  private applyTractionControl(throttle: number): number {
    this.tcsActive = false;
    const level = this.assists.tcs;
    if (level <= 0 || throttle <= 0.02) return throttle;
    let worst = 0;
    for (const w of this.wheels)
      if (w.driven && w.contact) worst = Math.max(worst, w.force.slipRatio);
    const threshold = level >= 2 ? 0.09 : 0.16;
    if (worst > threshold) {
      const cut = clamp(1 - (worst - threshold) / 0.12, 0.15, 1);
      this.tcsActive = true;
      return throttle * cut;
    }
    return throttle;
  }

  /** wheel forward/right directions for a steering angle */
  private wheelDirs(steer: number, fw: Vector3, rw: Vector3): { fw: Vector3; rw: Vector3 } {
    const c = Math.cos(steer);
    const sn = Math.sin(steer);
    fw.copy(this.forward).multiplyScalar(c).addScaledVector(this.right, sn);
    rw.copy(this.right).multiplyScalar(c).addScaledVector(this.forward, -sn);
    return { fw, rw };
  }

  private computeTyreForce(w: WheelState, i: number): TyreForce {
    if (!w.contact) {
      w.force.fx = w.force.fy = w.force.combinedSlip = 0;
      w.force.slipRatio = 0;
      return w.force;
    }
    const dirs = this.wheelDirs(i < 2 ? this.steerAngle : 0, this.tmp2, this.tmp3);
    const vC = this.pointVelocity(w.contactPoint, this.tmp);
    const vx = vC.dot(dirs.fw);
    const vy = vC.dot(dirs.rw);
    return tyreForce(this.tyres, w.fz, vx, vy, w.omega, w.radius, SURFACE_GRIP[w.surface], w.force);
  }

  private applyBrake(w: WheelState, i: number, dt: number, inertia: number): void {
    const s = this.spec;
    const front = i < 2;
    let torque =
      this.controls.brake * s.brakeTorqueNm * (front ? s.brakeBias : 1 - s.brakeBias) * 0.5;
    if (this.controls.handbrake && !front) torque = Math.max(torque, s.brakeTorqueNm * 0.35);
    if (this.assists.abs && torque > 0 && w.contact && Math.abs(this.speed) > 2) {
      const lock = -w.force.slipRatio;
      if (lock > 0.12) {
        torque *= clamp(1 - (lock - 0.12) / 0.15, 0.2, 1);
        this.absActive = true;
      }
    }
    w.brakeTorque = torque;
    if (torque <= 0) return;
    const dOmega = (torque / inertia) * dt;
    if (Math.abs(w.omega) <= dOmega) w.omega = 0;
    else w.omega -= Math.sign(w.omega) * dOmega;
  }

  private applyAero(): void {
    const s = this.spec;
    const v2 = this.vel.lengthSq();
    if (v2 < 0.01) return;
    const vLen = Math.sqrt(v2);
    const drag = 0.5 * AIR_DENSITY * s.dragCd * s.frontalAreaM2 * v2;
    this.force.addScaledVector(this.vel, -drag / vLen);
    const fwdSpeed = Math.max(0, this.speed);
    const q = 0.5 * AIR_DENSITY * fwdSpeed * fwdSpeed;
    const df = q * s.downforceFront * s.downforceMul;
    const dr = q * s.downforceRear * s.downforceMul;
    const fx = s.wheelbaseM * (1 - s.frontWeightBias);
    const rx = s.wheelbaseM * s.frontWeightBias;
    this.tmp.copy(this.up).multiplyScalar(-df);
    this.addForceAt(this.tmp, this.tmp2.copy(this.pos).addScaledVector(this.forward, fx));
    this.tmp.copy(this.up).multiplyScalar(-dr);
    this.addForceAt(this.tmp, this.tmp2.copy(this.pos).addScaledVector(this.forward, -rx));
  }

  private integrate(dt: number): void {
    this.vel.addScaledVector(this.force, dt / this.mass);
    this.pos.addScaledVector(this.vel, dt);
    // world-space inverse inertia: R * I^-1 * R^T applied to torque
    const localTorque = this.tmp
      .copy(this.torque)
      .applyQuaternion(this.invQuat.copy(this.quat).invert());
    localTorque.x *= 1 / this.inertiaLocal.x;
    localTorque.y *= 1 / this.inertiaLocal.y;
    localTorque.z *= 1 / this.inertiaLocal.z;
    localTorque.applyQuaternion(this.quat);
    this.angVel.addScaledVector(localTorque, dt);
    this.angVel.multiplyScalar(1 - 0.4 * dt);
    if (this.assists.stability && Math.abs(this.slipAngle) > 0.12) {
      this.angVel.y *= 1 - 2.5 * dt;
    }
    const wx = this.angVel.x * dt * 0.5;
    const wy = this.angVel.y * dt * 0.5;
    const wz = this.angVel.z * dt * 0.5;
    const q = this.quat;
    const dq = new Quaternion(wx, wy, wz, 0).multiply(q);
    q.set(q.x + dq.x, q.y + dq.y, q.z + dq.z, q.w + dq.w).normalize();
  }

  /** Keeps the body inside the barriers, sliding along them with friction. */
  private resolveBarriers(): void {
    const s = this.spec;
    const hw = s.widthM / 2;
    const hl = s.lengthM / 2;
    let hit = 0;
    for (const [lx, lz] of [
      [-hw, -hl],
      [hw, -hl],
      [-hw, hl],
      [hw, hl],
    ]) {
      const corner = this.tmp.set(lx, 0, lz).applyQuaternion(this.quat).add(this.pos);
      const q = this.track.query(corner, this.trackHint, this.wheelQuery);
      const limit = this.track.barrierDistance(q.index);
      const pen = Math.abs(q.lateral) - limit;
      if (pen <= 0) continue;
      const dir = Math.sign(q.lateral);
      this.pos.addScaledVector(q.right, -dir * pen);
      const vn = this.vel.dot(q.right) * dir;
      if (vn > 0) {
        this.vel.addScaledVector(q.right, -dir * vn * 1.25);
        this.vel.multiplyScalar(1 - Math.min(0.6, vn * 0.05));
        hit = Math.max(hit, vn);
        this.angVel.y *= 0.5;
      }
      this.vel.multiplyScalar(0.995);
    }
    this.wallContact = hit;
  }

  private readonly tmpLever = new Vector3();
  private addForceAt(f: Vector3, at: Vector3): void {
    this.force.add(f);
    const r = this.tmpLever.subVectors(at, this.pos);
    this.torque.add(r.cross(f));
  }

  pointVelocity(p: Vector3, out: Vector3): Vector3 {
    out.subVectors(p, this.pos);
    out.crossVectors(this.angVel, out);
    return out.add(this.vel);
  }

  /** World position of the model origin (ground level under the centre of gravity). */
  bodyOrigin(out: Vector3): Vector3 {
    return out.copy(this.pos).addScaledVector(this.up, -this.spec.cgHeightM);
  }

  get rpm(): number {
    return this.drivetrain.rpm;
  }
  get gear(): number {
    return this.drivetrain.gear;
  }
  get speedKmh(): number {
    return Math.abs(this.speed) * 3.6;
  }
}

function drivenMask(d: CarSpec['drivetrain']): boolean[] {
  switch (d) {
    case 'FF':
      return [true, true, false, false];
    case '4WD':
      return [true, true, true, true];
    default:
      return [false, false, true, true];
  }
}
