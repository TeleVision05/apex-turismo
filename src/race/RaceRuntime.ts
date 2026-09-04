import { Group, Vector3 } from 'three';
import type {
  Assists,
  CarSpec,
  HudState,
  InputState,
  RaceConfig,
  Transmission,
} from '../core/types';
import { Track } from '../track/Track';
import { RaceSession, type RaceEntry } from './RaceSession';
import { RacingLine } from '../track/RacingLine';
import { CarVisual, loadCarModel } from '../render/CarVisual';
import { SkidMarks, SmokeParticles, RainParticles } from '../render/Effects';
import { CameraRig } from '../render/CameraRig';
import type { SceneRenderer } from '../render/SceneRenderer';
import { buildTrackScene, type TrackScene } from '../render/track/TrackScene';
import type { AudioEngine, CarAudioState } from '../audio/AudioContract';
import type { InputManager } from '../core/Input';
import { ReplayRecorder, type Replay } from './Replay';
import { AIDriver } from './AIDriver';
import { ReplayCameraDirector } from '../render/ReplayCamera';

export function emptyHud(): HudState {
  return {
    speedKmh: 0,
    rpm: 0,
    redlineRpm: 8000,
    gear: 0,
    throttle: 0,
    brake: 0,
    position: 1,
    totalCars: 1,
    lap: 1,
    totalLaps: 1,
    currentLapMs: 0,
    lastLapMs: null,
    bestLapMs: null,
    deltaToBestMs: null,
    sectorTimes: [null, null, null],
    gapAheadMs: null,
    gapBehindMs: null,
    countdown: null,
    message: null,
    finished: false,
    offTrack: false,
    abs: false,
    tcs: false,
    carProgress: [],
    standings: [],
    wrongWay: false,
    invalidLap: false,
  };
}

/**
 * Everything that lives while a race is on screen: simulation, car visuals,
 * effects, camera, audio feed. Created by GameApp.load and disposed on exit.
 */
export class RaceRuntime {
  readonly session: RaceSession;
  readonly group = new Group();
  readonly visuals: CarVisual[] = [];
  readonly skids = new SkidMarks();
  readonly smoke = new SmokeParticles();
  private rain: RainParticles | null = null;
  private readonly wind = new Vector3(2, 0, 1);
  readonly camera: CameraRig;
  readonly hud = emptyHud();
  private readonly audioStates: CarAudioState[] = [];
  private prevGear: number[] = [];
  private readonly rel = new Vector3();
  private readonly camForward = new Vector3();
  private readonly camRight = new Vector3();
  private readonly focus = new Vector3();
  private finishHandled = false;
  private startLightsShown = -1;
  private readonly recorder: ReplayRecorder;
  replay: Replay | null = null;
  private director: ReplayCameraDirector | null = null;
  replayCamera: 'tv' | 'chase' = 'tv';
  replaySubject = 0;

  private constructor(
    readonly track: Track,
    readonly config: RaceConfig,
    readonly trackScene: TrackScene,
    entries: RaceEntry[],
    assists: Assists,
    transmission: Transmission,
    private readonly renderer: SceneRenderer,
    private readonly audio: AudioEngine,
    line: RacingLine,
  ) {
    this.session = new RaceSession(track, config, entries, assists, transmission, line);
    this.camera = new CameraRig(renderer.camera);
    this.recorder = new ReplayRecorder(entries.length);
    for (const m of trackScene.roadMeshes) {
      m.receiveShadow = true;
      if (config.weather === 'rain') {
        const mat = m.material as { roughness?: number; envMapIntensity?: number };
        if (mat.roughness !== undefined) mat.roughness = 0.32;
        if (mat.envMapIntensity !== undefined) mat.envMapIntensity = 1.4;
      }
    }
    this.group.add(trackScene.group, this.skids.mesh, this.smoke.points);
    if (config.weather === 'rain') {
      this.rain = new RainParticles();
      this.group.add(this.rain.points);
    }
  }

