// Generates a plausible, ever-changing HudState for the UI preview harness —
// no physics, just enough motion to exercise every HUD element visually.
import type { HudState, RaceConfig, StandingEntry } from '../../src/core/types';

const LAP_DURATION_S = 22;
const TOTAL_CARS = 8;
const REDLINE = 7600;
const IDLE = 1000;
const NAMES = [
  'Preview Driver',
  'M. Chen',
  'K. Nakajima',
  'L. Bianchi',
  'S. Weber',
  'J. Silva',
  'T. Novak',
  'O. Fischer',
];
const COLORS = [
  '#e8b923',
  '#7fb3ff',
  '#ef6a6a',
  '#6fe08a',
  '#c8a2ff',
  '#ffb37f',
  '#7fffe0',
  '#ff7fc0',
];

function carS(elapsedS: number, offset: number, speedMul: number): number {
  const t = Math.max(0, elapsedS - 3) * speedMul + offset;
  return (t / LAP_DURATION_S) % 1;
}

function buildCarProgress(elapsedS: number): HudState['carProgress'] {
  const out: HudState['carProgress'] = [];
  for (let i = 0; i < TOTAL_CARS; i++) {
    const speedMul = i === 0 ? 1 : 0.88 + ((i * 37) % 20) / 100;
    const s = carS(elapsedS, i * 0.09, speedMul);
    const lateral = Math.sin(elapsedS * 0.6 + i) * 2;
    out.push({ s, lateral, color: COLORS[i % COLORS.length], isPlayer: i === 0 });
  }
  return out;
}

function buildStandings(elapsedS: number, config: RaceConfig): StandingEntry[] {
  const ordered = NAMES.map((name, i) => ({
    name,
    carName: i === 0 ? 'Your car' : 'Rival GT',
    s: carS(elapsedS, i * 0.09, i === 0 ? 1 : 0.88 + ((i * 37) % 20) / 100),
    i,
  })).sort((a, b) => b.s - a.s);
  return ordered.map((o, pos) => ({
    name: o.name,
    carName: o.carName,
    position: pos + 1,
    lap: Math.min(config.laps, Math.floor(elapsedS / LAP_DURATION_S) + 1),
    gapMs: pos === 0 ? null : pos * 1150 + Math.round(Math.sin(elapsedS + pos) * 120),
    bestLapMs: 68210 + o.i * 260,
    isPlayer: o.i === 0,
    finished: false,
  }));
}

/** Builds a fully synthetic HudState for a given elapsed race time. */
export function buildHudState(elapsedS: number, config: RaceConfig): HudState {
  const lapProgress = (Math.max(0, elapsedS - 3) % LAP_DURATION_S) / LAP_DURATION_S;
  const lap = Math.min(config.laps, Math.floor(Math.max(0, elapsedS - 3) / LAP_DURATION_S) + 1);
  const gearCycle = Math.floor(lapProgress * 6) % 6;
  const rpmPhase = (lapProgress * 6) % 1;
  const rpm =
    elapsedS < 3 ? IDLE : IDLE + (REDLINE - IDLE) * (0.15 + 0.85 * Math.pow(rpmPhase, 0.7));
  const speedKmh =
    elapsedS < 3 ? 0 : 60 + 140 * Math.sin(lapProgress * Math.PI * 2 - 0.4) * 0.5 + 90;
  const finished = elapsedS - 3 > config.laps * LAP_DURATION_S;
  const wrongWayWindow = elapsedS > 33 && elapsedS < 35.5;
  const offTrackWindow = elapsedS % 13 < 1.4 && elapsedS > 4;

  let message: string | null = null;
  if (elapsedS >= 3 && elapsedS < 4.2) message = 'GO!';
  else if (lap === config.laps && !finished) message = 'FINAL LAP';
  else if (finished) message = 'FINISH';

  const sectorTimes: (number | null)[] = [0, 1, 2].map((i) =>
    lapProgress > (i + 1) / 3 || lap > 1 ? 60000 + i * 8000 : null,
  );

  return {
    speedKmh: Math.max(0, speedKmh),
    rpm,
    redlineRpm: REDLINE,
    gear: elapsedS < 3 ? 0 : gearCycle + 1,
    throttle: 0.6 + 0.4 * Math.sin(elapsedS * 2),
    brake: Math.max(0, -Math.sin(elapsedS * 2)),
    position: 1 + Math.floor((Math.sin(elapsedS * 0.15) + 1) * 1.5),
    totalCars: TOTAL_CARS,
    lap,
    totalLaps: config.laps,
    currentLapMs: lapProgress * LAP_DURATION_S * 1000,
    lastLapMs: lap > 1 ? 68210 + Math.round(Math.sin(elapsedS) * 400) : null,
    bestLapMs: lap > 1 ? 68210 : null,
    deltaToBestMs: lap > 1 ? Math.round(Math.sin(elapsedS * 0.4) * 900) : null,
    sectorTimes,
    gapAheadMs: 1240,
    gapBehindMs: 880,
    countdown: elapsedS < 3 ? Math.max(1, 3 - Math.floor(elapsedS)) : null,
    message,
    finished,
    offTrack: offTrackWindow,
    abs: (rpmPhase > 0.9 && Math.sin(elapsedS * 2) < -0.3) || false,
    tcs: throttleSpiking(elapsedS),
    carProgress: buildCarProgress(elapsedS),
    standings: buildStandings(elapsedS, config),
    wrongWay: wrongWayWindow,
    invalidLap: offTrackWindow,
  };
}

function throttleSpiking(elapsedS: number): boolean {
  return Math.sin(elapsedS * 2) > 0.85;
}
