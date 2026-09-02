import { PerspectiveCamera, Vector3, Quaternion } from 'three';
import type { CameraMode } from '../core/types';
import type { Vehicle } from '../physics/Vehicle';
import { damp, clamp } from '../core/math';

const MODES: CameraMode[] = ['chase', 'chaseFar', 'hood', 'cockpit', 'bumper'];

/** Follows the player's car in several GT-style views with smoothing and speed effects. */
export class CameraRig {
  mode: CameraMode = 'chase';
  lookBack = false;
  private readonly pos = new Vector3();
  private readonly look = new Vector3();
  private readonly tmp = new Vector3();
  private readonly tmp2 = new Vector3();
  private readonly headingDir = new Vector3(0, 0, -1);
  private readonly smoothQuat = new Quaternion();
  private shake = 0;
  private fovBase = 70;
  private initialised = false;

  constructor(readonly camera: PerspectiveCamera) {}

  setBaseFov(fov: number): void {
    this.fovBase = fov;
  }

  cycle(): CameraMode {
    this.mode = MODES[(MODES.indexOf(this.mode) + 1) % MODES.length];
    this.initialised = false;
    return this.mode;
  }

  snap(): void {
    this.initialised = false;
  }

  update(v: Vehicle, dt: number): void {
    const speed = Math.abs(v.speed);
    const origin = v.bodyOrigin(this.tmp2);
    switch (this.mode) {
      case 'chase':
      case 'chaseFar':
        this.updateChase(v, origin, dt, this.mode === 'chaseFar');
        break;
      case 'hood':
        this.updateAttached(v, origin, 0, v.spec.heightM * 0.72, -v.spec.lengthM * 0.28, dt);
        break;
      case 'cockpit':
        this.updateAttached(v, origin, -0.36, v.spec.heightM * 0.78, -v.spec.lengthM * 0.02, dt);
        break;
      case 'bumper':
        this.updateAttached(v, origin, 0, 0.45, -v.spec.lengthM * 0.5 + 0.1, dt);
        break;
    }
    const kick = clamp((speed - 30) / 60, 0, 1) * 8;
    this.camera.fov = damp(this.camera.fov, this.fovBase + kick, 0.4, dt);
    this.camera.updateProjectionMatrix();
    this.initialised = true;
  }

  private updateChase(v: Vehicle, origin: Vector3, dt: number, far: boolean): void {
    const speed = Math.abs(v.speed);
    // blend between heading and velocity direction so drifts show the car's angle
    const velDir = this.tmp.copy(v.vel);
    velDir.y = 0;
    const useVel = speed > 6 && velDir.lengthSq() > 1;
    if (useVel) velDir.normalize();
    else velDir.copy(v.forward).setY(0).normalize();
    if (v.speed < -1) velDir.negate();
    const flip = this.lookBack ? -1 : 1;
    const target = this.headingDir
      .clone()
      .lerp(velDir, this.initialised ? 1 - Math.exp(-dt / 0.35) : 1)
      .normalize();
    this.headingDir.copy(target);
    const dist = (far ? 7.5 : 5.6) + speed * 0.02 + v.spec.lengthM * 0.35;
    const height = (far ? 2.4 : 1.7) + v.spec.heightM * 0.3;
    const desired = this.tmp.copy(origin).addScaledVector(this.headingDir, -dist * flip);
    desired.y = origin.y + height;
    if (!this.initialised) this.pos.copy(desired);
    else {
      this.pos.x = damp(this.pos.x, desired.x, 0.09, dt);
      this.pos.z = damp(this.pos.z, desired.z, 0.09, dt);
      this.pos.y = damp(this.pos.y, desired.y, 0.16, dt);
    }
    const lookTarget = this.tmp.copy(origin).addScaledVector(this.headingDir, 3.5 * flip);
    lookTarget.y += 0.9;
    if (!this.initialised) this.look.copy(lookTarget);
    else this.look.lerp(lookTarget, 1 - Math.exp(-dt / 0.05));
    this.applyShake(v, dt);
    this.camera.position.copy(this.pos);
    this.camera.lookAt(this.look);
  }

  private updateAttached(
    v: Vehicle,
    origin: Vector3,
    x: number,
    y: number,
    z: number,
    dt: number,
  ): void {
    const local = this.tmp.set(x, y, z);
    if (this.lookBack) local.z = -local.z + v.spec.lengthM * 0.2;
    const world = local.applyQuaternion(v.quat).add(origin);
    // slight lag on rotation for weight, none on position (no clipping through the car)
    const q = v.quat.clone();
    if (this.lookBack) q.multiply(new Quaternion().setFromAxisAngle(new Vector3(0, 1, 0), Math.PI));
    if (!this.initialised) this.smoothQuat.copy(q);
    else this.smoothQuat.slerp(q, 1 - Math.exp(-dt / 0.045));
    this.camera.position.copy(world);
    this.camera.quaternion.copy(this.smoothQuat);
    this.applyShake(v, dt);
    this.camera.position.addScaledVector(
      v.up,
      this.shake * 0.02 * Math.sin(performance.now() * 0.05),
    );
  }

  private applyShake(v: Vehicle, dt: number): void {
    const rough = v.offTrackWheels > 0 ? 1 : v.wheels.some((w) => w.surface === 'curb') ? 0.5 : 0;
    const target = rough * clamp(Math.abs(v.speed) / 30, 0, 1) + Math.min(1, v.wallContact * 0.2);
    this.shake = damp(this.shake, target, 0.1, dt);
    if (this.mode === 'chase' || this.mode === 'chaseFar') {
      const t = performance.now() * 0.02;
      this.pos.y += this.shake * 0.03 * Math.sin(t * 1.3);
      this.pos.x += this.shake * 0.02 * Math.sin(t * 1.7);
    }
  }
}
