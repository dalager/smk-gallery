// Small deterministic noise helpers for procedural surface textures. Pure, no DOM.

/** Seeded pseudo-random generator (mulberry32). Returns numbers in [0, 1). */
export function seededRandom(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const smooth = (t) => t * t * (3 - 2 * t);

/**
 * Fractal value noise that repeats seamlessly at the edges, so it can be used
 * as a tiling texture.
 *
 * @param {number} size width and height in pixels
 * @param {{ seed?: number, baseCells?: number, octaves?: number, falloff?: number }} [options]
 *   `baseCells` is the number of noise cells across the tile in the coarsest octave.
 * @returns {Float32Array} size * size values in [0, 1], row by row
 */
export function tileableNoise(size, options = {}) {
  const { baseCells = 4, ...rest } = options;
  return valueNoise(size, size, { ...rest, cellsX: baseCells, cellsY: baseCells });
}

/**
 * Fractal value noise on a rectangle, with its own number of cells along each
 * axis, so features can be stretched (wear that follows the grain of the boards).
 * Also wraps at the edges, like `tileableNoise`.
 *
 * @param {number} width
 * @param {number} height
 * @param {{ seed?: number, cellsX?: number, cellsY?: number, octaves?: number, falloff?: number }} [options]
 *   `cellsX` and `cellsY` count the coarsest octave's cells across and down.
 * @returns {Float32Array} width * height values in [0, 1], row by row
 */
export function valueNoise(width, height, options = {}) {
  const { seed = 1, cellsX = 4, cellsY = 4, octaves = 4, falloff = 0.5 } = options;
  const out = new Float32Array(width * height);
  const random = seededRandom(seed);
  let amplitude = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cx = Math.max(1, Math.round(cellsX * 2 ** o));
    const cy = Math.max(1, Math.round(cellsY * 2 ** o));
    const lattice = Float32Array.from({ length: cx * cy }, random);
    const at = (x, y) => lattice[(y % cy) * cx + (x % cx)];
    for (let y = 0; y < height; y++) {
      const fy = (y / height) * cy;
      const y0 = Math.floor(fy);
      const ty = smooth(fy - y0);
      for (let x = 0; x < width; x++) {
        const fx = (x / width) * cx;
        const x0 = Math.floor(fx);
        const tx = smooth(fx - x0);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        out[y * width + x] += (top + (bottom - top) * ty) * amplitude;
      }
    }
    total += amplitude;
    amplitude *= falloff;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
