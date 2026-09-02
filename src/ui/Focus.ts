import type { InputState } from '../core/types';

/** One focusable control on a screen. */
export interface FocusItem {
  el: HTMLElement;
  /** Adjust a slider/select left (only used when the manager is a single-column list). */
  onLeft?: () => void;
  /** Adjust a slider/select right (only used when the manager is a single-column list). */
  onRight?: () => void;
  /** Activate the control. Defaults to `el.click()`. */
  onConfirm?: () => void;
  /** Called whenever this item receives focus (keyboard/gamepad move or mouse hover). */
  onFocus?: () => void;
}

/**
 * Drives keyboard/gamepad navigation for one screen: a flat list of focusable
 * elements, optionally arranged in a grid (`columns > 1`). Mouse users get the
 * same highlight for free via `mouseenter`.
 */
export class FocusManager {
  private items: FocusItem[] = [];
  private index = -1;
  private columns = 1;
  private onMoveSound?: () => void;

  constructor(onMoveSound?: () => void) {
    this.onMoveSound = onMoveSound;
  }

  setItems(items: FocusItem[], columns = 1): void {
    this.items = items;
    this.columns = Math.max(1, columns);
    this.index = items.length ? 0 : -1;
    this.items.forEach((item, idx) => {
      item.el.classList.add('focusable');
      item.el.addEventListener('mouseenter', () => this.setIndex(idx, false));
    });
    this.highlight();
    // Deliberately does NOT call onFocus here: setItems runs on every
    // screen render (including a refresh after e.g. a purchase), and firing
    // onFocus on whichever item lands at the current index would treat a
    // rebuild as if the user had navigated there, causing state feedback
    // loops (see garage/dealership, which use onFocus to drive a detail
    // panel). onFocus fires only from genuine navigation via setIndex.
  }

  clear(): void {
    this.items = [];
    this.index = -1;
  }

  private highlight(): void {
    this.items.forEach((it, idx) => it.el.classList.toggle('focused', idx === this.index));
    const cur = this.items[this.index];
    cur?.el.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }

  setIndex(i: number, sound = true): void {
    if (i < 0 || i >= this.items.length || i === this.index) return;
    this.index = i;
    this.highlight();
    this.items[i]?.onFocus?.();
    if (sound) this.onMoveSound?.();
  }

  private moveBy(delta: number): void {
    if (!this.items.length) return;
    const next = Math.max(0, Math.min(this.items.length - 1, this.index + delta));
    this.setIndex(next);
  }

  handle(input: InputState): void {
    if (!this.items.length) return;
    if (input.menuDown) this.moveBy(this.columns);
    else if (input.menuUp) this.moveBy(-this.columns);
    else if (input.menuRight) this.right();
    else if (input.menuLeft) this.left();
    else if (input.menuConfirm) this.confirm();
  }

  private left(): void {
    const cur = this.items[this.index];
    if (!cur) return;
    if (this.columns > 1) {
      if (this.index % this.columns !== 0) this.moveBy(-1);
    } else if (cur.onLeft) {
      cur.onLeft();
      this.onMoveSound?.();
    }
  }

  private right(): void {
    const cur = this.items[this.index];
    if (!cur) return;
    if (this.columns > 1) {
      if (this.index % this.columns !== this.columns - 1) this.moveBy(1);
    } else if (cur.onRight) {
      cur.onRight();
      this.onMoveSound?.();
    }
  }

  confirm(): void {
    const cur = this.items[this.index];
    if (!cur) return;
    if (cur.onConfirm) cur.onConfirm();
    else cur.el.click();
  }

  get current(): HTMLElement | null {
    return this.items[this.index]?.el ?? null;
  }
}
