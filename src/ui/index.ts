import './ui.css';
import { el } from './dom';
import { FocusManager } from './Focus';
import { Hud } from './hud/Hud';
import { ToastLayer } from './toast';
import { createTitleScreen } from './screens/title';
import { createHomeScreen } from './screens/home';
import { createGarageScreen } from './screens/garage';
import { createDealershipScreen } from './screens/dealership';
import { createTuningScreen } from './screens/tuning';
import { createEventsScreen } from './screens/events';
import { createCustomScreen } from './screens/custom';
import { createTimeTrialScreen } from './screens/timetrial';
import { createSettingsScreen } from './screens/settings';
import { createControlsScreen } from './screens/controls';
import { createRecordsScreen } from './screens/records';
import { createLoadingScreen } from './screens/loading';
import { createPauseScreen } from './screens/pause';
import { createResultsScreen } from './screens/results';
import { createReplayScreen } from './screens/replay';
import type { GameFacade, ScreenName, UiController } from './UiContract';
import type { Screen, ScreenContext } from './Screen';
import type { HudState, InputState, RaceResult } from '../core/types';

const HUD_VISIBLE_ON: ScreenName[] = ['race', 'pause'];

type LoadingScreen = Screen & { setProgress: (progress: number, text: string) => void };

/** Owns screen switching, focus routing and the HUD. One instance per game. */
class UiApp {
  private screensLayer = el('div', 'screens');
  private toastLayer = new ToastLayer();
  private hud: Hud;
  private focusManager = new FocusManager(() => this.facade.playUiSound('move'));
  private screens: Record<ScreenName, Screen>;
  private currentName: ScreenName | null = null;
  private history: ScreenName[] = [];
  private ctx: ScreenContext;
  /**
   * True for the remainder of the current `handleInput` call right after
   * `showScreen`/`showResults` navigates us somewhere new. The same raw key
   * (Escape) that makes the game call `togglePause()` also sets `menuBack`
   * in the same InputState frame — without this guard, handleInput would
   * immediately treat that menuBack as "go back" and undo the pause
   * navigation that just happened moments earlier in the same tick.
   */
  private suppressBackOnce = false;

  constructor(
    private facade: GameFacade,
    private root: HTMLElement,
  ) {
    this.root.classList.add('apex-ui');
    this.hud = new Hud(facade);
    this.ctx = {
      facade,
      show: (name, data) => this.navigate(name, data, true),
      back: () => this.goBack(),
      refresh: () => this.refresh(),
      toast: (text) => this.toastLayer.show(text),
      sound: (kind) => facade.playUiSound(kind),
    };
    this.screens = this.buildScreens();
    for (const name of Object.keys(this.screens) as ScreenName[]) {
      this.screensLayer.appendChild(this.screens[name].el);
    }
    this.root.append(this.screensLayer, this.hud.el, this.toastLayer.el);
    this.navigate('title', undefined, false);
  }

  private buildScreens(): Record<ScreenName, Screen> {
    const ctx = this.ctx;
    return {
      title: createTitleScreen(ctx),
      home: createHomeScreen(ctx),
      garage: createGarageScreen(ctx),
      dealership: createDealershipScreen(ctx),
      tuning: createTuningScreen(ctx),
      events: createEventsScreen(ctx),
      custom: createCustomScreen(ctx),
      timetrial: createTimeTrialScreen(ctx),
      settings: createSettingsScreen(ctx),
      controls: createControlsScreen(ctx),
      records: createRecordsScreen(ctx),
      loading: createLoadingScreen(ctx),
      race: {
        el: el('div', 'screen screen-race'),
        render: () => undefined,
        focus: () => ({ items: [] }),
      },
      pause: createPauseScreen(ctx),
      results: createResultsScreen(ctx),
      replay: createReplayScreen(ctx),
    };
  }

  private updateChrome(): void {
    for (const name of Object.keys(this.screens) as ScreenName[]) {
      this.screens[name].el.classList.toggle('active', name === this.currentName);
    }
    const showHud = this.currentName !== null && HUD_VISIBLE_ON.includes(this.currentName);
    this.hud.el.classList.toggle('hidden-hud', !showHud);
    this.hud.el.classList.toggle('dimmed', this.currentName === 'pause');
  }

  private applyFocus(screen: Screen): void {
    const plan = screen.focus();
    this.focusManager.setItems(plan.items, plan.columns ?? 1);
  }

  private navigate(name: ScreenName, data: unknown, push: boolean): void {
    const prevName = this.currentName;
    if (prevName && push) this.history.push(prevName);
    if (prevName) this.screens[prevName].onHide?.();
    this.currentName = name;
    const screen = this.screens[name];
    screen.onShow?.(data);
    screen.render(data);
    this.applyFocus(screen);
    this.updateChrome();
  }

  private goBack(): void {
    const prev = this.history.pop();
    if (!prev) return;
    this.navigate(prev, undefined, false);
  }

  refresh(): void {
    if (!this.currentName) return;
    const screen = this.screens[this.currentName];
    screen.render();
    this.applyFocus(screen);
  }

  showScreen(name: ScreenName, data?: unknown): void {
    this.navigate(name, data, true);
    this.suppressBackOnce = true;
  }

  updateHud(state: HudState): void {
    this.hud.update(state);
  }

  showResults(result: RaceResult): void {
    this.navigate('results', result, true);
    this.suppressBackOnce = true;
  }

  setLoading(progress: number, text: string): void {
    (this.screens.loading as LoadingScreen).setProgress(progress, text);
  }

  handleInput(input: InputState): void {
    if (!this.currentName) return;
    const suppressBack = this.suppressBackOnce;
    this.suppressBackOnce = false;
    const screen = this.screens[this.currentName];
    screen.onTick?.();
    if (this.currentName === 'race') this.hud.setStandingsVisible(input.standings);
    if (screen.interceptInput?.(input)) return;
    if (input.menuBack) {
      if (suppressBack) return;
      if (screen.interceptBack?.()) return;
      this.goBack();
      return;
    }
    this.focusManager.handle(input);
  }

  showToast(text: string): void {
    this.toastLayer.show(text);
  }
}

export function createUi(facade: GameFacade, root: HTMLElement): UiController {
  const app = new UiApp(facade, root);
  return {
    showScreen: (name, data) => app.showScreen(name, data),
    updateHud: (state) => app.updateHud(state),
    showResults: (result) => app.showResults(result),
    setLoading: (progress, text) => app.setLoading(progress, text),
    handleInput: (input) => app.handleInput(input),
    refresh: () => app.refresh(),
    showToast: (text) => app.showToast(text),
  };
}
