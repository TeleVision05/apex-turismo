import { el, clear } from '../dom';
import { fmtHp, fmtKg, fmtKm, fmtNm, fmtPP, titleCase } from '../format';
import { makeButton, makeListRow, makeMenuShell, makeSwatch } from '../widgets';
import type { MenuShell } from '../widgets';
import { POWER_STAGES, WEIGHT_STAGES } from '../../physics/Tuning';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';
import type { OwnedCar } from '../../core/types';

function statRow(label: string, value: string): HTMLElement {
  const item = el('div', 'stat-item');
  item.appendChild(el('div', 'stat-label', label));
  item.appendChild(el('div', 'stat-value', value));
  return item;
}

/** Garage: owned car list, colour picker, sell flow and a live stat card. */
class GarageScreen implements Screen {
  readonly el: HTMLElement;
  private shell: MenuShell;
  private list = el('div', 'menu-scroll');
  private detail = el('div', 'garage-detail');
  private detailScroll = el('div', 'detail-scroll');
  private detailActions = el('div', 'detail-actions');
  private highlightIndex = 0;
  private sellConfirm = false;
  private notice: string | null = null;
  private focusItems: FocusItem[] = [];

  constructor(private ctx: ScreenContext) {
    this.el = el('div', 'screen screen-garage');
    this.shell = makeMenuShell('Owned cars', 'Garage', {
      onBack: () => {
        this.ctx.sound('back');
        this.ctx.back();
      },
    });
    this.shell.body.classList.add('split');
    this.detail.append(this.detailScroll, this.detailActions);
    this.shell.body.append(this.list, this.detail);
    this.el.appendChild(this.shell.el);
  }

  onShow(): void {
    this.highlightIndex = this.ctx.facade.save.selectedCar;
    this.sellConfirm = false;
    this.notice = null;
  }

  render(): void {
    this.rebuild();
  }

  focus(): FocusPlan {
    return { items: this.focusItems };
  }

  private selectCar(idx: number): void {
    this.ctx.facade.selectCar(idx);
    this.ctx.sound('confirm');
    this.ctx.refresh();
  }

  private setColor(idx: number, color: string): void {
    this.ctx.facade.setTuning(idx, { color });
    this.ctx.sound('confirm');
    this.ctx.refresh();
  }

  private sellNow(idx: number): void {
    const err = this.ctx.facade.sellCar(idx);
    if (err) {
      this.notice = err;
      this.sellConfirm = false;
      this.ctx.sound('error');
      this.rebuild();
      return;
    }
    this.sellConfirm = false;
    this.notice = null;
    const max = this.ctx.facade.save.garage.length - 1;
    this.highlightIndex = Math.max(0, Math.min(this.highlightIndex, max));
    this.ctx.sound('confirm');
    this.ctx.toast('Car sold');
    this.ctx.refresh();
  }

