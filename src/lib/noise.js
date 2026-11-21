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
  const { seed = 1, baseCells = 4, octaves = 4, falloff = 0.5 } = options;
  const out = new Float32Array(size * size);
  const random = seededRandom(seed);
  let amplitude = 1;
  let total = 0;
  for (let o = 0; o < octaves; o++) {
    const cells = baseCells * 2 ** o;
    const lattice = Float32Array.from({ length: cells * cells }, random);
    const at = (cx, cy) => lattice[(cy % cells) * cells + (cx % cells)];
    for (let y = 0; y < size; y++) {
      const fy = (y / size) * cells;
      const y0 = Math.floor(fy);
      const ty = smooth(fy - y0);
      for (let x = 0; x < size; x++) {
        const fx = (x / size) * cells;
        const x0 = Math.floor(fx);
        const tx = smooth(fx - x0);
        const top = at(x0, y0) + (at(x0 + 1, y0) - at(x0, y0)) * tx;
        const bottom = at(x0, y0 + 1) + (at(x0 + 1, y0 + 1) - at(x0, y0 + 1)) * tx;
        out[y * size + x] += (top + (bottom - top) * ty) * amplitude;
      }
    }
    total += amplitude;
    amplitude *= falloff;
  }
  for (let i = 0; i < out.length; i++) out[i] /= total;
  return out;
}
