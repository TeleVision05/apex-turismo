import {
  AdditiveBlending,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  DoubleSide,
  Mesh,
  MeshBasicMaterial,
  NormalBlending,
  Points,
  ShaderMaterial,
  Vector3,
} from 'three';
import type { Vehicle } from '../physics/Vehicle';

const MAX_SKID_QUADS = 6000;

/** Persistent tyre marks laid down by sliding wheels (ring buffer of quads). */
export class SkidMarks {
  readonly mesh: Mesh;
  private readonly positions: Float32Array;
  private readonly alphas: Float32Array;
  private cursor = 0;
  private readonly last = new Map<string, { l: Vector3; r: Vector3 } | null>();
  private readonly tmpL = new Vector3();
  private readonly tmpR = new Vector3();

  constructor() {
    this.positions = new Float32Array(MAX_SKID_QUADS * 6 * 3);
    this.alphas = new Float32Array(MAX_SKID_QUADS * 6);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.positions, 3).setUsage(35048));
    geo.setAttribute('alpha', new BufferAttribute(this.alphas, 1).setUsage(35048));
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
      vertexShader: `attribute float alpha; varying float vA; void main(){ vA = alpha; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: `varying float vA; void main(){ gl_FragColor = vec4(0.02,0.02,0.02, vA*0.55); }`,
    });
    this.mesh = new Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 2;
  }

  update(vehicles: Vehicle[]): void {
    let dirty = false;
    for (let vi = 0; vi < vehicles.length; vi++) {
      const v = vehicles[vi];
      for (let i = 0; i < 4; i++) {
        const w = v.wheels[i];
        const key = `${vi}-${i}`;
        const onRoad = w.surface === 'asphalt' || w.surface === 'curb';
        if (!w.contact || w.skid < 0.25 || !onRoad || Math.abs(v.speed) < 2) {
          this.last.set(key, null);
          continue;
        }
        const half = 0.11;
        const l = this.tmpL.copy(w.contactPoint).addScaledVector(v.right, -half);
        const r = this.tmpR.copy(w.contactPoint).addScaledVector(v.right, half);
        l.y += 0.015;
        r.y += 0.015;
        const prev = this.last.get(key);
        if (prev) {
          this.pushQuad(prev.l, prev.r, l, r, Math.min(1, w.skid));
          prev.l.copy(l);
          prev.r.copy(r);
          dirty = true;
        } else this.last.set(key, { l: l.clone(), r: r.clone() });
      }
    }
    if (dirty) {
      (this.mesh.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
      (this.mesh.geometry.getAttribute('alpha') as BufferAttribute).needsUpdate = true;
    }
  }

  private pushQuad(a: Vector3, b: Vector3, c: Vector3, d: Vector3, alpha: number): void {
    const q = this.cursor % MAX_SKID_QUADS;
    this.cursor++;
    const base = q * 18;
    const verts = [a, b, c, b, d, c];
    for (let i = 0; i < 6; i++) {
      this.positions[base + i * 3] = verts[i].x;
      this.positions[base + i * 3 + 1] = verts[i].y;
      this.positions[base + i * 3 + 2] = verts[i].z;
      this.alphas[q * 6 + i] = alpha;
    }
  }

  clear(): void {
    this.positions.fill(0);
    this.alphas.fill(0);
    this.last.clear();
    this.cursor = 0;
    (this.mesh.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }
}

const MAX_PARTICLES = 600;

/** Tyre smoke and dust particles rendered as soft sprites. */
export class SmokeParticles {
  readonly points: Points;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly size: Float32Array;
  private readonly life: Float32Array;
  private readonly vel: Float32Array;
  private readonly maxLife: Float32Array;
  private next = 0;

  constructor() {
    this.pos = new Float32Array(MAX_PARTICLES * 3);
    this.col = new Float32Array(MAX_PARTICLES * 4);
    this.size = new Float32Array(MAX_PARTICLES);
    this.life = new Float32Array(MAX_PARTICLES);
    this.maxLife = new Float32Array(MAX_PARTICLES);
    this.vel = new Float32Array(MAX_PARTICLES * 3);
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(35048));
    geo.setAttribute('color4', new BufferAttribute(this.col, 4).setUsage(35048));
    geo.setAttribute('psize', new BufferAttribute(this.size, 1).setUsage(35048));
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      blending: NormalBlending,
      uniforms: { map: { value: makeSoftCircle() } },
      vertexShader: `attribute vec4 color4; attribute float psize; varying vec4 vC;
        void main(){ vC = color4; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = psize * (400.0 / -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec4 vC; void main(){ vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC.rgb, vC.a * t.a); }`,
    });
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 3;
  }

  emit(at: Vector3, vel: Vector3, color: Color, size: number, life: number, alpha: number): void {
    const i = this.next;
    this.next = (this.next + 1) % MAX_PARTICLES;
    this.pos[i * 3] = at.x;
    this.pos[i * 3 + 1] = at.y;
    this.pos[i * 3 + 2] = at.z;
    this.vel[i * 3] = vel.x + (Math.random() - 0.5) * 1.5;
    this.vel[i * 3 + 1] = vel.y + Math.random() * 1.2;
    this.vel[i * 3 + 2] = vel.z + (Math.random() - 0.5) * 1.5;
    this.col[i * 4] = color.r;
    this.col[i * 4 + 1] = color.g;
    this.col[i * 4 + 2] = color.b;
    this.col[i * 4 + 3] = alpha;
    this.size[i] = size;
    this.life[i] = life;
    this.maxLife[i] = life;
  }

  private readonly smoke = new Color(0.85, 0.85, 0.85);
  private readonly dust = new Color(0.55, 0.48, 0.35);
  private readonly tmpV = new Vector3();

  updateFromVehicles(vehicles: Vehicle[], dt: number): void {
    for (const v of vehicles) {
      for (const w of v.wheels) {
        if (!w.contact) continue;
        const speed = Math.abs(v.speed);
        const offRoad = w.surface === 'grass' || w.surface === 'gravel';
        const rate = offRoad
          ? Math.min(1, speed / 25) * 0.6
          : w.skid > 0.45 && speed > 4
            ? w.skid
            : 0;
        if (rate <= 0.05 || Math.random() > rate * dt * 40) continue;
        const backwards = this.tmpV.copy(v.vel).multiplyScalar(-0.15);
        backwards.y = 0.4;
        this.emit(
          w.contactPoint,
          backwards,
          offRoad ? this.dust : this.smoke,
          offRoad ? 1.6 : 2.2,
          offRoad ? 1.2 : 1.6,
          offRoad ? 0.35 : 0.42,
        );
      }
    }
    this.step(dt);
  }

  step(dt: number): void {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      const t = Math.max(0, this.life[i] / this.maxLife[i]);
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= 1 - dt * 1.5;
      this.vel[i * 3 + 2] *= 1 - dt * 1.5;
      this.size[i] += dt * 3.5;
      this.col[i * 4 + 3] = (this.life[i] <= 0 ? 0 : t * t) * 0.45;
    }
    const g = this.points.geometry;
    (g.getAttribute('position') as BufferAttribute).needsUpdate = true;
    (g.getAttribute('color4') as BufferAttribute).needsUpdate = true;
    (g.getAttribute('psize') as BufferAttribute).needsUpdate = true;
  }
}

function makeSoftCircle(): CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const ctx = c.getContext('2d')!;
  const grad = ctx.createRadialGradient(32, 32, 2, 32, 32, 32);
  grad.addColorStop(0, 'rgba(255,255,255,0.9)');
  grad.addColorStop(0.5, 'rgba(255,255,255,0.35)');
  grad.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 64, 64);
  return new CanvasTexture(c);
}

const RAIN_COUNT = 2500;

/** Falling rain streaks that follow the camera. */
export class RainParticles {
  readonly points: Points;
  private readonly pos: Float32Array;
  private readonly box = 28;
  private readonly height = 24;

  constructor() {
    this.pos = new Float32Array(RAIN_COUNT * 3);
    for (let i = 0; i < RAIN_COUNT; i++) {
      this.pos[i * 3] = (Math.random() - 0.5) * this.box * 2;
      this.pos[i * 3 + 1] = Math.random() * this.height;
      this.pos[i * 3 + 2] = (Math.random() - 0.5) * this.box * 2;
    }
    const geo = new BufferGeometry();
    geo.setAttribute('position', new BufferAttribute(this.pos, 3).setUsage(35048));
    const mat = new ShaderMaterial({
      transparent: true,
      depthWrite: false,
      uniforms: { map: { value: makeSoftCircle() } },
      vertexShader: `void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = 90.0 / -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; void main(){ vec2 uv = gl_PointCoord; uv.y = (uv.y - 0.5) * 0.25 + 0.5; float a = texture2D(map, uv).a; gl_FragColor = vec4(0.75, 0.8, 0.9, a * 0.5); }`,
    });
    this.points = new Points(geo, mat);
    this.points.frustumCulled = false;
    this.points.renderOrder = 4;
  }

  update(dt: number, cameraPos: Vector3, wind: Vector3): void {
    const fall = 14 * dt;
    for (let i = 0; i < RAIN_COUNT; i++) {
      let y = this.pos[i * 3 + 1] - fall;
      let x = this.pos[i * 3] + wind.x * dt;
      let z = this.pos[i * 3 + 2] + wind.z * dt;
      if (y < 0) y += this.height;
      if (x > this.box) x -= this.box * 2;
      if (x < -this.box) x += this.box * 2;
      if (z > this.box) z -= this.box * 2;
      if (z < -this.box) z += this.box * 2;
      this.pos[i * 3] = x;
      this.pos[i * 3 + 1] = y;
      this.pos[i * 3 + 2] = z;
    }
    this.points.position.set(cameraPos.x, cameraPos.y - 6, cameraPos.z);
    (this.points.geometry.getAttribute('position') as BufferAttribute).needsUpdate = true;
  }
}

/** Flat ground disc used by the showroom. */
export function makeShowroomFloor(): Mesh {
  const mat = new MeshBasicMaterial({
    color: 0x0c0d10,
    side: DoubleSide,
    blending: AdditiveBlending,
    transparent: true,
    opacity: 0.0,
  });
  return new Mesh(new BufferGeometry(), mat);
}
