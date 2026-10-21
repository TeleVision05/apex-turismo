import { el, clear } from '../dom';
import { formatLapTime } from '../../core/math';
import { makeMenuShell } from '../widgets';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';

/** Records: every saved best lap, sorted by track. */
export function createRecordsScreen(ctx: ScreenContext): Screen {
  const root = el('div', 'screen screen-records');
  const shell = makeMenuShell('Career', 'Records', {
    wide: true,
    onBack: () => {
      ctx.sound('back');
      ctx.back();
    },
  });
  const body = el('div', 'menu-scroll');
  shell.body.appendChild(body);
  root.appendChild(shell.el);

  let focusItems: FocusItem[] = [];

  function rebuild(): void {
    focusItems = [];
    if (shell.backItem) focusItems.push(shell.backItem);
    clear(body);
    const { records } = ctx.facade.save;
    if (!records.length) {
      body.appendChild(el('div', 'notice info', 'No lap records yet — go set one.'));
      return;
    }
    const tracks = ctx.facade.tracks();
    const rows = records
      .map((r) => ({
        record: r,
        trackName: tracks.find((t) => t.id === r.trackId)?.name ?? r.trackId,
        carName: ctx.facade.carById(r.carSpecId)?.name ?? r.carSpecId,
      }))
      .sort((a, b) => a.trackName.localeCompare(b.trackName) || a.record.timeMs - b.record.timeMs);

    const table = el('table', 'records-table');
    const head = el('tr');
    for (const h of ['Track', 'Car', 'Time', 'Date']) head.appendChild(el('th', '', h));
    table.appendChild(head);
    for (const row of rows) {
      const tr = el('tr');
      const item: FocusItem = { el: tr };
      tr.appendChild(el('td', '', row.trackName));
      tr.appendChild(el('td', '', row.carName));
      tr.appendChild(el('td', '', formatLapTime(row.record.timeMs)));
      tr.appendChild(el('td', '', new Date(row.record.dateIso).toLocaleDateString()));
      table.appendChild(tr);
      focusItems.push(item);
    }
    body.appendChild(table);
  }

  return {
    el: root,
    onShow: () => ctx.facade.showroom(null),
    render: () => rebuild(),
    focus: (): FocusPlan => ({ items: focusItems }),
  };
}
