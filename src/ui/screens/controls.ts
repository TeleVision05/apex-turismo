import { el, clear } from '../dom';
import { makeButton, makeScreenHeader } from '../widgets';
import { ACTION_LABELS, KEYBOARD, MAPPABLE_ACTIONS } from '../../core/InputBindings';
import { InputManager } from '../../core/Input';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';
import type { ConnectedDevice } from '../../core/Input';
import type { InputAction, InputMapping } from '../../core/types';

function keyLabel(code: string): string {
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Arrow')) return `${code.slice(5)} arrow`;
  return code.replace('Left', ' (L)').replace('Right', ' (R)');
}

/** Controls: connected devices, keyboard reference and a per-device remap wizard. */
class ControlsScreen implements Screen {
  readonly el: HTMLElement;
  private body = el('div', 'side-panel-scroll');
  private overlay = el('div', 'capture-overlay hidden panel');
  private overlayText = el('div', 'capture-text', '');
  private devices: ConnectedDevice[] = [];
  private focusItems: FocusItem[] = [];
  private capturing = false;
  private cancelled = false;
  private pollTimer: number | null = null;

  constructor(private ctx: ScreenContext) {
    this.el = el('div', 'screen screen-controls');
    const panel = el('div', 'side-panel panel');
    panel.style.width = 'min(56vw, 700px)';
    panel.append(makeScreenHeader('gamepad', 'Controls'), this.body);
    this.el.appendChild(panel);
    this.overlay.append(
      this.overlayText,
      el('div', 'capture-hint', 'Move Back / press Backspace to cancel'),
    );
    this.el.appendChild(this.overlay);
  }

  onShow(): void {
    this.ctx.facade.showroom(null);
    this.cancelled = false;
    this.pollTimer = window.setInterval(() => {
      if (!this.capturing) this.rebuild();
    }, 1000);
  }

  onHide(): void {
    if (this.pollTimer !== null) window.clearInterval(this.pollTimer);
    this.pollTimer = null;
    if (this.capturing) {
      this.cancelled = true;
      this.ctx.facade.cancelCapture();
      this.setCapturing(false);
    }
  }

  render(): void {
    this.rebuild();
  }

  focus(): FocusPlan {
    return this.capturing ? { items: [] } : { items: this.focusItems };
  }

  interceptBack(): boolean {
    if (!this.capturing) return false;
    this.cancelled = true;
    this.ctx.facade.cancelCapture();
    this.setCapturing(false);
    this.ctx.sound('back');
    this.rebuild();
    return true;
  }

  private setCapturing(active: boolean, label?: string): void {
    this.capturing = active;
    this.overlay.classList.toggle('hidden', !active);
    if (label) this.overlayText.textContent = `Move or press the control for: ${label}`;
  }

  private async captureOne(device: ConnectedDevice, action: InputAction): Promise<void> {
    this.setCapturing(true, ACTION_LABELS[action]);
    this.focusItems = [];
    try {
      const binding = await this.ctx.facade.captureBinding();
      if (this.cancelled) return;
      this.ctx.facade.setBinding(device.id, device.type, action, binding);
      this.ctx.sound('confirm');
    } finally {
      this.setCapturing(false);
    }
  }

  private async mapAll(device: ConnectedDevice): Promise<void> {
    this.cancelled = false;
    for (const action of MAPPABLE_ACTIONS) {
      if (this.cancelled) break;
      await this.captureOne(device, action);
    }
    this.rebuild();
  }

  private buildDeviceList(): void {
    this.body.appendChild(el('div', 'section-label subsection', 'Connected devices'));
    if (!this.devices.length) {
      this.body.appendChild(
        el(
          'div',
          'notice info',
          'No devices detected yet. Press a button on your controller or wheel to detect it.',
        ),
      );
      return;
    }
    const listEl = el('div', 'device-list');
    for (const d of this.devices) {
      const row = el('div', 'device-row');
      row.appendChild(el('span', '', `${d.id} (${d.type === 'wheel' ? 'Wheel' : 'Gamepad'})`));
      row.appendChild(
        el(
          'span',
          `pill ${d.mapped ? 'owned' : 'locked'}`,
          d.mapped ? 'Mapped' : 'Default mapping',
        ),
      );
      listEl.appendChild(row);
    }
    this.body.appendChild(listEl);
    this.body.appendChild(
      el(
        'div',
        'gt-row-hint',
        'Steering wheels are treated as direct 1:1 steering — no smoothing or auto-centre.',
      ),
    );
  }

  private buildMappingRow(
    device: ConnectedDevice,
    action: InputAction,
    mapping: InputMapping | undefined,
  ): void {
    const binding = mapping?.bindings[action];
    const row = el('div', 'gt-row');
    row.appendChild(el('span', 'gt-row-label', ACTION_LABELS[action]));
    const value = el('div', 'gt-row-value');
    value.appendChild(el('span', '', binding ? InputManager.describe(binding) : 'Not bound'));
    const remap = makeButton('Remap', () => {
      void this.captureOne(device, action).then(() => this.rebuild());
    });
    value.appendChild(remap.el);
    row.appendChild(value);
    this.body.appendChild(row);
    this.focusItems.push(remap.item);
  }

  private buildMappingTable(device: ConnectedDevice): void {
    this.body.appendChild(el('div', 'section-label subsection', `Mapping — ${device.id}`));
    const mapping = this.ctx.facade.inputMappings()[device.id];
    for (const action of MAPPABLE_ACTIONS) this.buildMappingRow(device, action, mapping);
    const mapAllBtn = makeButton('Map all', () => void this.mapAll(device));
    const resetBtn = makeButton(
      'Reset device',
      () => {
        this.ctx.facade.clearMapping(device.id);
        this.ctx.sound('back');
        this.rebuild();
      },
      { className: 'danger' },
    );
    const actions = el('div', 'form-actions');
    actions.append(mapAllBtn.el, resetBtn.el);
    this.body.appendChild(actions);
    this.focusItems.push(mapAllBtn.item, resetBtn.item);
  }

  private buildKeyboardTable(): void {
    this.body.appendChild(el('div', 'section-label subsection', 'Keyboard reference'));
    const table = el('table', 'kbd-table');
    for (const [code, action] of Object.entries(KEYBOARD)) {
      const label = action.startsWith('menu')
        ? action.replace('menu', 'Menu ')
        : ACTION_LABELS[action as InputAction];
      const tr = el('tr');
      tr.appendChild(el('td', 'key', keyLabel(code)));
      tr.appendChild(el('td', '', label));
      table.appendChild(tr);
    }
    this.body.appendChild(table);
  }

  private rebuild(): void {
    this.focusItems = [];
    clear(this.body);
    this.devices = this.ctx.facade.inputDevices();
    this.buildDeviceList();
    for (const d of this.devices) this.buildMappingTable(d);
    this.buildKeyboardTable();
  }
}

export function createControlsScreen(ctx: ScreenContext): Screen {
  return new ControlsScreen(ctx);
}
