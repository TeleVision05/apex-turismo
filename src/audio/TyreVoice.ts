import type { CarAudioState } from './AudioContract';
import { clamp, computeSpatial, loopingNoise, pulseShapeCurve, ramp, Smoother } from './AudioCore';

/**
 * Per-car tyre voice: squeal, grass rumble and curb thud, spatialised the
 * same way as the matching engine voice. Built once per pool slot.
 */
export class TyreVoice {
  private squealSrc: AudioBufferSourceNode;
  private squealBp: BiquadFilterNode;
  private squealGain: GainNode;

  private grassSrc: AudioBufferSourceNode;
  private grassLp: BiquadFilterNode;
  private grassGain: GainNode;

  private curbSrc: AudioBufferSourceNode;
  private curbBp: BiquadFilterNode;
  private curbPulseGain: GainNode;
  private curbDepthGain: GainNode;
  private curbLfo: OscillatorNode;
  private curbShaper: WaveShaperNode;

  private preSpatial: GainNode;
  private voiceGain: GainNode;
  private panner: StereoPannerNode;
  private distGain: GainNode;

  private skid = new Smoother(0, 10);

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.preSpatial = ctx.createGain();
    this.preSpatial.gain.value = 1;

    this.squealSrc = loopingNoise(ctx, 1.5, 'white');
    this.squealBp = ctx.createBiquadFilter();
    this.squealBp.type = 'bandpass';
    this.squealBp.Q.value = 6;
    this.squealBp.frequency.value = 1100;
    this.squealGain = ctx.createGain();
    this.squealGain.gain.value = 0;
    this.squealSrc.connect(this.squealBp).connect(this.squealGain).connect(this.preSpatial);

    this.grassSrc = loopingNoise(ctx, 1.5, 'brown');
    this.grassLp = ctx.createBiquadFilter();
    this.grassLp.type = 'lowpass';
    this.grassLp.frequency.value = 220;
    this.grassGain = ctx.createGain();
    this.grassGain.gain.value = 0;
    this.grassSrc.connect(this.grassLp).connect(this.grassGain).connect(this.preSpatial);

    this.curbSrc = loopingNoise(ctx, 1.5, 'white');
    this.curbBp = ctx.createBiquadFilter();
    this.curbBp.type = 'bandpass';
    this.curbBp.frequency.value = 150;
    this.curbBp.Q.value = 1.2;
    this.curbPulseGain = ctx.createGain();
    this.curbPulseGain.gain.value = 0;
    this.curbDepthGain = ctx.createGain();
    this.curbDepthGain.gain.value = 0;
    this.curbLfo = ctx.createOscillator();
    this.curbLfo.type = 'sine';
    this.curbLfo.frequency.value = 2;
    this.curbShaper = ctx.createWaveShaper();
    this.curbShaper.curve = pulseShapeCurve(8);
    this.curbLfo.connect(this.curbShaper).connect(this.curbPulseGain.gain);
    this.curbLfo.start();
    this.curbSrc
      .connect(this.curbBp)
      .connect(this.curbPulseGain)
      .connect(this.curbDepthGain)
      .connect(this.preSpatial);

    this.voiceGain = ctx.createGain();
    this.voiceGain.gain.value = 0;
    this.panner = ctx.createStereoPanner();
    this.distGain = ctx.createGain();
    this.preSpatial
      .connect(this.voiceGain)
      .connect(this.panner)
      .connect(this.distGain)
      .connect(destination);
  }

  assign(car: CarAudioState): void {
    this.skid.reset(car.skid);
  }

  update(car: CarAudioState, dt: number): void {
    const skid = this.skid.update(car.skid, dt);
    const squealActive = car.speed > 3;
    ramp(
      this.squealBp.frequency,
      clamp(900 + skid * 300 + car.speed * 5, 900, 1400),
      this.ctx,
      0.08,
    );
    ramp(this.squealGain.gain, squealActive ? skid * 0.5 : 0, this.ctx, 0.08);

    ramp(this.grassGain.gain, car.onGrass ? clamp(car.speed / 25, 0, 1) * 0.35 : 0, this.ctx, 0.15);

    ramp(this.curbLfo.frequency, clamp(car.speed / 2, 0.5, 10), this.ctx, 0.1);
    ramp(
      this.curbDepthGain.gain,
      car.onCurb ? clamp(car.speed / 20, 0.15, 1) * 0.4 : 0,
      this.ctx,
      0.06,
    );

    const s = computeSpatial(car.relX, car.relZ, car.isPlayer);
    ramp(this.panner.pan, s.pan, this.ctx, 0.15);
    ramp(this.distGain.gain, s.gain, this.ctx, 0.15);
    ramp(this.voiceGain.gain, 1, this.ctx, 0.2);
  }

  idle(): void {
    ramp(this.voiceGain.gain, 0, this.ctx, 0.25);
  }
}
