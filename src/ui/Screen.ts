import type { GameFacade, ScreenName } from './UiContract';
import type { FocusItem } from './Focus';
import type { InputState } from '../core/types';

/** Shared services every screen gets, so screens never talk to the DOM root directly. */
export interface ScreenContext {
  facade: GameFacade;
  /** Navigate to another screen, pushing history. */
  show: (name: ScreenName, data?: unknown) => void;
  /** Go back one screen in history. */
  back: () => void;
  /** Re-render whichever screen is currently visible. */
  refresh: () => void;
  toast: (text: string) => void;
  sound: (kind: 'move' | 'confirm' | 'back' | 'buy' | 'error') => void;
}

export interface FocusPlan {
  items: FocusItem[];
  columns?: number;
}

/** One menu screen: a panel mounted once, rebuilt on every show/refresh. */
export interface Screen {
  el: HTMLElement;
  /** (Re)build the DOM for this screen from current facade state. */
  render(data?: unknown): void;
  /** Focus items for the content currently on screen (call after render). */
  focus(): FocusPlan;
  /** Called each time the screen becomes visible, before render(). */
  onShow?(data?: unknown): void;
  /** Called when navigating away from this screen. */
  onHide?(): void;
  /** Called every frame while this screen is visible (e.g. device polling). */
  onTick?(): void;
  /**
   * Called before the default Back handling. Return true to swallow the Back
   * press (e.g. cancel an in-progress control capture) instead of navigating away.
   */
  interceptBack?(): boolean;
  /**
   * Called before default focus-list navigation, for screens with bespoke
   * input handling (e.g. the replay scrubber). Return true to swallow the
   * frame's input entirely (default handling, including Back, is skipped).
   */
  interceptInput?(input: InputState): boolean;
}
