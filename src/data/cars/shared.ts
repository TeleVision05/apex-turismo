import type { TorquePoint } from '../../core/types';

/** Builds a torque curve from a few (rpm, Nm) anchors. */
export const tq = (...pts: [number, number][]): TorquePoint[] =>
  pts.map(([rpm, nm]) => ({ rpm, nm }));

/** Fields shared by (almost) every car; spread first, then overridden per car. */
export const base = {
  cgHeightM: 0.48,
  reverseRatio: 3.4,
  suspensionTravelM: 0.16,
  steerLockDeg: 34,
  frontTorqueSplit: 0,
};
