import { el } from './dom';
import type { FocusItem } from './Focus';

export interface Widget {
  el: HTMLElement;
  item: FocusItem;
}

/** A standard clickable action button, e.g. "Buy", "Start race". */
export function makeButton(
  label: string,
  onClick: () => void,
  opts?: { className?: string; disabled?: boolean },
): Widget {
  const btn = el('button', `gt-btn ${opts?.className ?? ''}`.trim(), label);
  if (opts?.disabled) {
    btn.disabled = true;
    btn.classList.add('disabled');
  }
  btn.addEventListener('click', () => {
    if (!btn.disabled) onClick();
  });
  return { el: btn, item: { el: btn, onConfirm: () => !btn.disabled && onClick() } };
}

function rowShell(label: string): { row: HTMLElement; value: HTMLElement } {
  const row = el('div', 'gt-row');
  row.appendChild(el('span', 'gt-row-label', label));
  const value = el('div', 'gt-row-value');
  row.appendChild(value);
  return { row, value };
}

/** A left/right cycling control over a discrete option list ("< High >"). */
export function makeCycle<T>(
  label: string,
  options: { value: T; label: string }[],
  current: T,
  onChange: (v: T) => void,
  opts?: { hint?: string; disabled?: boolean },
): Widget {
  const { row, value } = rowShell(label);
  if (opts?.disabled) row.classList.add('disabled');
  let idx = Math.max(
    0,
    options.findIndex((o) => o.value === current),
  );
  const left = el('button', 'gt-arrow', '‹');
  const text = el('span', 'gt-cycle-text', options[idx]?.label ?? '');
  const right = el('button', 'gt-arrow', '›');
  value.append(left, text, right);
  if (opts?.hint) row.appendChild(el('div', 'gt-row-hint', opts.hint));
  const step = (dir: number): void => {
    if (opts?.disabled || !options.length) return;
    idx = (idx + dir + options.length) % options.length;
    text.textContent = options[idx].label;
    onChange(options[idx].value);
  };
  left.addEventListener('click', (e) => {
    e.stopPropagation();
    step(-1);
  });
  right.addEventListener('click', (e) => {
    e.stopPropagation();
    step(1);
  });
  return {
    el: row,
    item: { el: row, onLeft: () => step(-1), onRight: () => step(1), onConfirm: () => step(1) },
  };
}

/** A boolean on/off switch rendered as a two-state cycle. */
export function makeToggle(
  label: string,
  value: boolean,
  onChange: (v: boolean) => void,
  opts?: { onLabel?: string; offLabel?: string },
): Widget {
  return makeCycle(
    label,
    [
      { value: false, label: opts?.offLabel ?? 'Off' },
      { value: true, label: opts?.onLabel ?? 'On' },
    ],
    value,
    onChange,
  );
}

/** A native range slider (mouse drag works for free) with a live value label. */
export function makeSlider(
  label: string,
  value: number,
  min: number,
  max: number,
  step: number,
  format: (v: number) => string,
  onChange: (v: number) => void,
  opts?: { hint?: string; disabled?: boolean },
): Widget {
  const { row, value: valueBox } = rowShell(label);
  if (opts?.disabled) row.classList.add('disabled');
  const track = el('div', 'gt-slider-track');
  const input = el('input', 'gt-slider') as HTMLInputElement;
  input.type = 'range';
  input.min = String(min);
  input.max = String(max);
  input.step = String(step);
  input.value = String(value);
  input.disabled = !!opts?.disabled;
  const readout = el('span', 'gt-slider-readout', format(value));
  track.appendChild(input);
  valueBox.append(track, readout);
  if (opts?.hint) row.appendChild(el('div', 'gt-row-hint', opts.hint));
  const apply = (v: number): void => {
    readout.textContent = format(v);
    onChange(v);
  };
  input.addEventListener('input', () => apply(Number(input.value)));
  const step2 = (dir: number): void => {
    if (opts?.disabled) return;
    const next = Math.max(min, Math.min(max, Number(input.value) + dir * step));
    input.value = String(next);
    apply(next);
  };
  return {
    el: row,
    item: opts?.disabled
      ? { el: row }
      : { el: row, onLeft: () => step2(-1), onRight: () => step2(1) },
  };
}

/** A colour swatch button used by the garage/dealership colour pickers. */
export function makeSwatch(color: string, selected: boolean, onSelect: () => void): Widget {
  const btn = el('button', `gt-swatch${selected ? ' selected' : ''}`);
  btn.style.background = color;
  btn.title = color;
  btn.addEventListener('click', onSelect);
  return { el: btn, item: { el: btn, onConfirm: onSelect } };
}

/** A large tile for the home world-map grid. */
export function makeTile(title: string, desc: string, onSelect: () => void): Widget {
  const tile = el('button', 'gt-tile');
  tile.appendChild(el('div', 'gt-tile-title', title));
  tile.appendChild(el('div', 'gt-tile-desc', desc));
  tile.addEventListener('click', onSelect);
  return { el: tile, item: { el: tile, onConfirm: onSelect } };
}

/** A selectable list card (garage car, dealership car, event, record row...). */
export function makeCard(
  className: string,
  onSelect?: () => void,
): { el: HTMLElement; item: FocusItem } {
  const card = el('div', `gt-card ${className}`.trim());
  if (onSelect) card.addEventListener('click', onSelect);
  return { el: card, item: { el: card, onConfirm: onSelect ?? (() => undefined) } };
}
