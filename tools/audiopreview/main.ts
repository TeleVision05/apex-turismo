import { createAudioEngine } from '../../src/audio';
import type { AudioEngine, CarAudioState } from '../../src/audio/AudioContract';

type DebugEngine = AudioEngine & { __audioDebugAnalyser(): AnalyserNode | null };

const engine = createAudioEngine() as DebugEngine;

const analyserApi = {
  getAnalyser: (): AnalyserNode | null => engine.__audioDebugAnalyser(),
  /** Returns { rms, peakFreq } sampled from the master bus analyser. */
  sample(): { rms: number; peakFreq: number | null } | null {
    const analyser = analyserApi.getAnalyser();
    if (!analyser) return null;
    const timeData = new Float32Array(analyser.fftSize);
    analyser.getFloatTimeDomainData(timeData);
    let sumSquares = 0;
    for (let i = 0; i < timeData.length; i++) sumSquares += timeData[i] * timeData[i];
    const rms = Math.sqrt(sumSquares / timeData.length);

    const freqData = new Float32Array(analyser.frequencyBinCount);
    analyser.getFloatFrequencyData(freqData);
    let maxDb = -Infinity;
    let maxIdx = -1;
    for (let i = 1; i < freqData.length; i++) {
      if (freqData[i] > maxDb) {
        maxDb = freqData[i];
        maxIdx = i;
      }
    }
    const sampleRate = (analyser.context as AudioContext).sampleRate;
    const peakFreq = maxIdx >= 0 ? (maxIdx * sampleRate) / analyser.fftSize : null;
    return { rms, peakFreq };
  },
};
(window as unknown as { __audioDebug: typeof analyserApi }).__audioDebug = analyserApi;

const log = document.getElementById('log') as HTMLDivElement;
function logLine(msg: string): void {
  const time = new Date().toISOString().slice(11, 19);
  log.textContent = `[${time}] ${msg}\n` + log.textContent;
}

const presetSelect = document.getElementById('preset') as HTMLSelectElement;
const throttleSlider = document.getElementById('throttle') as HTMLInputElement;
const throttleVal = document.getElementById('throttleVal') as HTMLSpanElement;
throttleSlider.addEventListener('input', () => {
  throttleVal.textContent = throttleSlider.value;
});

let mode: 'idle' | 'sweep' | 'drive' = 'idle';
let lastT = performance.now();
let simTime = 0;
let rpm = 1000;
let scrapeHeld = false;

function currentCar(dt: number): CarAudioState {
  const engineKind = presetSelect.value as CarAudioState['engine'];
  const throttle = Number(throttleSlider.value) / 100;
  const redline = 8000;

  if (mode === 'sweep') {
    simTime += dt;
    const phase = (Math.sin(simTime * 0.35) + 1) / 2; // 0..1, ~18s period
    rpm = 900 + phase * (redline - 900);
  } else if (mode === 'drive') {
    simTime += dt;
    rpm = driveRpm(simTime, redline);
  } else {
    rpm += (Math.max(900, throttle * redline * 0.9) - rpm) * Math.min(1, dt * 2);
  }

  const skid = mode === 'drive' ? Math.max(0, Math.sin(simTime * 1.7)) * 0.8 : 0;
  const speed = clamp((rpm / redline) * 60, 0, 60);

  return {
    id: 0,
    rpm,
    redlineRpm: redline,
    throttle: mode === 'drive' ? driveThrottle(simTime) : throttle,
    gear: Math.max(1, Math.min(6, Math.floor(rpm / 1300))),
    skid,
    speed,
    relX: 0,
    relY: 0,
    relZ: 0,
    isPlayer: true,
    shifting: mode === 'drive' && Math.floor(simTime * 2) % 20 === 0,
    onGrass: mode === 'drive' && Math.floor(simTime / 3) % 5 === 3,
    onCurb: mode === 'drive' && Math.floor(simTime / 2) % 4 === 2,
    engine: engineKind,
  };
}

