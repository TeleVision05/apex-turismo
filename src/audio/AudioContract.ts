import type { AudioSettings } from '../core/types';

/** Per-frame description of a car the audio engine should voice. */
export interface CarAudioState {
  id: number;
  rpm: number;
  redlineRpm: number;
  throttle: number;
  gear: number;
  /** 0..1 how much the tyres are sliding (max over wheels) */
  skid: number;
  /** m/s */
  speed: number;
  /** position relative to the listener in metres: x right, y up, z forward(-) */
  relX: number;
  relY: number;
  relZ: number;
  isPlayer: boolean;
  /** true while the gearbox is between gears (for shift sounds) */
  shifting: boolean;
  onGrass: boolean;
  onCurb: boolean;
  /** engine character to pick a synthesis preset */
  engine: 'i4' | 'i6' | 'v6' | 'v8' | 'rotary' | 'flat6' | 'v8hybrid';
}

export interface AudioEngine {
  /** must be called from a user gesture before anything is heard */
  resume(): Promise<void>;
  setSettings(s: AudioSettings): void;
  /** update all active car voices; cars not listed fall silent */
  updateCars(cars: CarAudioState[], dt: number): void;
  playCollision(intensity: number, relX: number, relZ: number): void;
  playWallScrape(intensity: number): void;
  playUi(kind: 'move' | 'confirm' | 'back' | 'buy' | 'error' | 'countdown' | 'go'): void;
  setMenuMusic(on: boolean): void;
  setRaceAmbience(on: boolean): void;
  /** pause/resume all race sounds (menus, pause screen) */
  setRaceActive(active: boolean): void;
}
