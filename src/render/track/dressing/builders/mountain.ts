import { ConeGeometry, Group, InstancedMesh, Mesh, MeshStandardMaterial, Object3D } from 'three';
import { makeRng } from '../../../../core/math';
import type { Disposables } from '../../types';
import type { DressingContext, MountainConeSpec, RidgeLineSpec, RollingHillsSpec } from '../types';
import { PALETTE } from './palette';
import { landmarkFrame, newGroup, orientAt } from './shared';

interface Built {
  group: Group;
  disposables: Disposables;
}

/** A large low-poly cone mountain with a snow cap, e.g. Mt Fuji seen beyond Fuji Speedway. */
export function buildMountainCone(ctx: DressingContext, spec: MountainConeSpec): Built {
  const group = newGroup('dressing-mountain-cone');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);

  const bodyGeo = new ConeGeometry(spec.radius, spec.height, 9, 4);
  const bodyMat = new MeshStandardMaterial({
    color: PALETTE.rockGrey,
    roughness: 1,
    flatShading: true,
  });
  const body = new Mesh(bodyGeo, bodyMat);
  orientAt(body, pf, spec.height / 2, spec.rotationDeg);
  group.add(body);

  const capHeight = spec.height * (spec.snowLine ?? 0.3);
  const capRadius = spec.radius * (capHeight / spec.height);
  const capGeo = new ConeGeometry(capRadius, capHeight, 9, 2);
  const capMat = new MeshStandardMaterial({
    color: PALETTE.snowWhite,
    roughness: 0.9,
    flatShading: true,
  });
  const cap = new Mesh(capGeo, capMat);
  orientAt(cap, pf, spec.height - capHeight / 2, spec.rotationDeg);
  group.add(cap);

  return {
    group,
    disposables: { geometries: [bodyGeo, capGeo], materials: [bodyMat, capMat], textures: [] },
  };
}

/**
 * A jagged alpine ridge line behind a corner, e.g. Red Bull Ring's Styrian hills.
 * Built from overlapping cone peaks (like buildRollingHills) rather than a single
 * flat wall, so it reads as a hillside from any viewing angle instead of collapsing
 * into a thin edge-on sliver when seen nearly along its own length.
 */
export function buildRidgeLine(ctx: DressingContext, spec: RidgeLineSpec): Built {
  const group = newGroup('dressing-ridge-line');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const rng = makeRng(0x1d6e ^ Math.floor(spec.s));

  const peakGeo = new ConeGeometry(spec.length / spec.peaks, spec.height, 6, 1);
  const rockMat = new MeshStandardMaterial({
    color: PALETTE.rockGrey,
    roughness: 1,
    flatShading: true,
  });
  const greenMat = new MeshStandardMaterial({
    color: PALETTE.hillGreenLush,
    roughness: 1,
    flatShading: true,
  });
  for (let i = 0; i < spec.peaks; i++) {
    const t = spec.peaks <= 1 ? 0.5 : i / (spec.peaks - 1);
    const along = (t - 0.5) * spec.length;
    const scale = 0.75 + rng() * 0.5;
    const mat = i % 2 === 0 ? rockMat : greenMat;
    const peak = new Mesh(peakGeo, mat);
    orientAt(peak, pf, (spec.height * scale) / 2, spec.rotationDeg);
    peak.position.addScaledVector(pf.forward, along);
    peak.position.addScaledVector(pf.right, (rng() - 0.5) * (spec.length / spec.peaks) * 0.6);
    peak.scale.set(1 + rng() * 0.4, scale, 1 + rng() * 0.4);
    peak.rotateY(rng() * Math.PI * 2);
    group.add(peak);
  }

  return {
    group,
    disposables: { geometries: [peakGeo], materials: [rockMat, greenMat], textures: [] },
  };
}

/** Dry rolling hills with sparse oak-like trees, e.g. Laguna Seca's back country. */
export function buildRollingHills(ctx: DressingContext, spec: RollingHillsSpec): Built {
  const group = newGroup('dressing-rolling-hills');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const rng = makeRng(0x0ac3 ^ Math.floor(spec.s));

  const hillGeo = new ConeGeometry(spec.length * 0.4, spec.height, 7, 1);
  hillGeo.scale(1, 0.4, 1);
  const hillMat = new MeshStandardMaterial({
    color: PALETTE.hillGreenDry,
    roughness: 1,
    flatShading: true,
  });
  const humps = 4;
  for (let i = 0; i < humps; i++) {
    const hump = new Mesh(hillGeo, hillMat);
    const along = (i / (humps - 1) - 0.5) * spec.length;
    orientAt(hump, pf, spec.height * 0.15, spec.rotationDeg);
    hump.position.addScaledVector(pf.forward, along);
    hump.scale.setScalar(0.7 + rng() * 0.6);
    group.add(hump);
  }

  const oaks = buildOaks(pf, spec, rng);
  group.add(oaks.group);

  return {
    group,
    disposables: {
      geometries: [hillGeo, oaks.trunkGeo, oaks.canopyGeo],
      materials: [hillMat, oaks.trunkMat, oaks.canopyMat],
      textures: [],
    },
  };
}

function buildOaks(
  pf: ReturnType<typeof landmarkFrame>,
  spec: RollingHillsSpec,
  rng: () => number,
): {
  group: Group;
  trunkGeo: ConeGeometry;
  canopyGeo: ConeGeometry;
  trunkMat: MeshStandardMaterial;
  canopyMat: MeshStandardMaterial;
} {
  const group = newGroup('oaks');
  const trunkGeo = new ConeGeometry(0.25, 2, 5);
  const canopyGeo = new ConeGeometry(2.2, 1.6, 8);
  const trunkMat = new MeshStandardMaterial({ color: 0x5b4632, roughness: 1 });
  const canopyMat = new MeshStandardMaterial({
    color: 0x7a8f4a,
    roughness: 0.95,
    flatShading: true,
  });
  const trunks = new InstancedMesh(trunkGeo, trunkMat, spec.oaks);
  const canopies = new InstancedMesh(canopyGeo, canopyMat, spec.oaks);
  const dummy = new Object3D();
  for (let i = 0; i < spec.oaks; i++) {
    const along = (rng() - 0.5) * spec.length;
    const across = (rng() - 0.5) * spec.length * 0.6;
    dummy.position
      .copy(pf.position)
      .addScaledVector(pf.forward, along)
      .addScaledVector(pf.right, across);
    const scale = 0.8 + rng() * 0.7;
    dummy.position.y += 1 * scale;
    dummy.scale.setScalar(scale);
    dummy.updateMatrix();
    trunks.setMatrixAt(i, dummy.matrix);
    dummy.position.y += 1.6 * scale;
    dummy.updateMatrix();
    canopies.setMatrixAt(i, dummy.matrix);
  }
  trunks.instanceMatrix.needsUpdate = true;
  canopies.instanceMatrix.needsUpdate = true;
  group.add(trunks, canopies);
  return { group, trunkGeo, canopyGeo, trunkMat, canopyMat };
}
