import type { DressingSpec } from '../types';

/**
 * Silverstone Circuit (Northamptonshire, England): pits on the left under
 * "The Wing"'s long curved roof, big grandstands through Copse and Stowe,
 * and countryside hedgerows around the lap.
 */
export const spec: DressingSpec = {
  id: 'silverstone',
  startRotationM: 3172,
  landmarks: [
    {
      kind: 'pitComplex',
      s: -10,
      side: 'left',
      distance: 46,
      length: 100,
      garages: 24,
      towerHeight: 26,
      roof: 'wing',
    },
    {
      kind: 'grandstand',
      s: -80,
      side: 'right',
      distance: 60,
      length: 55,
      rows: 11,
      roof: 'tiered',
    },
    {
      kind: 'grandstand',
      s: 260,
      side: 'right',
      distance: 56,
      length: 55,
      rows: 8,
      roof: 'pitched',
    },
    {
      kind: 'grandstand',
      s: 2208,
      side: 'right',
      distance: 56,
      length: 55,
      rows: 8,
      roof: 'pitched',
    },
    { kind: 'cameraTower', s: 836, side: 'left', distance: 26, height: 16 },
    { kind: 'cameraTower', s: 2792, side: 'left', distance: 26, height: 16 },
    { kind: 'cameraTower', s: 4956, side: 'right', distance: 26, height: 16 },
    { kind: 'apexBoard', s: -5, side: 'right', distance: 16 },
    { kind: 'apexBoard', s: 3412, side: 'left', distance: 16 },
    { kind: 'helipad', s: -230, side: 'left', distance: 106 },
    { kind: 'carPark', s: 210, side: 'left', distance: 81, rows: 6, cols: 12 },
    { kind: 'bridge', s: 1024, side: 'center', distance: 6, clearance: 6.5 },
    { kind: 'bridge', s: 3624, side: 'center', distance: 6, clearance: 6.5 },
    { kind: 'bridge', s: 5212, side: 'center', distance: 6, clearance: 6.5 },
    { kind: 'marshalPost', s: 1172, side: 'left', distance: 16 },
    { kind: 'marshalPost', s: 2424, side: 'right', distance: 16 },
    { kind: 'marshalPost', s: 4040, side: 'left', distance: 16 },
    { kind: 'marshalPost', s: 5548, side: 'right', distance: 16 },
  ],
  regions: [
    {
      kind: 'adBoardRun',
      sStart: -160,
      sEnd: 160,
      side: 'left',
      distance: 12,
      spacing: 12,
      colors: [],
    },
    { kind: 'flagRow', sStart: -150, sEnd: 60, side: 'right', distance: 15, spacing: 25 },
    { kind: 'gravelTrap', sStart: 220, sEnd: 340, side: 'right', distance: 12, width: 20 },
    { kind: 'gravelTrap', sStart: 2170, sEnd: 2300, side: 'right', distance: 12, width: 20 },
  ],
};
