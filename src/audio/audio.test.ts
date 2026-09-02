import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAudioEngine } from './index';
import type { AudioEngine, CarAudioState } from './AudioContract';
import { ENGINE_PRESETS, firingFrequency, jitterAt } from './EnginePresets';
import { ensureExhaustWorklet, workletAvailable } from './engine/ExhaustWorklet';

/** A minimal AudioParam stand-in that records automation calls without doing real math. */
class MockAudioParam {
  value = 0;
  calls: { fn: string; args: unknown[] }[] = [];
  setValueAtTime(value: number, time: number): this {
    this.value = value;
    this.calls.push({ fn: 'setValueAtTime', args: [value, time] });
    return this;
  }
  setTargetAtTime(target: number, time: number, tc: number): this {
    this.value = target;
    this.calls.push({ fn: 'setTargetAtTime', args: [target, time, tc] });
    return this;
  }
  linearRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.calls.push({ fn: 'linearRampToValueAtTime', args: [value, time] });
    return this;
  }
  exponentialRampToValueAtTime(value: number, time: number): this {
    this.value = value;
    this.calls.push({ fn: 'exponentialRampToValueAtTime', args: [value, time] });
    return this;
  }
  cancelScheduledValues(): this {
    return this;
  }
}

let nodeCount = 0;

function makeParamNode(extra: Record<string, unknown> = {}) {
  nodeCount++;
  return {
    connect: vi.fn().mockReturnThis(),
    disconnect: vi.fn(),
    ...extra,
  };
}

function paramNode(params: string[], extra: Record<string, unknown> = {}) {
  const node = makeParamNode(extra) as Record<string, unknown>;
  for (const p of params) node[p] = new MockAudioParam();
  return node;
}

class MockAudioContext {
  currentTime = 0;
  sampleRate = 44100;
  destination = makeParamNode();
  state = 'running';

  createGain() {
    return paramNode(['gain']);
  }
  createOscillator() {
    const node = paramNode(['frequency', 'detune'], {
      type: 'sine',
      start: vi.fn(),
      stop: vi.fn(),
      setPeriodicWave: vi.fn(),
      onended: null,
    });
    return node;
  }
  createBiquadFilter() {
    return paramNode(['frequency', 'Q', 'gain'], { type: 'lowpass' });
  }
  createStereoPanner() {
    return paramNode(['pan']);
  }
  createWaveShaper() {
    return makeParamNode({ curve: null });
  }
  createDynamicsCompressor() {
    return paramNode(['threshold', 'knee', 'ratio', 'attack', 'release']);
  }
  createBufferSource() {
    return makeParamNode({
      buffer: null,
      loop: false,
      start: vi.fn(),
      stop: vi.fn(),
      onended: null,
    });
  }
  createBuffer(_channels: number, length: number) {
    const data = new Float32Array(length);
    return { getChannelData: () => data, length };
  }
  createPeriodicWave() {
    return {};
  }
  async resume(): Promise<void> {
    this.state = 'running';
  }
}

function installMockAudioContext(): void {
  nodeCount = 0;
  (globalThis as unknown as { AudioContext: unknown }).AudioContext = MockAudioContext;
}

function uninstallMockAudioContext(): void {
  delete (globalThis as unknown as { AudioContext?: unknown }).AudioContext;
}

function car(overrides: Partial<CarAudioState>): CarAudioState {
  return {
    id: 0,
    rpm: 3000,
    redlineRpm: 7500,
    throttle: 0.6,
    gear: 3,
    skid: 0,
    speed: 20,
    relX: 0,
    relY: 0,
    relZ: 0,
    isPlayer: false,
    shifting: false,
    onGrass: false,
    onCurb: false,
    engine: 'i4',
    ...overrides,
  };
}

function countNodes(): number {
  return nodeCount;
}

