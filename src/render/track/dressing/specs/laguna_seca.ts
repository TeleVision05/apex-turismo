import type { DressingSpec } from '../types';

/**
 * WeatherTech Raceway Laguna Seca (California): pits on the right, small
 * paddock, dry golden hills with sparse oaks all around, and the blind
 * Corkscrew drop.
 */
export const spec: DressingSpec = {
  id: 'laguna_seca',
  landmarks: [
    {
      kind: 'pitComplex',
      s: -10,
      side: 'right',
      distance: 46,
      length: 100,
      garages: 14,
      towerHeight: 18,
      roof: 'flat',
    },
    {
      kind: 'grandstand',
      s: -60,
      side: 'left',
      distance: 20,
      length: 55,
      rows: 8,
      roof: 'pitched',
    },
    {
      kind: 'grandstand',
      s: 504,
      side: 'right',
      distance: 16,
      length: 25,
      rows: 6,
      roof: 'pitched',
    },
    {
      kind: 'rollingHills',
      s: 3300,
      side: 'right',
      distance: 240,
      length: 50,
      height: 50,
      oaks: 24,
    },
    {
      kind: 'rollingHills',
      s: 1900,
      side: 'left',
      distance: 260,
      length: 50,
      height: 55,
      oaks: 26,
    },
    {
      kind: 'rollingHills',
      s: 300,
      side: 'right',
      distance: 280,
      length: 50,
      height: 58,
      oaks: 28,
    },
    { kind: 'cameraTower', s: 3300, side: 'left', distance: 26, height: 14 },
    { kind: 'cameraTower', s: 504, side: 'right', distance: 24, height: 14 },
    { kind: 'apexBoard', s: -5, side: 'left', distance: 15 },
    { kind: 'helipad', s: -160, side: 'right', distance: 76 },
    { kind: 'carPark', s: 120, side: 'right', distance: 61, rows: 4, cols: 8 },
    { kind: 'bridge', s: 1320, side: 'center', distance: 6, clearance: 6 },
    { kind: 'marshalPost', s: 1612, side: 'right', distance: 15 },
    { kind: 'marshalPost', s: 2756, side: 'left', distance: 15 },
    { kind: 'marshalPost', s: 3548, side: 'right', distance: 15 },
  ],
  regions: [
    {
      kind: 'adBoardRun',
      sStart: -120,
      sEnd: 120,
      side: 'left',
      distance: 12,
      spacing: 12,
      colors: [],
    },
    { kind: 'flagRow', sStart: -100, sEnd: 40, side: 'left', distance: 14, spacing: 22 },
    { kind: 'gravelTrap', sStart: 3260, sEnd: 3420, side: 'left', distance: 11, width: 14 },
  ],
};
