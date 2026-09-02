export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
export const sign = (v: number): number => (v < 0 ? -1 : 1);
export const smoothstep = (e0: number, e1: number, x: number): number => {
  const t = clamp((x - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};
/** Exponential approach: moves `current` toward `target` with time constant `tau` seconds. */
export const damp = (current: number, target: number, tau: number, dt: number): number =>
  lerp(current, target, 1 - Math.exp(-dt / Math.max(tau, 1e-6)));
/** Wraps an angle to [-PI, PI]. */
export const wrapAngle = (a: number): number => {
  let x = a % (Math.PI * 2);
  if (x > Math.PI) x -= Math.PI * 2;
  if (x < -Math.PI) x += Math.PI * 2;
  return x;
};
/** Wraps an index into a ring of length n. */
export const wrapIndex = (i: number, n: number): number => ((i % n) + n) % n;
/** Piecewise-linear interpolation over sorted (x, y) pairs. */
export function interpCurve(points: { x: number; y: number }[], x: number): number {
  if (x <= points[0].x) return points[0].y;
  const last = points[points.length - 1];
  if (x >= last.x) return last.y;
  for (let i = 1; i < points.length; i++) {
    const p = points[i];
    if (x <= p.x) {
      const q = points[i - 1];
      return lerp(q.y, p.y, (x - q.x) / (p.x - q.x));
    }
  }
  return last.y;
}
/** Deterministic pseudo-random generator (mulberry32). */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function formatLapTime(ms: number | null | undefined): string {
  if (ms === null || ms === undefined || !isFinite(ms)) return '--:--.---';
  const neg = ms < 0;
  const a = Math.abs(ms);
  const m = Math.floor(a / 60000);
  const s = Math.floor((a % 60000) / 1000);
  const t = Math.floor(a % 1000);
  return `${neg ? '-' : ''}${m}:${s.toString().padStart(2, '0')}.${t.toString().padStart(3, '0')}`;
}
export function formatDelta(ms: number): string {
  const s = ms / 1000;
  return `${s >= 0 ? '+' : '-'}${Math.abs(s).toFixed(3)}`;
}