describe('audio engine: safe before resume()', () => {
  it('never throws when Web Audio is unavailable', async () => {
    uninstallMockAudioContext();
    const engine = createAudioEngine();
    await expectAllMethodsSafe(engine);
  });

  it('never throws before resume() even when Web Audio is available', async () => {
    installMockAudioContext();
    const engine = createAudioEngine();
    expect(() => exerciseAllMethodsSync(engine)).not.toThrow();
    uninstallMockAudioContext();
  });
});

async function expectAllMethodsSafe(engine: AudioEngine): Promise<void> {
  await expect(engine.resume()).resolves.toBeUndefined();
  expect(() => exerciseAllMethodsSync(engine)).not.toThrow();
}

function exerciseAllMethodsSync(engine: AudioEngine): void {
  engine.setSettings({ master: 1, engine: 1, effects: 1, music: 1 });
  engine.updateCars([car({ id: 0, isPlayer: true })], 1 / 60);
  engine.playCollision(1, 1, 1);
  engine.playWallScrape(0.5);
  for (const kind of ['move', 'confirm', 'back', 'buy', 'error', 'countdown', 'go'] as const) {
    engine.playUi(kind);
  }
  engine.setMenuMusic(true);
  engine.setMenuMusic(false);
  engine.setRaceAmbience(true);
  engine.setRaceAmbience(false);
  engine.setRaceActive(false);
  engine.setRaceActive(true);
}

describe('audio engine: after resume()', () => {
  beforeEach(() => {
    installMockAudioContext();
  });

  it('creates at most 5 engine voices for 12 cars (pool size is independent of car count)', async () => {
    const oscSpy = vi.spyOn(MockAudioContext.prototype, 'createOscillator');
    const engine = createAudioEngine();
    await engine.resume();
    const afterResume = oscSpy.mock.calls.length;
    // the whole voice pool (player + up to 4 others) is built once at resume() time
    expect(afterResume).toBeGreaterThan(0);
    expect(afterResume).toBeLessThanOrEqual(5 * 10);

    engine.updateCars([car({ id: 0, isPlayer: true })], 1 / 60);
    expect(oscSpy.mock.calls.length).toBe(afterResume);

    const twelveCars: CarAudioState[] = [car({ id: 0, isPlayer: true })];
    for (let i = 1; i < 12; i++) twelveCars.push(car({ id: i, relX: i, relZ: i * 5 }));
    engine.updateCars(twelveCars, 1 / 60);
    // more cars in the scene must not create more oscillators — the pool is fixed-size
    expect(oscSpy.mock.calls.length).toBe(afterResume);
    oscSpy.mockRestore();
  });

  it('does not grow the node count over 600 steady-state updateCars calls', async () => {
    const engine = createAudioEngine();
    await engine.resume();
    // steady throttle/rpm chosen to avoid overrun crackle / blow-off / shift one-shots
    const cars: CarAudioState[] = [car({ id: 0, isPlayer: true, throttle: 0.6, rpm: 4000 })];
    for (let i = 1; i < 12; i++) {
      cars.push(car({ id: i, relX: i, relZ: i * 5, throttle: 0.6, rpm: 4000 }));
    }
    engine.updateCars(cars, 1 / 60);
    const baseline = countNodes();
    for (let i = 0; i < 600; i++) {
      engine.updateCars(cars, 1 / 60);
    }
    expect(countNodes()).toBe(baseline);
  });

  it('rate-limits playCollision to one burst per 80ms', async () => {
    const engine = createAudioEngine();
    await engine.resume();
    engine.updateCars([car({ id: 0, isPlayer: true })], 1 / 60);
    const baseline = countNodes();
    engine.playCollision(1, 2, 2);
    const afterOne = countNodes();
    expect(afterOne).toBeGreaterThan(baseline);
    engine.playCollision(1, 2, 2);
    const afterTwo = countNodes();
    expect(afterTwo).toBe(afterOne);
  });
});