  static async load(
    track: Track,
    config: RaceConfig,
    entries: RaceEntry[],
    assists: Assists,
    transmission: Transmission,
    renderer: SceneRenderer,
    audio: AudioEngine,
    quality: 'low' | 'medium' | 'high' | 'ultra',
    progress: (p: number, text: string) => void,
  ): Promise<RaceRuntime> {
    progress(0.1, 'Preparing racing line');
    await nextFrame();
    const line = new RacingLine(track);
    progress(0.2, 'Building circuit');
    await nextFrame();
    const trackScene = buildTrackScene(track, {
      quality,
      timeOfDay: config.timeOfDay,
      racingLine: line,
    });
    progress(0.45, 'Placing the grid');
    await nextFrame();
    const rt = new RaceRuntime(
      track,
      config,
      trackScene,
      entries,
      assists,
      transmission,
      renderer,
      audio,
      line,
    );
    const uniqueSpecs = [...new Map(entries.map((e) => [e.spec.id, e.spec])).values()];
    let done = 0;
    await Promise.all(
      uniqueSpecs.map(async (spec) => {
        await loadCarModel(spec);
        done++;
        progress(0.5 + (0.4 * done) / uniqueSpecs.length, `Loading ${spec.name}`);
      }),
    );
    for (const p of rt.session.participants) {
      const model = await loadCarModel(p.entry.spec);
      const vis = new CarVisual(model, p.entry.tuning.color, p.entry.isPlayer);
      vis.setNight(config.timeOfDay === 'night');
      if (config.timeOfDay === 'night' && p.entry.isPlayer) vis.enableHeadlamps(p.entry.spec);
      rt.visuals.push(vis);
      rt.group.add(vis.root);
      rt.audioStates.push(rt.audioStateFor(p.entry.spec, p.entry.isPlayer, rt.audioStates.length));
      rt.prevGear.push(1);
    }
    progress(0.95, 'Lights out soon');
    await nextFrame();
    rt.camera.snap();
    return rt;
  }

  private audioStateFor(spec: CarSpec, isPlayer: boolean, id: number): CarAudioState {
    return {
      id,
      rpm: spec.idleRpm,
      redlineRpm: spec.redlineRpm,
      throttle: 0,
      gear: 1,
      skid: 0,
      speed: 0,
      relX: 0,
      relY: 0,
      relZ: 0,
      isPlayer,
      shifting: false,
      onGrass: false,
      onCurb: false,
      engine: spec.engine,
    };
  }

  setRacingLineVisible(v: boolean): void {
    this.trackScene.setRacingLineVisible(v);
  }

  /** Per-frame: simulate, then sync visuals, camera, effects and audio. */
  update(dt: number, input: InputState, inputManager: InputManager): void {
    const s = this.session;
    s.update(dt, input);
    const vehicles = s.vehicles;
    if (!s.paused && s.state !== 'countdown') this.recorder.update(vehicles, dt);
    for (let i = 0; i < vehicles.length; i++) this.visuals[i].update(vehicles[i], dt);
    this.skids.update(vehicles);
    this.smoke.updateFromVehicles(vehicles, dt);
    const player = s.player.vehicle;
    this.camera.lookBack = input.lookBack;
    this.camera.update(player, dt);
    this.renderer.updateShadowTarget(player.pos);
    this.trackScene.update(dt, this.renderer.camera.position);
    this.updateDrivingLine();
    this.rain?.update(dt, this.renderer.camera.position, this.wind);
    this.updateStartLights();
    this.feedAudio(dt);
    this.rumble(inputManager, dt);
    s.hud(this.hud);
  }

  private static readonly RED: [number, number, number] = [0.95, 0.12, 0.1];
  private static readonly YELLOW: [number, number, number] = [0.95, 0.85, 0.15];
  private static readonly BLUE: [number, number, number] = [0.2, 0.6, 1.0];
  private static readonly DIM: [number, number, number] = [0.35, 0.35, 0.4];

  /**
   * GT-style dynamic driving line: red where the player must brake for what is
   * ahead at their current speed, blue where they can accelerate, yellow when
   * they are on the limit. Only the stretch around the player is recoloured.
   */
  private updateDrivingLine(): void {
    const v = this.session.player.vehicle;
    const line = this.session.line;
    const n = line.speed.length;
    const grip = v.tyres.mu * 0.97;
    const carFactor = Math.sqrt((grip * 0.9) / 1.38);
    const speed = Math.abs(v.speed);
    const start = v.query.index - 20;
    this.trackScene.recolorRacingLine(start, 220, (i) => {
      const k = (((i - start) % n) + n) % n;
      if (k < 20) return RaceRuntime.DIM;
      const allowed = line.speed[i] * carFactor;
      if (speed > allowed * 1.04) return RaceRuntime.RED;
      if (speed < allowed * 0.94) return RaceRuntime.BLUE;
      return RaceRuntime.YELLOW;
    });
  }

  private updateStartLights(): void {
    const s = this.session;
    const lights =
      s.state === 'countdown' ? Math.min(5, Math.max(0, 5 - Math.ceil(s.countdown))) : -1;
    if (lights !== this.startLightsShown) {
      this.startLightsShown = lights;
      this.trackScene.setStartLights(lights);
      if (lights > 0 && lights < 5) this.audio.playUi('countdown');
      if (lights === -1 && s.state === 'racing' && s.simTime < 1) this.audio.playUi('go');
    }
  }

