// Geometry helpers for turning a raw scan into a gallery-ready model:
// Y-up, metres, standing on y = 0 and centred on its own base.

const AXES = ['x', 'y', 'z'];

/** Axis-aligned bounds of a flat xyz array. */
export function computeBounds(positions) {
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      const v = positions[i + a];
      if (v < min[a]) min[a] = v;
      if (v > max[a]) max[a] = v;
    }
  }
  return { min, max };
}

/** The axis with the largest extent; a reasonable guess for "up" on a standing figure. */
export function tallestAxis(positions) {
  const { min, max } = computeBounds(positions);
  let best = 0;
  for (let a = 1; a < 3; a++) {
    if (max[a] - min[a] > max[best] - min[best]) best = a;
  }
  return AXES[best];
}

/**
 * Rotate in place so that `up` becomes +Y. Rotations only, so winding is preserved.
 * @param {Float32Array} positions
 * @param {'x'|'y'|'z'} up
 */
export function orientYUp(positions, up) {
  if (up === 'y') return positions;
  if (up !== 'x' && up !== 'z') throw new Error(`Unknown up axis: ${up}`);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const y = positions[i + 1];
    const z = positions[i + 2];
    if (up === 'z') {
      positions[i + 1] = z;
      positions[i + 2] = -y;
    } else {
      positions[i] = -y;
      positions[i + 1] = x;
    }
  }
  return positions;
}

/** Rotate in place around the Y axis (to make a figure face the visitor). */
export function rotateY(positions, degrees) {
  if (!degrees) return positions;
  const rad = (degrees * Math.PI) / 180;
  const c = Math.cos(rad);
  const s = Math.sin(rad);
  for (let i = 0; i < positions.length; i += 3) {
    const x = positions[i];
    const z = positions[i + 2];
    positions[i] = c * x + s * z;
    positions[i + 2] = -s * x + c * z;
  }
  return positions;
}

/**
 * Scale to real size and put the model on the floor, centred on its base.
 * The base is the footprint of the lowest `baseSlice` of the height, so a
 * figure with an outstretched arm still stands in the middle of its plinth.
 *
 * @param {Float32Array} positions Y-up, any unit. Modified in place.
 * @param {{ heightMeters?: number|null, fallbackScale?: number, baseSlice?: number }} [options]
 * @returns {{ scale: number, size: {width:number,height:number,depth:number}, base: {width:number,depth:number} }}
 */
export function normalizeToFloor(positions, options = {}) {
  const { heightMeters = null, fallbackScale = 0.001, baseSlice = 0.03 } = options;
  const { min, max } = computeBounds(positions);
  const rawHeight = max[1] - min[1];
  if (!(rawHeight > 0)) throw new Error('Model has no height');
  const scale = heightMeters ? heightMeters / rawHeight : fallbackScale;

  const sliceTop = min[1] + rawHeight * baseSlice;
  const baseMin = [Infinity, Infinity];
  const baseMax = [-Infinity, -Infinity];
  for (let i = 0; i < positions.length; i += 3) {
    if (positions[i + 1] > sliceTop) continue;
    const x = positions[i];
    const z = positions[i + 2];
    if (x < baseMin[0]) baseMin[0] = x;
    if (x > baseMax[0]) baseMax[0] = x;
    if (z < baseMin[1]) baseMin[1] = z;
    if (z > baseMax[1]) baseMax[1] = z;
  }
  const cx = (baseMin[0] + baseMax[0]) / 2;
  const cz = (baseMin[1] + baseMax[1]) / 2;

  for (let i = 0; i < positions.length; i += 3) {
    positions[i] = (positions[i] - cx) * scale;
    positions[i + 1] = (positions[i + 1] - min[1]) * scale;
    positions[i + 2] = (positions[i + 2] - cz) * scale;
  }

  return {
    scale,
    size: {
      width: (max[0] - min[0]) * scale,
      height: rawHeight * scale,
      depth: (max[2] - min[2]) * scale,
    },
    base: {
      width: (baseMax[0] - baseMin[0]) * scale,
      depth: (baseMax[1] - baseMin[1]) * scale,
    },
  };
}

/**
 * Smooth, area-weighted vertex normals for an indexed triangle mesh.
 * @param {ArrayLike<number>} positions xyz per vertex
 * @param {ArrayLike<number>} indices three per triangle
 * @returns {Float32Array}
 */
export function computeVertexNormals(positions, indices) {
  const normals = new Float32Array(positions.length);
  for (let i = 0; i < indices.length; i += 3) {
    const a = indices[i] * 3;
    const b = indices[i + 1] * 3;
    const c = indices[i + 2] * 3;
    const e1x = positions[b] - positions[a];
    const e1y = positions[b + 1] - positions[a + 1];
    const e1z = positions[b + 2] - positions[a + 2];
    const e2x = positions[c] - positions[a];
    const e2y = positions[c + 1] - positions[a + 1];
    const e2z = positions[c + 2] - positions[a + 2];
    // The cross product's length is twice the triangle area, which is the weighting.
    const nx = e1y * e2z - e1z * e2y;
    const ny = e1z * e2x - e1x * e2z;
    const nz = e1x * e2y - e1y * e2x;
    for (const v of [a, b, c]) {
      normals[v] += nx;
      normals[v + 1] += ny;
      normals[v + 2] += nz;
    }
  }
  for (let i = 0; i < normals.length; i += 3) {
    const len = Math.hypot(normals[i], normals[i + 1], normals[i + 2]);
    if (len > 0) {
      normals[i] /= len;
      normals[i + 1] /= len;
      normals[i + 2] /= len;
    } else {
      normals[i + 1] = 1; // unreferenced or degenerate vertex
    }
  }
  return normals;
}

/**
 * Work out which STL axis is "up" by comparing the model's proportions with
 * the catalogue's height/width/depth. Needed for pieces that are wider than
 * they are tall (a reclining figure, an animal), where "tallest axis" is wrong.
 * Falls back to the tallest axis when width or depth is unknown.
 *
 * @param {Float32Array} positions
 * @param {{ height?: number, width?: number, depth?: number }} dims any consistent unit
 * @returns {'x'|'y'|'z'}
 */
export function detectUpAxis(positions, dims = {}) {
  const { height, width, depth } = dims;
  if (!(height > 0 && width > 0 && depth > 0)) return tallestAxis(positions);
  const { min, max } = computeBounds(positions);
  const extent = [0, 1, 2].map((a) => max[a] - min[a]);
  const catalogue = [width, depth].sort((a, b) => a - b);
  let best = 0;
  let bestError = Infinity;
  for (let up = 0; up < 3; up++) {
    if (!(extent[up] > 0)) continue;
    const scale = height / extent[up];
    const others = extent.filter((_, a) => a !== up).sort((a, b) => a - b);
    const error = others.reduce(
      (sum, e, i) => sum + Math.abs(Math.log((e * scale) / catalogue[i])),
      0,
    );
    if (error < bestError) {
      bestError = error;
      best = up;
    }
  }
  return AXES[best];
}
