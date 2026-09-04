import { el, clear } from '../dom';
import { fmtCredits, fmtPP } from '../format';
import { makeButton, makeMenuShell, makeSlider } from '../widgets';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';
import type { UpgradeInfo } from '../UiContract';
import type { CarSpec, OwnedCar } from '../../core/types';

const TYRE_ORDER = ['comfort', 'sport', 'racing'] as const;

function installedStageIndex(kind: UpgradeInfo['kind'], owned: OwnedCar): number {
  if (kind === 'power') return owned.tuning.powerStage;
  if (kind === 'weight') return owned.tuning.weightStage;
  return TYRE_ORDER.indexOf(owned.tuning.tyres);
}

/** Tuning shop: upgrade shopping for the selected car, plus live setup sliders. */
class TuningScreen implements Screen {
  readonly el: HTMLElement;
  private carName = el('div', 'card-title', '');
  private ppReadout = el('div', 'card-sub', '');
  private body = el('div', 'menu-scroll');
  private focusItems: FocusItem[] = [];
  private notice: string | null = null;

  constructor(private ctx: ScreenContext) {
    this.el = el('div', 'screen screen-tuning');
    const shell = makeMenuShell('Upgrade & setup', 'Tuning Shop');
    shell.body.append(this.carName, this.ppReadout, this.body);
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

  private buyUpgrade(idx: number, kind: UpgradeInfo['kind'], stage: number): void {
    const err = this.ctx.facade.buyUpgrade(idx, kind, stage);
    if (err) {
      this.notice = err;
      this.ctx.sound('error');
      this.rebuild();
      return;
    }
    this.notice = null;
    this.ctx.sound('buy');
    this.ctx.refresh();
  }

  private buildUpgradeSection(idx: number, owned: OwnedCar, upg: UpgradeInfo): void {
    this.body.appendChild(el('div', 'section-label', upg.label));
    const installed = installedStageIndex(upg.kind, owned);
    upg.stages.forEach((stage, stageIdx) => {
      const row = el('div', 'gt-row');
      row.appendChild(el('span', 'gt-row-label', stage.label));
      if (stageIdx === installed) {
        row.appendChild(el('div', 'pill owned', 'Installed'));
      } else {
        const btn = makeButton(fmtCredits(stage.priceCr), () =>
          this.buyUpgrade(idx, upg.kind, stageIdx),
        );
        row.appendChild(btn.el);
        this.focusItems.push(btn.item);
      }
      this.body.appendChild(row);
    });
  }

  private buildDownforceSlider(
    idx: number,
    owned: OwnedCar,
    spec: CarSpec,
    hasAero: boolean,
  ): void {
    const down = makeSlider(
      'Downforce',
      owned.tuning.downforce,
      -1,
      1,
      0.1,
      (v) => (v < -0.05 ? 'Low' : v > 0.05 ? 'High' : 'Medium'),
      (v) => {
        this.ctx.facade.setTuning(idx, { downforce: v });
        owned.tuning.downforce = v;
        this.ppReadout.textContent = fmtPP(this.ctx.facade.performancePoints(spec, owned.tuning));
      },
      {
        disabled: !hasAero,
        hint: hasAero ? undefined : 'This car has no aero — downforce has no effect',
      },
    );
    this.body.appendChild(down.el);
    if (hasAero) this.focusItems.push(down.item);
  }

  private buildSetupSliders(idx: number, owned: OwnedCar): void {
    const spec = this.ctx.facade.ownedCarSpec(owned);
    const hasAero = spec.downforceFront + spec.downforceRear >= 0.2;
    this.body.appendChild(el('div', 'section-label', 'Setup'));

    const susp = makeSlider(
      'Suspension',
      owned.tuning.suspension,
      -1,
      1,
      0.1,
      (v) => (v < -0.05 ? 'Soft' : v > 0.05 ? 'Stiff' : 'Neutral'),
      (v) => this.ctx.facade.setTuning(idx, { suspension: v }),
    );
    this.body.appendChild(susp.el);
    this.focusItems.push(susp.item);

    this.buildDownforceSlider(idx, owned, spec, hasAero);

    const finalDrive = makeSlider(
      'Final drive',
      owned.tuning.finalDriveMul,
      0.85,
      1.15,
      0.01,
      (v) => v.toFixed(2),
      (v) => this.ctx.facade.setTuning(idx, { finalDriveMul: v }),
    );
    this.body.appendChild(finalDrive.el);
    this.focusItems.push(finalDrive.item);

    const brakeBias = makeSlider(
      'Brake bias',
      owned.tuning.brakeBias,
      0.5,
      0.72,
      0.01,
      (v) => `${Math.round(v * 100)}% F`,
      (v) => this.ctx.facade.setTuning(idx, { brakeBias: v }),
    );
    this.body.appendChild(brakeBias.el);
    this.focusItems.push(brakeBias.item);
  }

  private rebuild(): void {
    this.focusItems = [];
    clear(this.body);
    const idx = this.ctx.facade.save.selectedCar;
    const owned = this.ctx.facade.save.garage[idx];
    if (!owned) {
      this.carName.textContent = 'No car selected';
      this.ppReadout.textContent = '';
      this.ctx.facade.showroom(null);
      return;
    }
    const spec = this.ctx.facade.ownedCarSpec(owned);
    this.carName.textContent = spec.name;
    this.ppReadout.textContent = fmtPP(this.ctx.facade.performancePoints(spec, owned.tuning));
    this.ctx.facade.showroom(spec.id, owned.tuning.color);

    if (this.notice) this.body.appendChild(el('div', 'notice error', this.notice));
    for (const upg of this.ctx.facade.upgrades()) this.buildUpgradeSection(idx, owned, upg);
    this.buildSetupSliders(idx, owned);
  }
}

export function createTuningScreen(ctx: ScreenContext): Screen {
  return new TuningScreen(ctx);
}
