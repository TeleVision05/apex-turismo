import type { DeviceBinding, InputAction, InputMapping, InputState } from './types';
import { clamp } from './math';
import { KEYBOARD, standardGamepadMapping, wheelPresetFor, isWheelId } from './InputBindings';

export function emptyInput(): InputState {
  return {
    steer: 0,
    steerIsDirect: false,
    throttle: 0,
    brake: 0,
    handbrake: false,
    shiftUp: false,
    shiftDown: false,
    camera: false,
    lookBack: false,
    pause: false,
    reset: false,
    standings: false,
    menuUp: false,
    menuDown: false,
    menuLeft: false,
    menuRight: false,
    menuConfirm: false,
    menuBack: false,
  };
}

export interface ConnectedDevice {
  index: number;
  id: string;
  type: 'gamepad' | 'wheel';
  mapped: boolean;
}

const EDGE_ACTIONS = ['shiftUp', 'shiftDown', 'camera', 'pause', 'reset'] as const;

/**
 * Unified input: keyboard, standard gamepads and steering wheels through the
 * Gamepad API. Produces one InputState per frame with edge-triggered buttons.
 */
export class InputManager {
  readonly state = emptyInput();
  steeringSensitivity = 1;
  wheelRotationDeg = 900;
  private keys = new Set<string>();
  private prevDigital: Record<string, boolean> = {};
  private kbSteer = 0;
  private kbThrottle = 0;
  private kbBrake = 0;
  private mappings: Record<string, InputMapping>;
  private capture: {
    baseline: { axes: number[]; buttons: number[] }[];
    resolve: (b: DeviceBinding & { deviceId: string }) => void;
  } | null = null;
  lastDeviceUsed: 'keyboard' | 'gamepad' | 'wheel' = 'keyboard';
  private ffbEnabled = true;

