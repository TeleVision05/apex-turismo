import type { CarClass, CarSpec, Difficulty, OwnedCar, RaceConfig } from '../core/types';
import { CARS } from '../data/cars';
import { defaultTuning, performancePoints } from '../physics/Tuning';
import { makeRng } from '../core/math';
import type { RaceEntry } from './RaceSession';

const DRIVER_NAMES = [
  'K. Tanaka',
  'L. Moreau',
  'S. Okafor',
  'M. Rossi',
  'A. Lindqvist',
  'J. Carter',
  'R. Silva',
  'H. Weber',
  'T. Nakamura',
  'E. Novak',
  'D. Kowalski',
  'P. Fischer',
  'N. Haddad',
  'V. Petrov',
  'C. Dubois',
  'B. Larsen',
  'F. Alonso-Ruiz',
  'G. Mbeki',
  'I. Sato',
  'O. Brennan',
  'Y. Chen',
  'W. Schmidt',
  'Z. Costa',
  'M. Kimura',
];

const SKILL_RANGE: Record<Difficulty, [number, number]> = {
  easy: [0.8, 0.87],
  normal: [0.87, 0.93],
  hard: [0.92, 0.97],
  expert: [0.96, 1.01],
};

const CLASS_ORDER: CarClass[] = ['N100', 'N200', 'N300', 'N500', 'Gr.4', 'Gr.3', 'Gr.1'];

/** Cars an opponent field may use for a given class; falls back to neighbours. */
export function opponentPool(cls: CarClass): CarSpec[] {
  const direct = CARS.filter((c) => c.carClass === cls);
  if (direct.length >= 2) return direct;
  const i = CLASS_ORDER.indexOf(cls);
  const near = CARS.filter((c) => Math.abs(CLASS_ORDER.indexOf(c.carClass) - i) <= 1);
  return near.length ? near : CARS;
}

/** Picks opponents whose PP sits near the player's when no class is given. */
function poolForPlayer(playerPp: number): CarSpec[] {
  const scored = CARS.map((c) => ({ c, pp: performancePoints(c, defaultTuning(c)) }));
  const near = scored
    .filter((s) => Math.abs(s.pp - playerPp) <= Math.max(60, playerPp * 0.14))
    .map((s) => s.c);
  if (near.length >= 2) return near;
  return scored
    .sort((a, b) => Math.abs(a.pp - playerPp) - Math.abs(b.pp - playerPp))
    .slice(0, 3)
    .map((s) => s.c);
}

/** Builds the full grid for a race: the player's car plus generated opponents. */
export function buildEntries(
  config: RaceConfig,
  player: OwnedCar,
  playerSpec: CarSpec,
  driverName: string,
): RaceEntry[] {
  const rng = makeRng(
    hashString(config.trackId + config.laps + config.opponents + config.difficulty),
  );
  const entries: RaceEntry[] = [];
  const playerPp = performancePoints(playerSpec, player.tuning);
  const pool = config.opponentClass ? opponentPool(config.opponentClass) : poolForPlayer(playerPp);
  const [lo, hi] = SKILL_RANGE[config.difficulty];
  const names = [...DRIVER_NAMES].sort(() => rng() - 0.5);
  const count = config.mode === 'race' ? config.opponents : 0;
  for (let i = 0; i < count; i++) {
    const spec = pool[Math.floor(rng() * pool.length)];
    const tuning = defaultTuning(spec);
    tuning.color = spec.colors[Math.floor(rng() * spec.colors.length)];
    // opponents in a lower-PP car get a little extra skill so the field stays close
    const ppGap = Math.max(0, playerPp - performancePoints(spec, tuning)) / Math.max(300, playerPp);
    const skill = lo + rng() * (hi - lo) + ppGap * 0.25;
    entries.push({ spec, tuning, name: names[i % names.length], isPlayer: false, skill });
  }
  // grid order: player starts at the back in races (GT7 style), alone otherwise
  entries.push({
    spec: playerSpec,
    tuning: player.tuning,
    name: driverName,
    isPlayer: true,
    skill: 1,
  });
  return entries;
}

function hashString(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
