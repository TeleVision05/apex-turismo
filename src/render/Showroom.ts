import {
  CircleGeometry,
  Group,
  Mesh,
  MeshStandardMaterial,
  PointLight,
  RingGeometry,
  SpotLight,
} from 'three';
import type { CarSpec } from '../core/types';
import { CarVisual, loadCarModel } from './CarVisual';
import type { SceneRenderer } from './SceneRenderer';

/** A studio turntable that shows the highlighted car behind the menus. */
export class Showroom {
  readonly group = new Group();
  private car: CarVisual | null = null;
  private currentId: string | null = null;
  private angle = 0;
  private floor: Mesh;
  private loadToken = 0;

  constructor(private readonly renderer: SceneRenderer) {
    this.floor = new Mesh(
      new CircleGeometry(14, 64),
      new MeshStandardMaterial({ color: 0x15171c, roughness: 0.25, metalness: 0.4 }),
    );
    this.floor.rotation.x = -Math.PI / 2;
    this.floor.receiveShadow = true;
    const ring = new Mesh(
      new RingGeometry(6, 6.15, 96),
      new MeshStandardMaterial({ color: 0xe8b923, emissive: 0xe8b923, emissiveIntensity: 1.2 }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.01;
    const key = new SpotLight(0xffffff, 900, 60, 0.6, 0.5, 1.6);
    key.position.set(8, 12, 8);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    const fill = new PointLight(0x9fc4ff, 120, 60);
    fill.position.set(-9, 5, -6);
    const rim = new PointLight(0xffe0b0, 90, 60);
    rim.position.set(0, 4, -10);
    this.group.add(this.floor, ring, key, fill, rim);
    this.group.visible = false;
  }

  async show(spec: CarSpec | null, color?: string): Promise<void> {
    if (!spec) {
      this.group.visible = false;
      this.currentId = null;
      return;
    }
    this.group.visible = true;
    if (this.currentId === spec.id) {
      if (color) this.car?.setColor(color);
      return;
    }
    const token = ++this.loadToken;
    this.currentId = spec.id;
    const model = await loadCarModel(spec);
    if (token !== this.loadToken) return;
    this.clearCar();
    this.car = new CarVisual(model, color ?? spec.defaultColor, true);
    this.car.root.position.set(0, 0, 0);
    this.group.add(this.car.root);
  }

  private clearCar(): void {
    if (this.car) {
      this.group.remove(this.car.root);
      this.car.dispose();
      this.car = null;
    }
  }

  update(dt: number): void {
    if (!this.group.visible) return;
    this.angle += dt * 0.25;
    if (this.car) this.car.root.rotation.y = this.angle;
    const cam = this.renderer.camera;
    const r = 8.5;
    cam.position.set(Math.sin(0.6) * r + 2.5, 2.1, Math.cos(0.6) * r);
    cam.lookAt(2.2, 0.7, 0);
  }

  dispose(): void {
    this.clearCar();
  }
}
