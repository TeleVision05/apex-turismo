// Standalone mock GameFacade for previewing src/ui in isolation. Not part of
// the shipped game — only used by tools/uipreview/main.ts via `npm run dev`.
import { CARS, carById as dataCarById } from '../../src/data/cars';
import { EVENTS } from '../../src/data/events';
import {
  defaultTuning,
  peakPowerKw as calcPeakPowerKw,
  performancePoints as calcPP,
  POWER_STAGES,
  WEIGHT_STAGES,
} from '../../src/physics/Tuning';
import { defaultSettings } from '../../src/core/Save';
import { InputManager } from '../../src/core/Input';
import type { GameFacade, ScreenName, UpgradeInfo } from '../../src/ui/UiContract';
import type { UiController } from '../../src/ui/UiContract';
import type {
  CarSpec,
  CarTuning,
  DeviceBinding,
  InputAction,
  OwnedCar,
  RaceConfig,
  SaveData,
} from '../../src/core/types';

const OWNED_IDS = ['sakura_86', 'hakone_type_r', 'aurelia_gt3'];

function freshSave(): SaveData {
  const garage: OwnedCar[] = OWNED_IDS.map((id, i) => ({
    specId: id,
    tuning: defaultTuning(dataCarById(id)),
    odometerM: 1200_000 * (i + 1) * 0.7,
  }));
  return {
    version: 1,
    credits: 150000,
    garage,
    selectedCar: 0,
    records: [
      {
        trackId: 'tsukuba',
        carSpecId: 'sakura_86',
        timeMs: 62340,
        dateIso: new Date().toISOString(),
      },
      {
        trackId: 'suzuka',
        carSpecId: 'hakone_type_r',
        timeMs: 128900,
        dateIso: new Date().toISOString(),
      },
    ],
    completedEvents: { sunday_tsukuba: { bestPosition: 1, count: 2 } },
    settings: defaultSettings(),
    totalRaces: 4,
    totalDistanceM: 82000,
    inputMappings: {},
    driverName: 'Preview Driver',
  };
}

const MOCK_TRACKS = [
  {
    id: 'tsukuba',
    name: 'Tsukuba Circuit',
    country: 'Japan',
    lengthM: 2045,
    direction: 'clockwise',
    corners: 9,
    elevationRangeM: 8,
  },
  {
    id: 'brands_hatch',
    name: 'Brands Hatch',
    country: 'United Kingdom',
    lengthM: 3908,
    direction: 'clockwise',
    corners: 12,
    elevationRangeM: 30,
  },
  {
    id: 'laguna_seca',
    name: 'Laguna Seca',
    country: 'United States',
    lengthM: 3602,
    direction: 'clockwise',
    corners: 11,
    elevationRangeM: 55,
  },
  {
    id: 'suzuka',
    name: 'Suzuka Circuit',
    country: 'Japan',
    lengthM: 5807,
    direction: 'clockwise',
    corners: 18,
    elevationRangeM: 40,
  },
  {
    id: 'monza',
    name: 'Monza',
    country: 'Italy',
    lengthM: 5793,
    direction: 'clockwise',
    corners: 11,
    elevationRangeM: 12,
  },
  {
    id: 'spa',
    name: 'Spa-Francorchamps',
    country: 'Belgium',
    lengthM: 7004,
    direction: 'clockwise',
    corners: 20,
    elevationRangeM: 100,
  },
];

function trackPoint(s: number): [number, number] {
  const t = s * Math.PI * 2;
  const u = 0.5 + 0.4 * Math.cos(t) + 0.05 * Math.sin(t * 2);
  const v = 0.5 + 0.3 * Math.sin(t) + 0.04 * Math.cos(t * 3);
  return [u, v];
}

const DRIVER_NAMES = [
  'A. Rossi',
  'M. Chen',
  'K. Nakajima',
  'L. Bianchi',
  'S. Weber',
  'J. Silva',
  'T. Novak',
  'O. Fischer',
  'R. Costa',
  'H. Park',
  'D. Kim',
  'F. Martin',
];

/** Mock implementation of GameFacade for the UI preview harness. */
export class MockFacade implements GameFacade {
  save: SaveData = freshSave();
  private ui!: UiController;
  private input = new InputManager({});
  private screenName: ScreenName = 'title';
  private raceConfig: RaceConfig | null = null;
  private raceStartMs = 0;
  private paused = false;
  private pausedAtMs = 0;
  private replay = {
    timeS: 0,
    durationS: 96,
    playing: true,
    speed: 1,
    camera: 'tv',
    subject: 'A. Rossi',
  };
  private cameraModeValue: import('../../src/core/types').CameraMode = 'chase';

