import type { DressingSpec } from '../types';

/**
 * Fuji Speedway (Shizuoka, Japan): pits on the left beneath the tall race
 * control tower, with Mt Fuji's snow-capped cone looming behind the main
 * straight.
 */
export const spec: DressingSpec = {
  id: 'fuji',
  landmarks: [
    {
      kind: 'pitComplex',
      s: -10,
      side: 'left',
      distance: 46,
      length: 100,
      garages: 20,
      towerHeight: 30,
      roof: 'flat',
    },
    {
      kind: 'mountainCone',
      s: 1200,
      side: 'right',
      distance: 4206,
      height: 800,
      radius: 1100,
      snowLine: 0.32,
    },
    {
      kind: 'grandstand',
      s: -80,
      side: 'right',
      distance: 58,
      length: 55,
      rows: 10,
      roof: 'tiered',
    },
    {
      kind: 'grandstand',
      s: 2436,
      side: 'right',
      distance: 54,
      length: 55,
      rows: 6,
      roof: 'pitched',
    },
    { kind: 'cameraTower', s: 52, side: 'right', distance: 26, height: 18 },
    { kind: 'cameraTower', s: 2720, side: 'left', distance: 26, height: 16 },
    { kind: 'apexBoard', s: -5, side: 'right', distance: 16 },
    { kind: 'helipad', s: -220, side: 'left', distance: 106 },
    { kind: 'carPark', s: 180, side: 'left', distance: 76, rows: 6, cols: 12 },
    { kind: 'bridge', s: 1288, side: 'center', distance: 6, clearance: 6.5 },
    { kind: 'bridge', s: 2996, side: 'center', distance: 6, clearance: 6.5 },
    { kind: 'marshalPost', s: 2128, side: 'right', distance: 16 },
    { kind: 'marshalPost', s: 2996, side: 'left', distance: 16 },
  ],
  regions: [
    {
      kind: 'adBoardRun',
      sStart: -170,
      sEnd: 170,
      side: 'right',
      distance: 12,
      spacing: 12,
      colors: [],
    },
    { kind: 'flagRow', sStart: -150, sEnd: 60, side: 'right', distance: 15, spacing: 25 },
    { kind: 'gravelTrap', sStart: 2080, sEnd: 2200, side: 'right', distance: 12, width: 20 },
  ],
};
