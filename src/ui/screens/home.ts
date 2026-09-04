import { el, clear } from '../dom';
import { fmtCredits, fmtPP } from '../format';
import { makeMenuItem } from '../widgets';
import { icon } from '../icons';
import type { IconName } from '../icons';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';

interface MenuItemDef {
  icon: IconName;
  title: string;
  desc: string;
  go: () => void;
}

const DRIVING_TIPS = [
  'Brake in a straight line, then release smoothly as you turn in.',
  'Look through the corner to where you want the car to go, not at the apex.',
  'Trail braking late lets you rotate the car deeper into slow corners.',
  'Smooth throttle application beats a stab of full power out of the apex.',
  "A wider entry line often buys a straighter, faster exit — don't fight for the apex.",
  'Weight transfer takes time: give the car a moment to settle before you commit.',
];

interface TopBar {
  el: HTMLElement;
  credits: HTMLElement;
  carName: HTMLElement;
  carPp: HTMLElement;
  driverName: HTMLElement;
}

function buildTopBar(): TopBar {
  const topBar = el('div', 'top-bar');
  const wordmark = el('div', 'wordmark');
  wordmark.appendChild(icon('emblem', 'wordmark-emblem'));
  wordmark.appendChild(el('span', 'wordmark-text', 'APEX TURISMO'));

  const credits = el('div', 'credits tnum', '');
  const creditsBlock = el('div', 'credits-block');
  creditsBlock.appendChild(credits);

  const carName = el('div', 'car-name', '');
  const carPp = el('div', 'car-pp tnum', '');
  const carBlock = el('div', 'car-block');
  carBlock.append(carName, carPp);

  const driverName = el('div', 'driver-name', '');
  const driverBlock = el('div', 'driver-block');
  driverBlock.appendChild(driverName);

  const left = el('div', 'top-bar-left');
  left.append(wordmark, creditsBlock);
  topBar.append(left, carBlock, driverBlock);
  return { el: topBar, credits, carName, carPp, driverName };
}

function buildTicker(): { el: HTMLElement; text: HTMLElement } {
  const ticker = el('div', 'home-ticker');
  ticker.appendChild(el('div', 'overline home-ticker-label', 'Driving tip'));
  const text = el('span', 'home-ticker-text', '');
  ticker.appendChild(text);
  return { el: ticker, text };
}

function menuItemDefs(ctx: ScreenContext): MenuItemDef[] {
  return [
    {
      icon: 'world',
      title: 'World Circuits',
      desc: 'Race through the event series',
      go: () => ctx.show('events'),
    },
    {
      icon: 'flag',
      title: 'Custom Race',
      desc: 'Set up a one-off race on any track',
      go: () => ctx.show('custom'),
    },
    {
      icon: 'stopwatch',
      title: 'Time Trial',
      desc: 'Chase your best lap, no traffic',
      go: () => ctx.show('timetrial'),
    },
    { icon: 'car', title: 'Garage', desc: 'Manage your owned cars', go: () => ctx.show('garage') },
    {
      icon: 'tag',
      title: 'Brand Central',
      desc: 'Buy cars from every maker',
      go: () => ctx.show('dealership'),
    },
    {
      icon: 'wrench',
      title: 'Tuning Shop',
      desc: 'Upgrade and set up your car',
      go: () => ctx.show('tuning'),
    },
    {
      icon: 'trophy',
      title: 'Records',
      desc: 'Your best laps, track by track',
      go: () => ctx.show('records'),
    },
    {
      icon: 'sliders',
      title: 'Settings',
      desc: 'Graphics, audio, assists and more',
      go: () => ctx.show('settings'),
    },
    {
      icon: 'gamepad',
      title: 'Controls',
      desc: 'Devices, mapping and keyboard reference',
      go: () => ctx.show('controls'),
    },
  ];
}

function renderHeader(bar: TopBar, ctx: ScreenContext): void {
  const { save } = ctx.facade;
  bar.credits.textContent = fmtCredits(save.credits);
  bar.driverName.textContent = save.driverName;
  const owned = save.garage[save.selectedCar];
  if (owned) {
    const spec = ctx.facade.ownedCarSpec(owned);
    bar.carName.textContent = spec.name;
    bar.carPp.textContent = fmtPP(ctx.facade.performancePoints(spec, owned.tuning));
  } else {
    bar.carName.textContent = 'No car selected';
    bar.carPp.textContent = '';
  }
}

function renderProgress(fill: HTMLElement, ctx: ScreenContext): void {
  const events = ctx.facade.events();
  const total = events.length || 1;
  const completed = events.filter((e) => ctx.facade.save.completedEvents[e.id]).length;
  fill.style.width = `${Math.min(100, Math.round((completed / total) * 100))}%`;
}

function showSelectedCar(ctx: ScreenContext): void {
  const { save } = ctx.facade;
  const owned = save.garage[save.selectedCar];
  if (owned) ctx.facade.showroom(owned.specId, owned.tuning.color);
  else ctx.facade.showroom(null);
}

/** Home: a vertical menu of large condensed labels over the showroom scene. */
export function createHomeScreen(ctx: ScreenContext): Screen {
  const root = el('div', 'screen screen-home');
  const bg = el('div', 'home-bg-veil');
  const progressTrack = el('div', 'home-progress-track');
  const progressFill = el('div', 'home-progress-fill');
  progressTrack.appendChild(progressFill);
  const topBar = buildTopBar();
  const menu = el('div', 'home-menu');
  const ticker = buildTicker();
  root.append(bg, progressTrack, topBar.el, menu, ticker.el);

  let focusItems: FocusItem[] = [];
  let tickerTimer: number | null = null;
  let tickerIdx = 0;
  const rotateTip = (): void => {
    ticker.text.textContent = DRIVING_TIPS[tickerIdx % DRIVING_TIPS.length];
    tickerIdx++;
    ticker.text.classList.remove('home-ticker-text');
    void ticker.text.offsetWidth;
    ticker.text.classList.add('home-ticker-text');
  };

  return {
    el: root,
    onShow: () => {
      showSelectedCar(ctx);
      rotateTip();
      if (tickerTimer !== null) window.clearInterval(tickerTimer);
      tickerTimer = window.setInterval(rotateTip, 6000);
    },
    onHide: () => {
      if (tickerTimer !== null) window.clearInterval(tickerTimer);
      tickerTimer = null;
    },
    render: () => {
      clear(menu);
      renderHeader(topBar, ctx);
      renderProgress(progressFill, ctx);
      focusItems = [];
      for (const item of menuItemDefs(ctx)) {
        const w = makeMenuItem(item.icon, item.title, item.desc, item.go);
        menu.appendChild(w.el);
        focusItems.push(w.item);
      }
    },
    focus: (): FocusPlan => ({ items: focusItems }),
  };
}
