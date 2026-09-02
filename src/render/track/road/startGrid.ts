import { BufferGeometry, DoubleSide, Mesh, MeshStandardMaterial, Vector3 } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import type { Track } from '../../../track/Track';
import { buildRibbon, edgePoint, type RibbonVertex } from '../geometryUtils';
import { proceduralTexture, tileTexture } from '../textures';
import type { Disposables } from '../types';

const LIFT = 0.012;

/** A 1m wide chequered band across the road at sample 0. */
export function buildStartFinishLine(track: Track): { mesh: Mesh; disposables: Disposables } {
  const p0 = track.points[0];
  const f = track.forwards[0];
  const half = track.widths[0] * 0.5 + 0.3;
  const back = p0
    .clone()
    .addScaledVector(f, -0.5)
    .setY(p0.y + LIFT);
  const front = p0
    .clone()
    .addScaledVector(f, 0.5)
    .setY(p0.y + LIFT);
  const r = track.rights[0];
  const lefts: RibbonVertex[] = [
    { pos: back.clone().addScaledVector(r, -half), v: 0 },
    { pos: front.clone().addScaledVector(r, -half), v: 1 },
  ];
  const rights: RibbonVertex[] = [
    { pos: back.clone().addScaledVector(r, half), v: 0 },
    { pos: front.clone().addScaledVector(r, half), v: 1 },
  ];
  const geometry = buildRibbon(lefts, rights, false, false);
  const squares = Math.max(4, Math.round((half * 2) / 0.5));
  const texture = proceduralTexture(64, (ctx) => {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, 64, 64);
    ctx.fillStyle = '#101010';
    ctx.fillRect(0, 0, 32, 32);
    ctx.fillRect(32, 32, 32, 32);
  });
  tileTexture(texture, squares, 2, true);
  const material = new MeshStandardMaterial({
    map: texture,
    roughness: 0.7,
    side: DoubleSide,
    polygonOffset: true,
    polygonOffsetFactor: -3,
    polygonOffsetUnits: -3,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'start-finish-line';
  return {
    mesh,
    disposables: { geometries: [geometry], materials: [material], textures: [texture] },
  };
}

interface GridSlot {
  center: Vector3;
  forward: Vector3;
  right: Vector3;
}

const SLOT_WIDTH = 2.4;
const SLOT_LENGTH = 5;
const SLOT_THICKNESS = 0.08;

function slotsForColumn(
  track: Track,
  lateral: number,
  startOffset: number,
  count: number,
  spacing: number,
): GridSlot[] {
  const slots: GridSlot[] = [];
  for (let k = 0; k < count; k++) {
    const s = -(startOffset + k * spacing);
    const idx = track.indexAt(s);
    const center = edgePoint(track, idx, lateral, LIFT);
    slots.push({ center, forward: track.forwards[idx], right: track.rights[idx] });
  }
  return slots;
}

/** 10 white grid-slot outlines behind the start line, staggered two columns wide. */
export function buildGridBoxes(track: Track): { mesh: Mesh; disposables: Disposables } {
  const columnA = slotsForColumn(track, 2.8, 9, 5, 9);
  const columnB = slotsForColumn(track, -2.8, 13.5, 5, 9);
  const strips: BufferGeometry[] = [];
  for (const slot of [...columnA, ...columnB]) strips.push(...outlineStrips(slot));
  const geometry = mergeGeometries(strips, false);
  for (const g of strips) g.dispose();
  const material = new MeshStandardMaterial({
    color: 0xffffff,
    roughness: 0.6,
    polygonOffset: true,
    polygonOffsetFactor: -2,
    polygonOffsetUnits: -2,
  });
  const mesh = new Mesh(geometry, material);
  mesh.name = 'grid-boxes';
  return { mesh, disposables: { geometries: [geometry], materials: [material], textures: [] } };
}

/** Four thin quad strips forming a rectangle outline around a grid slot. */
function outlineStrips(slot: GridSlot): BufferGeometry[] {
  const hw = SLOT_WIDTH / 2;
  const hl = SLOT_LENGTH / 2;
  const corner = (fw: number, rw: number): Vector3 =>
    slot.center.clone().addScaledVector(slot.forward, fw).addScaledVector(slot.right, rw);
  const edges: [Vector3, Vector3][] = [
    [corner(-hl, -hw), corner(hl, -hw)],
    [corner(-hl, hw), corner(hl, hw)],
    [corner(-hl, -hw), corner(-hl, hw)],
    [corner(hl, -hw), corner(hl, hw)],
  ];
  return edges.map(([a, b]) => strip(a, b));
}

function strip(a: Vector3, b: Vector3): BufferGeometry {
  const dir = b.clone().sub(a).normalize();
  const perp = new Vector3(-dir.z, 0, dir.x).multiplyScalar(SLOT_THICKNESS / 2);
  const lefts: RibbonVertex[] = [
    { pos: a.clone().sub(perp), v: 0 },
    { pos: b.clone().sub(perp), v: 1 },
  ];
  const rights: RibbonVertex[] = [
    { pos: a.clone().add(perp), v: 0 },
    { pos: b.clone().add(perp), v: 1 },
  ];
  return buildRibbon(lefts, rights, false, false);
}
