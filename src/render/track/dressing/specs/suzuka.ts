import type { DressingSpec } from '../types';

/**
 * Suzuka Circuit (Mie, Japan): figure-8 crossover, pits on the left of the
 * main straight, the landmark Ferris wheel behind them, grandstands at
 * Turn 1 / Spoon / the Casio Triangle chicane, and gravel at Degner / 130R.
 */
export const spec: DressingSpec = {
  id: 'suzuka',
  landmarks: [
    {
      kind: 'pitComplex',
      s: -10,
      side: 'left',
      distance: 46,
      length: 100,
      garages: 20,
      towerHeight: 24,
      roof: 'tiered',
    },
    { kind: 'ferrisWheel', s: -40, side: 'left', distance: 78, radius: 30 },
    {
      kind: 'grandstand',
      s: 768,
      side: 'right',
      distance: 54,
      length: 55,
      rows: 9,
      roof: 'pitched',
    },
    {
      kind: 'grandstand',
      s: 4040,
      side: 'right',
      distance: 54,
      length: 55,
      rows: 7,
      roof: 'pitched',
    },
    {
      kind: 'grandstand',
      s: 5480,
      side: 'left',
      distance: 56,
      length: 55,
      rows: 8,
      roof: 'tiered',
    },
    { kind: 'cameraTower', s: 720, side: 'left', distance: 26, height: 16 },
    { kind: 'cameraTower', s: 3960, side: 'left', distance: 28, height: 16 },
    { kind: 'cameraTower', s: 5150, side: 'right', distance: 28, height: 18 },
    { kind: 'apexBoard', s: -5, side: 'left', distance: 16 },
    { kind: 'apexBoard', s: 2988, side: 'right', distance: 16 },
    { kind: 'helipad', s: -200, side: 'left', distance: 96 },
    { kind: 'carPark', s: 130, side: 'left', distance: 71, rows: 5, cols: 10 },
    { kind: 'bridge', s: 480, side: 'center', distance: 6, clearance: 6.5 },
    { kind: 'bridge', s: 2700, side: 'center', distance: 6, clearance: 6.5 },
    { kind: 'bridge', s: 5300, side: 'center', distance: 6, clearance: 6.5 },
    { kind: 'marshalPost', s: 192 * 4, side: 'right', distance: 16 },
    { kind: 'marshalPost', s: 2524, side: 'right', distance: 16 },
    { kind: 'marshalPost', s: 3876, side: 'left', distance: 16 },
    { kind: 'marshalPost', s: 5108, side: 'left', distance: 18 },
    { kind: 'marshalPost', s: 1624, side: 'right', distance: 16 },
  ],
  regions: [
    {
      kind: 'adBoardRun',
      sStart: -160,
      sEnd: 160,
      side: 'right',
      distance: 12,
      spacing: 12,
      colors: [],
    },
    { kind: 'flagRow', sStart: -140, sEnd: 60, side: 'right', distance: 15, spacing: 25 },
    { kind: 'gravelTrap', sStart: 2280, sEnd: 2620, side: 'right', distance: 12, width: 22 },
    { kind: 'gravelTrap', sStart: 5000, sEnd: 5260, side: 'left', distance: 12, width: 26 },
    { kind: 'forestBelt', sStart: 4200, sEnd: 5000, side: 'both', distance: 26, density: 0.5 },
    { kind: 'forestBelt', sStart: 1700, sEnd: 2300, side: 'both', distance: 26, density: 0.4 },
  ],
};
