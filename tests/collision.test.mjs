import test from 'node:test';
import assert from 'node:assert/strict';
import { resolvePosition } from '../src/lib/collision.js';

const room = { minX: -5, maxX: 5, minZ: -4, maxZ: 4 };
const corridor = { minX: -1, maxX: 1, minZ: -6, maxZ: -3.9 };
const nextRoom = { minX: -5, maxX: 5, minZ: -12, maxZ: -5.9 };
const areas = [room, corridor, nextRoom];
const plinth = { x: 0, z: 0, halfX: 0.5, halfZ: 1 };
const close = (a, b) => assert.ok(Math.abs(a - b) < 1e-9, `${a} != ${b}`);

test('free positions are left alone', () => {
  assert.deepEqual(resolvePosition({ x: 2, z: 1 }, areas, [plinth], 0.3), { x: 2, z: 1 });
});

test('walls stop the visitor at the edge of the walkable area', () => {
  const p = resolvePosition({ x: 99, z: 99 }, [room], [], 0.3);
  close(p.x, 5);
  close(p.z, 4);
});

test('a wall beside a doorway blocks, the doorway lets you through', () => {
  const blocked = resolvePosition({ x: 3, z: -4.5 }, areas, [], 0.3);
  close(blocked.z, -4);
  close(blocked.x, 3);
  assert.deepEqual(resolvePosition({ x: 0.5, z: -5 }, areas, [], 0.3), { x: 0.5, z: -5 });
  assert.deepEqual(resolvePosition({ x: 0.5, z: -7 }, areas, [], 0.3), { x: 0.5, z: -7 });
});

test('inside the doorway the jambs hold the visitor in', () => {
  const p = resolvePosition({ x: 1.4, z: -5 }, areas, [], 0.3);
  close(p.x, 1);
  close(p.z, -5);
});

test('a plinth pushes the visitor out through its nearest face', () => {
  const side = resolvePosition({ x: 0.6, z: 0.2 }, areas, [plinth], 0.3);
  close(side.x, 0.8);
  close(side.z, 0.2);
  const end = resolvePosition({ x: 0.1, z: -1.2 }, areas, [plinth], 0.3);
  close(end.x, 0.1);
  close(end.z, -1.3);
});

test('standing exactly on a plinth centre still resolves to outside it', () => {
  const p = resolvePosition({ x: 0, z: 0 }, areas, [plinth], 0.3);
  assert.ok(Math.abs(p.x) >= 0.8 || Math.abs(p.z) >= 1.3);
});

test('a plinth against a wall cannot push the visitor through the wall', () => {
  const p = resolvePosition({ x: 4.9, z: 0 }, [room], [{ x: 4.4, z: 0, halfX: 0.5, halfZ: 0.5 }], 0.3);
  assert.ok(p.x <= 5);
});