  bindUi(ui: UiController): void {
    this.ui = ui;
  }

  private nav(name: ScreenName, data?: unknown): void {
    this.screenName = name;
    this.ui.showScreen(name, data);
  }

  /**
   * Debug-toolbar-only jump: unlike `nav`, this also clears any in-progress
   * race so a stale `raceMode()` doesn't keep feeding the HUD (and
   * eventually auto-finishing the race) in the background after the
   * toolbar jumps somewhere that isn't the race/pause/results/replay flow.
   */
  debugJump(name: ScreenName): void {
    this.screenName = name;
    this.raceConfig = null;
    this.paused = false;
    this.ui.showScreen(name);
  }

  // ---- rosters -------------------------------------------------------
  cars(): CarSpec[] {
    return CARS;
  }

  carById(id: string): CarSpec {
    return dataCarById(id);
  }

  tracks(): typeof MOCK_TRACKS {
    return MOCK_TRACKS;
  }

  events() {
    return EVENTS;
  }

  eventUnlocked(id: string): boolean {
    const ev = EVENTS.find((e) => e.id === id);
    if (!ev) return false;
    if (!ev.requires) return true;
    return !!this.save.completedEvents[ev.requires];
  }

  performancePoints(spec: CarSpec, tuning: CarTuning): number {
    return calcPP(spec, tuning);
  }

  peakPowerKw(spec: CarSpec, tuning: CarTuning): number {
    return calcPeakPowerKw(spec, POWER_STAGES[tuning.powerStage]);
  }

  upgrades(): UpgradeInfo[] {
    return [
      {
        kind: 'power',
        label: 'Engine tuning',
        stages: POWER_STAGES.map((_mul, i) => ({
          label: `Stage ${i}`,
          priceCr: i === 0 ? 0 : i * 8000,
        })),
      },
      {
        kind: 'weight',
        label: 'Weight reduction',
        stages: WEIGHT_STAGES.map((_mul, i) => ({
          label: `Stage ${i}`,
          priceCr: i === 0 ? 0 : i * 6000,
        })),
      },
      {
        kind: 'tyres',
        label: 'Tyres',
        stages: [
          { label: 'Comfort', priceCr: 0 },
          { label: 'Sport', priceCr: 3000 },
          { label: 'Racing', priceCr: 9000 },
        ],
      },
    ];
  }

  // ---- garage / dealership -------------------------------------------
  buyCar(specId: string, color: string): string | null {
    const spec = dataCarById(specId);
    if (this.save.credits < spec.priceCr) return "You don't have enough credits for this car.";
    this.save.credits -= spec.priceCr;
    this.save.garage.push({ specId, tuning: { ...defaultTuning(spec), color }, odometerM: 0 });
    return null;
  }

  sellCar(garageIndex: number): string | null {
    if (this.save.garage.length <= 1) return 'You need at least one car in your garage.';
    const owned = this.save.garage[garageIndex];
    if (!owned) return 'That car could not be found.';
    const spec = dataCarById(owned.specId);
    this.save.credits += Math.round(spec.priceCr * 0.5);
    this.save.garage.splice(garageIndex, 1);
    if (this.save.selectedCar >= this.save.garage.length)
      this.save.selectedCar = this.save.garage.length - 1;
    return null;
  }

  selectCar(garageIndex: number): void {
    this.save.selectedCar = garageIndex;
  }

  ownedCarSpec(car: OwnedCar): CarSpec {
    return dataCarById(car.specId);
  }

  buyUpgrade(garageIndex: number, kind: UpgradeInfo['kind'], stage: number): string | null {
    const owned = this.save.garage[garageIndex];
    if (!owned) return 'That car could not be found.';
    const info = this.upgrades().find((u) => u.kind === kind)!;
    const price = info.stages[stage]?.priceCr ?? 0;
    if (this.save.credits < price) return 'Not enough credits for this upgrade.';
    this.save.credits -= price;
    if (kind === 'power') owned.tuning.powerStage = stage as 0 | 1 | 2 | 3;
    else if (kind === 'weight') owned.tuning.weightStage = stage as 0 | 1 | 2 | 3;
    else owned.tuning.tyres = (['comfort', 'sport', 'racing'] as const)[stage];
    return null;
  }

