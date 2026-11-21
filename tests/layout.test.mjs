import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, PLAN, plinthHeightFor, roomAt, walkableAreas } from '../src/lib/layout.js';
import { resolvePosition } from '../src/lib/collision.js';

const piece = (objectNumber, room, width = 0.6, depth = 0.4, height = 1.8) => ({
  objectNumber,
  room,
  size: { width, depth, height },
  base: { width, depth },
});
const gallery = {
  rooms: [
    { id: 'a', name: 'A', wallColor: '#111111' },
    { id: 'b', name: 'B', wallColor: '#222222' },
  ],
  sculptures: [
    piece('a1', 'a'), piece('a2', 'a'), piece('a3', 'a'), piece('a4', 'a'), piece('a5', 'a'),
    piece('b1', 'b', 1.8, 0.9, 1),
    piece('lost', 'no-such-room'),
  ],
};
const layout = computeLayout(gallery);
const R = 0.3;

test('rooms run towards -Z with a doorway between each pair', () => {
  assert.equal(layout.rooms.length, 2);
  assert.equal(layout.rooms[0].centerZ, 0);
  assert.equal(layout.rooms[1].centerZ, -(PLAN.roomDepth + PLAN.wallThickness));
  assert.equal(layout.doors.length, 1);
  assert.ok(layout.doors[0].z < layout.rooms[0].minZ && layout.doors[0].z > layout.rooms[1].maxZ);
});

test('pieces alternate sides, face the aisle and skip unknown rooms', () => {
  assert.equal(layout.placements.length, 6);
  const [a1, a2] = layout.placements.filter((p) => p.room === 'a').sort((p, q) => q.z - p.z);
  assert.ok(a1.x * a2.x < 0);
  for (const p of layout.placements) {
    assert.equal(Math.sign(Math.sin(p.yaw)), -Math.sign(p.x)); // facing towards x = 0
  }
});

test('every piece is inside its room with space to walk all the way round', () => {
  for (const p of layout.placements) {
    const room = layout.rooms.find((r) => r.id === p.room);
    assert.ok(Math.abs(p.x) + p.halfX + 2 * R < PLAN.roomWidth / 2);
    assert.ok(p.z - p.halfZ - 2 * R > room.minZ && p.z + p.halfZ + 2 * R < room.maxZ);
    assert.ok(Math.abs(p.x) - p.halfX - R > PLAN.doorWidth / 2, 'aisle stays clear');
  }
  const sameSide = layout.placements.filter((p) => p.room === 'a' && p.x < 0).sort((p, q) => p.z - q.z);
  for (let i = 1; i < sameSide.length; i++) {
    const gap = sameSide[i].z - sameSide[i].halfZ - (sameSide[i - 1].z + sameSide[i - 1].halfZ);
    assert.ok(gap > 2 * R);
  }
});

test('a piece turned to face the aisle has its width along Z', () => {
  const wide = layout.placements.find((p) => p.item.objectNumber === 'b1');
  assert.ok(wide.halfZ > wide.halfX);
});

test('the visitor can walk the central axis from the first room to the last', () => {
  const areas = walkableAreas(layout, R);
  const obstacles = layout.placements;
  let pos = layout.start;
  const endZ = layout.rooms.at(-1).minZ + 1;
  for (let i = 0; i < 2000 && pos.z > endZ; i++) {
    pos = resolvePosition({ x: pos.x, z: pos.z - 0.05 }, areas, obstacles, R);
  }
  assert.ok(pos.z <= endZ, `stuck at z=${pos.z}`);
});

test('walls hold away from the doorway', () => {
  const areas = walkableAreas(layout, R);
  let pos = { x: 4, z: 0 };
  for (let i = 0; i < 2000; i++) pos = resolvePosition({ x: pos.x, z: pos.z - 0.05 }, areas, [], R);
  assert.ok(pos.z >= layout.rooms[0].minZ + R - 1e-9);
});

test('roomAt follows the visitor', () => {
  assert.equal(roomAt(layout, 3).id, 'a');
  assert.equal(roomAt(layout, layout.rooms[1].centerZ + 2).id, 'b');
});

test('plinths are low for statues and tall for busts', () => {
  assert.equal(plinthHeightFor(3), 0.3);
  assert.equal(plinthHeightFor(0.3), 1.2);
});
