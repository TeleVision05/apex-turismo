import { el } from './dom';
import { icon } from './icons';
import type { IconName } from './icons';
import type { FocusItem } from './Focus';

export interface Widget {
  el: HTMLElement;
  item: FocusItem;
}

/** A standard clickable action button, e.g. "Buy", "Start race". */
export function makeButton(
  label: string,
  onClick: () => void,
  opts?: { className?: string; disabled?: boolean; icon?: IconName },
): Widget {
  const btn = el('button', `gt-btn ${opts?.className ?? ''}`.trim());
  if (opts?.icon) btn.appendChild(icon(opts.icon, 'gt-btn-icon'));
  btn.appendChild(el('span', 'gt-btn-label', label));
  if (opts?.disabled) {
    btn.disabled = true;
    btn.classList.add('disabled');
  }
  btn.addEventListener('click', () => {
    if (!btn.disabled) onClick();
  });
  return { el: btn, item: { el: btn, onConfirm: () => !btn.disabled && onClick() } };
}

export interface MenuShell {
  /** Append this to the screen's root element. */
  el: HTMLElement;
  /** Append the screen's own content (lists, forms, detail panels) here. */
  body: HTMLElement;
}

/**
 * The full-height left menu column shared by every menu screen: a scrim over
 * the 3D scene, a hairline right edge, and an overline + title header. Not a
 * floating rounded panel.
 */
export function makeMenuShell(
  section: string,
  title: string,
  opts?: { wide?: boolean },
): MenuShell {
  const root = el('div', 'menu-screen');
  root.appendChild(el('div', 'menu-scrim'));
  const col = el('div', `menu-col${opts?.wide ? ' wide' : ''}`);
  const header = el('div', 'menu-header');
  header.append(el('div', 'overline', section), el('h1', 'menu-title', title));
  const body = el('div', 'menu-body');
  col.append(header, body);
  root.appendChild(col);
  return { el: root, body };
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

/** One row of the home screen's vertical menu: icon, condensed title, one-line description. */
export function makeMenuItem(
  iconName: IconName,
  title: string,
  desc: string,
  onSelect: () => void,
): Widget {
  const row = el('button', 'home-menu-item');
  row.appendChild(icon(iconName, 'home-menu-item-icon'));
  const text = el('div', 'home-menu-item-text');
  text.append(el('div', 'home-menu-item-title', title), el('div', 'home-menu-item-desc', desc));
  row.appendChild(text);
  row.addEventListener('click', onSelect);
  return { el: row, item: { el: row, onConfirm: onSelect } };
}

/** A hairline-separated list row (garage car, dealership car, event, record...). */
export function makeListRow(
  className: string,
  onSelect?: () => void,
): { el: HTMLElement; item: FocusItem } {
  const row = el('div', `list-row ${className}`.trim());
  if (onSelect) row.addEventListener('click', onSelect);
  return { el: row, item: { el: row, onConfirm: onSelect ?? (() => undefined) } };
}

/** An outlined tab chip, e.g. the dealership class filter row. Part of focus navigation. */
export function makeChip(label: string, active: boolean, onSelect: () => void): Widget {
  const btn = el('button', `chip${active ? ' active' : ''}`, label);
  btn.addEventListener('click', onSelect);
  return { el: btn, item: { el: btn, onConfirm: onSelect } };
}
