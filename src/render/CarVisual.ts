import {
  BoxGeometry,
  Color,
  CylinderGeometry,
  Group,
  Mesh,
  MeshPhysicalMaterial,
  MeshStandardMaterial,
  Object3D,
  Quaternion,
  SpotLight,
  Vector3,
  type Material,
  type MeshPhysicalMaterialParameters,
  type MeshStandardMaterialParameters,
} from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import type { Vehicle } from '../physics/Vehicle';
import type { CarSpec } from '../core/types';

const loader = new GLTFLoader();
const modelCache = new Map<string, Promise<Group>>();

/** Loads (and caches) a car model; falls back to a procedural stand-in when the file is missing. */
export function loadCarModel(spec: CarSpec): Promise<Group> {
  let p = modelCache.get(spec.model);
  if (!p) {
    p = loader
      .loadAsync(`${import.meta.env.BASE_URL}models/cars/${spec.model}`)
      .then((gltf) => gltf.scene)
      .catch(() => buildFallbackCar(spec));
    modelCache.set(spec.model, p);
  }
  return p;
}

const WHEEL_NAMES = ['Wheel_FL', 'Wheel_FR', 'Wheel_RL', 'Wheel_RR'];

/** Material presets keyed by the names exported from the Blender car generator. */
const MATERIALS: Record<string, MeshStandardMaterialParameters & MeshPhysicalMaterialParameters> = {
  Glass: {
    name: 'Glass',
    color: 0x0a0c10,
    metalness: 0.2,
    roughness: 0.03,
    transparent: true,
    opacity: 0.55,
    envMapIntensity: 1.6,
  },
  Chrome: { name: 'Chrome', color: 0xdddddd, metalness: 1, roughness: 0.12, envMapIntensity: 1.5 },
  Rim: { name: 'Rim', color: 0x9a9a9e, metalness: 0.95, roughness: 0.3, envMapIntensity: 1.3 },
  Rubber: { name: 'Rubber', color: 0x0b0b0b, roughness: 0.92, metalness: 0 },
  Trim: { name: 'Trim', color: 0x111111, roughness: 0.55, metalness: 0.1 },
  Headlight: {
    name: 'Headlight',
    color: 0xdfe8ff,
    emissive: 0xdfe8ff,
    emissiveIntensity: 0.6,
    roughness: 0.15,
    metalness: 0.2,
  },
  Taillight: {
    name: 'Taillight',
    color: 0x8a0000,
    emissive: 0xff2010,
    emissiveIntensity: 0.35,
    roughness: 0.2,
  },
  Brakelight: {
    name: 'Brakelight',
    color: 0x600000,
    emissive: 0xff1a08,
    emissiveIntensity: 0,
    roughness: 0.2,
  },
  Brake: { name: 'Brake', color: 0x552222, metalness: 0.6, roughness: 0.5 },
  Interior: { name: 'Interior', color: 0x141414, roughness: 0.9 },
};

/**
 * Visual representation of one car: cloned model, per-instance materials,
 * spinning/steering wheels, brake and head lights.
 */
export class CarVisual {
  readonly root = new Group();
  private readonly wheels: (Object3D | null)[] = [null, null, null, null];
  private readonly wheelSpin = [0, 0, 0, 0];
  private steeringWheel: Object3D | null = null;
  private paint: MeshPhysicalMaterial | null = null;
  private brakeLight: MeshStandardMaterial | null = null;
  private headLight: MeshStandardMaterial | null = null;
  private tailLight: MeshStandardMaterial | null = null;
  private headlamps: SpotLight[] = [];
  private readonly tmp = new Vector3();

  constructor(
    model: Group,
    color: string,
    readonly isPlayer: boolean,
  ) {
    const clone = model.clone(true);
    clone.traverse((o) => {
      if (o instanceof Mesh) {
        o.castShadow = true;
        o.receiveShadow = false;
        o.material = this.materialFor(o.material as Material, color);
      }
      const idx = WHEEL_NAMES.indexOf(o.name);
      if (idx >= 0) {
        this.wheels[idx] = o;
        o.rotation.order = 'YXZ';
      }
      if (o.name === 'SteeringWheel') this.steeringWheel = o;
    });
    this.root.add(clone);
  }

  private materialFor(src: Material, color: string): Material {
    const name = src.name || '';
    if (name === 'Paint') {
      if (!this.paint) {
        this.paint = new MeshPhysicalMaterial({
          color: new Color(color),
          metalness: 0.4,
          roughness: 0.32,
          clearcoat: 1,
          clearcoatRoughness: 0.05,
          envMapIntensity: 1.3,
        });
        this.paint.name = 'Paint';
      }
      return this.paint;
    }
    if (name === 'Headlight') {
      this.headLight = new MeshStandardMaterial({ ...MATERIALS.Headlight });
      return this.headLight;
    }
    if (name === 'Taillight') {
      this.tailLight = new MeshStandardMaterial({ ...MATERIALS.Taillight });
      return this.tailLight;
    }
    if (name === 'Brakelight') {
      this.brakeLight = new MeshStandardMaterial({ ...MATERIALS.Brakelight });
      return this.brakeLight;
    }
    if (name === 'Glass') return new MeshPhysicalMaterial({ ...MATERIALS.Glass });
    const preset = MATERIALS[name];
    return preset ? new MeshStandardMaterial({ ...preset }) : src;
  }

