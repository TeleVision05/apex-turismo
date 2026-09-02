// Standalone preview harness for src/ui. Mounts the real UI against a mock
// GameFacade so every screen can be exercised with mouse and keyboard without
// the rest of the game. Not shipped — dev-server only.
import { createUi } from '../../src/ui/index';
import { MockFacade } from './mockFacade';
import { buildHudState } from './syntheticHud';
import type { ScreenName } from '../../src/ui/UiContract';
import type { RaceConfig, RaceResult } from '../../src/core/types';

const uiRoot = document.getElementById('ui-root')!;

const facade = new MockFacade();
const ui = createUi(facade, uiRoot);
facade.bindUi(ui);

const DEFAULT_CONFIG: RaceConfig = {
  mode: 'race',
  trackId: 'suzuka',
  laps: 4,
  opponents: 7,
  difficulty: 'normal',
  timeOfDay: 'noon',
  weather: 'clear',
  playerCarId: '0',
  rollingStart: false,
  transmission: 'auto',
};

const DEMO_RESULT: RaceResult = {
  config: DEFAULT_CONFIG,
  entries: [
    {
      name: 'Preview Driver',
      carName: 'Your car',
      position: 1,
      lap: 4,
      gapMs: null,
      bestLapMs: 68210,
      isPlayer: true,
      finished: true,
      totalTimeMs: 274900,
    },
    {
      name: 'M. Chen',
      carName: 'Rival GT',
      position: 2,
      lap: 4,
      gapMs: 1150,
      bestLapMs: 68470,
      isPlayer: false,
      finished: true,
      totalTimeMs: 276050,
    },
    {
      name: 'K. Nakajima',
      carName: 'Rival GT',
      position: 3,
      lap: 4,
      gapMs: 2430,
      bestLapMs: 68820,
      isPlayer: false,
      finished: true,
      totalTimeMs: 277330,
    },
  ],
  playerPosition: 1,
  creditsEarned: 8500,
  newRecord: true,
  bestLapMs: 68210,
};

// --- debug toolbar: jump straight to any screen for fast visual QA -------
const SCREENS: ScreenName[] = [
  'title',
  'home',
  'garage',
  'dealership',
  'tuning',
  'events',
  'custom',
  'timetrial',
  'settings',
  'controls',
  'records',
  'loading',
  'race',
  'pause',
  'results',
  'replay',
];
const toolbar = document.getElementById('toolbar')!;
for (const name of SCREENS) {
  const btn = document.createElement('button');
  btn.textContent = name;
  btn.addEventListener('click', () => jumpTo(name));
  toolbar.appendChild(btn);
}

function jumpTo(name: ScreenName): void {
  if (name === 'race' || name === 'pause') {
    facade.startRace(DEFAULT_CONFIG);
    if (name === 'pause') window.setTimeout(() => facade.togglePause(), 500);
  } else if (name === 'results') {
    ui.showResults(DEMO_RESULT);
  } else if (name === 'replay') {
    facade.startReplay();
  } else {
    facade.debugJump(name);
  }
}

// --- input loop ------------------------------------------------------
let last = performance.now();
function frame(now: number): void {
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;

  const input = facade.inputManager();
  input.update(dt);

  const mode = facade.raceMode();
  if ((mode === 'race' || mode === 'paused') && input.state.pause) facade.togglePause();

  ui.handleInput(input.state);

  if (mode === 'race') {
    const config = facade.currentRaceConfig();
    if (config) {
      const elapsed = facade.raceElapsedS();
      const hud = buildHudState(elapsed, config);
      ui.updateHud(hud);
      if (hud.finished && elapsed > config.laps * 22 + 6) facade.finishRace();
    }
  }
  facade.tickReplay(dt);

  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// Quick manual finish for testing the results/replay screens without waiting.
window.addEventListener('keydown', (e) => {
  if (e.code === 'KeyF' && facade.raceMode() === 'race') facade.finishRace();
});
