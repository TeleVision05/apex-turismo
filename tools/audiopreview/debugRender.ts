import { EngineVoice } from '../../src/audio/EngineVoice';
import { ensureExhaustWorklet } from '../../src/audio/engine/ExhaustWorklet';
import type { CarAudioState } from '../../src/audio/AudioContract';

const CONTROL_HZ = 200;
const REDLINE_RPM = 8000;
const IDLE_RPM = 900;

/** Encodes a mono Float32 buffer as a 16-bit PCM WAV file (base64-encoded). */
function encodeWavBase64(samples: Float32Array, sampleRate: number): string {
  const bytesPerSample = 2;
  const dataSize = samples.length * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);
  const writeStr = (offset: number, s: string) => {
    for (let i = 0; i < s.length; i++) view.setUint8(offset + i, s.charCodeAt(i));
  };
  writeStr(0, 'RIFF');
  view.setUint32(4, 36 + dataSize, true);
  writeStr(8, 'WAVE');
  writeStr(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeStr(36, 'data');
  view.setUint32(40, dataSize, true);
  let offset = 44;
  for (let i = 0; i < samples.length; i++, offset += 2) {
    const s = Math.max(-1, Math.min(1, samples[i]));
    view.setInt16(offset, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  let binary = '';
  const bytes = new Uint8Array(buffer);
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function sweepCar(kind: CarAudioState['engine'], t: number, seconds: number): CarAudioState {
  const frac = Math.min(1, t / seconds);
  return {
    id: 0,
    rpm: IDLE_RPM + frac * (REDLINE_RPM - IDLE_RPM),
    redlineRpm: REDLINE_RPM,
    throttle: 1,
    gear: 1 + Math.floor(frac * 5),
    skid: 0,
    speed: frac * 60,
    relX: 0,
    relY: 0,
    relZ: 0,
    isPlayer: true,
    shifting: false,
    onGrass: false,
    onCurb: false,
    engine: kind,
  };
}

/**
 * Renders a full-throttle idle->redline sweep for `kind` through an
 * OfflineAudioContext, using ctx.suspend()/resume() to drive per-frame
 * EngineVoice.update() calls at the right offline timeline positions.
 * Returns a base64-encoded 16-bit PCM WAV.
 */
export async function renderPresetSweep(
  kind: CarAudioState['engine'],
  seconds = 4,
): Promise<string> {
  const sampleRate = 44100;
  const Ctor = (window as unknown as { OfflineAudioContext: typeof OfflineAudioContext })
    .OfflineAudioContext;
  const ctx = new Ctor(1, Math.ceil(seconds * sampleRate), sampleRate);
  const master = ctx.createGain();
  master.gain.value = 1;
  // mirrors AudioCore's engine-bus lowpass (full throttle -> its open end)
  // and master high-shelf cut, so this render matches what the player hears.
  const engineLowpass = ctx.createBiquadFilter();
  engineLowpass.type = 'lowpass';
  engineLowpass.frequency.value = 4500;
  engineLowpass.Q.value = 0.7;
  const highShelf = ctx.createBiquadFilter();
  highShelf.type = 'highshelf';
  highShelf.frequency.value = 2500;
  highShelf.gain.value = -6;
  master.connect(engineLowpass).connect(highShelf).connect(ctx.destination);

  const workletReady = ensureExhaustWorklet(ctx);
  const voice = new EngineVoice(ctx, master, workletReady);
  voice.assign(sweepCar(kind, 0, seconds));

  const dt = 1 / CONTROL_HZ;
  const steps = Math.floor(seconds * CONTROL_HZ);
  for (let i = 0; i < steps; i++) {
    const t = i * dt;
    void ctx.suspend(t).then(() => {
      voice.update(sweepCar(kind, t, seconds), dt);
      void ctx.resume();
    });
  }

  const rendered = await ctx.startRendering();
  return encodeWavBase64(rendered.getChannelData(0), sampleRate);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/**
 * Renders the sweep and POSTs the raw WAV bytes to a local sink (see
 * receive-server.mjs) rather than returning base64 — the automation tooling
 * that drives this page blocks base64-shaped output.
 */
export async function saveSweepToLocalServer(
  kind: CarAudioState['engine'],
  seconds = 4,
  endpoint = 'http://127.0.0.1:5399',
): Promise<string> {
  const base64 = await renderPresetSweep(kind, seconds);
  const bytes = base64ToBytes(base64);
  const res = await fetch(`${endpoint}/save?name=${encodeURIComponent(kind)}.wav`, {
    method: 'POST',
    body: new Blob([bytes.buffer as ArrayBuffer]),
  });
  return res.text();
}
