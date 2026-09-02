import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Vector3 } from 'three';
import { describe, expect, it } from 'vitest';
import { Track } from '../../track/Track';
import { RacingLine } from '../../track/RacingLine';
import type { TrackJson } from '../../core/types';
import { buildTrackScene } from './TrackScene';

const here = path.dirname(fileURLToPath(import.meta.url));
const suzukaPath = path.resolve(here, '../../../public/tracks/suzuka.json');

function makeSyntheticOval(n = 500): TrackJson {
  const rx = 420;
  const rz = 220;
  const points: [number, number, number][] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    points.push([Math.cos(a) * rx, 0, Math.sin(a) * rz]);
  }
  const h = ((rx - rz) / (rx + rz)) ** 2;
  const circumference = Math.PI * (rx + rz) * (1 + (3 * h) / (10 + Math.sqrt(4 - 3 * h)));
  return {
    id: 'synthetic-oval',
    name: 'Synthetic Oval',
    country: 'Testland',
    lengthM: circumference,
    direction: 'clockwise',
    sampleSpacingM: circumference / n,
    points,
    widths: new Array(n).fill(12),
    startIndex: 0,
    corners: [
      { name: 'Turn 1', number: 1, index: Math.floor(n * 0.25) },
      { name: 'Turn 2', number: 2, index: Math.floor(n * 0.75) },
    ],
    pitLane: null,
    origin: { lat: 0, lon: 0 },
    source: 'synthetic',
  };
}

function loadTrackJson(): TrackJson {
  if (existsSync(suzukaPath)) {
    return JSON.parse(readFileSync(suzukaPath, 'utf-8')) as TrackJson;
  }
  return makeSyntheticOval(500);
}

describe('buildTrackScene', () => {
  const json = loadTrackJson();
  const track = new Track(json);
  const racingLine = new RacingLine(track);
  const scene = buildTrackScene(track, { quality: 'medium', timeOfDay: 'noon', racingLine });

  it('populates the group', () => {
    expect(scene.group.children.length).toBeGreaterThan(0);
  });

  it('builds a road surface whose vertices sit within 1m of their track sample height', () => {
    // The road ribbon is a closed, non-indexed strip: 6 vertices per sample step
    // (l0, r0, r1, l0, r1, l1), where step k pairs sample k with sample k+1. Walking
    // it in that known order lets us check each vertex against the exact sample it
    // came from, rather than a spatial nearest-sample search (which can be ambiguous
    // near bridge crossovers, where two strands of track sit close in x/z but differ
    // greatly in y).
    expect(scene.roadMeshes.length).toBeGreaterThan(0);
    const roadMesh = scene.roadMeshes[0];
    const position = roadMesh.geometry.getAttribute('position');
    expect(position.count).toBeGreaterThan(0);
    expect(position.count).toBe(track.n * 6);
    const sampleForVertex = [0, 0, 1, 0, 1, 1];
    for (let p = 0; p < position.count; p++) {
      const step = Math.floor(p / 6);
      const posInStep = p % 6;
      const idx = sampleForVertex[posInStep] === 0 ? step : (step + 1) % track.n;
      const y = position.getY(p);
      expect(Math.abs(y - track.points[idx].y)).toBeLessThan(1);
    }
  });

  it('produces a minimap outline matching the track sample count, normalised to [0,1]', () => {
    expect(scene.minimap.outline.length).toBe(track.points.length);
    for (const [u, v] of scene.minimap.outline) {
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
    const [px, py] = scene.minimap.project(track.points[0].x, track.points[0].z);
    expect(px).toBeCloseTo(scene.minimap.outline[0][0], 5);
    expect(py).toBeCloseTo(scene.minimap.outline[0][1], 5);
  });

  it('reports finite bounds', () => {
    expect(Number.isFinite(scene.bounds.min.x)).toBe(true);
    expect(Number.isFinite(scene.bounds.min.y)).toBe(true);
    expect(Number.isFinite(scene.bounds.min.z)).toBe(true);
    expect(Number.isFinite(scene.bounds.max.x)).toBe(true);
    expect(Number.isFinite(scene.bounds.max.y)).toBe(true);
    expect(Number.isFinite(scene.bounds.max.z)).toBe(true);
  });

  it('toggles the racing line and start lights without throwing', () => {
    expect(() => scene.setRacingLineVisible(true)).not.toThrow();
    expect(() => scene.setStartLights(3)).not.toThrow();
    expect(() => scene.setStartLights(-1)).not.toThrow();
    expect(() => scene.update(1 / 60, new Vector3())).not.toThrow();
  });

  it('disposes without throwing', () => {
    expect(() => scene.dispose()).not.toThrow();
  });
});
