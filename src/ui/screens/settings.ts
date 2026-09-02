import { el, clear } from '../dom';
import { fmtPct, titleCase } from '../format';
import { makeButton, makeCycle, makeScreenHeader, makeSlider, makeToggle } from '../widgets';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';
import type { CameraMode, GraphicsSettings } from '../../core/types';

const QUALITY_OPTIONS = (['low', 'medium', 'high', 'ultra'] as const).map((v) => ({
  value: v,
  label: titleCase(v),
}));
const UNITS_OPTIONS = [
  { value: 'kmh' as const, label: 'km/h' },
  { value: 'mph' as const, label: 'mph' },
];
const TCS_OPTIONS = [
  { value: 0, label: 'Off' },
  { value: 1, label: 'Weak' },
  { value: 2, label: 'Strong' },
];
const CAMERA_OPTIONS: { value: CameraMode; label: string }[] = [
  { value: 'chase', label: 'Chase' },
  { value: 'chaseFar', label: 'Chase (far)' },
  { value: 'hood', label: 'Hood' },
  { value: 'cockpit', label: 'Cockpit' },
  { value: 'bumper', label: 'Bumper' },
];
const TRANSMISSION_OPTIONS = [
  { value: 'auto' as const, label: 'Automatic' },
  { value: 'manual' as const, label: 'Manual' },
];

/** Settings: graphics, audio, assists, transmission/units/camera and controls. */
class SettingsScreen implements Screen {
  readonly el: HTMLElement;
  private body = el('div', 'side-panel-scroll form-rows');
  private focusItems: FocusItem[] = [];
  private resetConfirm = false;

  constructor(private ctx: ScreenContext) {
    this.el = el('div', 'screen screen-settings');
    const panel = el('div', 'panel');
    panel.style.cssText =
      'position:absolute;top:clamp(16px,3vh,32px);left:clamp(16px,3vw,40px);bottom:clamp(16px,3vh,32px);' +
      'width:min(48vw,600px);display:flex;flex-direction:column;padding:clamp(16px,2.4vh,28px);gap:6px;';
    panel.append(makeScreenHeader('sliders', 'Settings'), this.body);
    this.el.appendChild(panel);
  }

  onShow(): void {
    this.resetConfirm = false;
    this.ctx.facade.showroom(null);
  }

  render(): void {
    this.rebuild();
  }

  focus(): FocusPlan {
    return { items: this.focusItems };
  }

  private push(w: { el: HTMLElement; item: FocusItem }): void {
    this.body.appendChild(w.el);
    this.focusItems.push(w.item);
  }

  private patchGraphics(patch: Partial<GraphicsSettings>): void {
    this.ctx.facade.updateSettings({
      graphics: { ...this.ctx.facade.save.settings.graphics, ...patch },
    });
  }

  private buildGraphics(): void {
    const g = this.ctx.facade.save.settings.graphics;
    this.body.appendChild(el('div', 'section-label subsection', 'Graphics'));
    this.push(
      makeCycle('Quality', QUALITY_OPTIONS, g.quality, (v) => this.patchGraphics({ quality: v })),
    );
    this.push(makeToggle('Shadows', g.shadows, (v) => this.patchGraphics({ shadows: v })));
    this.push(
      makeToggle('Post-processing', g.postProcessing, (v) =>
        this.patchGraphics({ postProcessing: v }),
      ),
    );
    this.push(
      makeToggle('Motion blur', g.motionBlur, (v) => this.patchGraphics({ motionBlur: v })),
    );
    this.push(
      makeSlider('Resolution scale', g.resolutionScale, 0.5, 1, 0.05, fmtPct, (v) =>
        this.patchGraphics({ resolutionScale: v }),
      ),
    );
    this.push(
      makeSlider(
        'Field of view',
        g.fov,
        55,
        100,
        1,
        (v) => `${Math.round(v)}°`,
        (v) => this.patchGraphics({ fov: v }),
      ),
    );
  }

  private buildAudio(): void {
    const a = this.ctx.facade.save.settings.audio;
    this.body.appendChild(el('div', 'section-label subsection', 'Audio'));
    const patch = (p: Partial<typeof a>): void =>
      this.ctx.facade.updateSettings({ audio: { ...this.ctx.facade.save.settings.audio, ...p } });
    this.push(
      makeSlider('Master volume', a.master, 0, 1, 0.05, fmtPct, (v) => patch({ master: v })),
    );
    this.push(makeSlider('Engine', a.engine, 0, 1, 0.05, fmtPct, (v) => patch({ engine: v })));
    this.push(makeSlider('Effects', a.effects, 0, 1, 0.05, fmtPct, (v) => patch({ effects: v })));
    this.push(makeSlider('Music', a.music, 0, 1, 0.05, fmtPct, (v) => patch({ music: v })));
  }

