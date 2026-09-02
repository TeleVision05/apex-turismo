import { el } from '../dom';
import { makeButton } from '../widgets';
import { formatLapTime } from '../../core/math';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { InputState } from '../../core/types';

const CAMERA_LABEL: Record<string, string> = { tv: 'TV', chase: 'Chase' };

/** Replay: a minimal GT-style bottom bar over the game's own replay camera. */
export function createReplayScreen(ctx: ScreenContext): Screen {
  const root = el('div', 'screen screen-replay');
  const bar = el('div', 'replay-bar panel');
  const progressTrack = el('div', 'replay-progress-track');
  const progressFill = el('div', 'replay-progress-fill');
  progressTrack.appendChild(progressFill);
  const timeRow = el('div', 'replay-time-row');
  const elapsed = el('span', '', '0:00.000');
  const total = el('span', '', '0:00.000');
  timeRow.append(elapsed, el('span', '', '/'), total);

  const controls = el('div', 'replay-controls');
  const playBtn = makeButton('Pause', () => ctx.facade.replayControl('toggle'));
  const slowerBtn = makeButton('«', () => ctx.facade.replayControl('slower'));
  const speedLabel = el('span', 'replay-speed', 'x1');
  const fasterBtn = makeButton('»', () => ctx.facade.replayControl('faster'));
  const cameraBtn = makeButton('TV', () => ctx.facade.replayControl('camera'));
  const subjectLabel = el('span', 'replay-subject', '');
  const nextCarBtn = makeButton('Next car', () => ctx.facade.replayControl('nextCar'));
  const exitBtn = makeButton('Exit replay', () => exit());
  controls.append(
    playBtn.el,
    slowerBtn.el,
    speedLabel,
    fasterBtn.el,
    cameraBtn.el,
    subjectLabel,
    nextCarBtn.el,
    exitBtn.el,
  );

  bar.append(progressTrack, timeRow, controls);
  root.appendChild(bar);

  function exit(): void {
    ctx.facade.exitReplay();
    ctx.sound('back');
    ctx.back();
  }

  function poll(): void {
    const s = ctx.facade.replayState();
    const frac = s.durationS > 0 ? Math.max(0, Math.min(1, s.timeS / s.durationS)) : 0;
    progressFill.style.transform = `scaleX(${frac})`;
    elapsed.textContent = formatLapTime(s.timeS * 1000);
    total.textContent = formatLapTime(s.durationS * 1000);
    playBtn.el.textContent = s.playing ? 'Pause' : 'Play';
    speedLabel.textContent = `x${s.speed}`;
    cameraBtn.el.textContent = CAMERA_LABEL[s.camera] ?? s.camera;
    subjectLabel.textContent = s.subject;
  }

  return {
    el: root,
    onShow: () => poll(),
    onTick: () => poll(),
    render: () => poll(),
    focus: (): FocusPlan => ({ items: [] }),
    interceptInput: (input: InputState): boolean => {
      if (input.menuBack) return false;
      if (input.menuConfirm) ctx.facade.replayControl('toggle');
      if (input.menuLeft) ctx.facade.replayControl('slower');
      if (input.menuRight) ctx.facade.replayControl('faster');
      if (input.menuUp || input.menuDown) ctx.facade.replayControl('nextCar');
      return true;
    },
    interceptBack: (): boolean => {
      exit();
      return true;
    },
  };
}
