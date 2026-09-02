import type { DeviceBinding, InputAction, InputMapping } from './types';

const btn = (index: number): DeviceBinding => ({ kind: 'button', index, rest: 0, full: 1 });
const axis = (index: number, rest = 0, full = 1): DeviceBinding => ({
  kind: 'axis',
  index,
  rest,
  full,
});

/** Standard-mapping gamepad (Xbox / PlayStation layout as exposed by the browser). */
export function standardGamepadMapping(id: string): InputMapping {
  return {
    deviceId: id,
    deviceType: 'gamepad',
    bindings: {
      steerAxis: axis(0),
      throttle: btn(7),
      brake: btn(6),
      handbrake: btn(1),
      shiftUp: btn(5),
      shiftDown: btn(4),
      camera: btn(3),
      lookBack: btn(8),
      pause: btn(9),
      reset: btn(2),
      standings: btn(0),
    },
  };
}

/**
 * Best-effort defaults for common wheels when the browser exposes them without
 * a standard mapping. Pedals on most Logitech/Thrustmaster wheels rest at +1
 * and read -1 when fully pressed. Users can re-map every control in Settings.
 */
export function wheelPresetFor(id: string): InputMapping | null {
  const lower = id.toLowerCase();
  const logitech = /g29|g920|g923|g27|g25|driving force|logitech/.test(lower);
  const thrustmaster = /t150|t300|t248|tmx|t500|tx |thrustmaster|ferrari/.test(lower);
  const fanatec = /fanatec|csl|podium|clubsport/.test(lower);
  const moza = /moza|simagic|simucube|vrs/.test(lower);
  if (!logitech && !thrustmaster && !fanatec && !moza) return null;
  const bindings: Partial<Record<InputAction, DeviceBinding>> = {
    steerAxis: axis(0),
    throttle: logitech ? axis(2, 1, -1) : axis(1, 1, -1),
    brake: logitech ? axis(5, 1, -1) : axis(2, 1, -1),
    shiftUp: btn(logitech ? 4 : 5),
    shiftDown: btn(logitech ? 5 : 4),
    handbrake: btn(1),
    camera: btn(3),
    lookBack: btn(0),
    pause: btn(9),
    reset: btn(2),
    standings: btn(8),
  };
  return { deviceId: id, deviceType: 'wheel', bindings };
}

export function isWheelId(id: string): boolean {
  return /wheel|g29|g920|g923|g27|t150|t300|t248|tmx|fanatec|moza|simagic|driving force|racing/i.test(
    id,
  );
}

export const ACTION_LABELS: Record<InputAction, string> = {
  steerLeft: 'Steer left',
  steerRight: 'Steer right',
  steerAxis: 'Steering axis',
  throttle: 'Accelerate',
  brake: 'Brake',
  handbrake: 'Handbrake',
  shiftUp: 'Shift up',
  shiftDown: 'Shift down',
  camera: 'Change camera',
  lookBack: 'Look back',
  pause: 'Pause',
  reset: 'Reset to track',
  standings: 'Show standings',
};

export const MAPPABLE_ACTIONS: InputAction[] = [
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

/** Keyboard defaults (KeyboardEvent.code). */
export const KEYBOARD: Record<
  string,
  InputAction | 'menuUp' | 'menuDown' | 'menuLeft' | 'menuRight' | 'menuConfirm' | 'menuBack'
> = {
  ArrowLeft: 'steerLeft',
  KeyA: 'steerLeft',
  ArrowRight: 'steerRight',
  KeyD: 'steerRight',
  ArrowUp: 'throttle',
  KeyW: 'throttle',
  ArrowDown: 'brake',
  KeyS: 'brake',
  Space: 'handbrake',
  ShiftLeft: 'shiftUp',
  ShiftRight: 'shiftUp',
  KeyE: 'shiftUp',
  ControlLeft: 'shiftDown',
  ControlRight: 'shiftDown',
  KeyQ: 'shiftDown',
  KeyC: 'camera',
  KeyV: 'lookBack',
  Escape: 'pause',
  KeyR: 'reset',
  Tab: 'standings',
  Enter: 'menuConfirm',
  Backspace: 'menuBack',
};
