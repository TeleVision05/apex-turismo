import { pulseWave, ramp, saturationCurve, setNow } from '../AudioCore';
import type { EnginePreset } from '../EnginePresets';
import { createExhaustWorkletNode } from './ExhaustWorklet';

const SHIFT_CUT_S = 0.08;

/**
 * The exhaust pulse train (worklet-generated when available, an oscillator
 * approximation otherwise) run through a parallel resonator bank modelling
 * the exhaust pipe + cabin, a crackle waveshaper and a throttle/rpm lowpass.
 * `input()` is exposed so overrun pop bursts can be injected upstream of the
 * resonators, sharing the same exhaust colour as the pulse train itself.
 */
export class ExhaustChain {
  private preset: EnginePreset | null = null;
  private usingWorklet = false;

  private fallbackOsc: OscillatorNode;
  private fallbackGain: GainNode;
  private workletNode: AudioWorkletNode | null = null;
  private freqParam: AudioParam;

  private resonatorInput: GainNode;
  private resonators: BiquadFilterNode[] = [];
  private resonatorSum: GainNode;
  private shaper: WaveShaperNode;
  private lowpass: BiquadFilterNode;
  private shiftGain: GainNode;
  private levelGain: GainNode;

  constructor(
    private ctx: BaseAudioContext,
    destination: AudioNode,
    workletReady: Promise<boolean>,
  ) {
    this.fallbackOsc = ctx.createOscillator();
    // type becomes 'custom' implicitly once applyPreset() calls setPeriodicWave();
    // it cannot be assigned directly (browsers throw InvalidStateError).
    this.fallbackOsc.frequency.value = 100;
    this.fallbackGain = ctx.createGain();
    this.fallbackGain.gain.value = 1;
    this.fallbackOsc.connect(this.fallbackGain);
    this.fallbackOsc.start();
    this.freqParam = this.fallbackOsc.frequency;

    this.resonatorInput = ctx.createGain();
    this.resonatorInput.gain.value = 1;
    this.fallbackGain.connect(this.resonatorInput);
    this.resonatorSum = ctx.createGain();
    // 4 parallel resonators re-summing a common broadband pulse add energy
    // back up; compensate so the bank stays roughly unity overall.
    this.resonatorSum.gain.value = 0.45;
    this.resonators = this.buildResonators();

    this.shaper = ctx.createWaveShaper();
    this.lowpass = ctx.createBiquadFilter();
    this.lowpass.type = 'lowpass';
    this.lowpass.Q.value = 0.7;
    this.shiftGain = ctx.createGain();
    this.shiftGain.gain.value = 1;
    this.levelGain = ctx.createGain();
    this.levelGain.gain.value = 0.3;

    this.resonatorSum
      .connect(this.shaper)
      .connect(this.lowpass)
      .connect(this.shiftGain)
      .connect(this.levelGain)
      .connect(destination);

    void workletReady.then((ready) => {
      if (ready) this.upgradeToWorklet();
    });
  }

  /** Nodes that need a resonated, exhaust-coloured signal (e.g. overrun pops) feed in here. */
  input(): GainNode {
    return this.resonatorInput;
  }

  private buildResonators(): BiquadFilterNode[] {
    const nodes: BiquadFilterNode[] = [];
    // Moderate Q: a sharp attack through a high-Q bandpass rings well above
    // its nominal 0dB peak (classic resonant-filter overshoot), so these
    // values are kept low enough to stay clear of the peak<0.6 budget.
    for (let i = 0; i < 4; i++) {
      const f = this.ctx.createBiquadFilter();
      f.type = i === 3 ? 'peaking' : 'bandpass';
      f.Q.value = i === 0 ? 2.5 : 3;
      if (i === 3) f.gain.value = 3;
      this.resonatorInput.connect(f).connect(this.resonatorSum);
      nodes.push(f);
    }
    return nodes;
  }

  applyPreset(preset: EnginePreset): void {
    if (this.preset === preset) return;
    this.preset = preset;
    const f0 = preset.exhaustFundamentalHz;
    const freqs = [f0, f0 * 2, f0 * 3, preset.bodyResonanceHz];
    for (let i = 0; i < this.resonators.length; i++) {
      setNow(this.resonators[i].frequency, freqs[i], this.ctx);
    }
    this.shaper.curve = saturationCurve(preset.saturation);
    try {
      this.fallbackOsc.setPeriodicWave(pulseWave(this.ctx, 12));
    } catch {
      /* mock context without createPeriodicWave support */
    }
    if (this.usingWorklet) this.rebuildWorkletNode();
  }

  private upgradeToWorklet(): void {
    if (this.usingWorklet || !this.preset) return;
    this.usingWorklet = true;
    this.rebuildWorkletNode();
    ramp(this.fallbackGain.gain, 0, this.ctx, 0.05);
  }

  private rebuildWorkletNode(): void {
    if (!this.preset) return;
    try {
      this.workletNode?.disconnect();
      const node = createExhaustWorkletNode(
        this.ctx,
        this.preset.firePattern,
        this.preset.attackMs,
        this.preset.decayMs,
      );
      node.connect(this.resonatorInput);
      this.workletNode = node;
      const param = node.parameters.get('firingFreq');
      if (param) this.freqParam = param;
    } catch {
      this.usingWorklet = false;
    }
  }

  setFrequency(hz: number, instant: boolean): void {
    if (instant) setNow(this.freqParam, hz, this.ctx);
    else ramp(this.freqParam, hz, this.ctx, 0.03);
  }

  setJitter(amount: number): void {
    const param = this.workletNode?.parameters.get('jitterAmount');
    if (param) setNow(param, amount, this.ctx);
  }

  /** rpmFrac 0..1.3, throttle 0..1; darker/quieter on a closed-throttle overrun. */
  updateTone(rpmFrac: number, throttle: number, overrun: boolean, level: number): void {
    if (!this.preset) return;
    const p = this.preset;
    let cutoff = p.filterBaseHz + rpmFrac * p.filterRpmHz * 1000 + throttle * p.filterThrottleHz;
    if (overrun) cutoff *= 0.55;
    ramp(this.lowpass.frequency, cutoff, this.ctx, 0.05);
    ramp(this.levelGain.gain, level, this.ctx, 0.08);
  }

  /** 60-120ms cut of the exhaust level, standing in for the fuel-cut + re-load thump. */
  shiftCut(): void {
    const now = this.ctx.currentTime;
    try {
      this.shiftGain.gain.cancelScheduledValues(now);
      this.shiftGain.gain.setValueAtTime(1, now);
      this.shiftGain.gain.linearRampToValueAtTime(0.15, now + SHIFT_CUT_S * 0.3);
      this.shiftGain.gain.linearRampToValueAtTime(1, now + SHIFT_CUT_S);
    } catch {
      /* ignore */
    }
  }
}