  private buildAssists(): void {
    const a = this.ctx.facade.save.settings.assists;
    this.body.appendChild(el('div', 'section-label subsection', 'Assists'));
    const patch = (p: Partial<typeof a>): void =>
      this.ctx.facade.updateSettings({
        assists: { ...this.ctx.facade.save.settings.assists, ...p },
      });
    this.push(makeToggle('ABS', a.abs, (v) => patch({ abs: v })));
    this.push(makeCycle('Traction control', TCS_OPTIONS, a.tcs, (v) => patch({ tcs: v })));
    this.push(makeToggle('Stability control', a.stability, (v) => patch({ stability: v })));
    this.push(makeToggle('Racing line', a.racingLine, (v) => patch({ racingLine: v })));
    this.push(makeToggle('Brake assist', a.autoBrake, (v) => patch({ autoBrake: v })));
  }

  private buildDriving(): void {
    const s = this.ctx.facade.save.settings;
    this.body.appendChild(el('div', 'section-label subsection', 'Driving'));
    this.push(
      makeCycle('Transmission', TRANSMISSION_OPTIONS, s.transmission, (v) =>
        this.ctx.facade.updateSettings({ transmission: v }),
      ),
    );
    this.push(
      makeCycle('Units', UNITS_OPTIONS, s.units, (v) =>
        this.ctx.facade.updateSettings({ units: v }),
      ),
    );
    this.push(
      makeCycle('Camera', CAMERA_OPTIONS, this.ctx.facade.cameraMode(), (v) =>
        this.ctx.facade.setCameraMode(v),
      ),
    );
  }

  private buildControls(): void {
    const s = this.ctx.facade.save.settings;
    this.body.appendChild(el('div', 'section-label subsection', 'Controls'));
    this.push(
      makeSlider(
        'Steering sensitivity',
        s.steeringSensitivity,
        0.5,
        2,
        0.05,
        (v) => v.toFixed(2),
        (v) => this.ctx.facade.updateSettings({ steeringSensitivity: v }),
      ),
    );
    this.push(
      makeSlider(
        'Wheel rotation',
        s.wheelRotationDeg,
        360,
        1080,
        10,
        (v) => `${Math.round(v)}°`,
        (v) => this.ctx.facade.updateSettings({ wheelRotationDeg: v }),
      ),
    );
    this.push(
      makeSlider('Force feedback', s.wheelForceFeedback, 0, 1, 0.05, fmtPct, (v) =>
        this.ctx.facade.updateSettings({ wheelForceFeedback: v }),
      ),
    );
  }

  private buildReset(): void {
    this.body.appendChild(el('div', 'section-label subsection', 'Data'));
    if (this.resetConfirm) {
      this.buildResetConfirmBox();
    } else {
      const btn = makeButton(
        'Reset save data',
        () => {
          this.resetConfirm = true;
          this.rebuild();
        },
        { className: 'danger' },
      );
      this.push(btn);
    }
  }

  private buildResetConfirmBox(): void {
    const box = el('div', 'confirm-box');
    box.appendChild(
      el(
        'div',
        'confirm-text',
        'Reset all save data — credits, cars and records? This cannot be undone.',
      ),
    );
    const row = el('div', 'form-actions');
    const confirmBtn = makeButton(
      'Confirm reset',
      () => {
        this.ctx.facade.resetSave();
        this.resetConfirm = false;
        this.ctx.sound('confirm');
        this.ctx.toast('Save data reset');
        this.ctx.refresh();
      },
      { className: 'danger' },
    );
    const cancelBtn = makeButton('Cancel', () => {
      this.resetConfirm = false;
      this.rebuild();
    });
    row.append(confirmBtn.el, cancelBtn.el);
    box.appendChild(row);
    this.body.appendChild(box);
    this.focusItems.push(confirmBtn.item, cancelBtn.item);
  }

  private rebuild(): void {
    this.focusItems = [];
    clear(this.body);
    this.buildGraphics();
    this.buildAudio();
    this.buildAssists();
    this.buildDriving();
    this.buildControls();
    this.buildReset();
  }
}

export function createSettingsScreen(ctx: ScreenContext): Screen {
  return new SettingsScreen(ctx);
}
