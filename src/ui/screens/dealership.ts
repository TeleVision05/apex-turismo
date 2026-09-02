import { el, clear } from '../dom';
import { fmtCredits, fmtHp, fmtPP } from '../format';
import { makeButton, makeCard, makeScreenHeader, makeSwatch } from '../widgets';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';
import type { CarSpec, CarTuning } from '../../core/types';

function stockTuning(spec: CarSpec): CarTuning {
  return {
    powerStage: 0,
    weightStage: 0,
    tyres: spec.tyres,
    suspension: 0,
    downforce: 0,
    finalDriveMul: 1,
    brakeBias: spec.brakeBias,
    color: spec.defaultColor,
  };
}

function statBox(label: string, value: string): HTMLElement {
  const item = el('div', 'stat-item');
  item.appendChild(el('div', 'stat-label', label));
  item.appendChild(el('div', 'stat-value', value));
  return item;
}

/** Brand Central: every car grouped by maker, with a buy + colour flow. */
class DealershipScreen implements Screen {
  readonly el: HTMLElement;
  private list = el('div', 'side-panel-scroll');
  private detail = el('div', 'dealer-detail');
  private cars: CarSpec[] = [];
  private highlightId = '';
  private chosenColor = '';
  private notice: { kind: 'error' | 'info'; text: string } | null = null;
  private focusItems: FocusItem[] = [];

  constructor(private ctx: ScreenContext) {
    this.el = el('div', 'screen screen-dealership');
    const panel = el('div', 'side-panel panel');
    panel.appendChild(makeScreenHeader('tag', 'Brand Central'));
    panel.append(this.list, this.detail);
    this.el.appendChild(panel);
  }

  onShow(): void {
    this.notice = null;
  }

  render(): void {
    this.rebuild();
  }

  focus(): FocusPlan {
    return { items: this.focusItems };
  }

  private isOwned(specId: string): boolean {
    return this.ctx.facade.save.garage.some((c) => c.specId === specId);
  }

  private buyNow(spec: CarSpec): void {
    const err = this.ctx.facade.buyCar(spec.id, this.chosenColor || spec.defaultColor);
    if (err) {
      this.notice = { kind: 'error', text: err };
      this.ctx.sound('error');
      this.rebuild();
      return;
    }
    this.notice = null;
    this.ctx.sound('buy');
    this.ctx.toast(`${spec.name} purchased`);
    this.ctx.refresh();
  }

  private buildStats(spec: CarSpec): void {
    const grid = el('div', 'stat-grid');
    grid.append(
      statBox('Price', fmtCredits(spec.priceCr)),
      statBox('Class', spec.carClass),
      statBox('PP', fmtPP(this.ctx.facade.performancePoints(spec, stockTuning(spec)))),
      statBox('Power', fmtHp(this.ctx.facade.peakPowerKw(spec, stockTuning(spec)))),
    );
    this.detail.appendChild(grid);
  }

  private buildSwatches(spec: CarSpec): void {
    this.detail.appendChild(el('div', 'section-label', 'Colour'));
    const swatchRow = el('div', 'swatch-row');
    for (const color of spec.colors) {
      const w = makeSwatch(color, color === this.chosenColor, () => {
        this.chosenColor = color;
        this.ctx.facade.showroom(spec.id, this.chosenColor);
        this.rebuild();
      });
      swatchRow.appendChild(w.el);
      this.focusItems.push(w.item);
    }
    this.detail.appendChild(swatchRow);
  }

  private buildDetail(spec: CarSpec): void {
    clear(this.detail);
    this.detail.appendChild(el('div', 'section-label', spec.name));
    this.detail.appendChild(el('div', 'card-sub', spec.description));
    this.buildStats(spec);
    this.buildSwatches(spec);
    if (this.notice)
      this.detail.appendChild(el('div', `notice ${this.notice.kind}`, this.notice.text));
    if (this.isOwned(spec.id))
      this.detail.appendChild(el('div', 'notice info', 'You already own this car'));
    const buyBtn = makeButton(
      this.isOwned(spec.id) ? 'Buy another' : 'Buy car',
      () => this.buyNow(spec),
      {
        className: 'primary',
      },
    );
    this.detail.appendChild(buyBtn.el);
    this.focusItems.push(buyBtn.item);
  }

  private buildCard(spec: CarSpec): void {
    const card = makeCard(spec.id === this.highlightId ? 'selected' : '', () => {
      this.highlightId = spec.id;
      this.chosenColor = spec.defaultColor;
      this.notice = null;
      this.rebuild();
    });
    card.item.onFocus = () => {
      if (this.highlightId === spec.id) return;
      this.highlightId = spec.id;
      this.chosenColor = spec.defaultColor;
      this.notice = null;
      this.rebuild();
    };
    const titleRow = el('div', 'card-title-row');
    titleRow.appendChild(el('div', 'card-title', spec.name));
    titleRow.appendChild(
      el('div', 'pill pp', fmtPP(this.ctx.facade.performancePoints(spec, stockTuning(spec)))),
    );
    card.el.appendChild(titleRow);
    card.el.appendChild(el('div', 'card-sub', `${spec.carClass} · ${fmtCredits(spec.priceCr)}`));
    if (this.isOwned(spec.id)) {
      const meta = el('div', 'card-meta');
      meta.appendChild(el('span', 'pill owned', 'Owned'));
      card.el.appendChild(meta);
    }
    this.list.appendChild(card.el);
    this.focusItems.push(card.item);
  }

  private groupedByMaker(): Map<string, CarSpec[]> {
    const map = new Map<string, CarSpec[]>();
    for (const spec of this.cars) {
      const arr = map.get(spec.maker) ?? [];
      arr.push(spec);
      map.set(spec.maker, arr);
    }
    return map;
  }

  private rebuild(): void {
    this.focusItems = [];
    clear(this.list);
    this.cars = this.ctx.facade.cars();
    if (!this.cars.find((c) => c.id === this.highlightId))
      this.highlightId = this.cars[0]?.id ?? '';

    for (const [maker, makerCars] of this.groupedByMaker()) {
      this.list.appendChild(el('div', 'section-label', maker));
      for (const spec of makerCars) this.buildCard(spec);
    }

    const highlighted = this.cars.find((c) => c.id === this.highlightId);
    if (highlighted) {
      if (!this.chosenColor) this.chosenColor = highlighted.defaultColor;
      this.ctx.facade.showroom(highlighted.id, this.chosenColor);
      this.buildDetail(highlighted);
    }
  }
}

export function createDealershipScreen(ctx: ScreenContext): Screen {
  return new DealershipScreen(ctx);
}