  setColor(color: string): void {
    this.paint?.color.set(color);
  }

  /** Adds real spotlights (player only, night races). */
  enableHeadlamps(spec: CarSpec): void {
    if (this.headlamps.length) return;
    for (const side of [-1, 1]) {
      const light = new SpotLight(0xe8f0ff, 400, 140, 0.55, 0.5, 1.2);
      light.position.set(side * spec.widthM * 0.35, 0.7, -spec.lengthM * 0.45);
      light.target.position.set(side * spec.widthM * 0.2, 0.2, -spec.lengthM * 0.45 - 40);
      light.castShadow = false;
      this.root.add(light, light.target);
      this.headlamps.push(light);
    }
  }

  setNight(night: boolean): void {
    if (this.headLight) this.headLight.emissiveIntensity = night ? 6 : 0.6;
    if (this.tailLight) this.tailLight.emissiveIntensity = night ? 2.5 : 0.35;
  }

  update(v: Vehicle, dt: number): void {
    v.bodyOrigin(this.tmp);
    this.root.position.copy(this.tmp);
    this.root.quaternion.copy(v.quat);
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (!w) continue;
      this.wheelSpin[i] = (this.wheelSpin[i] + v.wheels[i].omega * dt) % (Math.PI * 2);
      w.rotation.x = this.wheelSpin[i];
      w.rotation.y = -v.wheels[i].steer;
      // suspension travel relative to the rest position
      const travel = v.wheels[i].restCompression - v.wheels[i].compression;
      w.position.y = v.wheels[i].radius + travel;
    }
    if (this.steeringWheel) this.steeringWheel.rotation.z = -v.controls.steer * Math.PI * 1.2;
    if (this.brakeLight) {
      const target = v.controls.brake > 0.05 ? 4.5 : 0;
      this.brakeLight.emissiveIntensity +=
        (target - this.brakeLight.emissiveIntensity) * Math.min(1, dt * 25);
    }
  }

  /** Drives the visual from recorded replay data instead of a live vehicle. */
  applyState(
    pos: Vector3,
    quat: Quaternion,
    spins: number[],
    steer: number,
    brake: number,
    cgHeight: number,
    radius: number,
  ): void {
    this.root.quaternion.copy(quat);
    this.tmp.set(0, -cgHeight, 0).applyQuaternion(quat);
    this.root.position.copy(pos).add(this.tmp);
    for (let i = 0; i < 4; i++) {
      const w = this.wheels[i];
      if (!w) continue;
      w.rotation.x = spins[i] % (Math.PI * 2);
      w.rotation.y = i < 2 ? -steer : 0;
      w.position.y = radius;
    }
    if (this.steeringWheel) this.steeringWheel.rotation.z = -steer * 3;
    if (this.brakeLight) this.brakeLight.emissiveIntensity = brake > 0.05 ? 4.5 : 0;
  }

  dispose(): void {
    this.root.traverse((o) => {
      if (o instanceof Mesh) {
        const m = o.material as Material;
        if (m !== this.paint) m.dispose();
      }
    });
    this.paint?.dispose();
  }
}

/** Simple placeholder car so the game still runs without GLB assets. */
export function buildFallbackCar(spec: CarSpec): Group {
  const g = new Group();
  g.name = 'Car';
  const L = spec.lengthM;
  const W = spec.widthM;
  const H = spec.heightM;
  const paint = new MeshStandardMaterial({ color: 0xffffff, name: 'Paint' });
  const glass = new MeshStandardMaterial({ color: 0x111111, name: 'Glass' });
  const body = new Mesh(new BoxGeometry(W * 0.92, H * 0.42, L * 0.96), paint);
  body.name = 'Body';
  body.position.y = spec.wheelRadiusM * 0.9 + H * 0.21;
  const cabin = new Mesh(new BoxGeometry(W * 0.8, H * 0.4, L * 0.45), glass);
  cabin.name = 'Glass';
  cabin.position.set(0, spec.wheelRadiusM * 0.9 + H * 0.42 + H * 0.2, L * 0.05);
  g.add(body, cabin);
  const tail = new Mesh(
    new BoxGeometry(W * 0.8, 0.08, 0.05),
    new MeshStandardMaterial({ color: 0x600000, name: 'Brakelight' }),
  );
  tail.name = 'Brakelights';
  tail.position.set(0, spec.wheelRadiusM * 0.9 + H * 0.3, L * 0.48);
  g.add(tail);
  const rubber = new MeshStandardMaterial({ color: 0x0b0b0b, name: 'Rubber' });
  const wheelGeo = new CylinderGeometry(spec.wheelRadiusM, spec.wheelRadiusM, 0.24, 24);
  wheelGeo.rotateZ(Math.PI / 2);
  const fx = spec.wheelbaseM * (1 - spec.frontWeightBias);
  const rx = spec.wheelbaseM * spec.frontWeightBias;
  const positions: [string, number, number][] = [
    ['Wheel_FL', -spec.trackM / 2, -fx],
    ['Wheel_FR', spec.trackM / 2, -fx],
    ['Wheel_RL', -spec.trackM / 2, rx],
    ['Wheel_RR', spec.trackM / 2, rx],
  ];
  for (const [name, x, z] of positions) {
    const w = new Mesh(wheelGeo, rubber);
    w.name = name;
    w.position.set(x, spec.wheelRadiusM, z);
    g.add(w);
  }
  return g;
}
