import type { DressingSpec } from '../types';

/**
 * Autódromo José Carlos Pace / Interlagos (São Paulo, Brazil): pits on the
 * right, the Arquibancadas grandstand climbing to the pit straight, and the
 * São Paulo apartment-tower skyline beyond the back straight.
 */
export const spec: DressingSpec = {
  id: 'interlagos',
  startRotationM: 3516,
  landmarks: [
    {
      kind: 'pitComplex',
      s: -10,
      side: 'right',
      distance: 46,
      length: 100,
      garages: 18,
      towerHeight: 22,
      roof: 'flat',
    },
    {
      kind: 'grandstand',
      s: -70,
      side: 'left',
      distance: 18,
      length: 35,
      rows: 9,
      roof: 'tiered',
    },
    {
      kind: 'grandstand',
      s: 3248,
      side: 'left',
      distance: 18,
      length: 35,
      rows: 10,
      roof: 'tiered',
    },
    {
      kind: 'citySkyline',
      s: 204,
      side: 'right',
      distance: 1606,
      length: 400,
      towers: 20,
      maxHeight: 95,
    },
    { kind: 'cameraTower', s: 2204, side: 'right', distance: 24, height: 16 },
    { kind: 'cameraTower', s: 4196, side: 'left', distance: 24, height: 16 },
    { kind: 'apexBoard', s: -5, side: 'left', distance: 15 },
    { kind: 'helipad', s: -190, side: 'right', distance: 96 },
    { kind: 'carPark', s: 150, side: 'right', distance: 66, rows: 5, cols: 10 },
    { kind: 'bridge', s: 900, side: 'center', distance: 6, clearance: 6 },
    { kind: 'bridge', s: 2500, side: 'center', distance: 6, clearance: 6 },
    { kind: 'marshalPost', s: 1248, side: 'right', distance: 15 },
    { kind: 'marshalPost', s: 2420, side: 'left', distance: 15 },
    { kind: 'marshalPost', s: 3896, side: 'right', distance: 15 },
  ],
  regions: [
    {
      kind: 'adBoardRun',
      sStart: -140,
      sEnd: 140,
      side: 'left',
      distance: 12,
      spacing: 12,
      colors: [],
    },
    { kind: 'flagRow', sStart: -120, sEnd: 50, side: 'left', distance: 14, spacing: 22 },
    { kind: 'gravelTrap', sStart: 1900, sEnd: 2000, side: 'left', distance: 11, width: 16 },
  ],
};
