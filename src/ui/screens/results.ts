import { el, clear } from '../dom';
import { fmtCredits } from '../format';
import { formatDelta, formatLapTime } from '../../core/math';
import { makeButton, makeScreenHeader } from '../widgets';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';
import type { RaceResult, RaceResultEntry } from '../../core/types';

function entryTime(e: RaceResultEntry): string {
  if (e.totalTimeMs !== null) return formatLapTime(e.totalTimeMs);
  if (e.gapMs !== null) return formatDelta(e.gapMs);
  return e.finished ? 'Finished' : 'DNF';
}

/** Results: final standings, a credits count-up, a replay link, and Continue/Restart. */
class ResultsScreen implements Screen {
  readonly el: HTMLElement;
  private tableWrap = el('div', 'results-table-wrap');
  private creditsValue = el('div', 'credits-earned', 'Cr. 0');
  private recordBanner = el('div', 'results-new-record hidden', 'New track record!');
  private buttons = el('div', 'form-actions');
  private focusItems: FocusItem[] = [];
  private last: RaceResult | null = null;
  private countUpHandle: number | null = null;

  constructor(private ctx: ScreenContext) {
    this.el = el('div', 'screen screen-results');
    const box = el('div', 'center-panel panel');
    const creditsBox = el('div', 'results-credits');
    creditsBox.appendChild(this.creditsValue);
    box.append(
      makeScreenHeader('trophy', 'Results', 'results-title'),
      this.tableWrap,
      creditsBox,
      this.recordBanner,
      this.buttons,
    );
    this.el.appendChild(box);
  }

  onShow(data: unknown): void {
    if (data) this.last = data as RaceResult;
  }

  onHide(): void {
    if (this.countUpHandle !== null) cancelAnimationFrame(this.countUpHandle);
    this.countUpHandle = null;
  }

  render(data: unknown): void {
    if (data) this.last = data as RaceResult;
    this.rebuild();
  }

  focus(): FocusPlan {
    return { items: this.focusItems };
  }

  private buildTable(result: RaceResult): void {
    clear(this.tableWrap);
    const table = el('table', 'results-table');
    const head = el('tr');
    for (const h of ['Pos', 'Driver', 'Car', 'Time', 'Best lap']) head.appendChild(el('th', '', h));
    table.appendChild(head);
    for (const e of result.entries) {
      const tr = el('tr', e.isPlayer ? 'player-row' : '');
      tr.append(
        el('td', '', `${e.position}`),
        el('td', '', e.name),
        el('td', '', e.carName),
        el('td', '', entryTime(e)),
        el('td', '', formatLapTime(e.bestLapMs)),
      );
      table.appendChild(tr);
    }
    this.tableWrap.appendChild(table);
  }

  private animateCredits(target: number): void {
    if (this.countUpHandle !== null) cancelAnimationFrame(this.countUpHandle);
    const start = performance.now();
    const duration = 900;
    const step = (now: number): void => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      this.creditsValue.textContent = fmtCredits(Math.round(target * eased));
      if (t < 1) this.countUpHandle = requestAnimationFrame(step);
    };
    this.countUpHandle = requestAnimationFrame(step);
  }

  private rebuild(): void {
    this.focusItems = [];
    clear(this.buttons);
    if (!this.last) return;
    this.buildTable(this.last);
    this.recordBanner.classList.toggle('hidden', !this.last.newRecord);
    this.animateCredits(this.last.creditsEarned);
    const replay = makeButton(
      'Watch replay',
      () => {
        this.ctx.sound('confirm');
        this.ctx.facade.startReplay();
        this.ctx.show('replay');
      },
      { icon: 'replay' },
    );
    const cont = makeButton(
      'Continue',
      () => {
        this.ctx.sound('confirm');
        this.ctx.facade.quitToHome();
      },
      { className: 'primary', icon: 'continue' },
    );
    const restart = makeButton(
      'Restart',
      () => {
        this.ctx.sound('confirm');
        this.ctx.facade.restartRace();
      },
      { icon: 'restart' },
    );
    this.buttons.append(replay.el, cont.el, restart.el);
    this.focusItems.push(replay.item, cont.item, restart.item);
  }
}

export function createResultsScreen(ctx: ScreenContext): Screen {
  return new ResultsScreen(ctx);
}
