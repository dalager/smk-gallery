import * as THREE from 'three';
import { seededRandom, tileableNoise } from './lib/noise.js';

// Procedural surface textures, drawn once into canvases at start-up so the
// gallery needs no image files.

/** Real-world size of one repeat of each texture, in metres. */
export const TILE = {
  floor: { width: 1.6, length: 3.2, strips: 8 }, // eight 20 cm planks across
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
  const tone = 0.94 + random() * 0.1;
  const warmth = random() * 4 - 2;
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

/** Clips drawing to one strip of the tile, so marks never run across into a strip that is shown elsewhere. */
function inStrip(ctx, x, width, height, draw) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, 0, width, height);
  ctx.clip();
  draw();
  ctx.restore();
}

/** A knot: a dark core with the grain swirling round it. */
function drawKnot(ctx, x, y, r, random) {
  const stretch = 1.4 + random() * 1.2;
  const knot = ctx.createRadialGradient(x, y, 0, x, y, r * stretch);
  knot.addColorStop(0, `rgba(22, 11, 4, ${0.7 + random() * 0.25})`);
  knot.addColorStop(0.4, 'rgba(40, 22, 9, 0.45)');
  knot.addColorStop(1, 'rgba(40, 22, 9, 0)');
  ctx.fillStyle = knot;
  ctx.beginPath();
  ctx.ellipse(x, y, r * 1.3, r * stretch, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(30, 15, 5, 0.18)';
  ctx.lineWidth = 0.8;
  for (let ring = 1; ring <= 3; ring++) {
    ctx.beginPath();
    ctx.ellipse(x, y, r * (1.3 + ring * 0.7), r * stretch * (1.4 + ring * 0.9), 0, 0, Math.PI * 2);
    ctx.stroke();
  }
}

/**
 * Detail that belongs to the boards themselves: knots, fine speckle and the
 * scratches of a century of shoes, plus a roughness map in which scratches
 * have cut through the finish. Large-scale wear is not drawn here: it follows
 * the floor plan and comes from lib/floor-wear.js.
 * @returns {HTMLCanvasElement} roughness map (three.js reads the green channel)
 */
function markBoards(ctx, bctx, width, height, plankWidth, random) {
  const rough = canvasOf(width / 2, height / 2);
  const rctx = rough.getContext('2d');
  const speckle = tileableNoise(512, { seed: 29, baseCells: 40, octaves: 2 });
  const mottle = tileableNoise(512, { seed: 23, baseCells: 10, octaves: 3 });

  // Fine speckle and soft mottling within each board.
  const image = ctx.getImageData(0, 0, width, height);
  const px = image.data;
  for (let y = 0; y < height; y++) {
    const ny = Math.floor((y / height) * 512);
    for (let x = 0; x < width; x++) {
      const n = ny * 512 + Math.floor((x / width) * 512);
      const gain = 0.9 + 0.16 * mottle[n] + 0.12 * (speckle[n] - 0.5);
      const i = (y * width + x) * 4;
      for (let c = 0; c < 3; c++) px[i + c] *= gain;
    }
  }
  ctx.putImageData(image, 0, 0);

  const roughData = new ImageData(width / 2, height / 2);
  for (let y = 0; y < height / 2; y++) {
    const ny = Math.floor((y / (height / 2)) * 512);
    for (let x = 0; x < width / 2; x++) {
      const n = ny * 512 + Math.floor((x / (width / 2)) * 512);
      const value = 255 * (0.62 + 0.2 * mottle[n] + 0.14 * (speckle[n] - 0.5));
      roughData.data.set([value, value, value, 255], (y * (width / 2) + x) * 4);
    }
  }
  rctx.putImageData(roughData, 0, 0);

  for (let p = 0; p < PLANKS_ACROSS; p++) {
    const x0 = p * plankWidth;
    // Knots: some strips have none, a few have a cluster.
    const knots = Math.floor(random() * random() * 5);
    inStrip(ctx, x0, plankWidth, height, () => {
      for (let k = 0; k < knots; k++) {
        const r = 2.5 + random() * random() * 12;
        drawKnot(ctx, x0 + 18 + random() * (plankWidth - 36), random() * height, r, random);
      }
    });

    // Scratches, mostly along the direction people walk; a few across.
    const scratches = 22 + Math.floor(random() * 30);
    for (let s = 0; s < scratches; s++) {
      const x = x0 + random() * plankWidth;
      const y = random() * height;
      const length = 12 + random() * random() * 220;
      const angle = (random() - 0.5) * (random() < 0.8 ? 0.4 : Math.PI);
      const bend = (random() - 0.5) * length * 0.15;
      const ex = x + Math.sin(angle) * length;
      const ey = y + Math.cos(angle) * length;
      const light = random() < 0.7;
      const alpha = 0.05 + random() * 0.16;
      const lineWidth = 0.4 + random() * 1.1;
      const stroke = (target, style, scale = 1) => {
        inStrip(target, x0 * scale, plankWidth * scale, height * scale, () => {
          target.strokeStyle = style;
          target.lineWidth = lineWidth * scale;
          target.beginPath();
          target.moveTo(x * scale, y * scale);
          target.quadraticCurveTo(((x + ex) / 2 + bend) * scale, ((y + ey) / 2) * scale, ex * scale, ey * scale);
          target.stroke();
        });
      };
      stroke(ctx, light ? `rgba(214, 190, 160, ${alpha})` : `rgba(20, 10, 4, ${alpha * 1.4})`);
      stroke(bctx, `rgba(0, 0, 0, ${alpha * 1.5})`);
      stroke(rctx, `rgba(255, 255, 255, ${alpha * 2})`, 0.5); // the finish is cut: duller
    }
  }
  return rough;
}

/**
 * One tile of worn oak boards: eight independent strips, each with an end joint
 * at the tile edge and about half with one more somewhere along it, so any strip can follow any
 * other along a run of boards. The floor material shuffles them (floor-material.js).
 * @returns {{ map: THREE.Texture, bumpMap: THREE.Texture, roughnessMap: THREE.Texture, joints: number[] }}
 *   `joints[i]` is where strip i's second board starts, as a texture v coordinate
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
  const joints = [];
  for (let p = 0; p < PLANKS_ACROSS; p++) {
    const x = p * plankWidth;
    // About half the strips are one full-length board; the rest are two shorter ones.
    const joint = random() < 0.5 ? 0 : Math.floor(height * (0.35 + random() * 0.3));
    if (joint) drawBoard(ctx, { x, y: 0, width: plankWidth, height: joint }, height, 1000 + p * 2);
    drawBoard(ctx, { x, y: joint, width: plankWidth, height: height - joint }, height, 1001 + p * 2);
    joints.push(joint ? 1 - joint / height : 0); // canvas rows run down, texture v runs up

    for (const target of [ctx, bctx]) {
      target.fillStyle = target === ctx ? 'rgba(14, 8, 3, 0.85)' : '#000000';
      target.fillRect(x, 0, 1.75, height); // half the gap on each side of the strip
      target.fillRect(x + plankWidth - 1.75, 0, 1.75, height);
      target.fillRect(x, 0, plankWidth, 1.25); // end joints: at both tile edges and one between
      target.fillRect(x, height - 1.25, plankWidth, 1.25);
      if (joint) target.fillRect(x, joint - 1, plankWidth, 2.5);
    }
  }

  const roughnessMap = repeating(markBoards(ctx, bctx, width, height, plankWidth, random), THREE.NoColorSpace);
  const map = repeating(color, THREE.SRGBColorSpace);
  const bumpMap = repeating(bump, THREE.NoColorSpace);
  for (const texture of [map, bumpMap, roughnessMap]) {
    texture.anisotropy = maxAnisotropy; // the floor is always seen at a grazing angle
  }
  return { map, bumpMap, roughnessMap, joints };
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
