import * as THREE from 'three';
import { PLAN } from './lib/layout.js';

// Room titles lettered on the wall above each doorway, at both ends of every
// room, so the name of the room you are standing in is in view whichever way
// you face, and the next room's title can be read through the door ahead.

// Helvetica where it exists (macOS), its metric twin Nimbus Sans on Linux, Arial on Windows.
const FONT_STACK = 'Helvetica, "Nimbus Sans", Arial, sans-serif';
const LETTER_COLOR = 0xefe9dc;
const MAX_TITLE_WIDTH = 10.2; // metres, on a 12 m wall
const MAX_CAP_HEIGHT = 0.5; // metres: short titles are not blown up beyond this
const LONGEST_TITLE_PX = 3600; // canvas pixels given to the longest title
const TRACKING = 0.06; // letter spacing, in ems
const CAP_RATIO = 0.72; // cap height as a share of the font size, for Helvetica

const fontAt = (px) => `bold ${px}px ${FONT_STACK}`;

function measure(ctx, text, px) {
  ctx.font = fontAt(px);
  ctx.letterSpacing = `${px * TRACKING}px`;
  return ctx.measureText(text).width;
}

/**
 * One size for every title, chosen so the longest fits the wall.
 * @returns {{ fontPx: number, metresPerPx: number }}
 */
function commonScale(titles) {
  const ctx = document.createElement('canvas').getContext('2d');
  const reference = 100;
  const widest = Math.max(...titles.map((t) => measure(ctx, t, reference)));
  const fontPx = Math.floor((reference * LONGEST_TITLE_PX) / widest);
  const fitWidth = MAX_TITLE_WIDTH / LONGEST_TITLE_PX;
  const fitHeight = MAX_CAP_HEIGHT / (fontPx * CAP_RATIO);
  return { fontPx, metresPerPx: Math.min(fitWidth, fitHeight) };
}

/** A title as white letters on a transparent canvas, plus its size on the wall. */
function titleTexture(text, { fontPx, metresPerPx }, maxAnisotropy) {
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');
  const pad = Math.ceil(fontPx * 0.2);
  canvas.width = Math.ceil(measure(ctx, text, fontPx)) + pad * 2;
  canvas.height = Math.ceil(fontPx * 1.3);
  // Resizing a canvas resets its drawing state, so the font is set again.
  ctx.font = fontAt(fontPx);
  ctx.letterSpacing = `${fontPx * TRACKING}px`;
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ffffff';
  ctx.fillText(text, pad, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = maxAnisotropy;
  return { texture, width: canvas.width * metresPerPx, height: canvas.height * metresPerPx };
}

/** Adds every room's title to both of its end walls, centred above the door opening. */
export function buildSignage(scene, layout, maxAnisotropy = 1) {
  const titles = layout.rooms.map((room) => room.name.toUpperCase());
  const scale = commonScale(titles);
  const y = PLAN.doorHeight + (PLAN.roomHeight - PLAN.doorHeight) / 2;
  const offset = 0.01; // just proud of the plaster, to avoid flicker

  layout.rooms.forEach((room, index) => {
    const { texture, width, height } = titleTexture(titles[index], scale, maxAnisotropy);
    const material = new THREE.MeshStandardMaterial({
      map: texture,
      color: LETTER_COLOR,
      roughness: 0.9,
      transparent: true,
      depthWrite: false,
    });
    const geometry = new THREE.PlaneGeometry(width, height);

    const ahead = new THREE.Mesh(geometry, material);
    ahead.position.set(0, y, room.minZ + offset);
    const behind = new THREE.Mesh(geometry, material);
    behind.position.set(0, y, room.maxZ - offset);
    behind.rotation.y = Math.PI;
    scene.add(ahead, behind);
  });
}
