import { noiseBuffer } from './AudioCore';

export type UiKind = 'move' | 'confirm' | 'back' | 'buy' | 'error' | 'countdown' | 'go';

/** Short, quiet, synthesised UI blips. Every call creates a handful of one-shot nodes that self-clean via onended. */
export function playUiSound(ctx: AudioContext, destination: AudioNode, kind: UiKind): void {
  try {
    switch (kind) {
      case 'move':
        return tone(ctx, destination, 880, 0.03, 0.06, 'sine');
      case 'confirm':
        return twoTone(ctx, destination, 660, 990, 0.08);
      case 'back':
        return twoTone(ctx, destination, 660, 440, 0.08);
      case 'buy':
        return arpeggio(ctx, destination, [523, 659, 784, 1047]);
      case 'error':
        return buzz(ctx, destination);
      case 'countdown':
        return tone(ctx, destination, 880, 0.12, 0.12, 'sine');
      case 'go':
        return tone(ctx, destination, 1760, 0.5, 0.16, 'triangle');
    }
  } catch {
    /* mock context lacking oscillator support */
  }
}

function tone(
  ctx: AudioContext,
  destination: AudioNode,
  freq: number,
  dur: number,
  peak: number,
  type: OscillatorType,
): void {
  const osc = ctx.createOscillator();
  osc.type = type;
  osc.frequency.value = freq;
  const g = ctx.createGain();
  const now = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + Math.min(0.015, dur * 0.2));
  g.gain.exponentialRampToValueAtTime(0.0001, now + dur);
  osc.connect(g).connect(destination);
  osc.start(now);
  osc.stop(now + dur + 0.02);
  osc.onended = () => cleanup(osc, g);
}

function twoTone(
  ctx: AudioContext,
  destination: AudioNode,
  f1: number,
  f2: number,
  peak: number,
): void {
  tone(ctx, destination, f1, 0.06, peak, 'sine');
  const osc = ctx.createOscillator();
  osc.type = 'sine';
  const g = ctx.createGain();
  const now = ctx.currentTime + 0.06;
  osc.frequency.value = f2;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(peak, now + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.09);
  osc.connect(g).connect(destination);
  osc.start(now);
  osc.stop(now + 0.12);
  osc.onended = () => cleanup(osc, g);
}

function arpeggio(ctx: AudioContext, destination: AudioNode, freqs: number[]): void {
  freqs.forEach((f, i) => {
    const osc = ctx.createOscillator();
    osc.type = 'triangle';
    osc.frequency.value = f;
    const g = ctx.createGain();
    const now = ctx.currentTime + i * 0.07;
    g.gain.setValueAtTime(0.0001, now);
    g.gain.exponentialRampToValueAtTime(0.09, now + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, now + 0.22);
    osc.connect(g).connect(destination);
    osc.start(now);
    osc.stop(now + 0.25);
    osc.onended = () => cleanup(osc, g);
  });
}

function buzz(ctx: AudioContext, destination: AudioNode): void {
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer(ctx, 0.3, 'white');
  const bp = ctx.createBiquadFilter();
  bp.type = 'lowpass';
  bp.frequency.value = 220;
  const g = ctx.createGain();
  const now = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, now);
  g.gain.exponentialRampToValueAtTime(0.12, now + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);
  src.connect(bp).connect(g).connect(destination);
  src.start(now);
  src.stop(now + 0.3);
  src.onended = () => cleanup(src, bp, g);
}

function cleanup(...nodes: AudioNode[]): void {
  for (const n of nodes) {
    try {
      n.disconnect();
    } catch {
      /* already disconnected */
    }
  }
}