  private feedAudio(dt: number): void {
    const cam = this.renderer.camera;
    cam.getWorldDirection(this.camForward);
    this.camRight.crossVectors(this.camForward, cam.up).normalize();
    const vehicles = this.session.vehicles;
    for (let i = 0; i < vehicles.length; i++) {
      const v = vehicles[i];
      const a = this.audioStates[i];
      a.rpm = v.rpm;
      a.throttle = v.controls.throttle;
      a.gear = v.gear;
      a.speed = Math.abs(v.speed);
      a.skid = Math.max(...v.wheels.map((w) => w.skid));
      a.onGrass = v.offTrackWheels >= 2;
      a.onCurb = v.wheels.some((w) => w.surface === 'curb');
      a.shifting = v.drivetrain.shiftTimer > 0 || this.prevGear[i] !== v.gear;
      this.prevGear[i] = v.gear;
      this.rel.subVectors(v.pos, cam.position);
      a.relX = this.rel.dot(this.camRight);
      a.relY = this.rel.y;
      a.relZ = -this.rel.dot(this.camForward);
    }
    this.audio.updateCars(this.audioStates, dt);
    for (const ev of this.session.collisionEvents) {
      const v = ev.a.spec === this.session.player.vehicle.spec ? ev.a : ev.b;
      this.rel.subVectors(v.pos, cam.position);
      this.audio.playCollision(
        Math.min(1, ev.impulse / 6000),
        this.rel.dot(this.camRight),
        -this.rel.dot(this.camForward),
      );
    }
    this.session.collisionEvents.length = 0;
    const p = this.session.player.vehicle;
    if (p.wallContact > 0.5) this.audio.playWallScrape(Math.min(1, p.wallContact / 8));
  }

  private rumbleTimer = 0;
  private rumble(input: InputManager, dt: number): void {
    const p = this.session.player.vehicle;
    this.rumbleTimer -= dt;
    if (this.rumbleTimer > 0) return;
    if (p.wallContact > 1) {
      input.rumble(Math.min(1, p.wallContact / 6), 0.6, 180);
      this.rumbleTimer = 0.18;
    } else if (p.offTrackWheels >= 2 && Math.abs(p.speed) > 5) {
      input.rumble(0.15, 0.45, 120);
      this.rumbleTimer = 0.12;
    } else if (p.wheels.some((w) => w.surface === 'curb') && Math.abs(p.speed) > 8) {
      input.rumble(0.05, 0.35, 90);
      this.rumbleTimer = 0.1;
    }
  }

  private autopilot: AIDriver | null = null;

  /** Debug helper: an AI driver writes the player's input. */
  applyAutopilot(input: InputState): void {
    const p = this.session.player;
    if (!this.autopilot) this.autopilot = new AIDriver(p.vehicle, this.session.line, 0.97, 4242);
    this.autopilot.update(1 / 60, this.session.vehicles, input);
    input.steerIsDirect = false;
  }

  /** Switches to replay playback of everything recorded so far. */
  startReplay(): void {
    this.replay = this.recorder.finish();
    this.replay.seek(0);
    this.replay.playing = true;
    this.replay.speed = 1;
    this.director = new ReplayCameraDirector(this.track, this.renderer.camera);
    this.replaySubject = this.session.participants.indexOf(this.session.player);
    this.replayCamera = 'tv';
    this.camera.snap();
  }

  updateReplay(dt: number): void {
    const r = this.replay;
    if (!r || !this.director) return;
    r.update(dt);
    const parts = this.session.participants;
    for (let i = 0; i < parts.length; i++) {
      const st = r.states[i];
      const spec = parts[i].entry.spec;
      this.visuals[i].applyState(
        st.pos,
        st.quat,
        st.spins,
        st.steer,
        st.brake,
        spec.cgHeightM,
        spec.wheelRadiusM,
      );
      const a = this.audioStates[i];
      a.rpm = st.rpm;
      a.throttle = st.brake > 0.1 ? 0 : 0.6;
      a.speed = 0;
      a.skid = 0;
      a.shifting = false;
    }
    const subject = r.states[this.replaySubject];
    if (this.replayCamera === 'tv') this.director.update(subject.pos, dt);
    else {
      const v = parts[this.replaySubject].vehicle;
      v.pos.copy(subject.pos);
      v.quat.copy(subject.quat);
      v.updateAxes();
      this.camera.update(v, dt);
    }
    this.renderer.updateShadowTarget(subject.pos);
    this.trackScene.update(dt, this.renderer.camera.position);
    this.feedAudio(dt);
  }

  get playerFinished(): boolean {
    return this.session.player.finished;
  }

  /** true exactly once, when the player finishes. */
  consumeFinish(): boolean {
    if (this.session.state === 'finished' && !this.finishHandled) {
      this.finishHandled = true;
      return true;
    }
    return false;
  }

  focusPoint(): Vector3 {
    return this.focus.copy(this.session.player.vehicle.pos);
  }

  dispose(): void {
    this.trackScene.dispose();
    for (const v of this.visuals) v.dispose();
    this.skids.mesh.geometry.dispose();
    this.smoke.points.geometry.dispose();
  }
}

const nextFrame = (): Promise<void> =>
  new Promise((r) => (document.hidden ? setTimeout(r, 0) : requestAnimationFrame(() => r())));
