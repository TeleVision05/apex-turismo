import { el, clear } from '../dom';
import { fmtSpeed } from '../format';
import { formatDelta, formatLapTime } from '../../core/math';
import { Minimap } from './Minimap';
import type { GameFacade } from '../UiContract';
import type { HudState, StandingEntry } from '../../core/types';

/** Renders HudState at 60 fps: cached refs, minimal DOM writes, no per-frame layout thrash. */
export class Hud {
  readonly el: HTMLElement;
  private facade: GameFacade;
  private minimap = new Minimap();

  private position = el('span', '', '');
  private totalCars = el('span', 'of', '');
  private lapEl = el('div', 'hud-lap', '');
  private currentTime = el('div', 'hud-current-time', '');
  private lastTime = el('span', '', '');
  private bestTime = el('span', '', '');
  private delta = el('span', 'hud-delta', '');
  private sectors: HTMLElement[] = [];
  private gapAhead = el('span', '', '');
  private gapBehind = el('span', '', '');
  private speedValue = el('span', '', '');
  private speedUnit = el('span', 'unit', '');
  private gear = el('div', 'hud-gear', '');
  private rpmFill = el('div', 'hud-rpm-fill');
  private rpmRedline = el('div', 'hud-rpm-redline');
  private shiftLight = el('div', 'hud-shift-light');
  private absBadge = el('span', 'hud-badge', 'ABS');
  private tcsBadge = el('span', 'hud-badge', 'TCS');
  private offBadge = el('span', 'hud-badge', 'OFF TRACK');
  private invalidBadge = el('span', 'hud-badge', 'LAP INVALID');
  private centerMessage = el('div', 'hud-center-message');
  private standingsBox = el('div', 'hud-standings panel hidden');
  private standingsBody = el('tbody');

  private prev: Partial<Record<string, string | number | boolean>> = {};
  private currentTrackId: string | null = null;

  constructor(facade: GameFacade) {
    this.facade = facade;
    this.rpmRedline.style.width = '12%';
    this.el = el('div', 'hud-layer');
    this.el.append(
      this.buildTopLeft(),
      this.buildTopRight(),
      this.buildGaps(),
      this.buildBottomRight(),
      this.centerMessage,
      this.minimap.el,
      this.buildStandings(),
    );
  }

  private buildTopLeft(): HTMLElement {
    const box = el('div', 'hud-top-left');
    const pos = el('div', 'hud-position');
    pos.append(this.position, this.totalCars);
    box.append(pos, this.lapEl, this.buildAssists());
    return box;
  }

  private buildTopRight(): HTMLElement {
    const box = el('div', 'hud-top-right');
    const row = el('div', 'hud-time-row');
    row.append(this.lastTime, this.bestTime, this.delta);
    const sectorRow = el('div', 'hud-sectors');
    for (let i = 0; i < 3; i++) {
      const s = el('div', 'hud-sector');
      this.sectors.push(s);
      sectorRow.appendChild(s);
    }
    box.append(this.currentTime, row, sectorRow);
    return box;
  }

  private buildGaps(): HTMLElement {
    const box = el('div', 'hud-gaps');
    box.append(this.gapAhead, this.gapBehind);
    return box;
  }

  private buildBottomRight(): HTMLElement {
    const box = el('div', 'hud-bottom-right');
    const speed = el('div', 'hud-speed');
    speed.append(this.speedValue, this.speedUnit);
    const rpmBar = el('div', 'hud-rpm-bar');
    rpmBar.append(this.rpmRedline, this.rpmFill);
    box.append(speed, this.gear, rpmBar, this.shiftLight);
    return box;
  }

  private buildAssists(): HTMLElement {
    const box = el('div', 'hud-assists');
    box.append(this.absBadge, this.tcsBadge, this.offBadge, this.invalidBadge);
    return box;
  }

  private buildStandings(): HTMLElement {
    const table = el('table');
    const head = el('tr');
    for (const h of ['Pos', 'Driver', 'Car', 'Gap', 'Best']) head.appendChild(el('th', '', h));
    const thead = el('thead');
    thead.appendChild(head);
    table.append(thead, this.standingsBody);
    this.standingsBox.appendChild(table);
    return this.standingsBox;
  }

  private set(key: string, node: HTMLElement, text: string): void {
    if (this.prev[key] === text) return;
    this.prev[key] = text;
    node.textContent = text;
  }

  private updatePosition(state: HudState): void {
    this.set('pos', this.position, `${state.position}`);
    this.set('ofCars', this.totalCars, ` / ${state.totalCars}`);
    this.set('lap', this.lapEl, `LAP ${state.lap} / ${state.totalLaps}`);
  }

  private updateTimes(state: HudState): void {
    this.set('cur', this.currentTime, formatLapTime(state.currentLapMs));
    this.set('last', this.lastTime, `LAST ${formatLapTime(state.lastLapMs)}`);
    this.set('best', this.bestTime, `BEST ${formatLapTime(state.bestLapMs)}`);
    const dText = state.deltaToBestMs === null ? '' : formatDelta(state.deltaToBestMs);
    if (this.prev.delta !== dText) {
      this.prev.delta = dText;
      this.delta.textContent = dText;
      this.delta.classList.toggle(
        'negative',
        state.deltaToBestMs !== null && state.deltaToBestMs < 0,
      );
      this.delta.classList.toggle(
        'positive',
        state.deltaToBestMs !== null && state.deltaToBestMs >= 0,
      );
      this.delta.classList.toggle('hidden', state.deltaToBestMs === null);
    }
    state.sectorTimes.forEach((t, i) => {
      const key = `sector${i}`;
      const cls = t === null ? 'pending' : 'set';
      if (this.prev[key] === cls) return;
      this.prev[key] = cls;
      this.sectors[i]?.classList.toggle('set', t !== null);
    });
  }

