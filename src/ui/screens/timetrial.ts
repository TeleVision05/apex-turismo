import { el, clear } from '../dom';
import { formatLapTime } from '../../core/math';
import { makeButton, makeCycle, makeScreenHeader } from '../widgets';
import { TIME_OF_DAY_OPTIONS, TRANSMISSION_OPTIONS } from './raceOptions';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';
import type { RaceConfig, TimeOfDay, Transmission } from '../../core/types';

/** Time Trial: track + time of day + transmission, no traffic, 99 laps. */
class TimeTrialScreen implements Screen {
  readonly el: HTMLElement;
  private body = el('div', 'side-panel-scroll form-rows');
  private focusItems: FocusItem[] = [];
  private state: { trackId: string; timeOfDay: TimeOfDay; transmission: Transmission };

  constructor(private ctx: ScreenContext) {
    this.el = el('div', 'screen screen-timetrial');
    const panel = el('div', 'side-panel panel');
    panel.append(makeScreenHeader('stopwatch', 'Time Trial'), this.body);
    this.el.appendChild(panel);
    this.state = {
      trackId: '',
      timeOfDay: 'noon',
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
      mode: 'timetrial',
      trackId: this.state.trackId,
      laps: 99,
      opponents: 0,
      difficulty: 'normal',
      timeOfDay: this.state.timeOfDay,
      weather: 'clear',
      playerCarId: String(this.ctx.facade.save.selectedCar),
      rollingStart: false,
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

  private rebuild(): void {
    this.focusItems = [];
    clear(this.body);
    const tracks = this.ctx.facade.tracks();
    if (!tracks.find((t) => t.id === this.state.trackId)) this.state.trackId = tracks[0]?.id ?? '';

    this.buildTrackInfo();

    const tod = makeCycle(
      'Time of day',
      TIME_OF_DAY_OPTIONS,
      this.state.timeOfDay,
      (v) => (this.state.timeOfDay = v),
    );
    this.body.appendChild(tod.el);
    this.focusItems.push(tod.item);

    const trans = makeCycle(
      'Transmission',
      TRANSMISSION_OPTIONS,
      this.state.transmission,
      (v) => (this.state.transmission = v),
    );
    this.body.appendChild(trans.el);
    this.focusItems.push(trans.item);

    const startBtn = makeButton('Start time trial', () => this.start(), { className: 'primary' });
    const actions = el('div', 'form-actions');
    actions.appendChild(startBtn.el);
    this.body.appendChild(actions);
    this.focusItems.push(startBtn.item);
  }
}

export function createTimeTrialScreen(ctx: ScreenContext): Screen {
  return new TimeTrialScreen(ctx);
}