  private buildDetail(owned: OwnedCar, idx: number): void {
    clear(this.detailScroll);
    clear(this.detailActions);
    const spec = this.ctx.facade.ownedCarSpec(owned);
    const pp = this.ctx.facade.performancePoints(spec, owned.tuning);
    const kw = this.ctx.facade.peakPowerKw(spec, owned.tuning);
    const maxNm =
      Math.max(...spec.torqueCurve.map((p) => p.nm)) * POWER_STAGES[owned.tuning.powerStage];
    const mass = spec.massKg * WEIGHT_STAGES[owned.tuning.weightStage];

    const heading = el('div', 'detail-heading');
    heading.append(el('div', 'detail-name', spec.name), el('div', 'pill pp', fmtPP(pp)));
    this.detailScroll.appendChild(heading);
    this.detailScroll.appendChild(
      el('div', 'card-sub', `${spec.maker} · ${spec.carClass} · ${fmtKm(owned.odometerM)}`),
    );

    if (this.ctx.facade.save.selectedCar === idx) {
      this.detailScroll.appendChild(el('div', 'notice info', 'Currently selected'));
    }

    this.detailScroll.appendChild(el('div', 'section-label', 'Colour'));
    const swatchRow = el('div', 'swatch-row');
    for (const color of spec.colors) {
      const w = makeSwatch(color, color === owned.tuning.color, () => this.setColor(idx, color));
      swatchRow.appendChild(w.el);
      this.focusItems.push(w.item);
    }
    this.detailScroll.appendChild(swatchRow);

    const grid = el('div', 'stat-grid');
    grid.append(
      statRow('Power', fmtHp(kw)),
      statRow('Torque', fmtNm(maxNm)),
      statRow('Weight', fmtKg(mass)),
      statRow('Drivetrain', spec.drivetrain),
      statRow('Tyres', titleCase(owned.tuning.tyres)),
      statRow('PP', fmtPP(pp)),
    );
    this.detailScroll.appendChild(grid);

    if (this.notice) this.detailScroll.appendChild(el('div', 'notice error', this.notice));

    if (this.sellConfirm) {
      this.detailActions.appendChild(el('div', 'detail-price afford', `Sell ${spec.name}?`));
      const confirmBtn = makeButton('Confirm', () => this.sellNow(idx), { className: 'danger' });
      const cancelBtn = makeButton('Cancel', () => {
        this.sellConfirm = false;
        this.rebuild();
      });
      this.detailActions.append(confirmBtn.el, cancelBtn.el);
      this.focusItems.push(confirmBtn.item, cancelBtn.item);
      return;
    }

    if (this.ctx.facade.save.selectedCar !== idx) {
      const selectBtn = makeButton('Select car', () => this.selectCar(idx), {
        className: 'primary',
      });
      this.detailActions.appendChild(selectBtn.el);
      this.focusItems.push(selectBtn.item);
    }

    const sellBtn = makeButton(
      'Sell car',
      () => {
        this.sellConfirm = true;
        this.notice = null;
        this.rebuild();
      },
      { className: 'danger', disabled: this.ctx.facade.save.garage.length <= 1 },
    );
    this.detailActions.appendChild(sellBtn.el);
    this.focusItems.push(sellBtn.item);
  }

  private buildCard(owned: OwnedCar, idx: number): void {
    const spec = this.ctx.facade.ownedCarSpec(owned);
    const selected = idx === this.ctx.facade.save.selectedCar;
    const row = makeListRow(selected ? 'selected' : '', () => this.selectCar(idx));
    row.item.onFocus = () => {
      if (this.highlightIndex === idx) return;
      this.highlightIndex = idx;
      this.sellConfirm = false;
      this.notice = null;
      this.rebuild();
    };
    const titleRow = el('div', 'card-title-row');
    titleRow.appendChild(el('div', 'card-title', spec.name));
    titleRow.appendChild(
      el('div', 'pill pp', fmtPP(this.ctx.facade.performancePoints(spec, owned.tuning))),
    );
    row.el.appendChild(titleRow);
    row.el.appendChild(el('div', 'card-sub', `${spec.maker} · ${spec.carClass}`));
    const meta = el('div', 'card-meta');
    meta.appendChild(el('span', '', fmtHp(this.ctx.facade.peakPowerKw(spec, owned.tuning))));
    meta.appendChild(el('span', '', fmtKg(spec.massKg * WEIGHT_STAGES[owned.tuning.weightStage])));
    meta.appendChild(el('span', '', fmtKm(owned.odometerM)));
    row.el.appendChild(meta);
    this.list.appendChild(row.el);
    this.focusItems.push(row.item);
  }

  private rebuild(): void {
    this.focusItems = [];
    if (this.shell.backItem) this.focusItems.push(this.shell.backItem);
    clear(this.list);
    const { garage } = this.ctx.facade.save;
    garage.forEach((owned, idx) => this.buildCard(owned, idx));

    const owned = garage[this.highlightIndex] ?? garage[0];
    if (owned) {
      const spec = this.ctx.facade.ownedCarSpec(owned);
      this.ctx.facade.showroom(spec.id, owned.tuning.color);
      this.buildDetail(owned, this.highlightIndex);
    }
  }
}

export function createGarageScreen(ctx: ScreenContext): Screen {
  return new GarageScreen(ctx);
}
