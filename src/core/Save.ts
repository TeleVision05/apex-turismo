import type { SaveData, GameSettings, OwnedCar } from './types';
import { carById, STARTER_CAR_ID } from '../data/cars';
import { defaultTuning } from '../physics/Tuning';

const KEY = 'apex-turismo-save-v1';
export const SAVE_VERSION = 1;

export function defaultSettings(): GameSettings {
  return {
    graphics: {
      quality: 'high',
      shadows: true,
      postProcessing: true,
      motionBlur: false,
      resolutionScale: 1,
      fov: 70,
    },
    audio: { master: 0.8, engine: 0.9, effects: 0.8, music: 0.4 },
    assists: { abs: true, tcs: 1, stability: false, racingLine: true, autoBrake: false },
    transmission: 'auto',
    units: 'kmh',
    cameraMode: 'chase',
    steeringSensitivity: 1,
    wheelRotationDeg: 900,
    wheelForceFeedback: 0.7,
  };
}

export function newSave(): SaveData {
  const starter: OwnedCar = {
    specId: STARTER_CAR_ID,
    tuning: defaultTuning(carById(STARTER_CAR_ID)),
    odometerM: 0,
  };
  return {
    version: SAVE_VERSION,
    credits: 30000,
    garage: [starter],
    selectedCar: 0,
    records: [],
    completedEvents: {},
    settings: defaultSettings(),
    totalRaces: 0,
    totalDistanceM: 0,
    inputMappings: {},
    driverName: 'Player',
  };
}

/** Persistent player profile stored in localStorage. */
export class SaveStore {
  data: SaveData;

  constructor() {
    this.data = this.load();
  }

  private load(): SaveData {
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return newSave();
      const parsed = JSON.parse(raw) as Partial<SaveData>;
      const fresh = newSave();
      return {
        ...fresh,
        ...parsed,
        settings: {
          ...fresh.settings,
          ...(parsed.settings ?? {}),
          graphics: { ...fresh.settings.graphics, ...(parsed.settings?.graphics ?? {}) },
          audio: { ...fresh.settings.audio, ...(parsed.settings?.audio ?? {}) },
          assists: { ...fresh.settings.assists, ...(parsed.settings?.assists ?? {}) },
        },
        garage: parsed.garage && parsed.garage.length ? parsed.garage : fresh.garage,
      };
    } catch {
      return newSave();
    }
  }

  save(): void {
    try {
      localStorage.setItem(KEY, JSON.stringify(this.data));
    } catch {
      /* storage unavailable (private mode): the session simply is not persisted */
    }
  }

  reset(): void {
    this.data = newSave();
    this.save();
  }

  get selected(): OwnedCar {
    return this.data.garage[Math.min(this.data.selectedCar, this.data.garage.length - 1)];
  }

  bestLap(trackId: string, carSpecId?: string): number | null {
    let best: number | null = null;
    for (const r of this.data.records) {
      if (r.trackId !== trackId) continue;
      if (carSpecId && r.carSpecId !== carSpecId) continue;
      if (best === null || r.timeMs < best) best = r.timeMs;
    }
    return best;
  }

  /** Records a lap; returns true when it is a new track record for that car. */
  recordLap(trackId: string, carSpecId: string, timeMs: number): boolean {
    const prev = this.bestLap(trackId, carSpecId);
    if (prev !== null && prev <= timeMs) return false;
    this.data.records = this.data.records.filter(
      (r) => !(r.trackId === trackId && r.carSpecId === carSpecId),
    );
    this.data.records.push({ trackId, carSpecId, timeMs, dateIso: new Date().toISOString() });
    this.save();
    return true;
  }
}
