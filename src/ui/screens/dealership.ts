import { el, clear } from '../dom';
import { fmtCredits, fmtHp, fmtPP } from '../format';
import { makeButton, makeChip, makeListRow, makeMenuShell, makeSwatch } from '../widgets';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';
import type { CarClass, CarSpec, CarTuning } from '../../core/types';

const CLASS_FILTERS: Array<CarClass | 'All'> = [
  'All',
  'N100',
  'N200',
  'N300',
  'N500',
  'Gr.4',
  'Gr.3',
  'Gr.1',
];

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

/** Brand Central: every car grouped by maker, filterable by class, buy + colour flow. */
class DealershipScreen implements Screen {
  readonly el: HTMLElement;
  private chipRow = el('div', 'chip-row');
  private list = el('div', 'menu-scroll');
  private detail = el('div', 'dealer-detail');
  private cars: CarSpec[] = [];
  private classFilter: CarClass | 'All' = 'All';
  private highlightId = '';
  private chosenColor = '';
  private notice: { kind: 'error' | 'info'; text: string } | null = null;
  private focusItems: FocusItem[] = [];

  constructor(private ctx: ScreenContext) {
    this.el = el('div', 'screen screen-dealership');
    const shell = makeMenuShell('Cars', 'Brand Central');
    shell.body.append(this.chipRow, this.list, this.detail);
    this.el.appendChild(shell.el);
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
    const row = makeListRow(spec.id === this.highlightId ? 'selected' : '', () => {
      this.highlightId = spec.id;
      this.chosenColor = spec.defaultColor;
      this.notice = null;
      this.rebuild();
    });
    row.item.onFocus = () => {
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
    row.el.appendChild(titleRow);
    row.el.appendChild(el('div', 'card-sub', `${spec.carClass} · ${fmtCredits(spec.priceCr)}`));
    if (this.isOwned(spec.id)) {
      const meta = el('div', 'card-meta');
      meta.appendChild(el('span', 'pill owned', 'Owned'));
      row.el.appendChild(meta);
    }
    this.list.appendChild(row.el);
    this.focusItems.push(row.item);
  }

  private filteredCars(): CarSpec[] {
    if (this.classFilter === 'All') return this.cars;
    return this.cars.filter((c) => c.carClass === this.classFilter);
  }

  private groupedByMaker(cars: CarSpec[]): Map<string, CarSpec[]> {
    const map = new Map<string, CarSpec[]>();
    for (const spec of cars) {
      const arr = map.get(spec.maker) ?? [];
      arr.push(spec);
      map.set(spec.maker, arr);
    }
    return map;
  }

  private buildChips(): void {
    clear(this.chipRow);
    for (const cls of CLASS_FILTERS) {
      const chip = makeChip(cls, cls === this.classFilter, () => {
        this.classFilter = cls;
        this.rebuild();
      });
      this.chipRow.appendChild(chip.el);
      this.focusItems.push(chip.item);
    }
  }

  private rebuild(): void {
    this.focusItems = [];
    clear(this.list);
    this.cars = this.ctx.facade.cars();
    this.buildChips();

    const filtered = this.filteredCars();
    if (!filtered.find((c) => c.id === this.highlightId)) this.highlightId = filtered[0]?.id ?? '';

    for (const [maker, makerCars] of this.groupedByMaker(filtered)) {
      this.list.appendChild(el('div', 'section-label', maker));
      for (const spec of makerCars) this.buildCard(spec);
    }

    const highlighted = filtered.find((c) => c.id === this.highlightId);
    if (highlighted) {
      if (!this.chosenColor) this.chosenColor = highlighted.defaultColor;
      this.ctx.facade.showroom(highlighted.id, this.chosenColor);
      this.buildDetail(highlighted);
    } else {
      clear(this.detail);
      this.ctx.facade.showroom(null);
      this.detail.appendChild(el('div', 'notice info', 'No cars in this class'));
    }
  }
}

export function createDealershipScreen(ctx: ScreenContext): Screen {
  return new DealershipScreen(ctx);
}
