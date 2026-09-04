import type { CarSpec, Transmission } from '../core/types';
import { clamp, interpCurve } from '../core/math';

const RPM_TO_RAD = (Math.PI * 2) / 60;
const RAD_TO_RPM = 60 / (Math.PI * 2);
export const SHIFT_TIME = 0.14;
export const ENGINE_INERTIA = 0.25;
export const DRIVELINE_EFFICIENCY = 0.9;
/** Minimum time between two automatic gear changes. */
export const AUTO_SHIFT_LOCKOUT = 0.45;
/** The lower gear must land below this fraction of its own upshift rpm before an automatic downshift. */
const DOWNSHIFT_HYSTERESIS = 0.9;
/** Same, for a throttle kick-down or a downshift under braking. */
const KICKDOWN_HYSTERESIS = 0.8;
/** After an upshift the box holds the gear this long before a throttle kick-down is considered. */
const UPSHIFT_HOLD = 1.5;
/** Upshift point at a light throttle, as a fraction of the redline. */
const LIGHT_THROTTLE_UPSHIFT = 0.55;
/** With the throttle closed the box holds its gear until the engine is nearly at the limiter. */
const COAST_UPSHIFT = 0.88;

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
  /** full-throttle upshift rpm per forward gear (index gear - 1), from the torque curve */
  readonly upshiftRpm: number[];
  private reverseHold = 0;
  private autoLock = 0;
  private overRev = 0;
  private sinceUpshift = Infinity;
  /** road-speed rpm in the gear we last upshifted out of (Infinity when not applicable) */
  private upshiftRoadRpm = Infinity;
  /** road-speed rpm the last downshift landed at in the current gear (0 when not applicable) */
  private downshiftRoadRpm = 0;
  private demandSmoothed = 0;

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
    this.upshiftRpm = this.ratios.map((_, g) => this.optimalUpshiftRpm(g + 1));
  }

  /**
   * Full-throttle shift point for `gear`: the lowest rpm from which the next
   * gear puts at least as much torque at the wheels as this one, clamped to
   * 80-98 % of the redline. Top gear returns the upper clamp.
   */
  private optimalUpshiftRpm(gear: number): number {
    const lo = this.redline * 0.8;
    const hi = this.redline * 0.98;
    if (gear >= this.ratios.length) return hi;
    const gCur = this.ratios[gear - 1];
    const gNext = this.ratios[gear];
    for (let rpm = lo; rpm < hi; rpm += 25) {
      const here = interpCurve(this.torquePoints, rpm) * gCur;
      const there = interpCurve(this.torquePoints, (rpm * gNext) / gCur) * gNext;
      if (there >= here) return rpm;
    }
    return hi;
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
   * Automatic gearbox. Decisions use the rpm implied by the road speed
   * (`roadOmega`: wheel rad/s at the body's forward speed) so wheelspin cannot
   * fake a redline; a gear is only selected when the rpm it lands at sits
   * clear of the opposite threshold; a fresh upshift is held against throttle
   * kick-down; and two automatic shifts are never closer than
   * AUTO_SHIFT_LOCKOUT. Together these stop the box hunting between gears.
   * `speed` is forward speed (m/s, negative reversing).
   */
  autoShift(dt: number, throttle: number, brake: number, speed: number, roadOmega: number): void {
    if (this.autoLock > 0) this.autoLock -= dt;
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
      this.reverseHold += dt;
      if (this.reverseHold > 0.9) this.gear = -1;
      return;
    }
    this.reverseHold = 0;
    // sitting on the limiter for a while (wheelspin in a low gear) still goes up a gear
    this.overRev = this.rpm >= this.redline ? this.overRev + dt : 0;
    this.sinceUpshift += dt;
    // a rising throttle counts immediately, a lifted one fades over ~0.5 s, so a
    // re-applied pedal never short-shifts through the part-throttle zone
    const demandNow = smoothstep01((throttle - 0.1) / 0.8);
    this.demandSmoothed += (demandNow - this.demandSmoothed) * Math.min(1, dt / 0.5);
    const demand = Math.max(demandNow, this.demandSmoothed);
    if (this.autoLock > 0) return;
    const omega = Math.abs(roadOmega);
    const rpmRoad = omega * this.ratio * RAD_TO_RPM;
    // a closed throttle holds the gear (coasting into a corner never short-shifts), and a
    // gear a downshift just landed in is only left once the car has accelerated 10 % past
    // that point; both stop the box flickering while trail braking
    const coasting = throttle < 0.05;
    const upRpm = Math.max(
      coasting ? this.redline * COAST_UPSHIFT : this.upshiftPoint(this.gear, demand),
      this.downshiftRoadRpm * 1.1,
    );
    // never upshift into a braking phase: the lifted throttle still reads as demand for a
    // moment, and under ABS the engine drops while the road speed is still high
    const wantsUp = brake < 0.25 && (rpmRoad > upRpm || this.overRev > 0.6);
    if (this.gear < this.maxGear && speed > 1 && wantsUp) {
      this.autoShiftTo(this.gear + 1);
      this.sinceUpshift = 0;
      this.upshiftRoadRpm = rpmRoad;
      this.downshiftRoadRpm = 0;
      return;
    }
    if (this.gear > 1 && this.wantsDownshift(throttle, brake, demand, omega)) {
      const lowerRatio = this.ratios[this.gear - 2] * this.finalDrive;
      this.autoShiftTo(this.gear - 1);
      this.upshiftRoadRpm = Infinity;
      this.downshiftRoadRpm = omega * lowerRatio * RAD_TO_RPM;
    }
  }

  private wantsDownshift(throttle: number, brake: number, demand: number, omega: number): boolean {
    const lowerRatio = this.ratios[this.gear - 2] * this.finalDrive;
    const braking = brake > 0.25;
    const lugging = this.rpm < this.redline * 0.4;
    // a fresh upshift is held unless the driver brakes or the engine is lugging
    if (this.sinceUpshift < UPSHIFT_HOLD && !braking && !lugging) return false;
    const eager = braking || throttle > 0.85;
    let ceiling =
      this.upshiftPoint(this.gear - 1, eager ? 1 : demand) *
      (eager ? KICKDOWN_HYSTERESIS : DOWNSHIFT_HYSTERESIS);
    // the gear we shifted out of only comes back once the road speed has dropped 15 %
    ceiling = Math.min(ceiling, this.upshiftRoadRpm * 0.85);
    // both the road speed and the (possibly spinning) driven wheels must fit under the ceiling
    const rpmInLower = Math.max(
      omega * lowerRatio * RAD_TO_RPM,
      (this.rpm * lowerRatio) / this.ratio,
    );
    return rpmInLower < ceiling;
  }

  /** Upshift rpm for `gear` at a throttle demand of 0 (closed) .. 1 (flat out). */
  private upshiftPoint(gear: number, demand: number): number {
    const light = this.redline * LIGHT_THROTTLE_UPSHIFT;
    return light + (this.upshiftRpm[gear - 1] - light) * demand;
  }

  private autoShiftTo(gear: number): void {
    this.gear = gear;
    this.shiftTimer = SHIFT_TIME;
    this.autoLock = AUTO_SHIFT_LOCKOUT;
    this.overRev = 0;
  }

  static toRad(rpm: number): number {
    return rpm * RPM_TO_RAD;
  }
}

export function transmissionLabel(t: Transmission): string {
  return t === 'auto' ? 'AT' : 'MT';
}

const smoothstep01 = (x: number): number => {
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
};
