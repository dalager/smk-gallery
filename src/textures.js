import * as THREE from 'three';
import { seededRandom, tileableNoise } from './lib/noise.js';

// Procedural surface textures, drawn once into canvases at start-up so the
// gallery needs no image files.

/** Real-world size of one repeat of each texture, in metres. */
export const TILE = {
  floor: { width: 1.6, length: 3.2 }, // eight 20 cm planks across
  wall: 3,
};

const PLANKS_ACROSS = 8;

function canvasOf(width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

function repeating(canvas, colorSpace) {
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.colorSpace = colorSpace;
  return texture;
}

/** One board (or the part of it inside a rectangle): base tone plus long, slightly wavy grain. */
function drawBoard(ctx, rect, tileHeight, seed) {
  const random = seededRandom(seed);
  const tone = 0.84 + random() * 0.3;
  const warmth = random() * 8 - 4;
  ctx.save();
  ctx.beginPath();
  ctx.rect(rect.x, rect.y, rect.width, rect.height);
  ctx.clip();
  ctx.fillStyle = `rgb(${(92 + warmth) * tone}, ${64 * tone}, ${41 * tone - warmth * 0.4})`;
  ctx.fillRect(rect.x, rect.y, rect.width, rect.height);

  // Grain runs the whole tile height with a wave that repeats over it, so a
  // board that wraps around the tile edge lines up with itself.
  for (let i = 0; i < 46; i++) {
    const x = rect.x + random() * rect.width;
    const sway = 1 + random() * 3.5;
    const cycles = 1 + Math.floor(random() * 3);
    const phase = random() * Math.PI * 2;
    const dark = random() < 0.8;
    ctx.strokeStyle = dark
      ? `rgba(34, 18, 6, ${0.07 + random() * 0.18})`
      : `rgba(226, 190, 140, ${0.04 + random() * 0.08})`;
    ctx.lineWidth = 0.6 + random() * 1.8;
    ctx.beginPath();
    for (let y = 0; y <= tileHeight; y += 32) {
      const px = x + Math.sin((y / tileHeight) * Math.PI * 2 * cycles + phase) * sway;
      if (y === 0) ctx.moveTo(px, y);
      else ctx.lineTo(px, y);
    }
    ctx.stroke();
  }
  ctx.restore();
}

/** Runs `draw` at every tile offset that could reach into the canvas, so marks wrap seamlessly. */
function wrapped(ctx, width, height, draw) {
  for (const dx of [-width, 0, width]) {
    for (const dy of [-height, 0, height]) {
      ctx.save();
      ctx.translate(dx, dy);
      draw();
      ctx.restore();
    }
  }
}

/**
 * A century of visitors: knots, dark ingrained patches, bare scuffed areas and
 * scratches on the boards, plus a map of where the finish has worn dull.
 * @returns {HTMLCanvasElement} roughness map (three.js reads the green channel)
 */
function wearFloor(ctx, bctx, width, height, random) {
  // Knots.
  for (let i = 0; i < 9; i++) {
    const x = random() * width;
    const y = random() * height;
    const r = 5 + random() * 9;
    wrapped(ctx, width, height, () => {
      const knot = ctx.createRadialGradient(x, y, 0, x, y, r * 2.2);
      knot.addColorStop(0, 'rgba(24, 12, 4, 0.85)');
      knot.addColorStop(0.45, 'rgba(40, 22, 9, 0.5)');
      knot.addColorStop(1, 'rgba(40, 22, 9, 0)');
      ctx.fillStyle = knot;
      ctx.beginPath();
      ctx.ellipse(x, y, r * 1.3, r * 2.2, 0, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // Grime and bare patches: stretched along the boards, as wear follows the grain.
  const size = 512;
  const patches = tileableNoise(size, { seed: 23, baseCells: 3, octaves: 4 });
  const speckle = tileableNoise(size, { seed: 29, baseCells: 40, octaves: 2 });
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  for (let y = 0; y < height; y++) {
    const ny = Math.floor((y / height) * size);
    for (let x = 0; x < width; x++) {
      const n = ny * size + Math.floor((x / width) * size);
      const worn = Math.max(0, patches[n] - 0.55) * 2.2; // bare, scuffed wood: paler and greyer
      const gain = 0.68 + 0.5 * patches[n] + 0.12 * (speckle[n] - 0.5);
      const i = (y * width + x) * 4;
      const grey = (px[i] + px[i + 1] + px[i + 2]) / 3;
      for (let c = 0; c < 3; c++) {
        px[i + c] = (px[i + c] + (grey * 1.25 - px[i + c]) * worn * 0.6) * gain;
      }
    }
  }
  ctx.putImageData(image, 0, 0);

  // Scratches, mostly along the direction people walk.
  for (let i = 0; i < 260; i++) {
    const x = random() * width;
    const y = random() * height;
    const length = 20 + random() * 150;
    const angle = (random() - 0.5) * (random() < 0.75 ? 0.5 : Math.PI);
    const ex = x + Math.sin(angle) * length;
    const ey = y + Math.cos(angle) * length;
    const light = random() < 0.7;
    const alpha = 0.06 + random() * 0.16;
    const lineWidth = 0.5 + random() * 1.2;
    for (const target of [ctx, bctx]) {
      wrapped(target, width, height, () => {
        target.strokeStyle =
          target === bctx
            ? `rgba(0, 0, 0, ${alpha * 1.5})`
            : light
              ? `rgba(214, 190, 160, ${alpha})`
              : `rgba(20, 10, 4, ${alpha * 1.4})`;
        target.lineWidth = lineWidth;
        target.beginPath();
        target.moveTo(x, y);
        target.lineTo(ex, ey);
        target.stroke();
      });
    }
  }

  // Where the wood is bare the finish is gone, so those patches are dull; the rest keeps a low sheen.
  const roughness = canvasOf(size, size);
  const data = new ImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    const value = 255 * Math.min(1, 0.5 + 0.55 * patches[i] + 0.15 * (speckle[i] - 0.5));
    data.data.set([value, value, value, 255], i * 4);
  }
  roughness.getContext('2d').putImageData(data, 0, 0);
  return roughness;
}

/**
 * Worn oak floorboards running along the canvas's vertical axis, with staggered end joints.
 * @returns {{ map: THREE.Texture, bumpMap: THREE.Texture, roughnessMap: THREE.Texture }}
 */
export function createPlankFloor(maxAnisotropy = 1) {
  const width = 1024;
  const height = 2048;
  const color = canvasOf(width, height);
  const ctx = color.getContext('2d');
  const bump = canvasOf(width, height);
  const bctx = bump.getContext('2d');
  bctx.fillStyle = '#ffffff';
  bctx.fillRect(0, 0, width, height);

  const random = seededRandom(20261121);
  const plankWidth = width / PLANKS_ACROSS;
  for (let p = 0; p < PLANKS_ACROSS; p++) {
    const x = p * plankWidth;
    // Two end joints per strip make two boards; the second wraps around the tile edge.
    const first = Math.floor(random() * height * 0.45);
    const second = first + Math.floor(height * (0.35 + random() * 0.3));
    const seedA = 1000 + p * 2;
    const seedB = 1001 + p * 2;
    drawBoard(ctx, { x, y: first, width: plankWidth, height: second - first }, height, seedA);
    drawBoard(ctx, { x, y: second, width: plankWidth, height: height - second }, height, seedB);
    drawBoard(ctx, { x, y: 0, width: plankWidth, height: first }, height, seedB);

    for (const target of [ctx, bctx]) {
      target.fillStyle = target === ctx ? 'rgba(14, 8, 3, 0.85)' : '#000000';
      target.fillRect(x - 1.5, 0, 3.5, height); // gap between strips
      target.fillRect(x, first - 1, plankWidth, 2.5); // end joints
      target.fillRect(x, second - 1, plankWidth, 2.5);
    }
  }

  const roughnessMap = repeating(wearFloor(ctx, bctx, width, height, random), THREE.NoColorSpace);
  const map = repeating(color, THREE.SRGBColorSpace);
  const bumpMap = repeating(bump, THREE.NoColorSpace);
  for (const texture of [map, bumpMap, roughnessMap]) {
    texture.anisotropy = maxAnisotropy; // the floor is always seen at a grazing angle
  }
  return { map, bumpMap, roughnessMap };
}

/**
 * Painted plaster: a near-white map that mottles the wall colour very slightly,
 * and a fine bump map so light breaks up across the surface instead of lying flat.
 * @returns {{ map: THREE.Texture, bumpMap: THREE.Texture }}
 */
export function createPlasterWall() {
  const size = 512;
  const mottle = tileableNoise(size, { seed: 7, baseCells: 3, octaves: 4 });
  const grain = tileableNoise(size, { seed: 11, baseCells: 48, octaves: 3, falloff: 0.6 });

  const color = canvasOf(size, size);
  const bump = canvasOf(size, size);
  const colorData = new ImageData(size, size);
  const bumpData = new ImageData(size, size);
  for (let i = 0; i < size * size; i++) {
    // Tint stays within about 12% of full brightness: visible as depth, not as pattern.
    const tint = 255 * (0.88 + 0.09 * mottle[i] + 0.03 * grain[i]);
    const relief = 255 * (0.35 * mottle[i] + 0.65 * grain[i]);
    colorData.data.set([tint, tint, tint, 255], i * 4);
    bumpData.data.set([relief, relief, relief, 255], i * 4);
  }
  color.getContext('2d').putImageData(colorData, 0, 0);
  bump.getContext('2d').putImageData(bumpData, 0, 0);
  return {
    map: repeating(color, THREE.SRGBColorSpace),
    bumpMap: repeating(bump, THREE.NoColorSpace),
  };
}
