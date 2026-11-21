import test from 'node:test';
import assert from 'node:assert/strict';
import { parseBinaryStl } from '../src/lib/stl.mjs';

function makeStl(triangles) {
  const bytes = new Uint8Array(84 + triangles.length * 50);
  const view = new DataView(bytes.buffer);
  view.setUint32(80, triangles.length, true);
  triangles.forEach((tri, t) => {
    tri.forEach((value, i) => view.setFloat32(84 + t * 50 + 12 + i * 4, value, true));
  });
  return bytes;
}

test('parses triangles and skips normals', () => {
  const tri = [0, 0, 0, 1, 0, 0, 0, 2, 0];
  const { positions, triangleCount } = parseBinaryStl(makeStl([tri, tri.map((v) => v + 1)]));
  assert.equal(triangleCount, 2);
  assert.deepEqual([...positions.slice(0, 9)], tri);
  assert.equal(positions[9], 1);
});

test('accepts an ArrayBuffer and a Uint8Array view with an offset', () => {
  const stl = makeStl([[1, 2, 3, 4, 5, 6, 7, 8, 9]]);
  assert.equal(parseBinaryStl(stl.buffer).triangleCount, 1);
  const padded = new Uint8Array(stl.length + 7);
  padded.set(stl, 7);
  assert.equal(parseBinaryStl(padded.subarray(7)).positions[8], 9);
});

test('rejects truncated and ASCII files', () => {
  assert.throws(() => parseBinaryStl(new Uint8Array(10)), /too small/);
  assert.throws(() => parseBinaryStl(makeStl([[0, 0, 0, 1, 0, 0, 0, 1, 0]]).subarray(0, 100)), /Not a binary STL/);
  const ascii = new TextEncoder().encode('solid x\n'.padEnd(200, ' ') + 'endsolid x\n');
  assert.throws(() => parseBinaryStl(ascii), /Not a binary STL/);
});
