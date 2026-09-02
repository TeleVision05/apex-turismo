import { el, clear } from '../dom';
import { makeButton } from '../widgets';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';

/** Pause menu: Resume / Restart / Settings / Quit, overlaid on the frozen race. */
export function createPauseScreen(ctx: ScreenContext): Screen {
  const root = el('div', 'screen screen-pause');
  const box = el('div', 'center-panel panel');
  box.appendChild(el('div', 'pause-title', 'Paused'));
  const buttons = el('div', 'form-rows');
  box.appendChild(buttons);
  root.appendChild(box);

  let focusItems: FocusItem[] = [];

  function rebuild(): void {
    clear(buttons);
    focusItems = [];
    const resume = makeButton(
      'Resume',
      () => {
        ctx.sound('confirm');
        ctx.facade.resumeRace();
      },
      { className: 'primary' },
    );
    const restart = makeButton('Restart', () => {
      ctx.sound('confirm');
      ctx.facade.restartRace();
    });
    const settings = makeButton('Settings', () => ctx.show('settings'));
    const quit = makeButton(
      'Quit to menu',
      () => {
        ctx.sound('back');
        ctx.facade.quitToHome();
      },
      { className: 'danger' },
    );
    for (const w of [resume, restart, settings, quit]) {
      buttons.appendChild(w.el);
      focusItems.push(w.item);
    }
  }

  return {
    el: root,
    render: () => rebuild(),
    focus: (): FocusPlan => ({ items: focusItems }),
  };
}
