import { Vector3 } from 'three';
import type { Vehicle } from './Vehicle';

/** 2D oriented box on the ground plane. */
interface Box2 {
  cx: number;
  cz: number;
  fx: number; // forward unit (x,z)
  fz: number;
  rx: number; // right unit
  rz: number;
  hl: number; // half length
  hw: number; // half width
}

export interface CollisionEvent {
  a: Vehicle;
  b: Vehicle;
  impulse: number;
}

const tmpV = new Vector3();
const tmpW = new Vector3();

function boxOf(v: Vehicle): Box2 {
  return {
    cx: v.pos.x,
    cz: v.pos.z,
    fx: v.forward.x,
    fz: v.forward.z,
    rx: v.right.x,
    rz: v.right.z,
    hl: v.spec.lengthM * 0.5 * 0.96,
    hw: v.spec.widthM * 0.5 * 0.96,
  };
}

function projectRadius(b: Box2, ax: number, az: number): number {
  return Math.abs(ax * b.fx + az * b.fz) * b.hl + Math.abs(ax * b.rx + az * b.rz) * b.hw;
}

/** Separating axis test; returns minimum translation vector (from a to b) or null. */
function overlap(a: Box2, b: Box2): { nx: number; nz: number; depth: number } | null {
  const axes = [
    [a.fx, a.fz],
    [a.rx, a.rz],
    [b.fx, b.fz],
    [b.rx, b.rz],
  ];
  const dx = b.cx - a.cx;
  const dz = b.cz - a.cz;
  let best: { nx: number; nz: number; depth: number } | null = null;
  for (const [ax, az] of axes) {
    const dist = dx * ax + dz * az;
    const depth = projectRadius(a, ax, az) + projectRadius(b, ax, az) - Math.abs(dist);
    if (depth <= 0) return null;
    if (!best || depth < best.depth) {
      const s = dist < 0 ? -1 : 1;
      best = { nx: ax * s, nz: az * s, depth };
    }
  }
  return best;
}

/**
 * Resolves car-to-car contacts as 2D rigid impacts with friction. Vertical
 * dynamics are untouched so the suspension keeps handling the ground.
 */
export function resolveVehicleCollisions(vehicles: Vehicle[], events: CollisionEvent[]): void {
  const n = vehicles.length;
  for (let i = 0; i < n; i++) {
    const va = vehicles[i];
    for (let j = i + 1; j < n; j++) {
      const vb = vehicles[j];
      const dx = vb.pos.x - va.pos.x;
      const dz = vb.pos.z - va.pos.z;
      const dy = Math.abs(vb.pos.y - va.pos.y);
      if (dx * dx + dz * dz > 49 || dy > 2.5) continue;
      const mtv = overlap(boxOf(va), boxOf(vb));
      if (!mtv) continue;
      const impulse = resolvePair(va, vb, mtv.nx, mtv.nz, mtv.depth);
      if (impulse > 300) events.push({ a: va, b: vb, impulse });
    }
  }
}

function resolvePair(a: Vehicle, b: Vehicle, nx: number, nz: number, depth: number): number {
  const invMa = 1 / a.mass;
  const invMb = 1 / b.mass;
  const total = invMa + invMb;
  // positional correction
  const push = depth * 0.85;
  a.pos.x -= (nx * push * invMa) / total;
  a.pos.z -= (nz * push * invMa) / total;
  b.pos.x += (nx * push * invMb) / total;
  b.pos.z += (nz * push * invMb) / total;
  // contact point: midpoint between the centres pushed toward the deeper box edge
  const cx = (a.pos.x + b.pos.x) * 0.5;
  const cz = (a.pos.z + b.pos.z) * 0.5;
  const cp = tmpV.set(cx, (a.pos.y + b.pos.y) * 0.5, cz);
  const vaP = a.pointVelocity(cp, new Vector3());
  const vbP = b.pointVelocity(cp, tmpW);
  const rvx = vbP.x - vaP.x;
  const rvz = vbP.z - vaP.z;
  const vn = rvx * nx + rvz * nz;
  if (vn > 0) return 0;
  const restitution = 0.18;
  const ra = { x: cx - a.pos.x, z: cz - a.pos.z };
  const rb = { x: cx - b.pos.x, z: cz - b.pos.z };
  const iA = 1 / a.inertiaLocal.y;
  const iB = 1 / b.inertiaLocal.y;
  const raN = ra.x * nz - ra.z * nx;
  const rbN = rb.x * nz - rb.z * nx;
  const k = total + raN * raN * iA + rbN * rbN * iB;
  const jn = (-(1 + restitution) * vn) / k;
  applyImpulse(a, -jn * nx, -jn * nz, ra, iA);
  applyImpulse(b, jn * nx, jn * nz, rb, iB);
  // friction along the tangent
  const tx = -nz;
  const tz = nx;
  const vt = rvx * tx + rvz * tz;
  const jt = Math.max(-jn * 0.5, Math.min(jn * 0.5, -vt / k));
  applyImpulse(a, -jt * tx, -jt * tz, ra, iA);
  applyImpulse(b, jt * tx, jt * tz, rb, iB);
  return Math.abs(jn);
}

function applyImpulse(
  v: Vehicle,
  jx: number,
  jz: number,
  r: { x: number; z: number },
  invI: number,
): void {
  v.vel.x += jx / v.mass;
  v.vel.z += jz / v.mass;
  // cars are deliberately stable in contact: only part of the impulse becomes yaw
  v.angVel.y += (r.z * jx - r.x * jz) * invI * 0.55;
}
