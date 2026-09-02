import type {
  CameraMode,
  CarSpec,
  CarTuning,
  DeviceBinding,
  GameSettings,
  InputAction,
  InputMapping,
  OwnedCar,
  RaceConfig,
  SaveData,
  TrackIndexEntry,
} from './types';
import type { GameFacade, ScreenName, UiController, UpgradeInfo } from '../ui/UiContract';
import { createUi } from '../ui';
import { createAudioEngine } from '../audio';
import type { AudioEngine } from '../audio/AudioContract';
import { SaveStore } from './Save';
import { InputManager } from './Input';
import { Economy, upgradeCatalogue } from './Economy';
import { CARS, carById } from '../data/cars';
import { EVENTS, eventById, type RaceEvent } from '../data/events';
import { performancePoints, peakPowerKw } from '../physics/Tuning';
import { SceneRenderer } from '../render/SceneRenderer';
import { Showroom } from '../render/Showroom';
import { Track, loadTrackJson } from '../track/Track';
import { RaceRuntime } from '../race/RaceRuntime';
import { buildEntries } from '../race/RaceFactory';
import type { RaceResult } from './types';

/** Top-level orchestrator: owns every subsystem and implements the UI facade. */
export class GameApp implements GameFacade {
  readonly store = new SaveStore();
  readonly input: InputManager;
  readonly renderer: SceneRenderer;
  readonly audio: AudioEngine;
  readonly ui: UiController;
  private readonly showroomView: Showroom;
  private readonly economy: Economy;
  private tracksIndex: TrackIndexEntry[] = [];
  private screen: ScreenName = 'title';
  private race: RaceRuntime | null = null;
  private lastConfig: RaceConfig | null = null;
  private lastTime = performance.now();
  private loading = false;

  constructor(canvas: HTMLCanvasElement, uiRoot: HTMLElement) {
    this.input = new InputManager(this.save.inputMappings);
    this.renderer = new SceneRenderer(canvas, this.save.settings.graphics);
    this.audio = createAudioEngine();
    this.audio.setSettings(this.save.settings.audio);
    this.showroomView = new Showroom(this.renderer);
    this.renderer.scene.add(this.showroomView.group);
    this.economy = new Economy(this.save);
    this.ui = createUi(this, uiRoot);
    this.applyInputSettings();
  }

  get save(): SaveData {
    return this.store.data;
  }

  async boot(): Promise<void> {
    try {
      const res = await fetch(`${import.meta.env.BASE_URL}tracks/index.json`);
      this.tracksIndex = res.ok ? ((await res.json()) as TrackIndexEntry[]) : [];
    } catch {
      this.tracksIndex = [];
    }
    this.showScreen('title');
    this.scheduleFrame();
  }

  /** Debug: lets the AI drive the player's car (testing and demos). */
  autopilot = false;

  /** Debug: advances the race synchronously by `seconds` (for automated testing). */
  debugAdvance(seconds: number): void {
    if (!this.race) return;
    const steps = Math.round(seconds * 60);
    for (let i = 0; i < steps; i++) {
      this.input.update(1 / 60);
      const inp = this.input.state;
      if (this.autopilot) this.race.applyAutopilot(inp);
      this.race.update(1 / 60, inp, this.input);
      if (this.race.consumeFinish()) this.onRaceFinished();
    }
    this.ui.updateHud(this.race.hud);
  }

  /** Rolling timing stats for profiling (ms). */
  readonly stats = { frame: 0, sim: 0, render: 0, ui: 0, fps: 0 };

  private frame(): void {
    const now = performance.now();
    const dt = Math.min(0.1, (now - this.lastTime) / 1000);
    this.lastTime = now;
    const t0 = performance.now();
    this.frameBody(dt);
    const t1 = performance.now();
    this.renderer.render();
    const t2 = performance.now();
    this.stats.render = this.stats.render * 0.9 + (t2 - t1) * 0.1;
    this.stats.frame = this.stats.frame * 0.9 + (t2 - t0) * 0.1;
    this.stats.fps = this.stats.fps * 0.95 + (dt > 0 ? 1 / dt : 0) * 0.05;
    this.scheduleFrame();
  }

  /** rAF normally; a timer when the tab is hidden so the simulation keeps running. */
  private scheduleFrame(): void {
    if (document.hidden) window.setTimeout(() => this.frame(), 16);
    else requestAnimationFrame(() => this.frame());
  }

