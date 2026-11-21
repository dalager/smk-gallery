// Waypoints for the scripted camera flights. Each waypoint is
//   { camera: [x, y, z], look: [x, y, z], speed?: m/s, seconds?: s, hold?: s, focus?: item }
// where `speed` or `seconds` says how the camera gets there from the previous
// waypoint (cruise speed if neither is given). `hold` on the last waypoint keeps
// the final view still for that many seconds. `focus` names the sculpture the
// camera is turned towards there, whose plaque is shown. Pure functions of the floor plan.

import { PLAN } from './layout.js';

export const CRUISE_SPEED = 1.0; // metres per second: a slow walk
const BRISK_SPEED = 3.7;
const AIM_BIAS = 0.55; // 1 aims straight at a sculpture, 0 straight down the aisle
const MAX_DROP = 0.4; // how far below its own height the camera aims, in metres
const LEAD = 1.8; // metres the camera is short of a sculpture when it is aimed at it

const doorHeightFor = (plan) => Math.min(2.0, plan.doorHeight - 0.9);

function opening(layout, plan) {
  const first = layout.rooms[0];
  return {
    camera: [0, Math.min(3.8, plan.roomHeight - 1), first.maxZ - 0.5],
    look: [0, 2.0, first.centerZ - 3],
  };
}

/**
 * A slow pass down one room: the camera weaves gently along the aisle, turning
 * towards one sculpture per row and alternating sides.
 * @returns {{ waypoints: object[], side: number }} `side` is which side comes next
 */
function strollRoom(layout, room, side) {
  const waypoints = [];
  const pieces = layout.placements.filter((p) => p.room === room.id);
  const rows = [...new Set(pieces.map((p) => p.z))].sort((a, b) => b - a);
  for (const z of rows) {
    const inRow = pieces.filter((p) => p.z === z);
    const focus = inRow.find((p) => Math.sign(p.x) === side) ?? inRow[0];
    const cameraY = 1.7 + 0.35 * focus.item.size.height;
    waypoints.push({
      // Opposite side of the aisle from the piece and well short of it, so the
      // view is always ahead of the camera and never has to whip sideways.
      camera: [-Math.sign(focus.x) * 0.9, cameraY, z + LEAD],
      // Aim between the piece and the aisle, a little beyond it: the sculpture sits
      // off-centre in a wide frame and the turn towards the next one stays gentle.
      // Kept close to the camera's own height: a level camera keeps the walls upright.
      look: [focus.x * AIM_BIAS, cameraY - MAX_DROP, focus.z - 1.0],
      focus: focus.item,
    });
    side = -Math.sign(focus.x);
  }
  return { waypoints, side };
}

/** Dropping to head height and passing through the doorway at the far end of a room. */
function leaveRoom(room, plan, speed) {
  const doorZ = room.minZ - plan.wallThickness / 2;
  const y = doorHeightFor(plan);
  return [
    { camera: [0, y, room.minZ + 1.1], look: [0, 1.7, doorZ - 5.5], speed },
    { camera: [0, y, doorZ], look: [0, 1.7, doorZ - 6.5], speed },
  ];
}

/** The full tour: every room at a stroll, ending under the last skylight looking up. */
export function grandTour(layout, plan = PLAN) {
  const waypoints = [opening(layout, plan)];
  let side = -1;
  layout.rooms.forEach((room, index) => {
    const stroll = strollRoom(layout, room, side);
    waypoints.push(...stroll.waypoints);
    side = stroll.side;
    if (index < layout.rooms.length - 1) {
      waypoints.push(...leaveRoom(room, plan));
    } else {
      waypoints.push({
        camera: [0, 2.3, room.minZ + 2.2],
        look: [0, plan.roomHeight + 1, room.minZ - 0.5],
      });
    }
  });
  return waypoints;
}

/**
 * The short tour: the first room at a stroll, then briskly straight through
 * the rest, finishing with a turn in the last room so the camera ends with its
 * back to the far wall, looking back down the whole enfilade.
 */
export function quickTour(layout, plan = PLAN) {
  const rooms = layout.rooms;
  const last = rooms.at(-1);
  const waypoints = [opening(layout, plan)];
  if (rooms.length < 2) return [...waypoints, ...strollRoom(layout, rooms[0], -1).waypoints];

  waypoints.push(...strollRoom(layout, rooms[0], -1).waypoints);
  waypoints.push(...leaveRoom(rooms[0], plan));

  // Middle rooms: down the aisle with a slight sway, eyes well ahead.
  rooms.slice(1, -1).forEach((room, i) => {
    const sway = i % 2 === 0 ? 0.5 : -0.5;
    waypoints.push({
      camera: [sway, 2.3, room.centerZ],
      look: [-sway, 1.9, room.centerZ - 8],
      speed: BRISK_SPEED,
    });
    waypoints.push(...leaveRoom(room, plan, BRISK_SPEED));
  });

  // Last room: slow down, swing round past the right-hand row, back up to the wall.
  const end = last.minZ;
  const eye = 1.7;
  waypoints.push(
    { camera: [-0.6, 2.0, end + 9], look: [0.3, 1.8, end + 3], speed: BRISK_SPEED * 0.75 },
    { camera: [-1.0, 1.9, end + 4.5], look: [2.2, eye, end + 1.2], seconds: 2.6 },
    { camera: [-0.5, 1.8, end + 2.2], look: [3.0, 1.6, end + 4.0], seconds: 2.8 },
    { camera: [0, eye, end + 0.9], look: [0.5, 1.65, end + 10], seconds: 2.4 },
    // The final aim point is only a couple of rooms back; any further and the
    // look curve swings wide and the view wobbles as it settles.
    { camera: [0, eye, end + 0.55], look: [0, eye, end + 26], seconds: 2.2, hold: 1.5 },
  );
  return waypoints;
}

export const ROUTES = { grand: grandTour, quick: quickTour };
