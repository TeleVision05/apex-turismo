import workletSource from '../worklet/engine-processor.js?raw';
import type { FiringPulse } from '../EnginePresets';

const PROCESSOR_NAME = 'engine-processor';

let blobUrlCache: string | null = null;
const registeredContexts = new WeakSet<BaseAudioContext>();

function blobUrl(): string {
  blobUrlCache ??= URL.createObjectURL(new Blob([workletSource], { type: 'text/javascript' }));
  return blobUrlCache;
}

/** True when this context can host the sample-accurate worklet exhaust model (real-time or offline). */
export function workletAvailable(ctx: BaseAudioContext): boolean {
  return typeof ctx.audioWorklet?.addModule === 'function';
}

/**
 * Registers the pulse-train processor once per context (idempotent, safe to
 * call from every voice). Resolves false — never throws — if AudioWorklet is
 * unavailable or the module fails to load, so callers can fall back cleanly.
 * Accepts an OfflineAudioContext too, for the offline preset-sweep renderer.
 */
export async function ensureExhaustWorklet(ctx: BaseAudioContext): Promise<boolean> {
  if (!workletAvailable(ctx)) return false;
  if (registeredContexts.has(ctx)) return true;
  try {
    await ctx.audioWorklet.addModule(blobUrl());
    registeredContexts.add(ctx);
    return true;
  } catch {
    return false;
  }
}

/** Builds one AudioWorkletNode instance of the registered exhaust processor. */
export function createExhaustWorkletNode(
  ctx: BaseAudioContext,
  pattern: FiringPulse[],
  attackMs: number,
  decayMs: number,
): AudioWorkletNode {
  return new AudioWorkletNode(ctx, PROCESSOR_NAME, {
    numberOfInputs: 0,
    numberOfOutputs: 1,
    outputChannelCount: [1],
    processorOptions: { pattern, attackMs, decayMs },
  });
}
