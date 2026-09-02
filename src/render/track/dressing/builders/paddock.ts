import { BoxGeometry, Color, Group, InstancedMesh, MeshStandardMaterial, Object3D } from 'three';
import { makeRng } from '../../../../core/math';
import type { Disposables } from '../../types';
import type { DressingContext, PaddockSpec } from '../types';
import { terrainHeightAt } from '../../terrain';
import { landmarkFrame, lateralOffset, newGroup } from './shared';

const BLOCK_COLORS = [0xd8d6cf, 0xc9c4b8, 0xdcdcdc];

interface Built {
  group: Group;
  disposables: Disposables;
}

/** A cluster of plain box paddock/support buildings scattered behind the pits. */
export function buildPaddock(ctx: DressingContext, spec: PaddockSpec): Built {
  const group = newGroup('dressing-paddock');
  const pf = landmarkFrame(ctx.track, spec.s, spec.side, spec.distance);
  const sign = spec.side === 'left' ? -1 : 1;
  const rng = makeRng(0x9a11 ^ Math.floor(spec.s));

  const geo = new BoxGeometry(1, 1, 1);
  const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.85 });
  const blocks = new InstancedMesh(geo, mat, spec.blocks);
  blocks.castShadow = true;
  blocks.receiveShadow = true;

  const dummy = new Object3D();
  for (let i = 0; i < spec.blocks; i++) {
    const along = (rng() - 0.5) * spec.spread;
    const across = sign * spec.spread * 0.35 * rng();
    const w = 8 + rng() * 10;
    const d = 8 + rng() * 10;
    const h = 4 + rng() * 5;
    const base = lateralOffset(pf, sign, across).addScaledVector(pf.forward, along);
    const y = terrainHeightAt(ctx.track, base.x, base.z, pf.index).y;
    dummy.position.set(base.x, y + h / 2, base.z);
    dummy.rotation.set(0, rng() * Math.PI * 2, 0);
    dummy.scale.set(w, h, d);
    dummy.updateMatrix();
    blocks.setMatrixAt(i, dummy.matrix);
    blocks.setColorAt(i, new Color(BLOCK_COLORS[i % BLOCK_COLORS.length]));
  }
  blocks.instanceMatrix.needsUpdate = true;
  if (blocks.instanceColor) blocks.instanceColor.needsUpdate = true;
  group.add(blocks);

  return { group, disposables: { geometries: [geo], materials: [mat], textures: [] } };
}
