import test from 'node:test';
import assert from 'node:assert/strict';
import { computeLayout, PLAN } from '../src/lib/layout.js';
import { computeFloorWear, viewingSpot } from '../src/lib/floor-wear.js';
import { valueNoise } from '../src/lib/noise.js';

const piece = (objectNumber, room) => ({
  objectNumber,
  room,
  size: { width: 0.6, depth: 0.4, height: 1.8 },
  base: { width: 0.6, depth: 0.4 },
});
const layout = computeLayout({
  rooms: [
    { id: 'a', name: 'A', wallColor: '#111111' },
    { id: 'b', name: 'B', wallColor: '#222222' },
  ],
  sculptures: ['a1', 'a2', 'a3', 'a4', 'b1', 'b2'].map((n) => piece(n, n[0])),
});
const wear = computeFloorWear(layout, PLAN, { pixelsPerMetre: 10 });

/** Mean of a channel over a rectangle of floor, in metres. */
function mean(channel, minX, maxX, minZ, maxZ) {
  let sum = 0;
  let count = 0;
  for (let row = 0; row < wear.height; row++) {
    const z = wear.minZ + ((row + 0.5) / wear.height) * wear.sizeZ;
    if (z < minZ || z > maxZ) continue;
    for (let col = 0; col < wear.width; col++) {
      const x = wear.minX + ((col + 0.5) / wear.width) * wear.sizeX;
      if (x < minX || x > maxX) continue;
      sum += wear[channel][row * wear.width + col];
      count++;
    }
  }
  return sum / count;
}

test('the wear map covers the whole floor, with values in range', () => {
  assert.equal(wear.sizeX, PLAN.roomWidth);
  assert.equal(wear.minZ, layout.rooms[1].minZ);
  assert.equal(wear.minZ + wear.sizeZ, layout.rooms[0].maxZ);
  for (const channel of ['wear', 'grime', 'sheen']) {
    assert.equal(wear[channel].length, wear.width * wear.height);
    assert.ok(wear[channel].every((v) => v >= 0 && v <= 1), channel);
  }
});

test('the aisle and doorways are worn, the floor along the walls is not', () => {
  const room = layout.rooms[0];
  const aisle = mean('wear', -1, 1, room.minZ + 1, room.maxZ - 1);
  const byWall = mean('wear', -PLAN.roomWidth / 2, -PLAN.roomWidth / 2 + 0.3, room.minZ + 1, room.maxZ - 1);
  const door = layout.doors[0].z;
  const doorway = mean('wear', -0.6, 0.6, door - 0.5, door + 0.5);
  assert.ok(aisle > byWall * 3, `aisle ${aisle} vs wall ${byWall}`);
  assert.ok(doorway > aisle, `doorway ${doorway} vs aisle ${aisle}`);
});

test('people stand in front of each piece, on the aisle side', () => {
  for (const p of layout.placements) {
    const [x, z] = viewingSpot(p);
    assert.ok(Math.abs(x) < Math.abs(p.x), 'between the plinth and the aisle');
    const front = mean('wear', x - 0.3, x + 0.3, z - 0.3, z + 0.3);
    const behind = mean('wear', p.x + Math.sign(p.x) * (p.halfX + 0.6) - 0.2, p.x + Math.sign(p.x) * (p.halfX + 0.6) + 0.2, z - 0.3, z + 0.3);
    assert.ok(front > behind, `${p.item.objectNumber}: front ${front} vs behind ${behind}`);
  }
});

test('polish and grime collect where nobody walks', () => {
  const room = layout.rooms[0];
  const edge = [-PLAN.roomWidth / 2, -PLAN.roomWidth / 2 + 0.3, room.minZ + 1, room.maxZ - 1];
  const aisle = [-1, 1, room.minZ + 1, room.maxZ - 1];
  assert.ok(mean('sheen', ...edge) > mean('sheen', ...aisle));
  assert.ok(mean('grime', ...edge) > mean('grime', ...aisle));
});

test('valueNoise fills a rectangle and varies', () => {
  const noise = valueNoise(40, 90, { seed: 4, cellsX: 3, cellsY: 9, octaves: 3 });
  assert.equal(noise.length, 40 * 90);
  assert.ok(noise.every((v) => v >= 0 && v <= 1));
  assert.ok(Math.max(...noise) - Math.min(...noise) > 0.3);
});
