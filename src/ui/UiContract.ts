import type {
  CarSpec,
  CarTuning,
  GameSettings,
  HudState,
  InputMapping,
  InputState,
  OwnedCar,
  RaceConfig,
  RaceResult,
  SaveData,
  TrackIndexEntry,
  DeviceBinding,
  InputAction,
  CameraMode,
} from '../core/types';
import type { RaceEvent } from '../data/events';
import type { ConnectedDevice } from '../core/Input';

export type ScreenName =
  | 'title'
  | 'home'
  | 'garage'
  | 'dealership'
  | 'tuning'
  | 'events'
  | 'custom'
  | 'timetrial'
  | 'settings'
  | 'controls'
  | 'records'
  | 'loading'
  | 'race'
  | 'pause'
  | 'results'
  | 'replay';

export interface UpgradeInfo {
  kind: 'power' | 'weight' | 'tyres';
  label: string;
  stages: { label: string; priceCr: number }[];
}

/** Everything the UI can read and do. Implemented by GameApp. */
export interface GameFacade {
  readonly save: SaveData;
  cars(): CarSpec[];
  carById(id: string): CarSpec;
  tracks(): TrackIndexEntry[];
  events(): RaceEvent[];
  eventUnlocked(id: string): boolean;
  performancePoints(spec: CarSpec, tuning: CarTuning): number;
  peakPowerKw(spec: CarSpec, tuning: CarTuning): number;
  upgrades(): UpgradeInfo[];
  /** returns a user-facing error message or null on success */
  buyCar(specId: string, color: string): string | null;
  sellCar(garageIndex: number): string | null;
  selectCar(garageIndex: number): void;
  ownedCarSpec(car: OwnedCar): CarSpec;
  buyUpgrade(garageIndex: number, kind: UpgradeInfo['kind'], stage: number): string | null;
  setTuning(garageIndex: number, tuning: Partial<CarTuning>): void;
  startRace(config: RaceConfig): void;
  startEvent(eventId: string): string | null;
  quitToHome(): void;
  resumeRace(): void;
  restartRace(): void;
  togglePause(): void;
  updateSettings(patch: Partial<GameSettings>): void;
  setCameraMode(mode: CameraMode): void;
  cameraMode(): CameraMode;
  /** puts the selected car on the showroom turntable behind the menus */
  showroom(specId: string | null, color?: string): void;
  inputDevices(): ConnectedDevice[];
  captureBinding(): Promise<DeviceBinding & { deviceId: string }>;
  cancelCapture(): void;
  inputMappings(): Record<string, InputMapping>;
  setBinding(
    deviceId: string,
    deviceType: 'gamepad' | 'wheel',
    action: InputAction,
    binding: DeviceBinding,
  ): void;
  clearMapping(deviceId: string): void;
  resetSave(): void;
  playUiSound(kind: 'move' | 'confirm' | 'back' | 'buy' | 'error'): void;
  bestLap(trackId: string, carSpecId?: string): number | null;
  /** debug helper for testing: currently active screen */
  currentScreen(): ScreenName;
  /** outline of the loaded track as normalised [u, v] points in 0..1 (empty when no race is loaded) */
  trackOutline(): [number, number][];
  /** normalised minimap coordinates for a track fraction (0..1) and lateral offset in metres */
  minimapPoint(sFraction: number, lateral: number): [number, number];
  /** name of the loaded track and its corners for the loading screen / HUD */
  loadedTrackName(): string;
  /** replay of the race that just finished (available on the results screen) */
  startReplay(): void;
  exitReplay(): void;
  replayControl(action: 'toggle' | 'faster' | 'slower' | 'camera' | 'restart' | 'nextCar'): void;
  replayState(): {
    timeS: number;
    durationS: number;
    playing: boolean;
    speed: number;
    camera: string;
    subject: string;
  };
}

/** The UI layer. Implemented in src/ui, constructed with the facade. */
export interface UiController {
  showScreen(name: ScreenName, data?: unknown): void;
  updateHud(state: HudState): void;
  showResults(result: RaceResult): void;
  setLoading(progress: number, text: string): void;
  /** gamepad / keyboard navigation of the current screen, called every frame */
  handleInput(input: InputState): void;
  /** re-render the current screen after data changed (credits, garage...) */
  refresh(): void;
  showToast(text: string): void;
}
