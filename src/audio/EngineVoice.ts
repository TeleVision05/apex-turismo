import type { CarAudioState } from './AudioContract';
import { clamp, computeSpatial, ramp, setNow } from './AudioCore';
import { ExhaustChain } from './engine/ExhaustChain';
import { MechanicalLayers } from './engine/MechanicalLayers';
import { OverrunAndShift } from './engine/OverrunAndShift';
import { ENGINE_PRESETS, firingFrequency, jitterAt, type EngineKind } from './EnginePresets';

/** Doppler sensitivity: relative closing speed (m/s) mapped to a pitch-ratio delta, clamped. */
const DOPPLER_SCALE = 90;
const DOPPLER_CLAMP = 0.12;

/**
 * One persistent engine voice: a worklet-driven (or oscillator-fallback)
 * exhaust pulse train, intake/turbo/valvetrain/supercharger layers, overrun
 * pops and shift effects, all summed into a spatialised output. Built once
 * per pool slot and re-tuned in place — see `assign`/`update`/`idle`.
 */
export class EngineVoice {
  private kind: EngineKind | null = null;

  private preSpatial: GainNode;
  private exhaust: ExhaustChain;
  private mech: MechanicalLayers;
  private overrunShift: OverrunAndShift;

  private voiceGain: GainNode;
  private panner: StereoPannerNode;
  private distGain: GainNode;
  private distLpf: BiquadFilterNode;

  private wasShifting = false;
  private wasOverrun = false;
  private lastThrottle = 0;
  private lastGear = 0;
  private lastDistance = 0;

  constructor(
    private ctx: BaseAudioContext,
    destination: AudioNode,
    workletReady: Promise<boolean>,
  ) {
    this.preSpatial = ctx.createGain();
    this.preSpatial.gain.value = 1;
    this.exhaust = new ExhaustChain(ctx, this.preSpatial, workletReady);
    this.mech = new MechanicalLayers(ctx, this.preSpatial);
    this.overrunShift = new OverrunAndShift(ctx);

    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 0;
    this.panner = ctx.createStereoPanner();
    this.distGain = ctx.createGain();
    this.distLpf = ctx.createBiquadFilter();
    this.distLpf.type = 'lowpass';
    this.distLpf.frequency.value = 20000;
    this.preSpatial
      .connect(this.voiceGain)
      .connect(this.panner)
      .connect(this.distGain)
      .connect(this.distLpf)
      .connect(destination);

    this.applyPreset('i4');
  }

  private applyPreset(kind: EngineKind): void {
    if (this.kind === kind) return;
    this.kind = kind;
    const preset = ENGINE_PRESETS[kind];
    this.exhaust.applyPreset(preset);
    this.mech.applyPreset(preset);
  }

  /** Snap all frequencies/preset instantly (no ramp) — used when a pool slot is reassigned. */
  assign(car: CarAudioState): void {
    this.applyPreset(car.engine);
    const f = firingFrequency(car.rpm, car.engine);
    this.exhaust.setFrequency(f, true);
    setNow(this.voiceGain.gain, 0, this.ctx);
    this.wasShifting = car.shifting;
    this.wasOverrun = false;
    this.lastThrottle = car.throttle;
    this.lastGear = car.gear;
    this.lastDistance = Math.hypot(car.relX, car.relY, car.relZ);
    this.overrunShift.reset();
  }

  update(car: CarAudioState, dt: number): void {
    this.applyPreset(car.engine);
    const preset = ENGINE_PRESETS[car.engine];
    const rpmFrac = clamp(car.rpm / Math.max(1, car.redlineRpm), 0, 1.3);
    const overrun = car.throttle < 0.15 && rpmFrac > 0.55;
    if (overrun && !this.wasOverrun) this.overrunShift.onOverrunStart();
    this.wasOverrun = overrun;

    const doppler = car.isPlayer ? 1 : this.dopplerRatio(car, dt);
    const baseFreq = firingFrequency(car.rpm, car.engine);
    this.exhaust.setFrequency(baseFreq * doppler * this.overrunShift.blipMultiplier(), false);
    this.exhaust.setJitter(jitterAt(car.engine, rpmFrac));
    const level = (overrun ? 0.55 : 1) * (car.isPlayer ? 0.16 : 0.13);
    this.exhaust.updateTone(rpmFrac, car.throttle, overrun, level);

    this.mech.update(car, rpmFrac, baseFreq, this.lastThrottle);
    this.overrunShift.updateOverrun(overrun, dt, preset.overrunCrackle, this.exhaust.input());
    this.updateShift(car);
    this.updateSpatial(car);
    this.lastThrottle = car.throttle;
    this.lastGear = car.gear;
  }

  /** Ramp this slot's audible level to zero without touching frequencies (car dropped out of range). */
  idle(): void {
    ramp(this.voiceGain.gain, 0, this.ctx, 0.25);
    this.mech.idle();
  }

  private dopplerRatio(car: CarAudioState, dt: number): number {
    if (dt <= 0) return 1;
    const dist = Math.hypot(car.relX, car.relY, car.relZ);
    const closingSpeed = (this.lastDistance - dist) / dt;
    this.lastDistance = dist;
    return 1 + clamp(closingSpeed / DOPPLER_SCALE, -DOPPLER_CLAMP, DOPPLER_CLAMP);
  }

  private updateShift(car: CarAudioState): void {
    if (car.shifting && !this.wasShifting) {
      this.exhaust.shiftCut();
      this.overrunShift.fireShiftThump(this.exhaust.input());
      if (car.gear < this.lastGear) this.overrunShift.triggerBlip();
    }
    this.wasShifting = car.shifting;
  }

  private updateSpatial(car: CarAudioState): void {
    const s = computeSpatial(car.relX, car.relZ, car.isPlayer);
    ramp(this.panner.pan, s.pan, this.ctx, 0.15);
    ramp(this.distGain.gain, s.gain, this.ctx, 0.15);
    ramp(this.distLpf.frequency, s.cutoff, this.ctx, 0.15);
    ramp(this.voiceGain.gain, 1, this.ctx, 0.2);
  }
}
