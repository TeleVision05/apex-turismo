import { el, clear } from '../dom';
import { formatLapTime } from '../../core/math';
import { makeButton, makeCycle, makeSlider, makeToggle } from '../widgets';
import {
  DIFFICULTY_OPTIONS,
  TIME_OF_DAY_OPTIONS,
  TRANSMISSION_OPTIONS,
  WEATHER_OPTIONS,
} from './raceOptions';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';
import type { Difficulty, RaceConfig, TimeOfDay, Transmission, Weather } from '../../core/types';

interface CustomState {
  trackId: string;
  laps: number;
  opponents: number;
  difficulty: Difficulty;
  timeOfDay: TimeOfDay;
  weather: Weather;
  rollingStart: boolean;
  transmission: Transmission;
}

/** Custom Race: full free setup form, starts with facade.startRace(). */
class CustomScreen implements Screen {
  readonly el: HTMLElement;
  private body = el('div', 'side-panel-scroll form-rows');
  private focusItems: FocusItem[] = [];
  private state: CustomState;

  constructor(private ctx: ScreenContext) {
    this.el = el('div', 'screen screen-custom');
    const panel = el('div', 'side-panel panel');
    panel.append(el('div', 'section-label', 'Custom Race'), this.body);
    this.el.appendChild(panel);
    this.state = {
      trackId: '',
      laps: 3,
      opponents: 7,
      difficulty: 'normal',
      timeOfDay: 'noon',
      weather: 'clear',
      rollingStart: false,
      transmission: ctx.facade.save.settings.transmission,
    };
  }

  onShow(): void {
    this.ctx.facade.showroom(null);
  }

  render(): void {
    this.rebuild();
  }

  focus(): FocusPlan {
    return { items: this.focusItems };
  }

  private start(): void {
    const config: RaceConfig = {
      mode: 'race',
      trackId: this.state.trackId,
      laps: this.state.laps,
      opponents: this.state.opponents,
      difficulty: this.state.difficulty,
      timeOfDay: this.state.timeOfDay,
      weather: this.state.weather,
      playerCarId: String(this.ctx.facade.save.selectedCar),
      rollingStart: this.state.rollingStart,
      transmission: this.state.transmission,
    };
    this.ctx.sound('confirm');
    this.ctx.facade.startRace(config);
  }

  private buildTrackInfo(): void {
    const tracks = this.ctx.facade.tracks();
    const track = tracks.find((t) => t.id === this.state.trackId);
    const trackCycle = makeCycle(
      'Track',
      tracks.map((t) => ({ value: t.id, label: t.name })),
      this.state.trackId,
      (v) => {
        this.state.trackId = v;
        this.rebuild();
      },
    );
    this.body.appendChild(trackCycle.el);
    this.focusItems.push(trackCycle.item);
    if (!track) return;
    this.body.appendChild(
      el(
        'div',
        'gt-row-hint',
        `${track.country} · ${(track.lengthM / 1000).toFixed(2)} km · ${track.corners} corners`,
      ),
    );
    const carId = this.ctx.facade.save.garage[this.ctx.facade.save.selectedCar]?.specId;
    const best = this.ctx.facade.bestLap(track.id, carId);
    this.body.appendChild(el('div', 'gt-row-hint', `Best lap here: ${formatLapTime(best)}`));
  }

  private buildOptionRows(): void {
    const s = this.state;
    const laps = makeSlider(
      'Laps',
      s.laps,
      1,
      20,
      1,
      (v) => `${v}`,
      (v) => (s.laps = v),
    );
    const opponents = makeSlider(
      'Opponents',
      s.opponents,
      0,
      15,
      1,
      (v) => `${v}`,
      (v) => (s.opponents = v),
    );
    const difficulty = makeCycle(
      'Difficulty',
      DIFFICULTY_OPTIONS,
      s.difficulty,
      (v) => (s.difficulty = v),
    );
    const tod = makeCycle(
      'Time of day',
      TIME_OF_DAY_OPTIONS,
      s.timeOfDay,
      (v) => (s.timeOfDay = v),
    );
    const weather = makeCycle('Weather', WEATHER_OPTIONS, s.weather, (v) => (s.weather = v));
    const rolling = makeToggle('Rolling start', s.rollingStart, (v) => (s.rollingStart = v));
    const trans = makeCycle(
      'Transmission',
      TRANSMISSION_OPTIONS,
      s.transmission,
      (v) => (s.transmission = v),
    );
    for (const w of [laps, opponents, difficulty, tod, weather, rolling, trans]) {
      this.body.appendChild(w.el);
      this.focusItems.push(w.item);
    }
  }

  private rebuild(): void {
    this.focusItems = [];
    clear(this.body);
    const tracks = this.ctx.facade.tracks();
    if (!tracks.find((t) => t.id === this.state.trackId)) this.state.trackId = tracks[0]?.id ?? '';

    this.buildTrackInfo();
    this.buildOptionRows();

    const startBtn = makeButton('Start race', () => this.start(), { className: 'primary' });
    const actions = el('div', 'form-actions');
    actions.appendChild(startBtn.el);
    this.body.appendChild(actions);
    this.focusItems.push(startBtn.item);
  }
}

export function createCustomScreen(ctx: ScreenContext): Screen {
  return new CustomScreen(ctx);
}
