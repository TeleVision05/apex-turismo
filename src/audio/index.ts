import type { AudioSettings } from '../core/types';
import type { AudioEngine, CarAudioState } from './AudioContract';
import { type AudioCore, clamp, createAudioCore, ramp } from './AudioCore';
import { CarVoicePool } from './CarVoicePool';
import { CollisionFx, WallScrapeFx, WindFx } from './Effects';
import { MenuMusic } from './MenuMusic';
import { RaceAmbience } from './Ambience';
import { playUiSound, type UiKind } from './UiSounds';

const DEFAULT_SETTINGS: AudioSettings = { master: 1, engine: 1, effects: 1, music: 1 };
const SETTINGS_RAMP_S = 0.15;
const RACE_MUTE_RAMP_S = 0.3;

/** Mutable runtime state for one engine instance; kept off the closure so helpers stay small. */
interface Runtime {
  core: AudioCore | null;
  pool: CarVoicePool | null;
  collisionFx: CollisionFx | null;
  scrapeFx: WallScrapeFx | null;
  windFx: WindFx | null;
  menuMusic: MenuMusic | null;
  ambience: RaceAmbience | null;
  settings: AudioSettings;
  raceActive: boolean;
}

function newRuntime(): Runtime {
  return {
    core: null,
    pool: null,
    collisionFx: null,
    scrapeFx: null,
    windFx: null,
    menuMusic: null,
    ambience: null,
    settings: { ...DEFAULT_SETTINGS },
    raceActive: true,
  };
}

/** Builds the master chain and every sub-system, once, from a user gesture. */
function ensureCore(rt: Runtime): AudioCore | null {
  if (rt.core) return rt.core;
  const core = createAudioCore();
  if (!core) return null;
  rt.core = core;
  rt.pool = new CarVoicePool(core);
  rt.collisionFx = new CollisionFx(core.ctx, core.effectsBus);
  rt.scrapeFx = new WallScrapeFx(core.ctx, core.effectsBus);
  rt.windFx = new WindFx(core.ctx, core.raceLoopGain);
  rt.menuMusic = new MenuMusic(core.ctx, core.musicBus);
  rt.ambience = new RaceAmbience(core.ctx, core.raceLoopGain);
  applySettings(core, rt.settings);
  applyRaceActive(core, rt.raceActive);
  return core;
}

function applySettings(core: AudioCore, s: AudioSettings): void {
  ramp(core.masterGain.gain, clamp(s.master, 0, 1.5), core.ctx, SETTINGS_RAMP_S);
  ramp(core.engineBus.gain, clamp(s.engine, 0, 1.5), core.ctx, SETTINGS_RAMP_S);
  ramp(core.effectsBus.gain, clamp(s.effects, 0, 1.5), core.ctx, SETTINGS_RAMP_S);
  ramp(core.musicBus.gain, clamp(s.music, 0, 1.5), core.ctx, SETTINGS_RAMP_S);
}

function applyRaceActive(core: AudioCore, active: boolean): void {
  ramp(core.raceEngineGain.gain, active ? 1 : 0, core.ctx, RACE_MUTE_RAMP_S);
  ramp(core.raceLoopGain.gain, active ? 1 : 0, core.ctx, RACE_MUTE_RAMP_S);
}

/** engine bus lowpass: 3.5kHz closed throttle, opening only slightly to 4.5kHz at full throttle */
const ENGINE_LOWPASS_MIN_HZ = 3500;
const ENGINE_LOWPASS_MAX_HZ = 4500;

function updateCars(rt: Runtime, cars: CarAudioState[], dt: number): void {
  if (!rt.core || !rt.pool) return;
  rt.pool.update(cars, dt);
  const player = cars.find((c) => c.isPlayer);
  if (player) {
    rt.windFx?.update(player.speed);
    const cutoff =
      ENGINE_LOWPASS_MIN_HZ + player.throttle * (ENGINE_LOWPASS_MAX_HZ - ENGINE_LOWPASS_MIN_HZ);
    ramp(rt.core.engineLowpass.frequency, cutoff, rt.core.ctx, 0.15);
  } else {
    rt.windFx?.idle();
  }
}

/**
 * Builds a fully self-contained, procedural Web Audio engine. Every method
 * is a safe no-op until `resume()` has run (from a user gesture) and the
 * AudioContext exists; nothing throws even without Web Audio support.
 */
export function createAudioEngine(): AudioEngine {
  const rt = newRuntime();

  const engine = {
    async resume(): Promise<void> {
      const core = ensureCore(rt);
      if (!core) return;
      try {
        await core.ctx.resume();
      } catch {
        /* ignore: suspended/closed contexts just stay silent */
      }
    },
    setSettings(s: AudioSettings): void {
      rt.settings = s;
      if (rt.core) applySettings(rt.core, s);
    },
    updateCars(cars: CarAudioState[], dt: number): void {
      updateCars(rt, cars, dt);
    },
    playCollision(intensity: number, relX: number, relZ: number): void {
      rt.collisionFx?.play(intensity, relX, relZ);
    },
    playWallScrape(intensity: number): void {
      rt.scrapeFx?.play(intensity);
    },
    playUi(kind: UiKind): void {
      if (!rt.core) return;
      playUiSound(rt.core.ctx, rt.core.effectsBus, kind);
    },
    setMenuMusic(on: boolean): void {
      rt.menuMusic?.setOn(on);
    },
    setRaceAmbience(on: boolean): void {
      rt.ambience?.setOn(on);
    },
    setRaceActive(active: boolean): void {
      rt.raceActive = active;
      if (rt.core) applyRaceActive(rt.core, active);
    },
    /** Not part of AudioContract: lets the listening-check preview page sample the master bus. */
    __audioDebugAnalyser(): AnalyserNode | null {
      return rt.core?.analyser ?? null;
    },
  };

  return engine;
}
