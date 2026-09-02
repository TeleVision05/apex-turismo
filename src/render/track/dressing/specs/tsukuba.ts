import type { DressingSpec } from '../types';

/**
 * Tsukuba Circuit (Ibaraki, Japan): a small, flat, compact club circuit —
 * a modest pit building and grandstand, minimal dressing.
 */
export const spec: DressingSpec = {
  id: 'tsukuba',
  landmarks: [
    {
      kind: 'pitComplex',
      s: -6,
      side: 'left',
      distance: 46,
      length: 100,
      garages: 10,
      towerHeight: 14,
      roof: 'flat',
    },
    {
      kind: 'grandstand',
      s: -50,
      side: 'right',
      distance: 12,
      length: 14,
      rows: 6,
      roof: 'pitched',
    },
    { kind: 'cameraTower', s: 756, side: 'right', distance: 22, height: 12 },
    { kind: 'apexBoard', s: -4, side: 'right', distance: 14 },
    { kind: 'carPark', s: 90, side: 'left', distance: 51, rows: 4, cols: 8 },
    { kind: 'marshalPost', s: 1068, side: 'right', distance: 14 },
    { kind: 'marshalPost', s: 1748, side: 'left', distance: 14 },
  ],
  regions: [
    {
      kind: 'adBoardRun',
      sStart: -90,
      sEnd: 90,
      side: 'left',
      distance: 11,
      spacing: 10,
      colors: [],
    },
    { kind: 'flagRow', sStart: -70, sEnd: 10, side: 'right', distance: 9, spacing: 20 },
    { kind: 'gravelTrap', sStart: 720, sEnd: 800, side: 'left', distance: 11, width: 12 },
  ],
};
