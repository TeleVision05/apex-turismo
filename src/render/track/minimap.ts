import type { Track } from '../../track/Track';

const PADDING = 0.08;

export interface Minimap {
  outline: [number, number][];
  project(x: number, z: number): [number, number];
}

/** Normalised (0..1, y-down/z-down) minimap projection with 8% padding and preserved aspect ratio. */
export function buildMinimap(track: Track): Minimap {
  let minX = Infinity;
  let maxX = -Infinity;
  let minZ = Infinity;
  let maxZ = -Infinity;
  for (const p of track.points) {
    minX = Math.min(minX, p.x);
    maxX = Math.max(maxX, p.x);
    minZ = Math.min(minZ, p.z);
    maxZ = Math.max(maxZ, p.z);
  }
  const width = Math.max(1e-6, maxX - minX);
  const depth = Math.max(1e-6, maxZ - minZ);
  const usable = 1 - 2 * PADDING;
  const scale = usable / Math.max(width, depth);
  const usedW = width * scale;
  const usedH = depth * scale;
  const offX = PADDING + (usable - usedW) / 2;
  const offZ = PADDING + (usable - usedH) / 2;

  const project = (x: number, z: number): [number, number] => [
    offX + (x - minX) * scale,
    offZ + (z - minZ) * scale,
  ];
  const outline: [number, number][] = track.points.map((p) => project(p.x, p.z));
  return { outline, project };
}
