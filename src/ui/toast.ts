import { el } from './dom';

const LIFETIME_MS = 3200;

/** Small transient top-right notices, stacked newest-last. */
export class ToastLayer {
  readonly el: HTMLElement;

  constructor() {
    this.el = el('div', 'toast-layer');
  }

  show(text: string): void {
    const node = el('div', 'toast', text);
    this.el.appendChild(node);
    requestAnimationFrame(() => node.classList.add('shown'));
    window.setTimeout(() => {
      node.classList.remove('shown');
      window.setTimeout(() => node.remove(), 250);
    }, LIFETIME_MS);
  }
}