  constructor(mappings: Record<string, InputMapping>) {
    this.mappings = mappings;
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Tab' || e.code === 'Space' || e.code.startsWith('Arrow')) e.preventDefault();
      this.keys.add(e.code);
      this.lastDeviceUsed = 'keyboard';
    });
    window.addEventListener('keyup', (e) => this.keys.delete(e.code));
    window.addEventListener('blur', () => this.keys.clear());
  }

  setMappings(m: Record<string, InputMapping>): void {
    this.mappings = m;
  }

  devices(): ConnectedDevice[] {
    const out: ConnectedDevice[] = [];
    for (const gp of navigator.getGamepads()) {
      if (!gp) continue;
      const type =
        isWheelId(gp.id) || this.mappings[gp.id]?.deviceType === 'wheel' ? 'wheel' : 'gamepad';
      out.push({ index: gp.index, id: gp.id, type, mapped: !!this.mappings[gp.id] });
    }
    return out;
  }

  mappingFor(gp: Gamepad): InputMapping | null {
    const saved = this.mappings[gp.id];
    if (saved) return saved;
    if (gp.mapping === 'standard' && !isWheelId(gp.id)) return standardGamepadMapping(gp.id);
    return wheelPresetFor(gp.id);
  }

  /** Called once per frame. */
  update(dt: number): void {
    const s = this.state;
    const digital: Record<string, boolean> = {};
    this.readKeyboard(dt, digital);
    let steer = this.kbSteer;
    let throttle = this.kbThrottle;
    let brake = this.kbBrake;
    s.steerIsDirect = false;
    if (this.capture) this.pollCapture();
    for (const gp of navigator.getGamepads()) {
      if (!gp) continue;
      const map = this.mappingFor(gp);
      if (!map) continue;
      const r = this.readGamepad(gp, map, digital);
      if (Math.abs(r.steer) > 0.02 || r.throttle > 0.02 || r.brake > 0.02)
        this.lastDeviceUsed = map.deviceType;
      if (Math.abs(r.steer) > Math.abs(steer)) {
        steer = r.steer;
        s.steerIsDirect = map.deviceType === 'wheel';
      }
      throttle = Math.max(throttle, r.throttle);
      brake = Math.max(brake, r.brake);
      this.readMenuFromGamepad(gp, digital);
    }
    s.steer = clamp(steer, -1, 1);
    s.throttle = clamp(throttle, 0, 1);
    s.brake = clamp(brake, 0, 1);
    s.handbrake = !!digital.handbrake;
    s.lookBack = !!digital.lookBack;
    s.standings = !!digital.standings;
    for (const a of EDGE_ACTIONS) s[a] = !!digital[a] && !this.prevDigital[a];
    for (const m of [
      'menuUp',
      'menuDown',
      'menuLeft',
      'menuRight',
      'menuConfirm',
      'menuBack',
    ] as const) {
      s[m] = !!digital[m] && !this.prevDigital[m];
    }
    this.prevDigital = digital;
  }

  private readKeyboard(dt: number, digital: Record<string, boolean>): void {
    let steerTarget = 0;
    let thr = false;
    let brk = false;
    for (const code of this.keys) {
      const action = KEYBOARD[code];
      if (!action) continue;
      if (action === 'steerLeft') steerTarget -= 1;
      else if (action === 'steerRight') steerTarget += 1;
      else if (action === 'throttle') thr = true;
      else if (action === 'brake') brk = true;
      else digital[action] = true;
    }
    if (this.keys.has('ArrowUp') || this.keys.has('KeyW')) digital.menuUp = true;
    if (this.keys.has('ArrowDown') || this.keys.has('KeyS')) digital.menuDown = true;
    if (this.keys.has('ArrowLeft') || this.keys.has('KeyA')) digital.menuLeft = true;
    if (this.keys.has('ArrowRight') || this.keys.has('KeyD')) digital.menuRight = true;
    if (this.keys.has('Escape')) digital.menuBack = true;
    // keyboard steering ramps so the car does not snap to full lock
    const rise = 3.2 * this.steeringSensitivity;
    const fall = 7;
    if (steerTarget !== 0) this.kbSteer = clamp(this.kbSteer + steerTarget * rise * dt, -1, 1);
    else
      this.kbSteer =
        Math.abs(this.kbSteer) < fall * dt ? 0 : this.kbSteer - Math.sign(this.kbSteer) * fall * dt;
    this.kbThrottle = clamp(this.kbThrottle + (thr ? 5 : -8) * dt, 0, 1);
    this.kbBrake = clamp(this.kbBrake + (brk ? 6 : -10) * dt, 0, 1);
  }

  private readBinding(gp: Gamepad, b: DeviceBinding | undefined): number {
    if (!b) return 0;
    if (b.kind === 'button') {
      const btn = gp.buttons[b.index];
      return btn ? (typeof btn.value === 'number' ? btn.value : btn.pressed ? 1 : 0) : 0;
    }
    const raw = gp.axes[b.index] ?? b.rest;
    const span = b.full - b.rest;
    if (Math.abs(span) < 1e-3) return 0;
    return clamp((raw - b.rest) / span, 0, 1);
  }

  private readGamepad(
    gp: Gamepad,
    map: InputMapping,
    digital: Record<string, boolean>,
  ): { steer: number; throttle: number; brake: number } {
    const b = map.bindings;
    let steer = 0;
    if (b.steerAxis) {
      const raw = gp.axes[b.steerAxis.index] ?? 0;
      if (map.deviceType === 'wheel') {
        steer = clamp(raw * (900 / this.wheelRotationDeg), -1, 1);
      } else {
        const dz = 0.08;
        const mag = Math.max(0, Math.abs(raw) - dz) / (1 - dz);
        steer = Math.sign(raw) * Math.pow(mag, 1.4) * this.steeringSensitivity;
      }
    }
    if (b.steerLeft || b.steerRight)
      steer += this.readBinding(gp, b.steerRight) - this.readBinding(gp, b.steerLeft);
    const throttle = this.readBinding(gp, b.throttle);
    const brake = this.readBinding(gp, b.brake);
    for (const a of [
      'handbrake',
      'shiftUp',
      'shiftDown',
      'camera',
      'lookBack',
      'pause',
      'reset',
      'standings',
    ] as const) {
      if (this.readBinding(gp, b[a]) > 0.5) digital[a] = true;
    }
    return { steer, throttle, brake };
  }

  private readMenuFromGamepad(gp: Gamepad, digital: Record<string, boolean>): void {
    const std = gp.mapping === 'standard';
    const btn = (i: number): boolean => !!gp.buttons[i]?.pressed;
    const ay = gp.axes[1] ?? 0;
    const ax = gp.axes[0] ?? 0;
    if ((std && btn(12)) || ay < -0.6) digital.menuUp = true;
    if ((std && btn(13)) || ay > 0.6) digital.menuDown = true;
    if ((std && btn(14)) || (std && ax < -0.6)) digital.menuLeft = true;
    if ((std && btn(15)) || (std && ax > 0.6)) digital.menuRight = true;
    if (btn(0)) digital.menuConfirm = true;
    if (btn(1)) digital.menuBack = true;
    if (btn(9)) digital.pause = true;
  }

  /** Starts listening for the next control the user moves; resolves with its binding. */
  captureBinding(): Promise<DeviceBinding & { deviceId: string }> {
    const baseline = [...navigator.getGamepads()].map((gp) =>
      gp
        ? { axes: [...gp.axes], buttons: gp.buttons.map((b) => b.value) }
        : { axes: [], buttons: [] },
    );
    return new Promise((resolve) => {
      this.capture = { baseline, resolve };
    });
  }

  cancelCapture(): void {
    this.capture = null;
  }

  private pollCapture(): void {
    if (!this.capture) return;
    const pads = navigator.getGamepads();
    for (let i = 0; i < pads.length; i++) {
      const gp = pads[i];
      const base = this.capture.baseline[i];
      if (!gp || !base) continue;
      for (let a = 0; a < gp.axes.length; a++) {
        const rest = base.axes[a] ?? 0;
        const cur = gp.axes[a];
        if (Math.abs(cur - rest) > 0.55) {
          const full = cur > rest ? 1 : -1;
          this.capture.resolve({ kind: 'axis', index: a, rest, full, deviceId: gp.id });
          this.capture = null;
          return;
        }
      }
      for (let b = 0; b < gp.buttons.length; b++) {
        if (gp.buttons[b].value - (base.buttons[b] ?? 0) > 0.5) {
          this.capture.resolve({ kind: 'button', index: b, rest: 0, full: 1, deviceId: gp.id });
          this.capture = null;
          return;
        }
      }
    }
  }

  /** Rumble on controllers that support it (collisions, kerbs, off-track). */
  rumble(strong: number, weak: number, ms: number): void {
    if (!this.ffbEnabled) return;
    for (const gp of navigator.getGamepads()) {
      const act = (gp as Gamepad | null)?.vibrationActuator as
        { playEffect?: (t: string, p: object) => Promise<string> } | undefined;
      if (!act?.playEffect) continue;
      act
        .playEffect('dual-rumble', {
          startDelay: 0,
          duration: ms,
          strongMagnitude: clamp(strong, 0, 1),
          weakMagnitude: clamp(weak, 0, 1),
        })
        .catch(() => {});
    }
  }

  setForceFeedback(enabled: boolean): void {
    this.ffbEnabled = enabled;
  }

  /** Steering value applied to a steering-axis binding for a raw device value. */
  static describe(b: DeviceBinding): string {
    return b.kind === 'axis'
      ? `Axis ${b.index}${b.full < b.rest ? ' (inverted)' : ''}`
      : `Button ${b.index}`;
  }

  actionsList(): InputAction[] {
    return [
      'steerAxis',
      'throttle',
      'brake',
      'handbrake',
      'shiftUp',
      'shiftDown',
      'camera',
      'lookBack',
      'pause',
      'reset',
      'standings',
    ];
  }
}
