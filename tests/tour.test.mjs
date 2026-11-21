import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeLayout, PLAN, walkableAreas } from '../src/lib/layout.js';
import { catmullRom, createTourPath, monotoneCurve } from '../src/lib/tour.js';

const piece = (objectNumber, room, height = 1.8) => ({
  objectNumber,
  room,
  size: { width: 0.7, depth: 0.5, height },
  base: { width: 0.7, depth: 0.5 },
});
const rooms = ['a', 'b', 'c'].map((id) => ({ id, name: id, wallColor: '#333333' }));
const gallery = {
  rooms,
  sculptures: [
    ...[1, 2, 3, 4, 5, 6].map((n) => piece(`a${n}`, 'a', 1 + n * 0.25)),
    ...[1, 2, 3, 4].map((n) => piece(`b${n}`, 'b')),
    piece('c1', 'c'),
    piece('c2', 'c', 0.5),
  ],
};
const layout = computeLayout(gallery);
const tour = createTourPath(layout);
const frames = Array.from({ length: 2001 }, (_, i) => tour.sample((tour.duration * i) / 2000));
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

test('catmullRom passes through its control points', () => {
  const points = [[0, 0, 0], [1, 2, 0], [4, 2, 1], [5, 0, 1]];
  const curve = catmullRom(points);
  for (let i = 0; i < 3; i++) {
    assert.ok(dist(curve(i, 0), points[i]) < 1e-9);
    assert.ok(dist(curve(i, 1), points[i + 1]) < 1e-9);
  }
});

test('monotoneCurve hits its knots, eases at both ends and never goes backwards', () => {
  const xs = [0, 10, 12, 30, 31];
  const ys = [0, 10, 20, 22, 22.1];
  const curve = monotoneCurve(xs, ys);
  xs.forEach((x, i) => assert.ok(Math.abs(curve(x) - ys[i]) < 1e-9));
  assert.ok(curve(0.1) < 0.02, 'slow start');
  assert.ok(ys.at(-1) - curve(30.9) < 0.01, 'slow finish');
  let previous = 0;
  for (let x = 0; x <= 31; x += 0.01) {
    const value = curve(x);
    assert.ok(value >= previous - 1e-12);
    previous = value;
  }
  assert.equal(curve(-5), 0);
  assert.equal(curve(99), 22.1);
});

test('the flight runs from the first room to the last at a walking pace', () => {
  assert.ok(frames[0].position[2] > layout.rooms[0].centerZ);
  assert.ok(frames.at(-1).position[2] < layout.rooms.at(-1).centerZ);
  assert.ok(tour.length / tour.duration > 0.7 && tour.length / tour.duration < 1.4);
  assert.equal(frames[0].fade, 0);
  assert.equal(frames.at(-1).fade, 0);
  assert.equal(frames[1000].fade, 1);
});

test('the camera never passes through a wall, door frame, plinth or ceiling', () => {
  const margin = 0.3;
  const areas = walkableAreas(layout, margin);
  for (const { position: [x, y, z] } of frames) {
    const inside = areas.some((a) => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ);
    assert.ok(inside, `outside the floor plan at ${x.toFixed(2)}, ${z.toFixed(2)}`);
    assert.ok(y > 1.2 && y < PLAN.roomHeight - 0.5, `height ${y}`);
    const inDoorway = layout.doors.some((d) => Math.abs(z - d.z) < PLAN.wallThickness / 2 + margin);
    if (inDoorway) assert.ok(y < PLAN.doorHeight - 0.5, `too high in a doorway: ${y}`);
    for (const p of layout.placements) {
      const clear = Math.abs(x - p.x) > p.halfX + margin || Math.abs(z - p.z) > p.halfZ + margin;
      assert.ok(clear, `inside the plinth of ${p.item.objectNumber}`);
    }
  }
});

test('motion is smooth: steady speed and no sudden swings of the view', () => {
  const dt = tour.duration / 2000;
  let maxSpeed = 0;
  let maxTurn = 0;
  let previousDirection = null;
  for (let i = 1; i < frames.length; i++) {
    maxSpeed = Math.max(maxSpeed, dist(frames[i].position, frames[i - 1].position) / dt);
    const { position, look } = frames[i];
    const length = dist(look, position);
    assert.ok(length > 1.5, 'look target too close to the camera');
    const direction = look.map((v, k) => (v - position[k]) / length);
    if (previousDirection) {
      const dot = direction.reduce((sum, v, k) => sum + v * previousDirection[k], 0);
      maxTurn = Math.max(maxTurn, Math.acos(Math.min(1, dot)) / dt);
    }
    previousDirection = direction;
  }
  assert.ok(maxSpeed < 1.6, `peak speed ${maxSpeed.toFixed(2)} m/s`);
  assert.ok(maxTurn < (60 * Math.PI) / 180, `peak turn ${((maxTurn * 180) / Math.PI).toFixed(0)} deg/s`);
});

test('a custom duration is honoured', () => {
  assert.equal(createTourPath(layout, { duration: 30 }).duration, 30);
});

