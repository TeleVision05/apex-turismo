import type { CarAudioState } from './AudioContract';
import {
  clamp,
  computeSpatial,
  loopingNoise,
  pulseWave,
  ramp,
  saturationCurve,
  setNow,
} from './AudioCore';
import {
  ENGINE_PRESETS,
  firingFrequency,
  type EngineKind,
  type EnginePreset,
} from './EnginePresets';

const BURST_DUR = 0.06;

/**
 * One persistent engine voice: oscillators + noise + filter/shaper feed a
 * spatial chain into `destination`. Built once per pool slot and re-tuned
 * in place — see `assign`/`update`/`idle`.
 */
export class EngineVoice {
  private preset: EnginePreset = ENGINE_PRESETS.i4;
  private kind: EngineKind | null = null;

  private oscSaw: OscillatorNode;
  private oscSquare: OscillatorNode;
  private oscSub: OscillatorNode;
  private oscPulse: OscillatorNode;
  private gSaw: GainNode;
  private gSquare: GainNode;
  private gSub: GainNode;
  private gPulse: GainNode;
  private toneSum: GainNode;

  private noiseSrc: AudioBufferSourceNode;
  private noiseBp: BiquadFilterNode;
  private noiseGain: GainNode;

  private oscTurbo: OscillatorNode;
  private gTurbo: GainNode;
  private oscWhine: OscillatorNode;
  private gWhine: GainNode;
  private oscHybrid: OscillatorNode;
  private gHybrid: GainNode;

  private lowpass: BiquadFilterNode;
  private shaper: WaveShaperNode;
  private shiftGain: GainNode;
  private preSpatial: GainNode;
  private voiceGain: GainNode;
  private panner: StereoPannerNode;
  private distGain: GainNode;
  private distLpf: BiquadFilterNode;

