import { el, clear } from '../dom';
import { formatLapTime } from '../../core/math';
import type { Screen, ScreenContext, FocusPlan } from '../Screen';
import type { FocusItem } from '../Focus';

/** Records: every saved best lap, sorted by track. */
export function createRecordsScreen(ctx: ScreenContext): Screen {
  const root = el('div', 'screen screen-records');
  const panel = el('div', 'side-panel panel');
  panel.style.width = 'min(56vw, 680px)';
  panel.appendChild(el('div', 'section-label', 'Records'));
  const body = el('div', 'side-panel-scroll');
  panel.appendChild(body);
  root.appendChild(panel);

  let focusItems: FocusItem[] = [];

  function rebuild(): void {
    focusItems = [];
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
