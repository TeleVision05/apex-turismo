/** Shared, brand-neutral colour palette for track dressing (no real sponsor colours/logos). */
export const PALETTE = {
  concrete: 0xc9c8c2,
  concreteDark: 0x9b9a94,
  steel: 0x3a3d42,
  steelLight: 0x6b6f76,
  glassBlue: 0x1c3a52,
  glassEmissive: 0x0a1622,
  roofDark: 0x33363b,
  roofRed: 0x7a2f2f,
  tarmacGrey: 0x4a4a4a,
  gravelBeige: 0xcbb583,
  grassGreen: 0x3c7a3f,
  snowWhite: 0xf4f6fa,
  rockGrey: 0x767a72,
  rockDark: 0x565a54,
  hillGreenDry: 0x9c9457,
  hillGreenLush: 0x4f7d3f,
  cityConcrete: 0xb9b6ac,
  cityGlass: 0x8fa8bb,
  bullBlack: 0x141414,
  plinthGrey: 0x8a8a86,
} as const;

export const STRIPE_COLORS = [0x1f5fa8, 0xc23b3b, 0xd9b32c, 0x2f8f4f, 0xffffff, 0x3a3a3f];

export const SEAT_COLORS = [0x1f5fa8, 0x1f8f4f, 0xc23b3b, 0xd9b32c, 0xffffff];

/** Deterministic colour picker so repeated calls with the same index are stable. */
export function pick(colors: readonly number[], i: number): number {
  return colors[i % colors.length];
}