  private frameBody(dt: number): void {
    this.input.update(dt);
    const inp = this.input.state;
    if (this.race && this.screen === 'replay') {
      if (inp.camera) this.replayControl('camera');
      if (inp.pause || inp.menuBack) this.exitReplay();
      this.race.updateReplay(dt);
      this.ui.handleInput(inp);
    } else if (this.race && this.screen === 'race') {
      if (inp.pause) this.togglePause();
      if (inp.camera) this.cycleCamera();
      if (inp.reset) this.race.session.player.vehicle.resetToTrack();
      const s0 = performance.now();
      if (this.autopilot) this.race.applyAutopilot(inp);
      this.race.update(dt, inp, this.input);
      const s1 = performance.now();
      this.ui.updateHud(this.race.hud);
      this.stats.sim = this.stats.sim * 0.9 + (s1 - s0) * 0.1;
      this.stats.ui = this.stats.ui * 0.9 + (performance.now() - s1) * 0.1;
      if (this.race.consumeFinish()) this.onRaceFinished();
    } else if (this.race && this.screen === 'pause' && inp.pause) {
      this.resumeRace();
    } else {
      this.ui.handleInput(inp);
    }
    if (this.showroomView.group.visible) this.showroomView.update(dt);
  }

  private showScreen(name: ScreenName, data?: unknown): void {
    this.screen = name;
    this.ui.showScreen(name, data);
    const inMenu = name !== 'race' && name !== 'pause' && name !== 'loading' && name !== 'results';
    this.audio.setMenuMusic(inMenu || name === 'results');
    this.audio.setRaceActive(name === 'race');
  }

  currentScreen(): ScreenName {
    return this.screen;
  }

  // ---- data access -------------------------------------------------------
  cars(): CarSpec[] {
    return CARS;
  }
  carById(id: string): CarSpec {
    return carById(id);
  }
  tracks(): TrackIndexEntry[] {
    return this.tracksIndex;
  }
  events(): RaceEvent[] {
    return EVENTS.filter((e) => this.tracksIndex.some((t) => t.id === e.trackId));
  }
  eventUnlocked(id: string): boolean {
    const ev = eventById(id);
    if (!ev || !ev.requires) return true;
    return !!this.save.completedEvents[ev.requires];
  }
  performancePoints(spec: CarSpec, tuning: CarTuning): number {
    return performancePoints(spec, tuning);
  }
  peakPowerKw(spec: CarSpec, tuning: CarTuning): number {
    return peakPowerKw(spec, [1, 1.08, 1.17, 1.28][tuning.powerStage]);
  }
  upgrades(): UpgradeInfo[] {
    return upgradeCatalogue(this.ownedCarSpec(this.store.selected));
  }
  ownedCarSpec(car: OwnedCar): CarSpec {
    return carById(car.specId);
  }
  bestLap(trackId: string, carSpecId?: string): number | null {
    return this.store.bestLap(trackId, carSpecId);
  }

  // ---- garage / shop -----------------------------------------------------
  buyCar(specId: string, color: string): string | null {
    const err = this.economy.buyCar(specId, color);
    if (!err) {
      this.store.save();
      this.audio.playUi('buy');
      this.ui.refresh();
    } else this.audio.playUi('error');
    return err;
  }
  sellCar(index: number): string | null {
    const err = this.economy.sellCar(index);
    if (!err) {
      this.store.save();
      this.ui.refresh();
    }
    return err;
  }
  selectCar(index: number): void {
    if (this.save.garage[index]) {
      this.save.selectedCar = index;
      this.store.save();
    }
  }
  buyUpgrade(index: number, kind: UpgradeInfo['kind'], stage: number): string | null {
    const err = this.economy.buyUpgrade(index, kind, stage);
    if (!err) {
      this.store.save();
      this.audio.playUi('buy');
      this.ui.refresh();
    } else this.audio.playUi('error');
    return err;
  }
  setTuning(index: number, patch: Partial<CarTuning>): void {
    const car = this.save.garage[index];
    if (!car) return;
    Object.assign(car.tuning, patch);
    this.store.save();
    if (patch.color) this.showroomView.show(this.ownedCarSpec(car), car.tuning.color);
  }