  private wasShifting = false;
  private lastThrottle = 0;
  private overrunCooldown = 0;
  private blowoffCooldown = 0;

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
  ) {
    [this.oscSaw, this.gSaw] = this.tone('sawtooth');
    [this.oscSquare, this.gSquare] = this.tone('square');
    [this.oscSub, this.gSub] = this.tone('sine');
    [this.oscPulse, this.gPulse] = this.tone('custom');
    this.toneSum = ctx.createGain();
    this.toneSum.gain.value = 1;
    for (const g of [this.gSaw, this.gSquare, this.gSub, this.gPulse]) g.connect(this.toneSum);

    this.noiseSrc = loopingNoise(ctx, 2, 'white');
    this.noiseBp = ctx.createBiquadFilter();
    this.noiseBp.type = 'bandpass';
    this.noiseBp.Q.value = 0.9;
    this.noiseGain = ctx.createGain();
    this.noiseGain.gain.value = 0;
    this.noiseSrc.connect(this.noiseBp).connect(this.noiseGain).connect(this.toneSum);

    [this.oscTurbo, this.gTurbo] = this.tone('sine');
    [this.oscWhine, this.gWhine] = this.tone('sine');
    [this.oscHybrid, this.gHybrid] = this.tone('sine');

    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.Q.value = 0.7;
    this.shaper = ctx.createWaveShaper();
    this.shiftGain = ctx.createGain();
    this.shiftGain.gain.value = 1;
    this.preSpatial = ctx.createGain();
    this.preSpatial.gain.value = 1;
    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 0;
    this.panner = ctx.createStereoPanner();
    this.distGain = ctx.createGain();
    this.distLpf = ctx.createBiquadFilter();
    this.distLpf.type = 'lowpass';
    this.distLpf.frequency.value = 20000;

    this.toneSum
      .connect(this.lowpass)
      .connect(this.shaper)
      .connect(this.shiftGain)
      .connect(this.preSpatial);
    for (const g of [this.gTurbo, this.gWhine, this.gHybrid]) g.connect(this.preSpatial);
    this.preSpatial
      .connect(this.voiceGain)
      .connect(this.panner)
      .connect(this.distGain)
      .connect(this.distLpf)
      .connect(destination);

    this.applyPreset('i4');
  }

  private tone(type: OscillatorType): [OscillatorNode, GainNode] {
    const osc = this.ctx.createOscillator();
    if (type !== 'custom') osc.type = type;
    osc.frequency.value = 100;
    osc.start();
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain);
    return [osc, gain];
  }

  private applyPreset(kind: EngineKind): void {
    if (this.kind === kind) return;
    this.kind = kind;
    const p = ENGINE_PRESETS[kind];
    this.preset = p;
    setNow(this.gSaw.gain, p.mix.saw, this.ctx);
    setNow(this.gSquare.gain, p.mix.square, this.ctx);
    setNow(this.gSub.gain, p.mix.sub, this.ctx);
    setNow(this.gPulse.gain, p.mix.pulse, this.ctx);
    this.oscSaw.detune.value = -p.detuneCents * 0.6;
    this.oscSquare.detune.value = p.detuneCents;
    this.oscSquare.type = kind === 'rotary' ? 'triangle' : 'square';
    try {
      this.oscPulse.setPeriodicWave(pulseWave(this.ctx, p.harmonics));
    } catch {
      /* mock context without createPeriodicWave support */
    }
    this.shaper.curve = saturationCurve(p.saturation);
  }

  /** Snap all frequencies/preset instantly (no ramp) — used when a pool slot is reassigned to a new car. */
  assign(car: CarAudioState): void {
    this.applyPreset(car.engine);
    const f = firingFrequency(car.rpm, car.engine);
    setNow(this.oscSaw.frequency, f, this.ctx);
    setNow(this.oscSquare.frequency, f * 2, this.ctx);
    setNow(this.oscSub.frequency, f * 0.5, this.ctx);
    setNow(this.oscPulse.frequency, f, this.ctx);
    setNow(this.voiceGain.gain, 0, this.ctx);
    this.wasShifting = car.shifting;
    this.lastThrottle = car.throttle;
    this.overrunCooldown = 0;
    this.blowoffCooldown = 0;
  }

  update(car: CarAudioState, dt: number): void {
    this.applyPreset(car.engine);
    const f = firingFrequency(car.rpm, car.engine);
    const rpmFrac = clamp(car.rpm / Math.max(1, car.redlineRpm), 0, 1.3);
    const overrun = car.throttle < 0.15 && rpmFrac > 0.55;

    this.updateTone(f);
    this.updateFilter(car, rpmFrac, overrun);
    this.updateNoise(car, rpmFrac);
    this.updateTurbo(car, rpmFrac, dt);
    this.updateOverrun(rpmFrac, overrun, dt);
    this.updateWhines(car, rpmFrac, f);
    this.updateShift(car);
    this.updateSpatial(car);
    this.lastThrottle = car.throttle;
  }

  /** Ramp this slot's audible level to zero without touching frequencies (car dropped out of range). */
  idle(): void {
    ramp(this.voiceGain.gain, 0, this.ctx, 0.25);
  }

  private updateTone(f: number): void {
    ramp(this.oscSaw.frequency, f, this.ctx, 0.03);
    ramp(this.oscSquare.frequency, f * 2, this.ctx, 0.03);
    ramp(this.oscSub.frequency, f * 0.5, this.ctx, 0.03);
    ramp(this.oscPulse.frequency, f, this.ctx, 0.03);
  }

  private updateFilter(car: CarAudioState, rpmFrac: number, overrun: boolean): void {
    const p = this.preset;
    let cutoff =
      p.filterBaseHz + rpmFrac * p.filterRpmHz * 1000 + car.throttle * p.filterThrottleHz;
    if (overrun) cutoff *= 0.55;
    ramp(this.lowpass.frequency, cutoff, this.ctx, 0.05);
    const level = (overrun ? 0.55 : 1) * (car.isPlayer ? 0.42 : 0.34);
    ramp(this.toneSum.gain, level, this.ctx, 0.08);
  }

  private updateNoise(car: CarAudioState, rpmFrac: number): void {
    ramp(this.noiseBp.frequency, 500 + rpmFrac * 3000, this.ctx, 0.08);
    ramp(this.noiseGain.gain, car.throttle * (0.15 + rpmFrac * 0.1), this.ctx, 0.08);
  }

  private updateTurbo(car: CarAudioState, rpmFrac: number, dt: number): void {
    if (!this.preset.turbo) {
      ramp(this.gTurbo.gain, 0, this.ctx, 0.1);
      return;
    }
    ramp(this.oscTurbo.frequency, clamp(3000 + rpmFrac * 3000, 3000, 6000), this.ctx, 0.08);
    ramp(this.gTurbo.gain, car.throttle * rpmFrac * 0.12, this.ctx, 0.1);

    this.blowoffCooldown = Math.max(0, this.blowoffCooldown - dt);
    const lift = this.lastThrottle - car.throttle;
    if (this.lastThrottle > 0.6 && lift > 0.35 && this.blowoffCooldown <= 0) {
      this.blowoffCooldown = 0.5;
      this.fireBurst('highpass', 3500, 0.09, 0.18 * lift);
    }
  }

  private updateOverrun(rpmFrac: number, overrun: boolean, dt: number): void {
    this.overrunCooldown = Math.max(0, this.overrunCooldown - dt);
    if (!overrun || this.overrunCooldown > 0) return;
    const amount = this.preset.overrunCrackle;
    if (Math.random() > amount * dt * 6) return;
    this.overrunCooldown = 0.06 + (1 - amount) * 0.1;
    this.fireBurst('bandpass', 1500 + Math.random() * 2000, 0.04, 0.12 * rpmFrac);
  }

  private updateWhines(car: CarAudioState, rpmFrac: number, f: number): void {
    if (this.preset.hybridWhine) {
      ramp(this.oscHybrid.frequency, f * 8, this.ctx, 0.05);
      ramp(this.gHybrid.gain, rpmFrac * 0.06, this.ctx, 0.1);
    } else {
      ramp(this.gHybrid.gain, 0, this.ctx, 0.1);
    }
    if (car.isPlayer) {
      ramp(this.oscWhine.frequency, 150 + car.speed * 6, this.ctx, 0.1);
      ramp(this.gWhine.gain, clamp(car.speed / 40, 0, 1) * 0.05, this.ctx, 0.15);
    } else {
      ramp(this.gWhine.gain, 0, this.ctx, 0.15);
    }
  }

  private updateShift(car: CarAudioState): void {
    if (car.shifting && !this.wasShifting) {
      const now = this.ctx.currentTime;
      try {
        this.shiftGain.gain.cancelScheduledValues(now);
        this.shiftGain.gain.setValueAtTime(1, now);
        this.shiftGain.gain.linearRampToValueAtTime(0.25, now + 0.03);
        this.shiftGain.gain.linearRampToValueAtTime(1, now + 0.13);
      } catch {
        /* ignore */
      }
      this.fireBurst('bandpass', 3200, 0.02, 0.1);
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

  /** A one-shot noise burst for crackle/blow-off/shift-click, fed into the spatialised output. */
  private fireBurst(filterType: BiquadFilterType, freq: number, dur: number, peak: number): void {
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseSrc.buffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = filterType;
      bp.frequency.value = freq;
      const g = this.ctx.createGain();
      const now = this.ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0002, peak), now + dur * 0.15);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur + BURST_DUR);
      src.connect(bp).connect(g).connect(this.preSpatial);
      src.start(now);
      src.stop(now + dur + BURST_DUR + 0.05);
      src.onended = () => {
        try {
          src.disconnect();
          bp.disconnect();
          g.disconnect();
        } catch {
          /* already disconnected */
        }
      };
    } catch {
      /* mock context lacking one-shot support */
    }
  }
}
