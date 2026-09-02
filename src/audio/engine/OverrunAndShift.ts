import { noiseBuffer } from '../AudioCore';

const LIFT_DECAY_S = 1.5;
const LIFT_BOOST = 4;
const BLIP_DURATION_S = 0.18;
const BLIP_RATIO = 1.35;

/**
 * Overrun pops/bangs, the gear-shift re-load thump and the downshift
 * rev-match blip. Pops and the thump are one-shot noise bursts fed into the
 * exhaust resonator input so they share the car's exhaust colour; the blip
 * is a temporary multiplier the caller applies to the firing frequency.
 */
export class OverrunAndShift {
  private overrunCooldown = 0;
  private liftBoostUntil = 0;
  private blipUntil = 0;
  private burstBuffer: AudioBuffer;

  constructor(private ctx: BaseAudioContext) {
    this.burstBuffer = noiseBuffer(ctx, 0.3, 'white');
  }

  /** Clears cooldowns/timers when a pool slot is reassigned to a new car. */
  reset(): void {
    this.overrunCooldown = 0;
    this.liftBoostUntil = 0;
    this.blipUntil = 0;
  }

  /** Call once on the rising edge of an overrun (throttle just lifted at high rpm). */
  onOverrunStart(): void {
    this.liftBoostUntil = this.ctx.currentTime + LIFT_DECAY_S;
  }

  /** Call once on a detected downshift to start the rev-match blip. */
  triggerBlip(): void {
    this.blipUntil = this.ctx.currentTime + BLIP_DURATION_S;
  }

  /** >1 while a downshift blip is active; multiply the target firing frequency by this. */
  blipMultiplier(): number {
    return this.ctx.currentTime < this.blipUntil ? BLIP_RATIO : 1;
  }

  private liftBoost(): number {
    const remaining = this.liftBoostUntil - this.ctx.currentTime;
    if (remaining <= 0) return 1;
    return 1 + (LIFT_BOOST - 1) * (remaining / LIFT_DECAY_S);
  }

  updateOverrun(overrun: boolean, dt: number, amount: number, resonatorInput: AudioNode): void {
    this.overrunCooldown = Math.max(0, this.overrunCooldown - dt);
    if (!overrun || this.overrunCooldown > 0 || amount <= 0) return;
    const boost = this.liftBoost();
    if (Math.random() > amount * boost * dt * 5) return;
    this.overrunCooldown = 0.05 + (1 - amount) * 0.1;
    this.fireBurst(resonatorInput, 0.12 * amount * boost, 0.05);
  }

  fireShiftThump(resonatorInput: AudioNode): void {
    this.fireBurst(resonatorInput, 0.35, 0.03);
  }

  private fireBurst(destination: AudioNode, peak: number, dur: number): void {
    try {
      const src = this.ctx.createBufferSource();
      src.buffer = this.burstBuffer;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.frequency.value = 1200 + Math.random() * 1800;
      bp.Q.value = 1.5;
      const g = this.ctx.createGain();
      const now = this.ctx.currentTime;
      g.gain.setValueAtTime(0.0001, now);
      g.gain.exponentialRampToValueAtTime(Math.max(0.0005, peak), now + dur * 0.2);
      g.gain.exponentialRampToValueAtTime(0.0001, now + dur + 0.1);
      src.connect(bp).connect(g).connect(destination);
      src.start(now);
      src.stop(now + dur + 0.15);
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
