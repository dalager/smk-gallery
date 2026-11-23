// Where a century of visitors has worn the gallery floor, worked out from the
// floor plan rather than painted into a repeating tile. Pure, no DOM: returns
// plain arrays that the floor material stretches once over the whole enfilade.

import { PLAN } from './layout.js';
import { valueNoise } from './noise.js';

const clamp01 = (v) => Math.min(1, Math.max(0, v));
const smoothstep = (a, b, v) => {
  const t = clamp01((v - a) / (b - a));
  return t * t * (3 - 2 * t);
};
const bell = (d, sigma) => Math.exp(-(d * d) / (2 * sigma * sigma));

/** Distance from (x, z) to the segment a-b. */
function segmentDistance(x, z, a, b) {
  const dx = b[0] - a[0];
  const dz = b[1] - a[1];
  const t = clamp01(((x - a[0]) * dx + (z - a[1]) * dz) / (dx * dx + dz * dz || 1));
  return Math.hypot(x - (a[0] + t * dx), z - (a[1] + t * dz));
}

/** Where people stand to look at a piece: in the aisle, a step back from its plinth. */
export function viewingSpot(placement) {
  return [placement.x - Math.sign(placement.x) * (placement.halfX + 0.75), placement.z];
}

/**
 * The traffic sources of the floor plan, as functions of a floor position, each
 * giving how strongly that spot is walked on (0..1).
 */
function trafficSources(layout, plan) {
  const sources = [];
  // The main walk down the aisle, which wanders a little from side to side.
  sources.push((x, z) => {
    const wander = 0.55 * Math.sin(z * 0.31 + 1.3) + 0.3 * Math.sin(z * 0.83);
    return 0.55 * bell(x - wander, 1.2);
  });
  // Doorways funnel everyone through 2.6 metres.
  for (const door of layout.doors) {
    sources.push((x, z) => 0.85 * bell(x, plan.doorWidth * 0.22) * bell(z - door.z, 1.6));
  }
  for (const room of layout.rooms) {
    const pieces = layout.placements.filter((p) => p.room === room.id);
    // Visitors zig-zag from piece to piece across the aisle, in hanging order.
    const spots = pieces.map(viewingSpot);
    for (let i = 1; i < spots.length; i++) {
      const [a, b] = [spots[i - 1], spots[i]];
      sources.push((x, z) => 0.35 * bell(segmentDistance(x, z, a, b), 0.45));
    }
    for (const p of pieces) {
      const [sx, sz] = viewingSpot(p);
      const along = Math.max(0.5, p.halfZ + 0.2);
      // A standing spot in front, and a fainter ring where people step round it.
      sources.push((x, z) => 0.7 * bell(x - sx, 0.45) * bell(z - sz, along));
      sources.push((x, z) => {
        const d = Math.max(Math.abs(x - p.x) - p.halfX, Math.abs(z - p.z) - p.halfZ);
        return d > 0 ? 0.15 * bell(d - 0.4, 0.35) : 0;
      });
    }
  }
  return sources;
}

/** 1 against a wall, falling away within half a metre; fading out towards the doorways. */
function wallCloseness(layout, plan, x, z) {
  const side = Math.exp(-Math.max(0, plan.roomWidth / 2 - Math.abs(x)) / 0.35);
  let cross = Infinity;
  for (const room of layout.rooms) cross = Math.min(cross, Math.abs(z - room.minZ), Math.abs(z - room.maxZ));
  const awayFromDoor = smoothstep(plan.doorWidth / 2 - 0.1, plan.doorWidth / 2 + 0.6, Math.abs(x));
  return Math.max(side, Math.exp(-cross / 0.35) * awayFromDoor);
}

/**
 * A map of the whole floor: `wear` (bare, pale, dry wood where people walk),
 * `grime` (darkened, ingrained dirt) and `sheen` (wax and polish left where
 * nobody walks). Row 0 is the far end (smallest z), column 0 the left wall.
 *
 * @returns {{ width: number, height: number, minX: number, minZ: number, sizeX: number, sizeZ: number,
 *   wear: Float32Array, grime: Float32Array, sheen: Float32Array }}
 */
export function computeFloorWear(layout, plan = PLAN, { pixelsPerMetre = 20, maxPixels = 4096, seed = 31 } = {}) {
  const minX = -plan.roomWidth / 2;
  const sizeX = plan.roomWidth;
  const minZ = layout.rooms.at(-1).minZ;
  const sizeZ = layout.rooms[0].maxZ - minZ;
  const density = Math.min(pixelsPerMetre, maxPixels / sizeZ, maxPixels / sizeX);
  const width = Math.max(2, Math.round(sizeX * density));
  const height = Math.max(2, Math.round(sizeZ * density));

  // Irregularity at three scales, the finer two stretched along the boards.
  const patch = valueNoise(width, height, { seed, cellsX: sizeX / 2.5, cellsY: sizeZ / 2.5, octaves: 4 });
  const streak = valueNoise(width, height, { seed: seed + 1, cellsX: sizeX / 0.5, cellsY: sizeZ / 2.2, octaves: 3 });
  const stains = valueNoise(width, height, { seed: seed + 2, cellsX: sizeX / 1.1, cellsY: sizeZ / 1.6, octaves: 3 });

  const sources = trafficSources(layout, plan);
  const wear = new Float32Array(width * height);
  const grime = new Float32Array(width * height);
  const sheen = new Float32Array(width * height);
  for (let row = 0; row < height; row++) {
    const z = minZ + ((row + 0.5) / height) * sizeZ;
    for (let col = 0; col < width; col++) {
      const x = minX + ((col + 0.5) / width) * sizeX;
      const i = row * width + col;
      let untouched = 1;
      for (const source of sources) untouched *= 1 - source(x, z);
      const wall = wallCloseness(layout, plan, x, z);
      const traffic = 1 - untouched;
      // Even the quiet corners have had some feet on them.
      const scuffed = 0.6 * traffic + 0.4 * traffic * traffic + 0.06;
      const worn = clamp01(scuffed * (0.3 + 1.1 * patch[i] + 0.5 * (streak[i] - 0.5))) * (1 - 0.9 * wall);
      // Dirt gathers along the walls, in old stains, and at the edges of worn tracks.
      const rim = 4 * worn * (1 - worn) * smoothstep(0.4, 0.7, patch[i]);
      wear[i] = worn;
      grime[i] = clamp01(0.55 * wall + 0.22 * smoothstep(0.55, 0.9, stains[i]) + 0.25 * rim);
      sheen[i] = clamp01((1 - worn) * (0.35 + 0.65 * wall) * (0.7 + 0.6 * patch[i]));
    }
  }
  return { width, height, minX, minZ, sizeX, sizeZ, wear, grime, sheen };
}
