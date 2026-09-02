import { clamp, loopingNoise, ramp } from './AudioCore';

const SCHEDULER_MS = 200;
const FADE_S = 1.5;

/** Very quiet distant crowd + occasional far-off PA tone bursts. */
export class RaceAmbience {
  private out: GainNode;
  private crowdGain: GainNode;
  private paTimer: ReturnType<typeof setInterval> | null = null;
  private nextPaAt = 0;
  private on = false;

  constructor(
    private ctx: AudioContext,
    destination: AudioNode,
  ) {
    this.out = ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(destination);

    const src = loopingNoise(ctx, 3, 'white');
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = 700;
    bp.Q.value = 0.6;
    this.crowdGain = ctx.createGain();
    this.crowdGain.gain.value = 0.05;
    src.connect(bp).connect(this.crowdGain).connect(this.out);

    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.11;
    const lfoDepth = ctx.createGain();
    lfoDepth.gain.value = 0.02;
    lfo.connect(lfoDepth).connect(this.crowdGain.gain);
    lfo.start();
  }

  setOn(on: boolean): void {
    if (on === this.on) return;
    this.on = on;
    ramp(this.out.gain, on ? 1 : 0, this.ctx, FADE_S / 3);
    if (on) this.startPaScheduler();
    else this.stopPaScheduler();
  }

  private startPaScheduler(): void {
    this.nextPaAt = this.ctx.currentTime + 3 + Math.random() * 8;
    if (this.paTimer === null) {
      this.paTimer = setInterval(() => this.tick(), SCHEDULER_MS);
    }
  }

  private stopPaScheduler(): void {
    if (this.paTimer !== null) {
      clearInterval(this.paTimer);
      this.paTimer = null;
    }
  }

  private tick(): void {
    if (this.ctx.currentTime < this.nextPaAt) return;
    this.playPaBurst();
    this.nextPaAt = this.ctx.currentTime + 6 + Math.random() * 12;
  }

  private playPaBurst(): void {
    const osc = this.ctx.createOscillator();
    osc.type = 'square';
    const freq = 320 + Math.random() * 260;
    const bp = this.ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.frequency.value = freq * 2;
    bp.Q.value = 3;
    const g = this.ctx.createGain();
    const pan = this.ctx.createStereoPanner();
    pan.pan.value = clamp((Math.random() - 0.5) * 2, -1, 1);
    const now = this.ctx.currentTime;
    const dur = 0.4 + Math.random() * 0.6;
    osc.frequency.setValueAtTime(freq, now);
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.02, now + 0.05);
    g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(bp).connect(g).connect(pan).connect(this.out);
    osc.start(now);
    osc.stop(now + dur + 0.05);
    osc.onended = () => this.cleanup(osc, bp, g, pan);
  }

  private cleanup(...nodes: AudioNode[]): void {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        /* already disconnected */
      }
    }
  }
}
