import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeBounds,
  computeVertexNormals,
  detectUpAxis,
  normalizeToFloor,
  orientYUp,
  rotateY,
  tallestAxis,
} from '../src/lib/mesh.mjs';

const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-5, `${a} != ${b}`);

test('tallestAxis picks the largest extent', () => {
  assert.equal(tallestAxis(new Float32Array([0, 0, 0, 1, 2, 9])), 'z');
  assert.equal(tallestAxis(new Float32Array([0, 0, 0, 1, 5, 2])), 'y');
});

test('orientYUp turns Z-up into Y-up without mirroring', () => {
  const p = orientYUp(new Float32Array([1, 2, 3]), 'z');
  assert.deepEqual([...p], [1, 3, -2]);
  // x cross y = z must still hold after the rotation (no handedness flip).
  const basis = orientYUp(new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]), 'z');
  const [ax, ay, az, bx, by, bz, cx, cy, cz] = basis;
  [ay * bz - az * by, az * bx - ax * bz, ax * by - ay * bx].forEach((v, i) => close(v, [cx, cy, cz][i]));
  assert.throws(() => orientYUp(new Float32Array(3), 'w'), /Unknown up axis/);
});

test('rotateY by 90 degrees sends +Z to +X', () => {
  const p = rotateY(new Float32Array([0, 1, 1]), 90);
  close(p[0], 1);
  close(p[1], 1);
  close(p[2], 0);
});

test('normalizeToFloor scales to the real height and stands on y = 0', () => {
  // A 100-unit tall post on a small base, with an "arm" sticking out high up.
  const p = new Float32Array([
    10, 50, 10, 20, 50, 10, 10, 50, 30, 20, 50, 30, // base corners (y = 50)
    15, 150, 20, // top
    90, 140, 20, // arm, far off to the side
  ]);
  const info = normalizeToFloor(p, { heightMeters: 2 });
  close(info.scale, 0.02);
  close(info.size.height, 2);
  close(info.base.width, 0.2);
  close(info.base.depth, 0.4);
  const { min, max } = computeBounds(p);
  close(min[1], 0);
  close(max[1], 2);
  // Centred on the base, not on the bounding box that includes the arm.
  close(p[0], -0.1);
  close(p[3], 0.1);
});

test('normalizeToFloor falls back to millimetres without a known height', () => {
  const p = new Float32Array([0, 0, 0, 0, 1500, 0]);
  close(normalizeToFloor(p).size.height, 1.5);
  assert.throws(() => normalizeToFloor(new Float32Array([0, 1, 0, 2, 1, 3])), /no height/);
});

test('computeVertexNormals gives unit normals following the winding', () => {
  const positions = [0, 0, 0, 1, 0, 0, 0, 0, -1, 5, 5, 5];
  const n = computeVertexNormals(positions, [0, 1, 2]);
  assert.deepEqual([...n.slice(0, 9)], [0, 1, 0, 0, 1, 0, 0, 1, 0]);
  assert.deepEqual([...n.slice(9)], [0, 1, 0]); // unreferenced vertex gets a safe default
});

test('detectUpAxis uses catalogue proportions for pieces wider than they are tall', () => {
  // A reclining figure: 185 long, 96 high, 89 deep, stored Z-up in the STL.
  const reclining = new Float32Array([0, 0, 0, 1850, 890, 960]);
  assert.equal(tallestAxis(reclining), 'x');
  assert.equal(detectUpAxis(reclining, { height: 96, width: 185, depth: 89 }), 'z');
  // Units and scale do not matter, only proportions.
  const tiny = new Float32Array([0, 0, 0, 0.89, 0.96, 1.85]);
  assert.equal(detectUpAxis(tiny, { height: 0.96, width: 1.85, depth: 0.89 }), 'y');
});

test('detectUpAxis falls back to the tallest axis without full dimensions', () => {
  const standing = new Float32Array([0, 0, 0, 1, 5, 2]);
  assert.equal(detectUpAxis(standing, { height: 170 }), 'y');
  assert.equal(detectUpAxis(standing), 'y');
});
