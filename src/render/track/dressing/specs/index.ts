import type { DressingSpec } from '../types';
import { spec as suzuka } from './suzuka';
import { spec as monza } from './monza';
import { spec as spa } from './spa';
import { spec as laguna_seca } from './laguna_seca';
import { spec as brands_hatch } from './brands_hatch';
import { spec as tsukuba } from './tsukuba';
import { spec as fuji } from './fuji';
import { spec as interlagos } from './interlagos';
import { spec as red_bull_ring } from './red_bull_ring';
import { spec as silverstone } from './silverstone';

const SPECS: Record<string, DressingSpec> = {
  suzuka,
  monza,
  spa,
  laguna_seca,
  brands_hatch,
  tsukuba,
  fuji,
  interlagos,
  red_bull_ring,
  silverstone,
};

/** Looks up the declarative dressing spec for a track id, or null if none exists yet. */
export function getSpec(trackId: string): DressingSpec | null {
  return SPECS[trackId] ?? null;
}
