import type { CarAudioState } from '../AudioContract';
import { clamp, loopingNoise, noiseBuffer, pulseShapeCurve, ramp, setNow } from '../AudioCore';
import type { EnginePreset } from '../EnginePresets';

const BLOWOFF_COOLDOWN_S = 0.5;
// Turbo whistle and valvetrain tick must stay at most -24dB under the
// exhaust fundamental's steady-state peak (~0.16 for the player voice, see
// EngineVoice's `level`), i.e. no louder than roughly 0.16 * 10^(-24/20).
const MECH_PEAK_CAP = 0.01;

/**
 * Everything around the exhaust pulse train: intake roar, turbo whistle +
 * blow-off chirp, valvetrain tick, supercharger whine and hybrid electric
 * whine. All built once per voice and re-tuned in place.
 */
export class MechanicalLayers {
  private preset: EnginePreset | null = null;

  private intakeSrc: AudioBufferSourceNode;
  private intakeBp: BiquadFilterNode;
  private intakeGain: GainNode;

  private turboOsc: OscillatorNode;
  private turboGain: GainNode;
  private blowoffBuffer: AudioBuffer;
  private blowoffCooldown = 0;

  private tickSrc: AudioBufferSourceNode;
  private tickHp: BiquadFilterNode;
  private tickGain: GainNode;
  private tickLfo: OscillatorNode;
  private tickShaper: WaveShaperNode;
  private tickDepthGain: GainNode;

  private superOsc: OscillatorNode;
  private superLp: BiquadFilterNode;
  private superGain: GainNode;

  private hybridOsc: OscillatorNode;
  private hybridGain: GainNode;

  constructor(
    private ctx: BaseAudioContext,
    private destination: AudioNode,
  ) {
    this.intakeSrc = loopingNoise(ctx, 2, 'white');
    this.intakeBp = ctx.createBiquadFilter();
    this.intakeBp.type = 'bandpass';
    this.intakeBp.Q.value = 1.0;
    this.intakeGain = ctx.createGain();
    this.intakeGain.gain.value = 0;
    this.intakeSrc.connect(this.intakeBp).connect(this.intakeGain).connect(destination);

    [this.turboOsc, this.turboGain] = this.sineVoice();
    this.blowoffBuffer = noiseBuffer(ctx, 0.3, 'white');

    this.tickSrc = loopingNoise(ctx, 1.5, 'white');
    this.tickHp = ctx.createBiquadFilter();
    this.tickHp.type = 'highpass';
    this.tickHp.frequency.value = 3000;
    // tickGain's own value stays at 0: it is driven entirely by the shaped
    // LFO's AudioParam connection below, whose 0..1 swing is scaled down by
    // tickDepthGain first — connecting the (unscaled, 0..1) shaper straight
    // into an AudioParam would add up to +1 of gain on every click.
    this.tickGain = ctx.createGain();
    this.tickGain.gain.value = 0;
    this.tickLfo = ctx.createOscillator();
    this.tickLfo.type = 'sine';
    this.tickLfo.frequency.value = 40;
    this.tickShaper = ctx.createWaveShaper();
    this.tickShaper.curve = pulseShapeCurve(30);
    this.tickDepthGain = ctx.createGain();
    this.tickDepthGain.gain.value = 0;
    this.tickLfo.connect(this.tickShaper).connect(this.tickDepthGain).connect(this.tickGain.gain);
    this.tickLfo.start();
    this.tickSrc.connect(this.tickHp).connect(this.tickGain).connect(destination);

    [this.superOsc, this.superGain] = this.sineVoice('sawtooth');
    // the sawtooth's harmonic series runs well past 3kHz at 5x crank rpm;
    // cut it there so the supercharger reads as a low whine, not a hiss.
    this.superLp = ctx.createBiquadFilter();
    this.superLp.type = 'lowpass';
    this.superLp.frequency.value = 3000;
    this.superGain.disconnect();
    this.superGain.connect(this.superLp).connect(destination);

    [this.hybridOsc, this.hybridGain] = this.sineVoice();
  }

