import { Texture } from 'three';
import { proceduralTexture, tileTexture } from './base';

/** A dark semi-transparent chain-link grid, for the catch fence mesh. */
export function buildCatchFenceTexture(size: number): Texture {
  const tex = proceduralTexture(
    size,
    (ctx) => {
      ctx.clearRect(0, 0, size, size);
      ctx.strokeStyle = 'rgba(20,20,22,0.85)';
      ctx.lineWidth = Math.max(1, size / 96);
      const cell = size / 8;
      ctx.beginPath();
      for (let i = -8; i <= 16; i++) {
        ctx.moveTo(i * cell, 0);
        ctx.lineTo(i * cell + size, size);
        ctx.moveTo(i * cell, size);
        ctx.lineTo(i * cell + size, 0);
      }
      ctx.stroke();
    },
    [30, 30, 30, 160],
  );
  tileTexture(tex, 1, 1, false);
  tex.premultiplyAlpha = false;
  return tex;
}
