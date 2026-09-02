import { titleCase } from '../format';
import type { Difficulty, TimeOfDay, Transmission, Weather } from '../../core/types';

function opts<T extends string>(values: readonly T[]): { value: T; label: string }[] {
  return values.map((v) => ({ value: v, label: titleCase(v) }));
}

export const DIFFICULTY_OPTIONS = opts<Difficulty>(['easy', 'normal', 'hard', 'expert']);
export const TIME_OF_DAY_OPTIONS = opts<TimeOfDay>(['morning', 'noon', 'evening', 'night']);
export const WEATHER_OPTIONS = opts<Weather>(['clear', 'overcast', 'rain']);
export const TRANSMISSION_OPTIONS = opts<Transmission>(['auto', 'manual']);
