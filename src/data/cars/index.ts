import type { CarSpec } from '../../core/types';
import { N100_CARS } from './n100';
import { N200_CARS } from './n200';
import { N300_CARS } from './n300';
import { N500_CARS } from './n500';
import { GR4_CARS } from './gr4';
import { GR3_CARS } from './gr3';
import { GR1_CARS } from './gr1';

export const CARS: CarSpec[] = [
  ...N100_CARS,
  ...N200_CARS,
  ...N300_CARS,
  ...N500_CARS,
  ...GR4_CARS,
  ...GR3_CARS,
  ...GR1_CARS,
];

export const carById = (id: string): CarSpec => {
  const c = CARS.find((x) => x.id === id);
  if (!c) throw new Error(`Unknown car ${id}`);
  return c;
};

export const STARTER_CAR_ID = 'sakura_86';