function driveThrottle(t: number): number {
  const cyclePos = t % 12;
  if (cyclePos < 7) return clamp(cyclePos / 3, 0, 1);
  return clamp(1 - (cyclePos - 7) / 3, 0, 0.9);
}

function driveRpm(t: number, redline: number): number {
  const throttle = driveThrottle(t);
  const gearPhase = (t % 2) / 2;
  const base = 1200 + gearPhase * (redline - 2000) * (0.4 + throttle * 0.6);
  return clamp(base, 900, redline * 1.05);
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.min(hi, Math.max(lo, v));
}

function loop(): void {
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastT) / 1000);
  lastT = now;
  const state = currentCar(dt);
  engine.updateCars([state], dt);
  (window as unknown as { __audioDebug: { lastState?: CarAudioState } }).__audioDebug.lastState = state;
  if (scrapeHeld) engine.playWallScrape(0.6);
  requestAnimationFrame(loop);
}
requestAnimationFrame(loop);

document.getElementById('start')!.addEventListener('click', async () => {
  await engine.resume();
  engine.setSettings({ master: 1, engine: 1, effects: 0.8, music: 0.7 });
  logLine('resumed');
});

document.getElementById('sweep')!.addEventListener('click', (e) => {
  mode = mode === 'sweep' ? 'idle' : 'sweep';
  simTime = 0;
  (e.target as HTMLElement).classList.toggle('active', mode === 'sweep');
  logLine(`sweep ${mode === 'sweep' ? 'on' : 'off'}`);
});

document.getElementById('drive')!.addEventListener('click', (e) => {
  mode = mode === 'drive' ? 'idle' : 'drive';
  simTime = 0;
  (e.target as HTMLElement).classList.toggle('active', mode === 'drive');
  logLine(`drive simulation ${mode === 'drive' ? 'on' : 'off'}`);
});

document.getElementById('collision')!.addEventListener('click', () => {
  engine.playCollision(1, (Math.random() - 0.5) * 10, 3);
  logLine('collision');
});

document.getElementById('scrape')!.addEventListener('mousedown', () => {
  scrapeHeld = true;
});
document.getElementById('scrape')!.addEventListener('mouseup', () => {
  scrapeHeld = false;
});
document.getElementById('scrape')!.addEventListener('mouseleave', () => {
  scrapeHeld = false;
});

document.querySelectorAll<HTMLButtonElement>('[data-ui]').forEach((btn) => {
  btn.addEventListener('click', () => {
    const kind = btn.dataset.ui as Parameters<AudioEngine['playUi']>[0];
    engine.playUi(kind);
    logLine(`ui: ${kind}`);
  });
});

let musicOn = false;
document.getElementById('music')!.addEventListener('click', (e) => {
  musicOn = !musicOn;
  engine.setMenuMusic(musicOn);
  (e.target as HTMLElement).classList.toggle('active', musicOn);
  logLine(`music ${musicOn ? 'on' : 'off'}`);
});

let ambienceOn = false;
document.getElementById('ambience')!.addEventListener('click', (e) => {
  ambienceOn = !ambienceOn;
  engine.setRaceAmbience(ambienceOn);
  (e.target as HTMLElement).classList.toggle('active', ambienceOn);
  logLine(`ambience ${ambienceOn ? 'on' : 'off'}`);
});

let raceActive = true;
document.getElementById('raceActive')!.addEventListener('click', (e) => {
  raceActive = !raceActive;
  engine.setRaceActive(raceActive);
  (e.target as HTMLElement).classList.toggle('active', !raceActive);
  logLine(`race active: ${raceActive}`);
});

document.getElementById('sample')!.addEventListener('click', () => {
  const s = analyserApi.sample();
  logLine(s ? `rms=${s.rms.toFixed(4)} peakFreq=${s.peakFreq?.toFixed(1)}Hz` : 'no analyser (unsupported mock?)');
});
