// Walking collision on the floor plane. The visitor is a circle; the floor plan
// is a union of rectangles they may stand in (already shrunk by their radius);
// plinths are axis-aligned boxes. Pure functions, positions are { x, z } in metres.

/**
 * @param {{x:number,z:number}} position desired position
 * @param {Array<{minX:number,maxX:number,minZ:number,maxZ:number}>} areas walkable rectangles
 * @param {Array<{x:number,z:number,halfX:number,halfZ:number}>} obstacles boxes to keep out of
 * @param {number} bodyRadius
 * @returns {{x:number,z:number}} nearest allowed position
 */
export function resolvePosition(position, areas, obstacles, bodyRadius) {
  let current = clampToAreas(position, areas);
  for (const o of obstacles) {
    const halfX = o.halfX + bodyRadius;
    const halfZ = o.halfZ + bodyRadius;
    const dx = current.x - o.x;
    const dz = current.z - o.z;
    const overlapX = halfX - Math.abs(dx);
    const overlapZ = halfZ - Math.abs(dz);
    if (overlapX <= 0 || overlapZ <= 0) continue;
    // Leave through the nearest face, so walking along a plinth slides past it.
    if (overlapX < overlapZ) {
      current = { x: o.x + (dx < 0 ? -halfX : halfX), z: current.z };
    } else {
      current = { x: current.x, z: o.z + (dz < 0 ? -halfZ : halfZ) };
    }
  }
  return clampToAreas(current, areas);
}

/** Nearest point inside any of the rectangles. */
function clampToAreas(position, areas) {
  let best = position;
  let bestDist = Infinity;
  for (const a of areas) {
    const x = Math.min(a.maxX, Math.max(a.minX, position.x));
    const z = Math.min(a.maxZ, Math.max(a.minZ, position.z));
    const dist = (x - position.x) ** 2 + (z - position.z) ** 2;
    if (dist < bestDist) {
      best = { x, z };
      bestDist = dist;
    }
  }
  return best;
}
