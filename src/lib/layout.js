// Gallery floor plan: rooms in a row (an enfilade) running towards -Z, joined
// by doorways on the central axis. Sculptures line both sides of the aisle and
// face it. Pure functions, all distances in metres.

export const PLAN = {
  roomWidth: 12,
  roomDepth: 14,
  roomHeight: 5.5,
  wallThickness: 0.4,
  doorWidth: 2.6,
  doorHeight: 3.4,
  aisleOffset: 3.2, // distance from the central axis to each row of sculptures
  plinthMargin: 0.12,
  skylightWidth: 4.5, // roof lantern over each room, centred on the aisle
  skylightLength: 10,
  skylightWell: 1.3, // depth of the light well above the ceiling
};

/** Plinth height that brings a piece towards eye level: low for statues, tall for busts. */
export function plinthHeightFor(sculptureHeight) {
  return Math.min(1.2, Math.max(0.3, 1.5 - sculptureHeight * 0.65));
}

/**
 * @param {{ rooms: Array<{id:string,name:string,wallColor:string}>, sculptures: Array<object> }} gallery
 * @returns {{
 *   rooms: Array<{id:string,name:string,wallColor:string,index:number,centerZ:number,minZ:number,maxZ:number}>,
 *   doors: Array<{z:number}>,
 *   placements: Array<{item:object,room:string,x:number,z:number,yaw:number,plinthHeight:number,halfX:number,halfZ:number}>,
 *   start: {x:number,z:number},
 * }}
 */
export function computeLayout(gallery, plan = PLAN) {
  const pitch = plan.roomDepth + plan.wallThickness;
  const rooms = gallery.rooms.map((room, index) => {
    const centerZ = 0 - index * pitch;
    return {
      ...room,
      index,
      centerZ,
      minZ: centerZ - plan.roomDepth / 2,
      maxZ: centerZ + plan.roomDepth / 2,
    };
  });
  const doors = rooms.slice(1).map((room) => ({ z: room.maxZ + plan.wallThickness / 2 }));

  const placements = [];
  for (const room of rooms) {
    const items = gallery.sculptures.filter((s) => s.room === room.id);
    // Alternate sides so the config order reads left, right, left, right down the room.
    const sides = [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
    sides.forEach((column, sideIndex) => {
      const left = sideIndex === 0;
      column.forEach((item, row) => {
        const z = room.maxZ - ((row + 0.5) * plan.roomDepth) / column.length;
        // A piece facing the aisle is turned 90 degrees, so its width runs along Z.
        const halfWidth = item.base.width / 2 + plan.plinthMargin;
        const halfDepth = item.base.depth / 2 + plan.plinthMargin;
        placements.push({
          item,
          room: room.id,
          x: left ? -plan.aisleOffset : plan.aisleOffset,
          z,
          yaw: left ? Math.PI / 2 : -Math.PI / 2,
          plinthHeight: plinthHeightFor(item.size.height),
          halfX: halfDepth,
          halfZ: halfWidth,
        });
      });
    });
  }

  const start = rooms.length ? { x: 0, z: rooms[0].maxZ - 1.2 } : { x: 0, z: 0 };
  return { rooms, doors, placements, start };
}

/**
 * Floor areas a visitor of the given radius can stand in: each room, shrunk by
 * the radius, plus a corridor through each doorway that overlaps both rooms.
 * @returns {Array<{minX:number,maxX:number,minZ:number,maxZ:number}>}
 */
export function walkableAreas(layout, bodyRadius, plan = PLAN) {
  const halfRoom = plan.roomWidth / 2 - bodyRadius;
  const halfDoor = plan.doorWidth / 2 - bodyRadius;
  const reach = plan.wallThickness / 2 + bodyRadius + 0.05;
  return [
    ...layout.rooms.map((room) => ({
      minX: -halfRoom,
      maxX: halfRoom,
      minZ: room.minZ + bodyRadius,
      maxZ: room.maxZ - bodyRadius,
    })),
    ...layout.doors.map((door) => ({
      minX: -halfDoor,
      maxX: halfDoor,
      minZ: door.z - reach,
      maxZ: door.z + reach,
    })),
  ];
}

/** The room containing a Z coordinate (doorways count as the nearer room). */
export function roomAt(layout, z) {
  let nearest = null;
  let nearestDist = Infinity;
  for (const room of layout.rooms) {
    const dist = Math.abs(z - room.centerZ);
    if (dist < nearestDist) {
      nearest = room;
      nearestDist = dist;
    }
  }
  return nearest;
}