  // ---- settings & input --------------------------------------------------
  updateSettings(patch: Partial<GameSettings>): void {
    const s = this.save.settings;
    Object.assign(s, patch);
    if (patch.graphics) {
      s.graphics = { ...s.graphics, ...patch.graphics };
      this.renderer.applySettings(s.graphics);
      this.race?.camera.setBaseFov(s.graphics.fov);
    }
    if (patch.audio) {
      s.audio = { ...s.audio, ...patch.audio };
      this.audio.setSettings(s.audio);
    }
    if (patch.assists) s.assists = { ...s.assists, ...patch.assists };
    if (this.race) {
      this.race.session.player.vehicle.assists = s.assists;
      this.race.session.player.vehicle.transmission = s.transmission;
      this.race.setRacingLineVisible(s.assists.racingLine);
    }
    this.applyInputSettings();
    this.store.save();
  }
  private applyInputSettings(): void {
    const s = this.save.settings;
    this.input.steeringSensitivity = s.steeringSensitivity;
    this.input.wheelRotationDeg = s.wheelRotationDeg;
    this.input.setForceFeedback(s.wheelForceFeedback > 0.05);
  }
  setCameraMode(mode: CameraMode): void {
    this.save.settings.cameraMode = mode;
    if (this.race) {
      this.race.camera.mode = mode;
      this.race.camera.snap();
    }
    this.store.save();
  }
  cameraMode(): CameraMode {
    return this.race ? this.race.camera.mode : this.save.settings.cameraMode;
  }
  private cycleCamera(): void {
    if (!this.race) return;
    this.save.settings.cameraMode = this.race.camera.cycle();
    this.store.save();
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
  inputMappings(): Record<string, InputMapping> {
    return this.save.inputMappings;
  }
  setBinding(
    deviceId: string,
    deviceType: 'gamepad' | 'wheel',
    action: InputAction,
    binding: DeviceBinding,
  ): void {
    const m = this.save.inputMappings[deviceId] ?? { deviceId, deviceType, bindings: {} };
    m.deviceType = deviceType;
    m.bindings[action] = binding;
    this.save.inputMappings[deviceId] = m;
    this.input.setMappings(this.save.inputMappings);
    this.store.save();
  }
  clearMapping(deviceId: string): void {
    delete this.save.inputMappings[deviceId];
    this.input.setMappings(this.save.inputMappings);
    this.store.save();
  }
  resetSave(): void {
    this.store.reset();
    this.ui.refresh();
  }
  playUiSound(kind: 'move' | 'confirm' | 'back' | 'buy' | 'error'): void {
    if (kind === 'confirm' && this.screen === 'title') void this.audio.resume();
    this.audio.playUi(kind);
  }
  showroom(specId: string | null, color?: string): void {
    void this.showroomView.show(specId ? carById(specId) : null, color);
  }

  // ---- racing ------------------------------------------------------------
  startEvent(eventId: string): string | null {
    const ev = eventById(eventId);
    if (!ev) return 'That event is not available.';
    if (!this.eventUnlocked(eventId)) return 'Finish the previous event in this series first.';
    const car = this.store.selected;
    const spec = this.ownedCarSpec(car);
    if (!ev.allowedClasses.includes(spec.carClass)) {
      return `The ${spec.name} is a ${spec.carClass} car. This event is for ${ev.allowedClasses.join(', ')} cars.`;
    }
    const pp = performancePoints(spec, car.tuning);
    if (ev.ppLimit !== null && pp > ev.ppLimit) {
      return `Your car is ${pp} PP but this event allows up to ${ev.ppLimit} PP. Fit softer tyres or remove upgrades in the Tuning Shop.`;
    }
    this.startRace({
      mode: 'race',
      trackId: ev.trackId,
      laps: ev.laps,
      opponents: ev.opponents,
      difficulty: ev.difficulty,
      timeOfDay: ev.timeOfDay,
      weather: 'clear',
      playerCarId: String(this.save.selectedCar),
      opponentClass: ev.opponentClass,
      eventId: ev.id,
      rollingStart: false,
      transmission: this.save.settings.transmission,
    });
    return null;
  }

  startRace(config: RaceConfig): void {
    if (this.loading) return;
    this.lastConfig = config;
    void this.loadRace(config);
  }

  private async loadRace(config: RaceConfig): Promise<void> {
    this.loading = true;
    this.disposeRace();
    this.showroomView.show(null);
    this.showScreen('loading', {
      trackName: this.tracksIndex.find((t) => t.id === config.trackId)?.name ?? config.trackId,
    });
    this.ui.setLoading(0.02, 'Loading circuit data');
    try {
      const json = await loadTrackJson(config.trackId);
      const track = new Track(json);
      const owned = this.store.selected;
      const spec = this.ownedCarSpec(owned);
      const entries = buildEntries(config, owned, spec, this.save.driverName);
      const s = this.save.settings;
      this.renderer.setLighting(config.timeOfDay, config.weather);
      const rt = await RaceRuntime.load(
        track,
        config,
        entries,
        s.assists,
        config.transmission,
        this.renderer,
        this.audio,
        s.graphics.quality,
        (p, t) => this.ui.setLoading(p, t),
      );
      this.race = rt;
      rt.camera.mode = s.cameraMode;
      rt.camera.setBaseFov(s.graphics.fov);
      rt.setRacingLineVisible(s.assists.racingLine);
      this.renderer.scene.add(rt.group);
      this.audio.setRaceAmbience(true);
      this.showScreen('race');
    } catch (err) {
      console.error(err);
      this.ui.showToast('The circuit could not be loaded. Please try another track.');
      this.showScreen('home');
    } finally {
      this.loading = false;
    }
  }

  private onRaceFinished(): void {
    if (!this.race) return;
    const result: RaceResult = this.race.session.results();
    const cfg = this.race.config;
    const car = this.store.selected;
    if (result.bestLapMs !== null)
      result.newRecord = this.store.recordLap(cfg.trackId, car.specId, result.bestLapMs);
    if (cfg.mode === 'race') {
      let credits = result.creditsEarned;
      if (cfg.eventId) {
        const ev = eventById(cfg.eventId);
        if (ev) {
          const pos = result.playerPosition;
          credits = pos <= 3 ? ev.payoutCr[pos - 1] : Math.round(ev.payoutCr[2] * 0.25);
          const prev = this.save.completedEvents[ev.id];
          this.save.completedEvents[ev.id] = {
            bestPosition: Math.min(prev?.bestPosition ?? 99, pos),
            count: (prev?.count ?? 0) + 1,
          };
        }
      }
      result.creditsEarned = credits;
      this.save.credits += credits;
      this.save.totalRaces += 1;
    }
    car.odometerM += this.race.session.player.distance;
    this.save.totalDistanceM += this.race.session.player.distance;
    this.store.save();
    window.setTimeout(() => {
      if (this.race) {
        this.screen = 'results';
        this.ui.showResults(result);
        this.audio.setRaceActive(false);
        this.audio.setMenuMusic(true);
      }
    }, 2500);
  }

  quitToHome(): void {
    this.disposeRace();
    this.renderer.setLighting('noon', 'clear');
    this.showScreen('home');
  }
  restartRace(): void {
    if (this.lastConfig) this.startRace(this.lastConfig);
  }
  resumeRace(): void {
    if (!this.race) return;
    this.race.session.paused = false;
    this.showScreen('race');
  }
  togglePause(): void {
    if (!this.race) return;
    if (this.screen === 'race') {
      this.race.session.paused = true;
      this.showScreen('pause');
    } else this.resumeRace();
  }
  private disposeRace(): void {
    if (!this.race) return;
    this.renderer.scene.remove(this.race.group);
    this.race.dispose();
    this.race = null;
    this.audio.setRaceAmbience(false);
  }

  // ---- replay ------------------------------------------------------------
  startReplay(): void {
    if (!this.race) return;
    this.race.startReplay();
    this.audio.setRaceActive(true);
    this.showScreen('replay');
  }
  exitReplay(): void {
    if (!this.race) return;
    this.screen = 'results';
    this.ui.showResults(this.race.session.results());
    this.audio.setRaceActive(false);
    this.audio.setMenuMusic(true);
  }
  replayControl(action: 'toggle' | 'faster' | 'slower' | 'camera' | 'restart' | 'nextCar'): void {
    const r = this.race?.replay;
    if (!r || !this.race) return;
    const speeds = [0.25, 0.5, 1, 2, 4];
    const i = speeds.indexOf(r.speed);
    if (action === 'toggle') r.playing = !r.playing;
    else if (action === 'faster') r.speed = speeds[Math.min(speeds.length - 1, i + 1)];
    else if (action === 'slower') r.speed = speeds[Math.max(0, i - 1)];
    else if (action === 'restart') {
      r.seek(0);
      r.playing = true;
    } else if (action === 'camera')
      this.race.replayCamera = this.race.replayCamera === 'tv' ? 'chase' : 'tv';
    else if (action === 'nextCar')
      this.race.replaySubject =
        (this.race.replaySubject + 1) % this.race.session.participants.length;
  }
  replayState() {
    const r = this.race?.replay;
    const subject = this.race
      ? this.race.session.participants[this.race.replaySubject].entry.name
      : '';
    return {
      timeS: r?.time ?? 0,
      durationS: r?.duration ?? 0,
      playing: r?.playing ?? false,
      speed: r?.speed ?? 1,
      camera: this.race?.replayCamera === 'chase' ? 'Chase' : 'TV',
      subject,
    };
  }

  trackOutline(): [number, number][] {
    return this.race ? this.race.trackScene.minimap.outline : [];
  }
  minimapPoint(sFraction: number, lateral: number): [number, number] {
    if (!this.race) return [0, 0];
    const t = this.race.track;
    const idx = t.indexAt(sFraction * t.length);
    const p = t.points[idx];
    const r = t.rights[idx];
    return this.race.trackScene.minimap.project(p.x + r.x * lateral, p.z + r.z * lateral);
  }
  loadedTrackName(): string {
    return this.race?.track.name ?? '';
  }
}