  private sineVoice(type: OscillatorType = 'sine'): [OscillatorNode, GainNode] {
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.value = 200;
    osc.start();
    const gain = this.ctx.createGain();
    gain.gain.value = 0;
    osc.connect(gain).connect(this.destination);
    return [osc, gain];
  }

  applyPreset(preset: EnginePreset): void {
    this.preset = preset;
    if (!preset.turbo) setNow(this.turboGain.gain, 0, this.ctx);
    if (!preset.supercharger) setNow(this.superGain.gain, 0, this.ctx);
    if (!preset.hybridWhine) setNow(this.hybridGain.gain, 0, this.ctx);
  }

  update(car: CarAudioState, rpmFrac: number, firingFreq: number, lastThrottle: number): void {
    if (!this.preset) return;
    this.updateIntake(car, rpmFrac);
    this.updateTurbo(car, rpmFrac, lastThrottle);
    this.updateTick(firingFreq);
    this.updateSupercharger(car.rpm);
    this.updateHybrid(rpmFrac, firingFreq);
  }

  private updateIntake(car: CarAudioState, rpmFrac: number): void {
    const p = this.preset!;
    const centre = clamp(p.intakeBaseHz + rpmFrac * (1200 - p.intakeBaseHz), 600, 1200);
    ramp(this.intakeBp.frequency, centre, this.ctx, 0.06);
    // ~8dB (0.4x) quieter than the original intake roar.
    ramp(this.intakeGain.gain, car.throttle * (0.02 + rpmFrac * 0.04), this.ctx, 0.06);
  }

  private updateTurbo(car: CarAudioState, rpmFrac: number, lastThrottle: number): void {
    if (!this.preset!.turbo) return;
    ramp(this.turboOsc.frequency, clamp(2000 + rpmFrac * 6000, 2000, 8000), this.ctx, 0.08);
    ramp(this.turboGain.gain, car.throttle * rpmFrac * MECH_PEAK_CAP, this.ctx, 0.1);

    this.blowoffCooldown = Math.max(0, this.blowoffCooldown - 1 / 60);
    const lift = lastThrottle - car.throttle;
    if (lastThrottle > 0.6 && lift > 0.35 && this.blowoffCooldown <= 0) {
      this.blowoffCooldown = BLOWOFF_COOLDOWN_S;
      this.fireBlowoff(0.18 * lift);
    }
  }

  private updateTick(firingFreq: number): void {
    const amount = this.preset!.valvetrainTick;
    ramp(this.tickLfo.frequency, firingFreq * 2, this.ctx, 0.05);
    ramp(this.tickDepthGain.gain, amount * MECH_PEAK_CAP * 2.5, this.ctx, 0.1);
  }

  private updateSupercharger(rpm: number): void {
    if (!this.preset!.supercharger) return;
    const crankHz = rpm / 60;
    ramp(this.superOsc.frequency, crankHz * 5, this.ctx, 0.04);
    ramp(this.superGain.gain, clamp(rpm / 7000, 0, 1) * 0.05, this.ctx, 0.1);
  }

  private updateHybrid(rpmFrac: number, firingFreq: number): void {
    if (!this.preset!.hybridWhine) return;
    // a pure sine this high in the band eats into the >=25dB high-band
    // margin fast, so it stays well under the turbo/tick peak cap too.
    ramp(this.hybridOsc.frequency, firingFreq * 8, this.ctx, 0.05);
    ramp(this.hybridGain.gain, rpmFrac * MECH_PEAK_CAP * 0.6, this.ctx, 0.1);
  }

  private fireBlowoff(peak: number): void {
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.blowoffBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'highpass';
      bp.frequency.value = 3500;
      const g = this.ctx.createGain();
      const now = this.ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0005, peak), now + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
      src.connect(bp).connect(g).connect(this.destination);
      src.start(now);
      src.stop(now + 0.3);
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

  idle(): void {
    ramp(this.intakeGain.gain, 0, this.ctx, 0.2);
    ramp(this.turboGain.gain, 0, this.ctx, 0.2);
    ramp(this.tickDepthGain.gain, 0, this.ctx, 0.2);
    ramp(this.superGain.gain, 0, this.ctx, 0.2);
    ramp(this.hybridGain.gain, 0, this.ctx, 0.2);
  }
}
