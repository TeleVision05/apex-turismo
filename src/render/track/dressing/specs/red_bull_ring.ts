import type { DressingSpec } from '../types';

/**
 * Red Bull Ring (Spielberg, Austria): pits on the left, a short punchy lap
 * in a Styrian valley ringed by alpine hills, with the bull statue on the
 * high ground overlooking the infield.
 */
export const spec: DressingSpec = {
  id: 'red_bull_ring',
  landmarks: [
    {
      kind: 'pitComplex',
      s: -10,
      side: 'left',
      distance: 46,
      length: 100,
      garages: 16,
      towerHeight: 20,
      roof: 'flat',
    },
    {
      kind: 'grandstand',
      s: -70,
      side: 'right',
      distance: 58,
      length: 55,
      rows: 9,
      roof: 'tiered',
    },
    {
      kind: 'grandstand',
      s: 3504,
      side: 'right',
      distance: 54,
      length: 55,
      rows: 7,
      roof: 'pitched',
    },
    { kind: 'bullStatue', s: 2050, side: 'left', distance: 176, hillHeight: 22 },
    {
      kind: 'ridgeLine',
      s: 1200,
      side: 'left',
      distance: 906,
      length: 300,
      height: 260,
      peaks: 6,
    },
    {
      kind: 'ridgeLine',
      s: 3800,
      side: 'right',
      distance: 906,
      length: 300,
      height: 220,
      peaks: 5,
    },
    { kind: 'cameraTower', s: 900, side: 'left', distance: 24, height: 16 },
    { kind: 'cameraTower', s: 3284, side: 'right', distance: 24, height: 16 },
    { kind: 'apexBoard', s: -5, side: 'right', distance: 15 },
    { kind: 'helipad', s: -160, side: 'left', distance: 81 },
    { kind: 'carPark', s: 130, side: 'left', distance: 61, rows: 4, cols: 9 },
    { kind: 'bridge', s: 2540, side: 'center', distance: 6, clearance: 6 },
    { kind: 'marshalPost', s: 2232, side: 'left', distance: 15 },
    { kind: 'marshalPost', s: 4260, side: 'right', distance: 15 },
  ],
  regions: [
    {
      kind: 'adBoardRun',
      sStart: -130,
      sEnd: 130,
      side: 'right',
      distance: 12,
      spacing: 12,
      colors: [],
    },
    { kind: 'flagRow', sStart: -110, sEnd: 40, side: 'right', distance: 14, spacing: 22 },
    { kind: 'gravelTrap', sStart: 884, sEnd: 916, side: 'right', distance: 4, width: 5 },
  ],
};
