import { BoxGeometry, Group, Mesh, MeshStandardMaterial } from 'three';
import type { Disposables } from '../../types';
import type { BridgeSpec, DressingContext } from '../types';
import { newGroup, overRoadFrame, placeFacing } from './shared';

/** A Dunlop-bridge-style footbridge: two legs outside the barriers and a lattice walkway spanning the road. */
export function buildBridge(
  ctx: DressingContext,
  spec: BridgeSpec,
): { group: Group; disposables: Disposables } {
  const group = newGroup('dressing-bridge');
  const { track } = ctx;
  const pf = overRoadFrame(track, spec.s);
  const half = track.barrierDistance(pf.index) + 2;
  const legGeo = new BoxGeometry(0.5, spec.clearance, 0.5);
  const legMat = new MeshStandardMaterial({ color: 0x2f3236, roughness: 0.6, metalness: 0.4 });
  for (const sign of [-1, 1]) {
    const leg = new Mesh(legGeo, legMat);
    leg.castShadow = true;
    const legPos = pf.position.clone().addScaledVector(pf.right, sign * half);
    placeFacing(leg, legPos, pf.forward, spec.clearance / 2, spec.rotationDeg);
    group.add(leg);
  }

  const deckGeo = new BoxGeometry(half * 2 + 1, 0.4, 2.4);
  const deckMat = new MeshStandardMaterial({ color: 0xd8641f, roughness: 0.5, metalness: 0.2 });
  const deck = new Mesh(deckGeo, deckMat);
  deck.castShadow = true;
  placeFacing(deck, pf.position, pf.forward, spec.clearance, spec.rotationDeg);
  group.add(deck);

  const trussGeo = new BoxGeometry(half * 2 + 1, 1.6, 0.15);
  const trussMat = new MeshStandardMaterial({ color: 0x9aa0a6, roughness: 0.5, metalness: 0.5 });
  for (const dz of [-1.1, 1.1]) {
    const truss = new Mesh(trussGeo, trussMat);
    truss.castShadow = true;
    const trussPos = pf.position.clone();
    placeFacing(truss, trussPos, pf.forward, spec.clearance + 1, spec.rotationDeg);
    truss.translateZ(dz);
    group.add(truss);
  }

  return {
    group,
    disposables: {
      geometries: [legGeo, deckGeo, trussGeo],
      materials: [legMat, deckMat, trussMat],
      textures: [],
    },
  };
}
