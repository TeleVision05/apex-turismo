import { el, clear } from '../dom';
import { fmtHp, fmtKg, fmtKm, fmtNm, fmtPP, titleCase } from '../format';
import { makeButton, makeCard, makeScreenHeader, makeSwatch } from '../widgets';
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
  private list = el('div', 'side-panel-scroll');
  private detail = el('div', 'garage-detail');
  private highlightIndex = 0;
  private sellConfirm = false;
  private notice: string | null = null;
  private focusItems: FocusItem[] = [];

  constructor(private ctx: ScreenContext) {
    this.el = el('div', 'screen screen-garage');
    const panel = el('div', 'side-panel panel');
    panel.appendChild(makeScreenHeader('car', 'Garage'));
    panel.append(this.list, this.detail);
    this.el.appendChild(panel);
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

  private buildSellBox(idx: number, spec: { name: string }): void {
    const box = el('div', 'confirm-box');
    box.appendChild(
      el('div', 'confirm-text', `Sell ${spec.name} for credits? This cannot be undone.`),
    );
    const row = el('div', 'form-actions');
    const confirmBtn = makeButton('Confirm sale', () => this.sellNow(idx), { className: 'danger' });
    const cancelBtn = makeButton('Cancel', () => {
      this.sellConfirm = false;
      this.rebuild();
    });
    row.append(confirmBtn.el, cancelBtn.el);
    box.appendChild(row);
    this.detail.appendChild(box);
    this.focusItems.push(confirmBtn.item, cancelBtn.item);
  }

  private buildDetail(owned: OwnedCar, idx: number): void {
    clear(this.detail);
    const spec = this.ctx.facade.ownedCarSpec(owned);
    const pp = this.ctx.facade.performancePoints(spec, owned.tuning);
    const kw = this.ctx.facade.peakPowerKw(spec, owned.tuning);
    const maxNm =
      Math.max(...spec.torqueCurve.map((p) => p.nm)) * POWER_STAGES[owned.tuning.powerStage];
    const mass = spec.massKg * WEIGHT_STAGES[owned.tuning.weightStage];

    if (this.ctx.facade.save.selectedCar !== idx) {
      const btn = makeButton('Select this car', () => this.selectCar(idx), {
        className: 'primary',
      });
      this.detail.appendChild(btn.el);
      this.focusItems.push(btn.item);
    } else {
      this.detail.appendChild(el('div', 'notice info', 'Currently selected'));
    }

    this.detail.appendChild(el('div', 'section-label', 'Colour'));
    const swatchRow = el('div', 'swatch-row');
    for (const color of spec.colors) {
      const w = makeSwatch(color, color === owned.tuning.color, () => this.setColor(idx, color));
      swatchRow.appendChild(w.el);
      this.focusItems.push(w.item);
    }
    this.detail.appendChild(swatchRow);

    const stat = el('div', 'panel stat-card');
    stat.appendChild(el('div', 'section-label', 'Performance'));
    const grid = el('div', 'stat-grid');
    grid.append(
      statRow('Power', fmtHp(kw)),
      statRow('Torque', fmtNm(maxNm)),
      statRow('Weight', fmtKg(mass)),
      statRow('Drivetrain', spec.drivetrain),
      statRow('Tyres', titleCase(owned.tuning.tyres)),
      statRow('PP', fmtPP(pp)),
    );
    stat.appendChild(grid);
    this.detail.appendChild(stat);

    if (this.notice) this.detail.appendChild(el('div', 'notice error', this.notice));

    if (this.sellConfirm) {
      this.buildSellBox(idx, spec);
    } else {
      const sellBtn = makeButton(
        'Sell car',
        () => {
          this.sellConfirm = true;
          this.notice = null;
          this.rebuild();
        },
        { className: 'danger', disabled: this.ctx.facade.save.garage.length <= 1 },
      );
      this.detail.appendChild(sellBtn.el);
      this.focusItems.push(sellBtn.item);
    }
  }

  private buildCard(owned: OwnedCar, idx: number): void {
    const spec = this.ctx.facade.ownedCarSpec(owned);
    const selected = idx === this.ctx.facade.save.selectedCar;
    const card = makeCard(selected ? 'selected' : '', () => this.selectCar(idx));
    card.item.onFocus = () => {
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
    card.el.appendChild(titleRow);
    card.el.appendChild(el('div', 'card-sub', `${spec.maker} · ${spec.carClass}`));
    const meta = el('div', 'card-meta');
    meta.appendChild(el('span', '', fmtHp(this.ctx.facade.peakPowerKw(spec, owned.tuning))));
    meta.appendChild(el('span', '', fmtKg(spec.massKg * WEIGHT_STAGES[owned.tuning.weightStage])));
    meta.appendChild(el('span', '', fmtKm(owned.odometerM)));
    card.el.appendChild(meta);
    this.list.appendChild(card.el);
    this.focusItems.push(card.item);
  }

  private rebuild(): void {
    this.focusItems = [];
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
