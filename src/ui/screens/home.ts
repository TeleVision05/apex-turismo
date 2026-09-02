import { el, clear } from '../dom';
import { fmtCredits, fmtPP } from '../format';
import { makeTile } from '../widgets';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';

interface TileDef {
  title: string;
  desc: string;
  go: () => void;
}

/** Home / world map: a GT7-style tile grid plus the credits/car header bar. */
export function createHomeScreen(ctx: ScreenContext): Screen {
  const root = el('div', 'screen screen-home');

  const topBar = el('div', 'top-bar');
  const credits = el('div', 'credits', '');
  const carBlock = el('div', 'car-block');
  const carName = el('div', 'car-name', '');
  const carPp = el('div', 'car-pp', '');
  carBlock.append(carName, carPp);
  const driverBlock = el('div', 'driver-block');
  const driverName = el('div', 'driver-name', '');
  driverBlock.appendChild(driverName);
  topBar.append(credits, carBlock, driverBlock);

  const tiles = el('div', 'home-tiles');
  root.append(topBar, tiles);

  const buildTiles = (): TileDef[] => [
    {
      title: 'World Circuits',
      desc: 'Race through the event series',
      go: () => ctx.show('events'),
    },
    {
      title: 'Custom Race',
      desc: 'Set up a one-off race on any track',
      go: () => ctx.show('custom'),
    },
    {
      title: 'Time Trial',
      desc: 'Chase your best lap, no traffic',
      go: () => ctx.show('timetrial'),
    },
    { title: 'Garage', desc: 'Manage your owned cars', go: () => ctx.show('garage') },
    { title: 'Brand Central', desc: 'Buy cars from every maker', go: () => ctx.show('dealership') },
    { title: 'Tuning Shop', desc: 'Upgrade and set up your car', go: () => ctx.show('tuning') },
    { title: 'Records', desc: 'Your best laps, track by track', go: () => ctx.show('records') },
    {
      title: 'Settings',
      desc: 'Graphics, audio, assists and more',
      go: () => ctx.show('settings'),
    },
    {
      title: 'Controls',
      desc: 'Devices, mapping and keyboard reference',
      go: () => ctx.show('controls'),
    },
  ];

  let focusItems: FocusItem[] = [];

  return {
    el: root,
    onShow: () => ctx.facade.showroom(null),
    render: () => {
      clear(tiles);
      const { save } = ctx.facade;
      credits.textContent = fmtCredits(save.credits);
      driverName.textContent = save.driverName;
      const owned = save.garage[save.selectedCar];
      if (owned) {
        const spec = ctx.facade.ownedCarSpec(owned);
        carName.textContent = spec.name;
        carPp.textContent = fmtPP(ctx.facade.performancePoints(spec, owned.tuning));
      } else {
        carName.textContent = 'No car selected';
        carPp.textContent = '';
      }
      focusItems = [];
      for (const t of buildTiles()) {
        const w = makeTile(t.title, t.desc, t.go);
        tiles.appendChild(w.el);
        focusItems.push(w.item);
      }
    },
    focus: (): FocusPlan => ({ items: focusItems, columns: 3 }),
  };
}