/** Peak view turn rate in degrees per second, checking the path stays clear on the way. */
function flightCheck(aLayout, aTour, steps = 4000) {
  const areas = walkableAreas(aLayout, 0.3);
  const dt = aTour.duration / steps;
  let maxTurn = 0;
  let previous = null;
  for (let i = 0; i <= steps; i++) {
    const { position, look } = aTour.sample(i * dt);
    const [x, , z] = position;
    assert.ok(
      areas.some((a) => x >= a.minX && x <= a.maxX && z >= a.minZ && z <= a.maxZ),
      `outside the floor plan at ${x.toFixed(2)}, ${z.toFixed(2)}`,
    );
    for (const p of aLayout.placements) {
      assert.ok(
        Math.abs(x - p.x) > p.halfX + 0.3 || Math.abs(z - p.z) > p.halfZ + 0.3,
        `inside the plinth of ${p.item.objectNumber}`,
      );
    }
    const length = dist(look, position);
    assert.ok(length > 1.5, 'look target too close to the camera');
    const direction = look.map((v, k) => (v - position[k]) / length);
    if (previous) {
      const dot = direction.reduce((sum, v, k) => sum + v * previous[k], 0);
      maxTurn = Math.max(maxTurn, Math.acos(Math.min(1, dot)) / dt);
    }
    previous = direction;
  }
  return (maxTurn * 180) / Math.PI;
}

test('the quick tour strolls the first room, hurries through the rest and stays smooth', () => {
  const quick = createTourPath(layout, { route: 'quick' });
  assert.ok(quick.duration < tour.duration);
  assert.ok(flightCheck(layout, quick) < 60);

  // Same opening as the grand tour.
  for (const time of [0, 2, 5, 8]) {
    assert.ok(dist(quick.sample(time).position, tour.sample(time).position) < 0.05, `differs at ${time}s`);
  }
  const speedAt = (time) =>
    dist(quick.sample(time + 0.1).position, quick.sample(time - 0.1).position) / 0.2;
  const inRoom = (index) => {
    for (let time = 0; time < quick.duration; time += 0.05) {
      if (Math.abs(quick.sample(time).position[2] - layout.rooms[index].centerZ) < 0.2) return time;
    }
    throw new Error(`never reached room ${index}`);
  };
  assert.ok(speedAt(inRoom(0)) < 1.3);
  assert.ok(speedAt(inRoom(1)) > 2.5);
});

test('plaques follow the route: one per row while strolling, none while hurrying', () => {
  const quick = createTourPath(layout, { route: 'quick' });
  const shown = [];
  let longestGap = 0;
  let since = null;
  for (let time = 0; time <= quick.duration; time += 0.1) {
    const { focus, position } = quick.sample(time);
    if (focus) {
      if (shown.at(-1) !== focus) shown.push(focus);
      assert.equal(focus.room, 'a', 'only the strolled room has plaques');
      assert.ok(Math.abs(position[2] - layout.rooms[0].centerZ) < 9);
      since = time;
    } else if (since !== null && shown.length < 3) {
      longestGap = Math.max(longestGap, time - since);
    }
  }
  assert.equal(shown.length, 3, 'three rows in the first room');
  assert.equal(new Set(shown).size, 3);
  assert.ok(longestGap < 1.5, 'plaques hand over without a long blank');
  assert.equal(tour.sample(0).focus, null);
  assert.equal(tour.sample(tour.duration).focus, null);
});

test('the quick tour ends with its back to the far wall, looking back the way it came', () => {
  const quick = createTourPath(layout, { route: 'quick' });
  const { position, look } = quick.sample(quick.duration);
  const last = layout.rooms.at(-1);
  assert.ok(position[2] - last.minZ < 0.8, 'close to the end wall');
  assert.ok(Math.abs(position[0]) < 0.2 && Math.abs(position[1] - 1.7) < 0.1, 'centred at eye level');
  const length = dist(look, position);
  assert.ok((look[2] - position[2]) / length > 0.99, 'facing straight back down the enfilade');
  // And it has stopped turning: the last second is a held shot.
  const before = quick.sample(quick.duration - 1);
  const direction = before.look.map((v, k) => v - before.position[k]);
  assert.ok(direction[2] / Math.hypot(...direction) > 0.99);
});

test('the real gallery, when built, also has a collision-free tour', (t) => {
  let real;
  try {
    real = JSON.parse(readFileSync(new URL('../public/gallery.json', import.meta.url), 'utf8'));
  } catch {
    t.skip('public/gallery.json not built');
    return;
  }
  const realLayout = computeLayout(real);
  for (const route of ['grand', 'quick']) {
    const realTour = createTourPath(realLayout, { route });
    const turn = flightCheck(realLayout, realTour);
    t.diagnostic(`${route}: ${realTour.length.toFixed(1)} m in ${realTour.duration.toFixed(1)} s, peak turn ${turn.toFixed(0)} deg/s`);
    assert.ok(turn < 60);
  }
  const quick = createTourPath(realLayout, { route: 'quick' });
  assert.ok(quick.duration > 40 && quick.duration < 50, `quick tour is ${quick.duration.toFixed(1)} s`);
});
