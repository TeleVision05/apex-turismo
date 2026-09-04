import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync, readdirSync } from 'fs';
import { Vector3 } from 'three';
import { Track, localRadius, MIN_CORNER_RADIUS, RUNOFF_WIDTH } from './Track';
import type { TrackJson } from '../core/types';
import { ovalJson } from '../physics/testUtils';

const DIR = 'public/tracks';
const ids = existsSync(DIR)
  ? readdirSync(DIR)
      .filter((f) => f.endsWith('.json') && f !== 'index.json')
      .map((f) => f.replace('.json', ''))
  : [];

const load = (id: string): Track =>
  new Track(JSON.parse(readFileSync(`${DIR}/${id}.json`, 'utf8')) as TrackJson);

/**
 * Walks the road surface at a fixed lateral offset the way the rendered
 * ribbon is built (bilinear between consecutive cross-sections) and records
 * the largest height step between consecutive 0.5 m probes, plus how often
 * the nearest-sample index jumped by more than two samples.
 */
function sweep(t: Track, lateral: number): { worstStep: number; hops: number } {
  const p = new Vector3();
  const r = new Vector3();
  let hint: number | null = null;
  let prevH: number | null = null;
  let prevIdx = -1;
  let worstStep = 0;
  let hops = 0;
  for (let s = 0; s < t.length; s += 0.5) {
    const u = s / t.spacing;
    const i = Math.floor(u) % t.n;
    const j = (i + 1) % t.n;
    const f = u - Math.floor(u);
    p.copy(t.points[i]).lerp(t.points[j], f);
    r.copy(t.rights[i]).lerp(t.rights[j], f).normalize();
    p.addScaledVector(r, lateral);
    p.y += 0.6; // roughly wheel-attach height above the road
    const q = t.query(p, hint);
    hint = q.index;
    if (prevH !== null) worstStep = Math.max(worstStep, Math.abs(q.height - prevH));
    if (prevIdx >= 0) {
      const jump = Math.abs(q.index - prevIdx);
      if (jump > 2 && jump < t.n - 2) hops++;
    }
    prevH = q.height;
    prevIdx = q.index;
  }
  return { worstStep, hops };
}

describe.skipIf(ids.length === 0)('real circuits', () => {
  for (const id of ids) {
    it(`${id}: no corner tighter than the run-off can wrap around`, () => {
      const t = load(id);
      const minRadius = Math.max(MIN_CORNER_RADIUS, t.widths[0] * 0.5 + RUNOFF_WIDTH);
      let worst = Infinity;
      let at = -1;
      for (let i = 0; i < t.n; i++) {
        const r = localRadius(t.points, i);
        if (r < worst) {
          worst = r;
          at = i;
        }
      }
      expect(worst, `sample ${at}`).toBeGreaterThanOrEqual(minRadius - 0.5);
    });

    // measured 2026-09-04: Red Bull Ring 3.96 m (Remus), Spa 4.80 m (Bus Stop), Suzuka 5.49 m
    // (Casio Triangle); anything larger means the relaxation is running away
    it(`${id}: corner relaxation moves no sample more than 6 m`, () => {
      const json = JSON.parse(readFileSync(`${DIR}/${id}.json`, 'utf8')) as TrackJson;
      const t = new Track(json);
      let worst = 0;
      json.points.forEach(([x, , z], i) => {
        worst = Math.max(worst, Math.hypot(t.points[i].x - x, t.points[i].z - z));
      });
      expect(worst).toBeLessThan(6);
    });

    it(`${id}: the road height is continuous across the full width`, () => {
      const t = load(id);
      const half = t.widths[0] * 0.5;
      // 12 % is the steepest grade the track builder allows; on the inside of a
      // 13 m corner the ruled surface at the curb line climbs about twice as fast.
      for (const lateral of [-half - 1, -half + 0.5, -3, 0, 3, half - 0.5, half + 1]) {
        const { worstStep, hops } = sweep(t, lateral);
        expect(worstStep, `lateral ${lateral}`).toBeLessThan(0.16);
        expect(hops, `lateral ${lateral}`).toBe(0);
      }
    });
  }
});

describe('Track.query on a synthetic hairpin with a grade', () => {
  it('never steps more than a few centimetres even on the inside of the corner', () => {
    // a small oval with 15 m ends (just above the 13 m minimum) on a rolling 10 % grade
    const json = ovalJson(12, 120, 15);
    const L = json.points.length * json.sampleSpacingM;
    json.points.forEach((p, i) => {
      p[1] = 5 * Math.sin((2 * Math.PI * i * json.sampleSpacingM) / L);
    });
    const t = new Track(json);
    for (const lateral of [5.5, -5.5]) {
      const p = new Vector3();
      let hint: number | null = null;
      let prev: number | null = null;
      let worst = 0;
      for (let s = 0; s < L; s += 0.25) {
        const u = s / json.sampleSpacingM;
        const i = Math.floor(u) % t.n;
        const j = (i + 1) % t.n;
        const f = u - Math.floor(u);
        p.copy(t.points[i]).lerp(t.points[j], f);
        const r = t.rights[i].clone().lerp(t.rights[j], f).normalize();
        p.addScaledVector(r, lateral);
        const q = t.query(p, hint);
        hint = q.index;
        if (prev !== null) worst = Math.max(worst, Math.abs(q.height - prev));
        prev = q.height;
      }
      expect(worst, `lateral ${lateral}`).toBeLessThan(0.08);
    }
  });
});

describe('corner relaxation', () => {
  it('opens up a tracing kink to the minimum radius without moving the rest of the lap', () => {
    const json = ovalJson(12, 400, 60);
    // an OSM-style kink: bend one sample of a straight 3 m sideways
    const kinked = 25;
    json.points[kinked][0] += 0;
    json.points[kinked][2] += 3;
    const t = new Track(json);
    let minR = Infinity;
    for (let i = 0; i < t.n; i++) minR = Math.min(minR, localRadius(t.points, i));
    expect(minR).toBeGreaterThanOrEqual(Math.max(MIN_CORNER_RADIUS, 6 + RUNOFF_WIDTH) - 0.5);
    // far from the kink nothing moved
    const far = 200;
    expect(t.points[far].x).toBeCloseTo(json.points[far][0], 6);
    expect(t.points[far].z).toBeCloseTo(json.points[far][2], 6);
  });
});
