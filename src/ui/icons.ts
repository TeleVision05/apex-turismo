/**
 * Inline SVG icon set for the UI. All icons share a 24x24 viewBox and a
 * 1.75px currentColor stroke so colour (muted/gold) is driven entirely by
 * CSS on the wrapping element — no external assets, no per-icon styling.
 */

export type IconName =
  | 'world'
  | 'flag'
  | 'stopwatch'
  | 'car'
  | 'tag'
  | 'wrench'
  | 'trophy'
  | 'sliders'
  | 'gamepad'
  | 'coin'
  | 'emblem'
  | 'pause'
  | 'resume'
  | 'restart'
  | 'quit'
  | 'replay'
  | 'continue';

/** Raw <path>/<circle>/... markup for each icon, at viewBox 0 0 24 24. */
const ICON_PATHS: Record<IconName, string> = {
  world: `
    <circle cx="12" cy="12" r="8.5"/>
    <ellipse cx="12" cy="12" rx="3.6" ry="8.5"/>
    <path d="M3.8 9.5h16.4M3.8 14.5h16.4"/>
    <path d="M4.5 15.5c3-3.6 5.6-5.2 7.5-5.2s4.5 1.6 7.5 5.2" stroke-width="2.1"/>
  `,
  flag: `
    <path d="M6 21V4"/>
    <path d="M6 4h11l-2.5 3.5L17 11H6"/>
    <path fill="currentColor" stroke="none" d="M6 4h2.5v2.5H6zM11 4h2.5v2.5H11zM8.7 6.4h2.5v2.5H8.7zM13.6 6.4h2.4v2.5h-2.4zM6 8.9h2.5v2.4H6zM11 8.9h2.5v2.4H11z"/>
  `,
  stopwatch: `
    <circle cx="12" cy="13.5" r="8"/>
    <path d="M12 13.5V9"/>
    <path d="M9.5 3h5"/>
    <path d="M12 3v2"/>
    <path d="M18.2 5.6l1.4-1.4"/>
  `,
  car: `
    <path d="M4.2 15.2l1.4-5.1A2.2 2.2 0 0 1 7.7 8.4h8.6a2.2 2.2 0 0 1 2.1 1.7l1.4 5.1"/>
    <rect x="3" y="15.2" width="18" height="4.2" rx="1.6"/>
    <circle cx="7.6" cy="19.4" r="1.4"/>
    <circle cx="16.4" cy="19.4" r="1.4"/>
    <path d="M7 12.2h2.2M14.8 12.2H17"/>
  `,
  tag: `
    <path d="M12.3 3.2h5.5a1 1 0 0 1 1 1v5.5a1 1 0 0 1-.3.7l-9 9a1 1 0 0 1-1.4 0l-5.5-5.5a1 1 0 0 1 0-1.4l9-9a1 1 0 0 1 .7-.3z"/>
    <circle cx="15.3" cy="8.7" r="1.5" fill="currentColor" stroke="none"/>
  `,
  wrench: `
    <path d="M14.9 6.2a4 4 0 0 0-5.5 5.3L4.2 16.7l3.1 3.1 5.2-5.2a4 4 0 0 0 5.3-5.5l-2.6 2.6-2.1-2.1z"/>
    <circle cx="18.3" cy="5.7" r="1.9"/>
    <path d="M18.3 2.2v1.6M18.3 7.6v1.6M14.9 5.7h1.6M20.1 5.7h1.6"/>
  `,
  trophy: `
    <path d="M8 4.2h8v4a4 4 0 0 1-8 0v-4z"/>
    <path d="M8 5.4H5.3a3 3 0 0 0 3.1 4.6"/>
    <path d="M16 5.4h2.7a3 3 0 0 1-3.1 4.6"/>
    <path d="M12 12.2v2.8"/>
    <path d="M9 19.8h6"/>
    <path d="M10 16.5h4l.6 3.3h-5.2z"/>
  `,
  sliders: `
    <path d="M3.5 6.2h10.2"/>
    <circle cx="16" cy="6.2" r="1.9"/>
    <path d="M18.3 6.2h2.2"/>
    <path d="M3.5 12h4.7"/>
    <circle cx="10.5" cy="12" r="1.9"/>
    <path d="M12.8 12h7.7"/>
    <path d="M3.5 17.8h12.7"/>
    <circle cx="18.5" cy="17.8" r="1.9"/>
  `,
  gamepad: `
    <rect x="2.8" y="7.8" width="18.4" height="9.2" rx="4.6"/>
    <path d="M7.3 10.4v4M5.3 12.4h4"/>
    <circle cx="16.2" cy="10.8" r="1"/>
    <circle cx="18.6" cy="13.2" r="1"/>
  `,
  coin: `
    <circle cx="12" cy="12" r="8.5"/>
    <path d="M12 7v10"/>
    <path d="M9.3 9.4c0-1.2 1.2-2.1 2.7-2.1s2.7.9 2.7 2c0 1.2-1.2 1.7-2.7 2.1s-2.7.9-2.7 2.1c0 1.1 1.2 2 2.7 2s2.7-.9 2.7-2.1"/>
  `,
  emblem: `<path fill="currentColor" stroke="none" d="M12 2.4l9 10.1h-5.7L12 21.6l-3.3-9.1H3l9-10.1z"/>`,
  pause: `
    <rect fill="currentColor" stroke="none" x="6" y="4" width="4" height="16" rx="1.2"/>
    <rect fill="currentColor" stroke="none" x="14" y="4" width="4" height="16" rx="1.2"/>
  `,
  resume: `<path fill="currentColor" stroke="none" d="M7.5 4.8l12 7.2-12 7.2V4.8z"/>`,
  restart: `
    <path d="M20 12a8 8 0 1 1-2.7-6"/>
    <path d="M20 4.3v5.4h-5.4"/>
  `,
  quit: `
    <path d="M13.5 4.2H6.3a1.1 1.1 0 0 0-1.1 1.1v13.4a1.1 1.1 0 0 0 1.1 1.1h7.2"/>
    <path d="M9.8 12h10"/>
    <path d="M16.4 8.2l3.8 3.8-3.8 3.8"/>
  `,
  replay: `
    <rect x="3" y="5" width="18" height="14" rx="2.2"/>
    <path fill="currentColor" stroke="none" d="M9.8 8.7l6.4 3.3-6.4 3.3V8.7z"/>
  `,
  continue: `
    <path d="M4.5 12h15"/>
    <path d="M13 6l6.5 6-6.5 6"/>
  `,
};

/** Build a fresh <svg> element for the named icon. Never reuse the return value in two places. */
export function icon(name: IconName, className = 'gt-icon'): SVGSVGElement {
  const node = document.createElementNS('http://www.w3.org/2000/svg', 'svg') as SVGSVGElement;
  node.setAttribute('viewBox', '0 0 24 24');
  node.setAttribute('fill', 'none');
  node.setAttribute('stroke', 'currentColor');
  node.setAttribute('stroke-width', '1.75');
  node.setAttribute('stroke-linecap', 'round');
  node.setAttribute('stroke-linejoin', 'round');
  node.setAttribute('aria-hidden', 'true');
  if (className) node.setAttribute('class', className);
  node.innerHTML = ICON_PATHS[name];
  return node;
}
