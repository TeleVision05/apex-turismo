import type { CarSpec, Transmission } from '../core/types';
import { clamp, interpCurve } from '../core/math';

const RPM_TO_RAD = (Math.PI * 2) / 60;
const RAD_TO_RPM = 60 / (Math.PI * 2);
export const SHIFT_TIME = 0.14;
export const ENGINE_INERTIA = 0.25;
export const DRIVELINE_EFFICIENCY = 0.9;

/**
 * Engine + gearbox state. The engine is rigidly coupled to the driven wheels
 * while in gear (rpm derived from wheel speed); in neutral or while shifting it
 * free-revs with its own inertia. Below idle a slipping clutch keeps it alive.
 */
export class Drivetrain {
  rpm: number;
  gear = 1; // 0 = neutral, -1 = reverse
  shiftTimer = 0;
  readonly torquePoints: { x: number; y: number }[];
  readonly ratios: number[];
  readonly finalDrive: number;
  readonly reverseRatio: number;
  readonly idle: number;
  readonly redline: number;
  powerMul = 1;
  limiterCut = 0;
  /** true while the race start holds the cars on the grid */
  launchHold = false;
  private reverseHold = 0;

  constructor(
    readonly spec: CarSpec,
    finalDriveMul = 1,
  ) {
    this.torquePoints = spec.torqueCurve.map((p) => ({ x: p.rpm, y: p.nm }));
    this.ratios = spec.gearRatios;
    this.finalDrive = spec.finalDrive * finalDriveMul;
    this.reverseRatio = spec.reverseRatio;
    this.idle = spec.idleRpm;
    this.redline = spec.redlineRpm;
    this.rpm = spec.idleRpm;
  }

  /** Overall ratio (wheel rad/s -> engine rad/s), 0 in neutral. */
  get ratio(): number {
    if (this.gear === 0) return 0;
    const g = this.gear < 0 ? -this.reverseRatio : this.ratios[this.gear - 1];
    return g * this.finalDrive;
  }

  get maxGear(): number {
    return this.ratios.length;
  }

  /** Engine torque (Nm) at the crank for the current rpm and throttle. */
  engineTorque(throttle: number): number {
    const rpm = this.rpm;
    const full = interpCurve(this.torquePoints, rpm) * this.powerMul;
    const friction = 0.012 * full + 0.000004 * rpm * rpm * 0.35; // engine braking grows with rpm
    let t = throttle;
    if (rpm >= this.redline) {
      this.limiterCut = 0.05;
    }
    if (this.limiterCut > 0) t = 0;
    return full * t - friction * (1 - t);
  }

  /** Called every physics step with the mean driven-wheel angular speed. */
  update(dt: number, throttle: number, drivenWheelOmega: number): void {
    if (this.limiterCut > 0) this.limiterCut -= dt;
    if (this.shiftTimer > 0) this.shiftTimer -= dt;
    const inGear = this.gear !== 0 && this.shiftTimer <= 0;
    if (inGear) {
      const coupled = Math.abs(drivenWheelOmega * this.ratio) * RAD_TO_RPM;
      // slipping clutch below the launch rpm: the engine never stalls and launches with revs
      const launch = this.idle + throttle * (this.redline * 0.42 - this.idle);
      this.rpm = Math.max(coupled, launch);
      if (this.rpm > this.redline + 400) this.rpm = this.redline + 400;
    } else {
      const target = this.idle + throttle * (this.redline - this.idle);
      const rate = throttle > 0.05 ? 9000 : 6000;
      const delta = clamp(target - this.rpm, -rate * dt, rate * dt);
      this.rpm += delta;
    }
  }

  /** Torque delivered to the driven axle(s) combined, Nm. */
  axleTorque(throttle: number): number {
    if (this.gear === 0 || this.shiftTimer > 0) return 0;
    const te = this.engineTorque(throttle);
    return te * this.ratio * DRIVELINE_EFFICIENCY;
  }

  /** Inertia of the engine as seen at the driven wheels (total, all driven wheels). */
  reflectedInertia(): number {
    if (this.gear === 0 || this.shiftTimer > 0) return 0;
    return ENGINE_INERTIA * this.ratio * this.ratio;
  }

  shiftUp(): boolean {
    if (this.gear >= this.maxGear || this.shiftTimer > 0) return false;
    this.gear += 1;
    this.shiftTimer = SHIFT_TIME;
    return true;
  }

  shiftDown(): boolean {
    if (this.gear <= -1 || this.shiftTimer > 0) return false;
    this.gear -= 1;
    this.shiftTimer = SHIFT_TIME;
    return true;
  }

  /**
   * Automatic gearbox logic. `speed` is forward speed (m/s, negative reversing).
   */
  autoShift(throttle: number, brake: number, speed: number, wheelOmega: number): void {
    if (this.shiftTimer > 0) return;
    if (this.gear === -1) {
      if (speed > -0.3 && throttle > 0.2) this.gear = 1;
      return;
    }
    if (this.gear === 0) {
      this.gear = 1;
      return;
    }
    // holding the brake at a standstill for a moment engages reverse (GT-style)
    if (Math.abs(speed) < 0.4 && brake > 0.4 && throttle < 0.05 && !this.launchHold) {
      this.reverseHold += 1 / 240;
      if (this.reverseHold > 0.9) this.gear = -1;
      return;
    }
    this.reverseHold = 0;
    const rpm = this.rpm;
    const upshiftAt = this.redline * (throttle > 0.7 ? 0.985 : 0.75);
    if (this.gear < this.maxGear && rpm > upshiftAt && wheelOmega > 0) {
      this.shiftUp();
      return;
    }
    if (this.gear > 1) {
      const lowerRatio = this.ratios[this.gear - 2] * this.finalDrive;
      const rpmInLower = Math.abs(wheelOmega * lowerRatio) * RAD_TO_RPM;
      const eager = brake > 0.3 || throttle > 0.9;
      const threshold = eager ? this.redline * 0.9 : this.redline * 0.72;
      if (rpmInLower < threshold && rpm < this.redline * 0.62) this.shiftDown();
    }
  }

  static toRad(rpm: number): number {
    return rpm * RPM_TO_RAD;
  }
}

export function transmissionLabel(t: Transmission): string {
  return t === 'auto' ? 'AT' : 'MT';
}
