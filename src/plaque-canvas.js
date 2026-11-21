import { plaqueText } from './label.js';

// The plaque as a drawing, for videos and screenshots: those only capture the
// 3D canvas, so the on-page label has to be painted onto each frame. Sizes follow the
// page's stylesheet, scaled to the frame so the text stays readable at any
// resolution.

const SERIF = "'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif";
const SANS = 'system-ui, sans-serif';
const FADE_SECONDS = 0.3;

function wrap(ctx, text, maxWidth) {
  const lines = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && ctx.measureText(candidate).width > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function drawPlaque(ctx, item, alpha, frameHeight) {
  const s = frameHeight / 720; // the page design, as if on a 720-pixel-high frame
  const text = plaqueText(item);
  const titleFont = `600 ${18.4 * s}px ${SERIF}`;
  const bodyFont = `${12.8 * s}px ${SANS}`;
  const padX = 20 * s;
  const padY = 16 * s;
  const maxText = 352 * s - padX * 2;

  ctx.font = titleFont;
  const titleLines = wrap(ctx, text.title, maxText);
  ctx.font = bodyFont;
  const bodyLines = [...text.facts, text.objectNumber + text.credit].flatMap((l) => wrap(ctx, l, maxText));

  const titleLeading = 23 * s;
  const bodyLeading = 20.5 * s;
  ctx.font = titleFont;
  let width = Math.max(...titleLines.map((l) => ctx.measureText(l).width));
  ctx.font = bodyFont;
  width = Math.max(width, ...bodyLines.map((l) => ctx.measureText(l).width)) + padX * 2;
  const height = padY * 2 + titleLines.length * titleLeading + 4 * s + bodyLines.length * bodyLeading;
  const x = 24 * s;
  const y = frameHeight - 24 * s - height;

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = 'rgba(244, 240, 230, 0.95)';
  ctx.fillRect(x, y, width, height);
  ctx.fillStyle = '#1c1c1a';
  ctx.fillRect(x, y, 3 * s, height);
  ctx.textBaseline = 'alphabetic';
  let baseline = y + padY + titleLeading * 0.78;
  ctx.font = titleFont;
  for (const l of titleLines) {
    ctx.fillText(l, x + padX, baseline);
    baseline += titleLeading;
  }
  baseline += 4 * s - titleLeading * 0.78 + bodyLeading * 0.75;
  ctx.font = bodyFont;
  for (const l of bodyLines) {
    ctx.fillText(l, x + padX, baseline);
    baseline += bodyLeading;
  }
  ctx.restore();
}

/**
 * A copy of the current 3D frame with a plaque painted on, for screenshots.
 * Call straight after rendering, while the frame is still on its canvas.
 * @param {HTMLCanvasElement} source the WebGL canvas
 * @param {object|null} item sculpture whose plaque is up, if any
 * @returns {HTMLCanvasElement}
 */
export function composeStill(source, item) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(source, 0, 0);
  if (item) drawPlaque(ctx, item, 1, canvas.height);
  return canvas;
}

/**
 * A 2D canvas the size of the video that each finished 3D frame is copied to,
 * with the current plaque painted on top. Plaques fade in and out rather than
 * popping, timed by the frame rate so the result is the same on any machine.
 *
 * @param {HTMLCanvasElement} source the WebGL canvas
 * @param {number} fps
 * @returns {{ canvas: HTMLCanvasElement, compose: (item: object|null, visibility: number) => void }}
 */
export function createFrameCompositor(source, fps) {
  const canvas = document.createElement('canvas');
  canvas.width = source.width;
  canvas.height = source.height;
  const ctx = canvas.getContext('2d');
  const step = 1 / (fps * FADE_SECONDS);
  let shown = null;
  let alpha = 0;

  /**
   * Call straight after rendering, while the 3D frame is still on its canvas.
   * @param {object|null} item sculpture whose plaque should be up
   * @param {number} visibility 0..1, the tour's own fade in and out
   */
  function compose(item, visibility) {
    ctx.drawImage(source, 0, 0);
    if (item === shown && shown) {
      alpha = Math.min(1, alpha + step);
    } else {
      alpha = Math.max(0, alpha - step);
      if (alpha === 0) shown = item;
    }
    if (shown && alpha > 0) drawPlaque(ctx, shown, alpha * visibility, canvas.height);
  }

  return { canvas, compose };
}