  private updateGaps(state: HudState): void {
    this.set(
      'gapAhead',
      this.gapAhead,
      state.gapAheadMs === null ? '' : `Ahead ${formatDelta(-state.gapAheadMs)}`,
    );
    this.set(
      'gapBehind',
      this.gapBehind,
      state.gapBehindMs === null ? '' : `Behind ${formatDelta(state.gapBehindMs)}`,
    );
  }

  private updateSpeedGear(state: HudState): void {
    const units = this.facade.save.settings.units;
    this.set('speed', this.speedValue, fmtSpeed(state.speedKmh, units));
    this.set('unit', this.speedUnit, units === 'mph' ? 'mph' : 'km/h');
    const gearText = state.gear === 0 ? 'N' : state.gear === -1 ? 'R' : `${state.gear}`;
    this.set('gear', this.gear, gearText);
  }

  private updateRpm(state: HudState): void {
    const frac = Math.max(0, Math.min(1, state.rpm / state.redlineRpm));
    const key = `rpm${frac.toFixed(3)}`;
    if (this.prev.rpmKey !== key) {
      this.prev.rpmKey = key;
      this.rpmFill.style.transform = `scaleX(${frac})`;
    }
    const flash = state.rpm > state.redlineRpm * 0.95;
    if (this.prev.shiftFlash !== flash) {
      this.prev.shiftFlash = flash;
      this.shiftLight.classList.toggle('flash', flash);
    }
  }

  private updateAssists(state: HudState): void {
    if (this.prev.abs !== state.abs) {
      this.prev.abs = state.abs;
      this.absBadge.classList.toggle('active', state.abs);
    }
    if (this.prev.tcs !== state.tcs) {
      this.prev.tcs = state.tcs;
      this.tcsBadge.classList.toggle('active', state.tcs);
    }
    if (this.prev.off !== state.offTrack) {
      this.prev.off = state.offTrack;
      this.offBadge.classList.toggle('warn', state.offTrack);
      this.offBadge.classList.toggle('hidden', !state.offTrack);
    }
    if (this.prev.invalid !== state.invalidLap) {
      this.prev.invalid = state.invalidLap;
      this.invalidBadge.classList.toggle('warn', state.invalidLap);
      this.invalidBadge.classList.toggle('hidden', !state.invalidLap);
    }
  }

  private updateMessage(state: HudState): void {
    let text = '';
    let cls = 'hud-center-message';
    if (state.countdown !== null) {
      text = state.countdown > 0 ? `${state.countdown}` : 'GO!';
      cls += ' countdown';
    } else if (state.wrongWay) {
      text = 'WRONG WAY';
      cls += ' flash';
    } else if (state.message) {
      text = state.message;
    }
    const key = `${cls}|${text}`;
    if (this.prev.msg === key) return;
    this.prev.msg = key;
    this.centerMessage.className = cls;
    const isCountdown = cls.includes('countdown');
    if (text && !isCountdown) {
      clear(this.centerMessage);
      this.centerMessage.appendChild(el('div', 'hud-message-text', text));
    } else {
      this.centerMessage.textContent = text;
    }
  }

  private updateMinimap(state: HudState): void {
    const trackId = this.facade.loadedTrackName();
    if (trackId !== this.currentTrackId) {
      this.currentTrackId = trackId;
      this.minimap.setOutline(this.facade.trackOutline());
    } else if (!this.minimap.outlineReady) {
      this.minimap.setOutline(this.facade.trackOutline());
    }
    const dots = state.carProgress.map((c) => {
      const [u, v] = this.facade.minimapPoint(c.s, c.lateral);
      return { u, v, color: c.color, isPlayer: c.isPlayer };
    });
    this.minimap.drawDots(dots);
  }

  private updateStandings(standings: StandingEntry[]): void {
    clear(this.standingsBody);
    for (const s of standings) {
      const tr = el('tr', s.isPlayer ? 'is-player' : '');
      tr.appendChild(el('td', '', `${s.position}`));
      tr.appendChild(el('td', '', s.name));
      tr.appendChild(el('td', '', s.carName));
      tr.appendChild(el('td', '', s.gapMs === null ? 'Leader' : formatDelta(s.gapMs)));
      tr.appendChild(el('td', '', formatLapTime(s.bestLapMs)));
      this.standingsBody.appendChild(tr);
    }
  }

  update(state: HudState): void {
    this.updatePosition(state);
    this.updateTimes(state);
    this.updateGaps(state);
    this.updateSpeedGear(state);
    this.updateRpm(state);
    this.updateAssists(state);
    this.updateMessage(state);
    this.updateMinimap(state);
    if (!this.standingsBox.classList.contains('hidden')) this.updateStandings(state.standings);
  }

  setStandingsVisible(visible: boolean): void {
    if (this.prev.standingsVisible === visible) return;
    this.prev.standingsVisible = visible;
    this.standingsBox.classList.toggle('hidden', !visible);
  }

  resetForNewRace(): void {
    this.minimap.reset();
    this.currentTrackId = null;
    this.prev = {};
  }
}