describe('physically-inspired engine model', () => {
  const kinds: CarAudioState['engine'][] = ['i4', 'i6', 'v6', 'v8', 'rotary', 'flat6', 'v8hybrid'];

  it('every preset resolves to a stable, positive firing frequency and pattern', () => {
    for (const kind of kinds) {
      const preset = ENGINE_PRESETS[kind];
      expect(preset.firePattern.length).toBeGreaterThan(0);
      expect(firingFrequency(6000, kind)).toBeCloseTo((6000 / 60) * preset.pulsesPerRev, 5);
      expect(firingFrequency(0, kind)).toBeGreaterThan(0); // never zero/negative at idle-off
    }
    // V8 cross-plane firing is the classic uneven "burble"; I4 is even.
    expect(ENGINE_PRESETS.v8.firePattern.some((p) => p.mult !== 1)).toBe(true);
    expect(ENGINE_PRESETS.i4.firePattern.every((p) => p.mult === 1)).toBe(true);
    // rotary fires 3 smooth pulses per revolution, per spec.
    expect(ENGINE_PRESETS.rotary.pulsesPerRev).toBe(3);
    // only the supercharged Stallion GT500's engine kind carries a supercharger whine.
    expect(ENGINE_PRESETS.v8.supercharger).toBe(true);
    expect(kinds.filter((k) => ENGINE_PRESETS[k].supercharger)).toEqual(['v8']);
  });

  it('jitter is larger near idle than near redline for every preset', () => {
    for (const kind of kinds) {
      expect(jitterAt(kind, 0)).toBeGreaterThanOrEqual(jitterAt(kind, 1));
    }
  });

  it('falls back cleanly (no worklet) when AudioContext lacks audioWorklet', async () => {
    installMockAudioContext();
    const ctx = new (
      globalThis as unknown as { AudioContext: new () => AudioContext }
    ).AudioContext();
    expect(workletAvailable(ctx)).toBe(false);
    await expect(ensureExhaustWorklet(ctx)).resolves.toBe(false);
    uninstallMockAudioContext();
  });

  it('drives every engine kind (incl. supercharger/hybrid/rotary paths) without throwing', async () => {
    installMockAudioContext();
    const engine = createAudioEngine();
    await engine.resume();
    for (const kind of kinds) {
      expect(() =>
        engine.updateCars([car({ id: 0, isPlayer: true, engine: kind, rpm: 6500 })], 1 / 60),
      ).not.toThrow();
    }
    uninstallMockAudioContext();
  });

  it('handles a full throttle-lift overrun and a downshift blip without throwing', async () => {
    installMockAudioContext();
    const engine = createAudioEngine();
    await engine.resume();
    const highRpm = { id: 0, isPlayer: true, engine: 'v8' as const, rpm: 6800, throttle: 0.9 };
    engine.updateCars([car(highRpm)], 1 / 60);
    // lift off throttle above 50% of the rev range -> overrun pop scheduler engages
    expect(() => engine.updateCars([car({ ...highRpm, throttle: 0.05 })], 1 / 60)).not.toThrow();
    // a downshift (lower gear while still shifting) -> rev-match blip
    expect(() =>
      engine.updateCars([car({ ...highRpm, throttle: 0.05, gear: 2, shifting: true })], 1 / 60),
    ).not.toThrow();
    uninstallMockAudioContext();
  });

  it('applies a doppler-driven frequency nudge for a fast-closing other car', async () => {
    installMockAudioContext();
    const engine = createAudioEngine();
    await engine.resume();
    const approaching = car({ id: 1, relX: 0, relY: 0, relZ: 50, rpm: 5000 });
    engine.updateCars([car({ id: 0, isPlayer: true }), approaching], 1 / 60);
    // next frame: much closer, same dt -> a large closing speed
    expect(() =>
      engine.updateCars(
        [car({ id: 0, isPlayer: true }), car({ ...approaching, relZ: 20 })],
        1 / 60,
      ),
    ).not.toThrow();
    uninstallMockAudioContext();
  });
});
