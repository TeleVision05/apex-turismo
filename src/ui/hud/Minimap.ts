import { el } from '../dom';

interface Dot {
  u: number;
  v: number;
  color: string;
  isPlayer: boolean;
}

const SIZE = 220;
const PAD = 14;

/** Bottom-left minimap: a static outline canvas plus a dynamic dots canvas on top. */
export class Minimap {
  readonly el: HTMLElement;
  private staticCanvas: HTMLCanvasElement;
  private dynCanvas: HTMLCanvasElement;
  private staticCtx: CanvasRenderingContext2D;
  private dynCtx: CanvasRenderingContext2D;
  private hasOutline = false;

  constructor() {
    this.el = el('div', 'hud-minimap');
    this.staticCanvas = document.createElement('canvas');
    this.dynCanvas = document.createElement('canvas');
    for (const c of [this.staticCanvas, this.dynCanvas]) {
      c.width = SIZE;
      c.height = SIZE;
      this.el.appendChild(c);
    }
    this.staticCtx = this.staticCanvas.getContext('2d')!;
    this.dynCtx = this.dynCanvas.getContext('2d')!;
  }

  private toPixel(u: number, v: number): [number, number] {
    const s = SIZE - PAD * 2;
    return [PAD + u * s, PAD + v * s];
  }

  /** Draws the track outline once; call again to redraw for a new track. */
  setOutline(points: [number, number][]): void {
    this.hasOutline = true;
    const ctx = this.staticCtx;
    ctx.clearRect(0, 0, SIZE, SIZE);
    if (!points.length) return;
    ctx.strokeStyle = 'rgba(245,245,245,0.55)';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    points.forEach(([u, v], i) => {
      const [x, y] = this.toPixel(u, v);
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.stroke();
  }

  reset(): void {
    this.hasOutline = false;
    this.staticCtx.clearRect(0, 0, SIZE, SIZE);
  }

  get outlineReady(): boolean {
    return this.hasOutline;
  }

  drawDots(dots: Dot[]): void {
    const ctx = this.dynCtx;
    ctx.clearRect(0, 0, SIZE, SIZE);
    for (const d of dots) {
      const [x, y] = this.toPixel(d.u, d.v);
      const r = d.isPlayer ? 5 : 3.5;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fillStyle = d.isPlayer ? '#e8b923' : d.color;
      ctx.fill();
      if (d.isPlayer) {
        ctx.strokeStyle = 'rgba(0,0,0,0.6)';
        ctx.lineWidth = 1;
        ctx.stroke();
      }
    }
  }
}
