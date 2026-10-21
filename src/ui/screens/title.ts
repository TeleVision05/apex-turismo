import { el } from '../dom';
import { icon } from '../icons';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';

/** Title screen: also the audio-unlock gesture (any key/click). */
export function createTitleScreen(ctx: ScreenContext): Screen {
  const root = el('div', 'screen screen-title');
  const wrap = el('div', 'title-wrap');
  wrap.appendChild(icon('emblem', 'title-emblem'));
  wrap.appendChild(el('div', 'game-title', 'APEX TURISMO'));
  wrap.appendChild(el('div', 'game-subtitle', 'The Real Driving Simulator'));
  wrap.appendChild(el('div', 'press-start', 'Press any key or click to start'));
  root.appendChild(wrap);

  const driverCredit = el('div', 'driver-credit', '');
  wrap.appendChild(driverCredit);

  let armed = false;
  const enter = (): void => {
    if (!armed) return;
    armed = false;
    window.removeEventListener('keydown', onKey);
    ctx.facade.showroom(null);
    ctx.sound('confirm');
    ctx.show('home');
  };
  const onKey = (): void => {
    enter();
  };

  root.addEventListener('click', enter);

  return {
    el: root,
    onShow: () => {
      armed = true;
      window.addEventListener('keydown', onKey);
      ctx.facade.showroom(null);
    },
    onHide: () => {
      armed = false;
      window.removeEventListener('keydown', onKey);
    },
    render: () => {
      driverCredit.textContent = `Driver: ${ctx.facade.save.driverName}`;
    },
    focus: (): FocusPlan => ({
      items: [{ el: root, onConfirm: enter }],
    }),
  };
}
