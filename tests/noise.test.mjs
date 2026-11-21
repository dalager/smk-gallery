import test from 'node:test';
import assert from 'node:assert/strict';
import { seededRandom, tileableNoise } from '../src/lib/noise.js';

test('seededRandom is repeatable and stays in [0, 1)', () => {
  const a = seededRandom(42);
  const b = seededRandom(42);
  const values = Array.from({ length: 200 }, a);
  assert.deepEqual(values, Array.from({ length: 200 }, b));
  assert.ok(values.every((v) => v >= 0 && v < 1));
  assert.notEqual(seededRandom(43)(), values[0]);
});

test('tileableNoise stays in range and actually varies', () => {
  const noise = tileableNoise(64, { seed: 3 });
  assert.equal(noise.length, 64 * 64);
  let min = 1;
  let max = 0;
  for (const v of noise) {
    assert.ok(v >= 0 && v <= 1);
    min = Math.min(min, v);
    max = Math.max(max, v);
  }
  assert.ok(max - min > 0.3);
});

test('tileableNoise wraps without a seam', () => {
  const size = 64;
  const noise = tileableNoise(size, { seed: 5, baseCells: 2, octaves: 3 });
  // The step across the tile edge must be no bigger than steps inside the tile.
  let inside = 0;
  let across = 0;
  for (let i = 0; i < size; i++) {
    for (let x = 1; x < size; x++) {
      inside = Math.max(inside, Math.abs(noise[i * size + x] - noise[i * size + x - 1]));
    }
    across = Math.max(across, Math.abs(noise[i * size] - noise[i * size + size - 1]));
    across = Math.max(across, Math.abs(noise[i] - noise[(size - 1) * size + i]));
  }
  assert.ok(across <= inside * 1.5, `edge step ${across} vs inside ${inside}`);
});