  setTuning(garageIndex: number, tuning: Partial<CarTuning>): void {
    const owned = this.save.garage[garageIndex];
    if (owned) Object.assign(owned.tuning, tuning);
  }

  // ---- racing ----------------------------------------------------------
  startRace(config: RaceConfig): void {
    this.raceConfig = config;
    this.paused = false;
    this.nav('loading');
    let p = 0;
    const step = (): void => {
      p += 0.05 + Math.random() * 0.05;
      this.ui.setLoading(
        Math.min(1, p),
        p < 1 ? `Preparing ${this.loadedTrackName()}...` : 'Ready',
      );
      if (p < 1) window.setTimeout(step, 90);
      else {
        this.raceStartMs = performance.now();
        this.nav('race');
      }
    };
    step();
  }

  startEvent(eventId: string): string | null {
    const ev = EVENTS.find((e) => e.id === eventId);
    if (!ev) return 'That event could not be found.';
    const owned = this.save.garage[this.save.selectedCar];
    const spec = owned && dataCarById(owned.specId);
    if (!spec || !ev.allowedClasses.includes(spec.carClass))
      return 'Your car is not the right class for this event.';
    const pp = owned ? this.performancePoints(spec, owned.tuning) : 0;
    if (ev.ppLimit && pp > ev.ppLimit)
      return 'Your car exceeds the Performance Points limit for this event.';
    this.startRace({
      mode: 'race',
      trackId: ev.trackId,
      laps: ev.laps,
      opponents: ev.opponents,
      difficulty: ev.difficulty,
      timeOfDay: ev.timeOfDay,
      weather: 'clear',
      playerCarId: String(this.save.selectedCar),
      eventId,
      rollingStart: false,
      transmission: this.save.settings.transmission,
    });
    return null;
  }

  quitToHome(): void {
    this.raceConfig = null;
    this.nav('home');
  }

  resumeRace(): void {
    if (this.paused) this.raceStartMs += performance.now() - this.pausedAtMs;
    this.paused = false;
    this.nav('race');
  }

  restartRace(): void {
    if (this.raceConfig) this.startRace(this.raceConfig);
  }

  togglePause(): void {
    if (this.paused) this.resumeRace();
    else {
      this.paused = true;
      this.pausedAtMs = performance.now();
      this.nav('pause');
    }
  }

  isPaused(): boolean {
    return this.paused;
  }

  updateSettings(patch: Partial<SaveData['settings']>): void {
    Object.assign(this.save.settings, patch);
  }

  setCameraMode(mode: import('../../src/core/types').CameraMode): void {
    this.cameraModeValue = mode;
    this.save.settings.cameraMode = mode;
  }

  cameraMode(): import('../../src/core/types').CameraMode {
    return this.cameraModeValue;
  }

  showroom(specId: string | null, color?: string): void {
    const bg = document.getElementById('showroom-label');
    if (!bg) return;
    if (!specId) {
      bg.textContent = '';
      return;
    }
    const spec = dataCarById(specId);
    bg.textContent = `Showroom: ${spec.name} (${color ?? spec.defaultColor})`;
    bg.style.color = color ?? spec.defaultColor;
  }

  // ---- input -------------------------------------------------------
  inputManager(): InputManager {
    return this.input;
  }

  inputDevices() {
    return this.input.devices();
  }

  captureBinding(): Promise<DeviceBinding & { deviceId: string }> {
    return this.input.captureBinding();
  }

  cancelCapture(): void {
    this.input.cancelCapture();
  }

  inputMappings() {
    return this.save.inputMappings;
  }

  setBinding(
    deviceId: string,
    deviceType: 'gamepad' | 'wheel',
    action: InputAction,
    binding: DeviceBinding,
  ): void {
    const existing = this.save.inputMappings[deviceId] ?? { deviceId, deviceType, bindings: {} };
    existing.bindings[action] = binding;
    this.save.inputMappings[deviceId] = existing;
    this.input.setMappings(this.save.inputMappings);
  }

  clearMapping(deviceId: string): void {
    delete this.save.inputMappings[deviceId];
    this.input.setMappings(this.save.inputMappings);
  }

  resetSave(): void {
    this.save = freshSave();
  }

  playUiSound(): void {
    /* no audio in the preview harness */
  }

