import { clamp, loopingNoise, noiseBuffer, ramp } from './AudioCore';

const COLLISION_MIN_GAP = 0.08;

/** Short metallic impact burst, rate-limited to one every 80ms. */
export class CollisionFx {
  private lastPlay = -Infinity;
  private panner: StereoPannerNode;
  private distGain: GainNode;
  private burstBuffer: AudioBuffer;

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.panner = ctx.createStereoPanner();
    this.distGain = ctx.createGain();
    this.panner.connect(this.distGain).connect(destination);
    this.burstBuffer = noiseBuffer(ctx, 1, 'white');
  }

  play(intensity: number, relX: number, relZ: number): void {
    const now = this.ctx.currentTime;
    if (now - this.lastPlay < COLLISION_MIN_GAP) return;
    this.lastPlay = now;
    const amount = clamp(intensity, 0, 1.5);
    const dist = Math.hypot(relX, relZ);
    ramp(this.panner.pan, clamp(relX / 20, -1, 1), this.ctx, 0.01);
    ramp(this.distGain.gain, 1 / (1 + dist / 15), this.ctx, 0.01);
    this.burstSweep(amount);
    this.burstThump(amount);
    this.burstPartials(amount);
  }

  private burstSweep(amount: number): void {
    const src = this.ctx.createBufferSource();
    src.buffer = this.burstBuffer;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 2.5;
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    bp.frequency.setValueAtTime(3200, now);
    bp.frequency.exponentialRampToValueAtTime(500, now + 0.18);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.5 * amount), now + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    src.connect(bp).connect(g).connect(this.panner);
    src.start(now);
    src.stop(now + 0.3);
    src.onended = () => this.safeDisconnect(src, bp, g);
  }

  private burstThump(amount: number): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'sine';
    const g = this.ctx.createGain();
    const now = this.ctx.currentTime;
    osc.frequency.setValueAtTime(60 + Math.random() * 30, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.6 * amount), now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.2);
    osc.connect(g).connect(this.panner);
    osc.start(now);
    osc.stop(now + 0.25);
    osc.onended = () => this.safeDisconnect(osc, g);
  }

  private burstPartials(amount: number): void {
    const now = this.ctx.currentTime;
    for (const freq of [1200, 1850, 2600]) {
      const osc = this.ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.value = freq * (1 + (Math.random() - 0.5) * 0.05);
      const g = this.ctx.createGain();
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.001, 0.15 * amount), now + 0.005);
      g.gain.exponentialRampToValueAtTime(0.0001, now + 0.1);
      osc.connect(g).connect(this.panner);
      osc.start(now);
      osc.stop(now + 0.15);
      osc.onended = () => this.safeDisconnect(osc, g);
    }
  }

  private safeDisconnect(...nodes: AudioNode[]): void {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }
}

/** Continuous scraping noise; decays on its own once `play` stops being called each frame. */
export class WallScrapeFx {
  private gain: GainNode;

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
  ) {
    const src = loopingNoise(ctx, 1, 'white');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 1000;
    bp.Q.value = 0.8;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    src.connect(bp).connect(this.gain).connect(destination);
  }

  play(intensity: number): void {
    const now = this.ctx.currentTime;
    const g = this.gain.gain;
    try {
      const current = g.value;
      g.cancelScheduledValues(now);
      g.setValueAtTime(current, now);
      g.setTargetAtTime(clamp(intensity, 0, 1) * 0.5, now, 0.04);
      g.setTargetAtTime(0, now + 0.15, 0.2);
    } catch {
      /* ignore */
    }
  }
}

/** Wind noise for the player, audible above roughly 80 km/h. */
export class WindFx {
  private gain: GainNode;
  private filter: BiquadFilterNode;

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
  ) {
    const src = loopingNoise(ctx, 2, 'white');
    this.filter = ctx.createBiquadFilter();
    this.filter.type = 'lowpass';
    this.filter.frequency.value = 300;
    this.gain = ctx.createGain();
    this.gain.gain.value = 0;
    src.connect(this.filter).connect(this.gain).connect(destination);
  }

  update(speedMs: number): void {
    const speedFrac = clamp((speedMs - 20) / 25, 0, 1);
    ramp(this.filter.frequency, 250 + speedMs * 20, this.ctx, 0.2);
    ramp(this.gain.gain, speedFrac * 0.3, this.ctx, 0.3);
  }

  idle(): void {
    ramp(this.gain.gain, 0, this.ctx, 0.3);
  }
}
