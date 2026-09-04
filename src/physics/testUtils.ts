import type { TrackJson } from '../core/types';

/**
 * An oval of two straights joined by semicircles, defaulting to the 2 km
 * test oval (500 m straights, ~159 m radius). Test-only.
 */
export function ovalJson(width = 14, straight = 500, r = 159.15): TrackJson {
  const pts: [number, number, number][] = [];
  const spacing = 4;
  const total = 2 * straight + 2 * Math.PI * r;
  const n = Math.round(total / spacing);
  for (let i = 0; i < n; i++) {
    const s = (i / n) * total;
    let x: number;
    let z: number;
    if (s < straight) {
      x = s - straight / 2;
      z = -r;
    } else if (s < straight + Math.PI * r) {
      const a = (s - straight) / r;
      x = straight / 2 + Math.sin(a) * r;
      z = -Math.cos(a) * r;
    } else if (s < 2 * straight + Math.PI * r) {
      x = straight / 2 - (s - straight - Math.PI * r);
      z = r;
    } else {
      const a = (s - 2 * straight - Math.PI * r) / r;
      x = -straight / 2 - Math.sin(a) * r;
      z = Math.cos(a) * r;
    }
    pts.push([x, 0, z]);
  }
  return {
    id: 'oval',
    name: 'Oval',
    country: 'Test',
    lengthM: total,
    direction: 'clockwise',
    sampleSpacingM: spacing,
    points: pts,
    widths: pts.map(() => width),
    startIndex: 0,
    corners: [],
    pitLane: null,
    origin: { lat: 0, lon: 0 },
    source: 'test',
  };
}
