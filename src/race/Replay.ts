import { Quaternion, Vector3 } from 'three';
import type { Vehicle } from '../physics/Vehicle';

const RATE = 30; // samples per second
const FLOATS_PER_CAR = 3 + 4 + 4 + 1 + 1 + 1; // pos, quat, wheel spins, steer, brake, rpm

/** Records every car's transform at a fixed rate so a race can be replayed. */
export class ReplayRecorder {
  private frames: Float32Array[] = [];
  private accumulator = 0;
  private readonly spins: Float32Array;

  constructor(readonly carCount: number) {
    this.spins = new Float32Array(carCount * 4);
  }

  update(vehicles: Vehicle[], dt: number): void {
    for (let c = 0; c < vehicles.length; c++) {
      for (let w = 0; w < 4; w++) this.spins[c * 4 + w] += vehicles[c].wheels[w].omega * dt;
    }
    this.accumulator += dt;
    const step = 1 / RATE;
    if (this.accumulator < step) return;
    this.accumulator -= step;
    if (this.frames.length > RATE * 60 * 40) return; // cap at 40 minutes
    const f = new Float32Array(this.carCount * FLOATS_PER_CAR);
    for (let c = 0; c < vehicles.length; c++) {
      const v = vehicles[c];
      const o = c * FLOATS_PER_CAR;
      f[o] = v.pos.x;
      f[o + 1] = v.pos.y;
      f[o + 2] = v.pos.z;
      f[o + 3] = v.quat.x;
      f[o + 4] = v.quat.y;
      f[o + 5] = v.quat.z;
      f[o + 6] = v.quat.w;
      for (let w = 0; w < 4; w++) f[o + 7 + w] = this.spins[c * 4 + w];
      f[o + 11] = v.steerAngle;
      f[o + 12] = v.controls.brake;
      f[o + 13] = v.rpm;
    }
    this.frames.push(f);
  }

  finish(): Replay {
    return new Replay(this.frames, this.carCount);
  }
}

export interface ReplayCarState {
  pos: Vector3;
  quat: Quaternion;
  spins: number[];
  steer: number;
  brake: number;
  rpm: number;
}

/** Interpolated playback of recorded frames. */
export class Replay {
  time = 0;
  speed = 1;
  playing = true;
  readonly states: ReplayCarState[] = [];
  private readonly qa = new Quaternion();
  private readonly qb = new Quaternion();

  constructor(
    private readonly frames: Float32Array[],
    readonly carCount: number,
  ) {
    for (let c = 0; c < carCount; c++) {
      this.states.push({
        pos: new Vector3(),
        quat: new Quaternion(),
        spins: [0, 0, 0, 0],
        steer: 0,
        brake: 0,
        rpm: 0,
      });
    }
  }

  get duration(): number {
    return this.frames.length / RATE;
  }

  seek(t: number): void {
    this.time = Math.max(0, Math.min(this.duration, t));
    this.sample();
  }

  update(dt: number): void {
    if (this.playing) this.time += dt * this.speed;
    if (this.time >= this.duration) {
      this.time = this.duration;
      this.playing = false;
    }
    if (this.time < 0) this.time = 0;
    this.sample();
  }

  private sample(): void {
    if (!this.frames.length) return;
    const ft = this.time * RATE;
    const i = Math.min(this.frames.length - 1, Math.floor(ft));
    const j = Math.min(this.frames.length - 1, i + 1);
    const t = ft - i;
    const a = this.frames[i];
    const b = this.frames[j];
    for (let c = 0; c < this.carCount; c++) {
      const o = c * FLOATS_PER_CAR;
      const s = this.states[c];
      s.pos.set(lerp(a[o], b[o], t), lerp(a[o + 1], b[o + 1], t), lerp(a[o + 2], b[o + 2], t));
      this.qa.set(a[o + 3], a[o + 4], a[o + 5], a[o + 6]);
      this.qb.set(b[o + 3], b[o + 4], b[o + 5], b[o + 6]);
      s.quat.copy(this.qa).slerp(this.qb, t);
      for (let w = 0; w < 4; w++) s.spins[w] = lerp(a[o + 7 + w], b[o + 7 + w], t);
      s.steer = lerp(a[o + 11], b[o + 11], t);
      s.brake = lerp(a[o + 12], b[o + 12], t);
      s.rpm = lerp(a[o + 13], b[o + 13], t);
    }
  }
}

const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
