import { BoxGeometry, InstancedMesh, MeshStandardMaterial, Object3D, Vector3 } from 'three';
import type { Track } from '../../../track/Track';
import type { Disposables } from '../types';

const SPACING_M = 4;
const POST_HEIGHT = 0.95;
const POST_SIZE = 0.1;

/** Thin posts every 4m along both barriers, holding the Armco band up. */
export function buildBarrierPosts(track: Track): { mesh: InstancedMesh; disposables: Disposables } {
  const count = Math.max(1, Math.floor(track.length / SPACING_M)) * 2;
  const geometry = new BoxGeometry(POST_SIZE, POST_HEIGHT, POST_SIZE);
  const material = new MeshStandardMaterial({ color: 0x6b6b6f, roughness: 0.7, metalness: 0.2 });
  const mesh = new InstancedMesh(geometry, material, count);
  mesh.name = 'barrier-posts';
  mesh.castShadow = true;
  mesh.receiveShadow = true;

  const dummy = new Object3D();
  const up = new Vector3(0, 1, 0);
  let instance = 0;
  const steps = Math.floor(track.length / SPACING_M);
  for (let s = 0; s < steps; s++) {
    const idx = track.indexAt(s * SPACING_M);
    for (const sign of [-1, 1] as const) {
      const p = track.points[idx];
      const r = track.rights[idx];
      const lateral = sign * track.barrierDistance(idx);
      dummy.position.set(p.x + r.x * lateral, p.y + POST_HEIGHT / 2, p.z + r.z * lateral);
      dummy.up.copy(up);
      dummy.lookAt(dummy.position.clone().add(r));
      dummy.updateMatrix();
      mesh.setMatrixAt(instance++, dummy.matrix);
    }
  }
  mesh.count = instance;
  mesh.instanceMatrix.needsUpdate = true;
  return { mesh, disposables: { geometries: [geometry], materials: [material], textures: [] } };
}
