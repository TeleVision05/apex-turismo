import type { DressingSpec } from '../types';

/**
 * Brands Hatch GP circuit (Kent, England): pits on the left, the natural
 * amphitheatre grandstand above Paddock Hill Bend and Druids, and mature
 * woodland closing in around the far loop (Hawthorn to Stirlings).
 */
export const spec: DressingSpec = {
  id: 'brands_hatch',
  landmarks: [
    {
      kind: 'pitComplex',
      s: -10,
      side: 'left',
      distance: 46,
      length: 100,
      garages: 14,
      towerHeight: 18,
      roof: 'flat',
    },
    {
      kind: 'grandstand',
      s: 472,
      side: 'right',
      distance: 56,
      length: 55,
      rows: 10,
      roof: 'tiered',
    },
    {
      kind: 'grandstand',
      s: 812,
      side: 'left',
      distance: 56,
      length: 55,
      rows: 8,
      roof: 'pitched',
    },
    { kind: 'cameraTower', s: 472, side: 'left', distance: 24, height: 16 },
    { kind: 'cameraTower', s: 2668, side: 'right', distance: 24, height: 14 },
    { kind: 'apexBoard', s: -5, side: 'left', distance: 15 },
    { kind: 'helipad', s: -150, side: 'left', distance: 76 },
    { kind: 'carPark', s: 100, side: 'left', distance: 61, rows: 4, cols: 8 },
    { kind: 'bridge', s: 1200, side: 'center', distance: 6, clearance: 6 },
    { kind: 'bridge', s: 2900, side: 'center', distance: 6, clearance: 6 },
    { kind: 'marshalPost', s: 1036, side: 'right', distance: 15 },
    { kind: 'marshalPost', s: 1696, side: 'left', distance: 15 },
    { kind: 'marshalPost', s: 2948, side: 'right', distance: 15 },
    { kind: 'marshalPost', s: 3532, side: 'left', distance: 15 },
  ],
  regions: [
    {
      kind: 'adBoardRun',
      sStart: -110,
      sEnd: 110,
      side: 'right',
      distance: 12,
      spacing: 12,
      colors: [],
    },
    { kind: 'flagRow', sStart: -90, sEnd: 40, side: 'right', distance: 14, spacing: 22 },
    { kind: 'gravelTrap', sStart: 440, sEnd: 560, side: 'left', distance: 11, width: 16 },
    { kind: 'forestBelt', sStart: 1750, sEnd: 3150, side: 'both', distance: 18, density: 0.85 },
  ],
};
