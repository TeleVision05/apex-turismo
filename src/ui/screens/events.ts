import { el, clear } from '../dom';
import { fmtCredits } from '../format';
import { makeCard, makeScreenHeader } from '../widgets';
import { eventById } from '../../data/events';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';
import type { RaceEvent } from '../../data/events';

/** World Circuits: series-grouped event list with unlock gating. */
class EventsScreen implements Screen {
  readonly el: HTMLElement;
  private notice = el('div', 'notice error hidden');
  private list = el('div', 'side-panel-scroll');
  private focusItems: FocusItem[] = [];

  constructor(private ctx: ScreenContext) {
    this.el = el('div', 'screen screen-events');
    const panel = el('div', 'side-panel panel');
    panel.style.width = 'min(56vw, 680px)';
    panel.append(makeScreenHeader('world', 'World Circuits'), this.notice, this.list);
    this.el.appendChild(panel);
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

  private enter(ev: RaceEvent): void {
    const err = this.ctx.facade.startEvent(ev.id);
    if (err) {
      this.notice.textContent = err;
      this.notice.classList.remove('hidden');
      this.ctx.sound('error');
      return;
    }
    this.notice.classList.add('hidden');
    this.ctx.sound('confirm');
  }

  private trackName(id: string): string {
    return this.ctx.facade.tracks().find((t) => t.id === id)?.name ?? id;
  }

  private buildMeta(ev: RaceEvent): HTMLElement {
    const meta = el('div', 'card-meta');
    const payout = `Payout ${fmtCredits(ev.payoutCr[0])} / ${fmtCredits(ev.payoutCr[1])} / ${fmtCredits(ev.payoutCr[2])}`;
    meta.append(
      el('span', '', `${this.trackName(ev.trackId)} · ${ev.laps} laps`),
      el('span', '', `${ev.opponents} opponents`),
      el('span', '', ev.ppLimit ? `PP limit ${ev.ppLimit}` : 'No PP limit'),
      el('span', '', ev.allowedClasses.join(', ')),
      el('span', '', payout),
    );
    return meta;
  }

  private buildCard(ev: RaceEvent): void {
    const unlocked = this.ctx.facade.eventUnlocked(ev.id);
    const card = makeCard(unlocked ? '' : 'locked', unlocked ? () => this.enter(ev) : undefined);
    if (!unlocked) card.el.classList.add('disabled');

    const titleRow = el('div', 'card-title-row');
    titleRow.append(
      el('div', 'card-title', ev.name),
      el('div', `pill ${unlocked ? 'class' : 'locked'}`, unlocked ? ev.difficulty : 'Locked'),
    );
    card.el.append(titleRow, el('div', 'card-sub', ev.description), this.buildMeta(ev));

    const best = this.ctx.facade.save.completedEvents[ev.id];
    if (best)
      card.el.appendChild(
        el('div', 'card-sub', `Best result: P${best.bestPosition} (${best.count} entries)`),
      );

    if (!unlocked && ev.requires) {
      const req = eventById(ev.requires);
      card.el.appendChild(
        el('div', 'notice info', `Complete ${req?.name ?? 'the previous event'} first`),
      );
    }

    this.list.appendChild(card.el);
    if (unlocked) this.focusItems.push(card.item);
  }

  private rebuild(): void {
    this.focusItems = [];
    clear(this.list);
    this.notice.classList.add('hidden');
    const bySeries = new Map<string, RaceEvent[]>();
    for (const ev of this.ctx.facade.events()) {
      const arr = bySeries.get(ev.series) ?? [];
      arr.push(ev);
      bySeries.set(ev.series, arr);
    }
    for (const [series, events] of bySeries) {
      this.list.appendChild(el('div', 'section-label', series));
      for (const ev of events) this.buildCard(ev);
    }
  }
}

export function createEventsScreen(ctx: ScreenContext): Screen {
  return new EventsScreen(ctx);
}