  bestLap(trackId: string, carSpecId?: string): number | null {
    const matches = this.save.records.filter(
      (r) => r.trackId === trackId && (!carSpecId || r.carSpecId === carSpecId),
    );
    if (!matches.length) return null;
    return Math.min(...matches.map((r) => r.timeMs));
  }

  currentScreen(): ScreenName {
    return this.screenName;
  }

  trackOutline(): [number, number][] {
    if (!this.raceConfig) return [];
    const pts: [number, number][] = [];
    for (let i = 0; i <= 120; i++) pts.push(trackPoint(i / 120));
    return pts;
  }

  minimapPoint(sFraction: number, lateral: number): [number, number] {
    const [u, v] = trackPoint(sFraction);
    const off = Math.max(-1, Math.min(1, lateral / 6)) * 0.015;
    return [u + off, v + off];
  }

  loadedTrackName(): string {
    if (!this.raceConfig) return '';
    return (
      MOCK_TRACKS.find((t) => t.id === this.raceConfig!.trackId)?.name ?? this.raceConfig.trackId
    );
  }

  // ---- replay -------------------------------------------------------
  // Deliberately does NOT navigate the UI here: like startRace/quitToHome,
  // the *screen* transition is the UI's own responsibility (results.ts
  // calls `ctx.show('replay')` right after this; replay.ts calls
  // `ctx.back()` right after exitReplay()). Only `screenName` bookkeeping
  // happens here, for `raceMode()`/`currentScreen()`.
  startReplay(): void {
    this.replay.timeS = 0;
    this.replay.playing = true;
    this.screenName = 'replay';
  }

  exitReplay(): void {
    this.screenName = 'results';
  }

  replayControl(action: 'toggle' | 'faster' | 'slower' | 'camera' | 'restart' | 'nextCar'): void {
    const speeds = [0.5, 1, 2, 4];
    if (action === 'toggle') this.replay.playing = !this.replay.playing;
    else if (action === 'faster') {
      const i = Math.min(speeds.length - 1, speeds.indexOf(this.replay.speed) + 1);
      this.replay.speed = speeds[i];
    } else if (action === 'slower') {
      const i = Math.max(0, speeds.indexOf(this.replay.speed) - 1);
      this.replay.speed = speeds[i];
    } else if (action === 'camera')
      this.replay.camera = this.replay.camera === 'tv' ? 'chase' : 'tv';
    else if (action === 'restart') this.replay.timeS = 0;
    else if (action === 'nextCar') {
      const i = (DRIVER_NAMES.indexOf(this.replay.subject) + 1) % DRIVER_NAMES.length;
      this.replay.subject = DRIVER_NAMES[i];
    }
  }

  replayState() {
    return { ...this.replay };
  }

  // ---- driven by the harness loop ------------------------------------
  tickReplay(dt: number): void {
    if (this.screenName !== 'replay' || !this.replay.playing) return;
    this.replay.timeS = Math.min(this.replay.durationS, this.replay.timeS + dt * this.replay.speed);
  }

  raceMode(): 'race' | 'paused' | 'none' {
    if (this.screenName === 'race') return 'race';
    if (this.screenName === 'pause') return 'paused';
    return 'none';
  }

  raceElapsedS(): number {
    const now = this.paused ? this.pausedAtMs : performance.now();
    return (now - this.raceStartMs) / 1000;
  }

  currentRaceConfig(): RaceConfig | null {
    return this.raceConfig;
  }

  finishRace(): void {
    const owned = this.save.garage[this.save.selectedCar];
    const spec = owned && dataCarById(owned.specId);
    this.ui.showResults({
      config: this.raceConfig!,
      entries: buildStandings(this.save.driverName, spec?.name ?? 'Car').map((s, i) => ({
        ...s,
        totalTimeMs: i === 0 ? 612340 + i * 1200 : null,
      })),
      playerPosition: 1,
      creditsEarned: 8500,
      newRecord: true,
      bestLapMs: 68210,
    });
    this.raceConfig = null;
    this.screenName = 'results';
  }
}

function buildStandings(playerName: string, carName: string) {
  return DRIVER_NAMES.slice(0, 8).map((name, i) => ({
    name: i === 0 ? playerName : name,
    carName: i === 0 ? carName : 'Rival GT',
    position: i + 1,
    lap: 4,
    gapMs: i === 0 ? null : i * 1240,
    bestLapMs: 68210 + i * 340,
    isPlayer: i === 0,
    finished: true,
  }));
}
