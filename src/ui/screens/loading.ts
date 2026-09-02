import { el } from '../dom';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';

const TIPS = [
  'Trail-brake into slow corners to keep the front tyres loaded.',
  'Short-shift on cold tyres until they come up to temperature.',
  'Downforce costs top speed but pays it back in the corners.',
  'Softer tyres grip harder but wear out faster over a stint.',
  'Late apexes open the exit and protect your line down the straight.',
  'Lift off gently before you brake to keep the car balanced.',
  'A wider entry line often means a straighter, faster exit.',
  'Watch your brake bias — too much rear locks the tail under braking.',
];

/** Loading screen: track name, progress bar, rotating driving tip. */
export function createLoadingScreen(ctx: ScreenContext): Screen {
  const root = el('div', 'screen screen-loading');
  const wrap = el('div', 'loading-wrap');
  const trackName = el('div', 'loading-track-name', '');
  const barTrack = el('div', 'loading-bar-track');
  const barFill = el('div', 'loading-bar-fill');
  barTrack.appendChild(barFill);
  const status = el('div', 'loading-status', '');
  const tip = el('div', 'loading-tip', '');
  wrap.append(trackName, barTrack, status, tip);
  root.appendChild(wrap);

  let tipTimer: number | null = null;

  const rotateTip = (): void => {
    tip.textContent = `Tip: ${TIPS[Math.floor(Math.random() * TIPS.length)]}`;
  };

  return {
    el: root,
    onShow: () => {
      ctx.facade.showroom(null);
      rotateTip();
      tipTimer = window.setInterval(rotateTip, 4500);
    },
    onHide: () => {
      if (tipTimer !== null) window.clearInterval(tipTimer);
      tipTimer = null;
    },
    render: () => {
      trackName.textContent = ctx.facade.loadedTrackName() || 'Loading';
    },
    focus: (): FocusPlan => ({ items: [] }),
    setProgress: (progress: number, text: string) => {
      barFill.style.width = `${Math.round(Math.max(0, Math.min(1, progress)) * 100)}%`;
      status.textContent = text;
    },
  } as Screen & { setProgress: (progress: number, text: string) => void };
}
