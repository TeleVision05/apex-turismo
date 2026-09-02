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
  const press = el('div', 'press-start', 'Press any key or click to start');
  press.appendChild(el('div', 'press-start-underline'));
  wrap.appendChild(press);
  root.appendChild(wrap);

  const driverCredit = el('div', 'driver-credit', '');
  wrap.appendChild(driverCredit);

  const enter = (): void => {
    ctx.facade.showroom(null);
    ctx.sound('confirm');
    ctx.show('home');
  };

  root.addEventListener('click', enter);

  return {
    el: root,
    onShow: () => ctx.facade.showroom(null),
    render: () => {
      driverCredit.textContent = `Driver: ${ctx.facade.save.driverName}`;
    },
    focus: (): FocusPlan => ({
      items: [{ el: root, onConfirm: enter }],
    }),
  };
}
