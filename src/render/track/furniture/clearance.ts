import { InstancedMesh, Matrix4, Mesh, Vector3, type Object3D } from 'three';
import type { Track } from '../../../track/Track';

/**
 * True when any mesh vertex (or instanced sample) of `root` sits on the asphalt within
 * car height. Used to drop furniture/dressing that would cover the road on tight circuits.
 */
export function groupIntrudesDriveVolume(track: Track, root: Object3D): boolean {
  root.updateMatrixWorld(true);
  const probe = new Vector3();
  const m = new Matrix4();
  let hit = false;

  root.traverse((obj) => {
    if (hit || !(obj instanceof Mesh)) return;

    if (obj instanceof InstancedMesh) {
      const step = Math.max(1, Math.floor(obj.count / 64));
      for (let i = 0; i < obj.count; i += step) {
        obj.getMatrixAt(i, m);
        probe.set(0, 0.5, 0).applyMatrix4(m).applyMatrix4(obj.matrixWorld);
        if (pointInDriveVolume(track, probe)) {
          hit = true;
          return;
        }
      }
      return;
    }

    const pos = obj.geometry.getAttribute('position');
    if (!pos) return;
    const step = Math.max(1, Math.floor(pos.count / 48));
    for (let i = 0; i < pos.count; i += step) {
      probe.fromBufferAttribute(pos, i).applyMatrix4(obj.matrixWorld);
      if (pointInDriveVolume(track, probe)) {
        hit = true;
        return;
      }
    }
  });

  return hit;
}

function pointInDriveVolume(track: Track, p: Vector3): boolean {
  const q = track.query(p, null);
  if (Math.abs(q.lateral) > q.halfWidth) return false;
  const dy = p.y - q.height;
  return dy >= -0.3 && dy <= 4.5;
}
