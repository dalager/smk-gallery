import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { PLAN } from './lib/layout.js';
import { buildSignage } from './signage.js';
import { buildSkylights } from './skylight.js';
import { createFloorMaterial } from './floor-material.js';
import { createPlankFloor, createPlasterWall, TILE } from './textures.js';

const REVEAL_COLOR = 0xcfcabd;
const PLINTH_COLOR = 0xd9d5cb;
// Daylight from the roof lantern: steeply from above, leaning slightly towards
// the entrance so both rows of sculptures are modelled the same way.
const KEY_OFFSET = new THREE.Vector3(0, 11, 3.5);

/** A wall plane whose texture coordinates are in real units, so plaster looks the same on every panel. */
function wallPanel(width, height, material) {
  const geometry = new THREE.PlaneGeometry(width, height);
  const uv = geometry.attributes.uv;
  for (let i = 0; i < uv.count; i++) {
    uv.setXY(i, (uv.getX(i) * width) / TILE.wall, (uv.getY(i) * height) / TILE.wall);
  }
  const panel = new THREE.Mesh(geometry, material);
  panel.receiveShadow = true;
  return panel;
}

/** One face of a cross wall, optionally with a doorway cut out of the middle. */
function addCrossWall(scene, z, facing, material, withDoor) {
  const { roomWidth, roomHeight, doorWidth, doorHeight } = PLAN;
  const place = (panel, x, y) => {
    panel.position.set(x, y, z);
    panel.rotation.y = facing > 0 ? 0 : Math.PI;
    scene.add(panel);
  };
  if (!withDoor) {
    place(wallPanel(roomWidth, roomHeight, material), 0, roomHeight / 2);
    return;
  }
  const sideWidth = (roomWidth - doorWidth) / 2;
  const sideX = doorWidth / 2 + sideWidth / 2;
  place(wallPanel(sideWidth, roomHeight, material), -sideX, roomHeight / 2);
  place(wallPanel(sideWidth, roomHeight, material), sideX, roomHeight / 2);
  const lintel = roomHeight - doorHeight;
  place(wallPanel(doorWidth, lintel, material), 0, doorHeight + lintel / 2);
}

/** The inside faces of a doorway: two jambs and the underside of the lintel. */
function addDoorReveal(scene, z, material) {
  const { wallThickness, doorWidth, doorHeight } = PLAN;
  for (const side of [-1, 1]) {
    const jamb = wallPanel(wallThickness, doorHeight, material);
    jamb.position.set((side * doorWidth) / 2, doorHeight / 2, z);
    jamb.rotation.y = (-side * Math.PI) / 2;
    scene.add(jamb);
  }
  const soffit = wallPanel(doorWidth, wallThickness, material);
  soffit.position.set(0, doorHeight, z);
  soffit.rotation.x = Math.PI / 2;
  scene.add(soffit);
}

/**
 * Floor, walls, skylit ceiling and lighting for the whole enfilade.
 * @returns {{ lightRoom: (room: object) => void }} call when the visitor changes room
 */
export function buildGallery(scene, renderer, layout) {
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.18;
  scene.background = new THREE.Color(0x14181a);
  pmrem.dispose();

  const { roomWidth, roomDepth, roomHeight, wallThickness } = PLAN;
  const first = layout.rooms[0];
  const last = layout.rooms.at(-1);
  const length = first.maxZ - last.minZ;
  const midZ = (first.maxZ + last.minZ) / 2;

  // Boards run the length of the enfilade, drawing the eye from room to room.
  // The material places the boards and the wear from world position, not UVs.
  const planks = createPlankFloor(renderer.capabilities.getMaxAnisotropy());
  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(roomWidth, length),
    createFloorMaterial(planks, TILE.floor, layout),
  );
  floor.rotation.x = -Math.PI / 2;
  floor.position.z = midZ;
  floor.receiveShadow = true;
  scene.add(floor);

  buildSkylights(scene, layout);
  buildSignage(scene, layout, renderer.capabilities.getMaxAnisotropy());

  const plaster = createPlasterWall();
  const reveal = new THREE.MeshStandardMaterial({ color: REVEAL_COLOR, roughness: 0.9 });
  for (const room of layout.rooms) {
    const material = new THREE.MeshStandardMaterial({
      ...plaster,
      color: room.wallColor,
      bumpScale: 0.45,
      roughness: 0.95,
    });
    for (const side of [-1, 1]) {
      const wall = wallPanel(roomDepth, roomHeight, material);
      wall.position.set((side * roomWidth) / 2, roomHeight / 2, room.centerZ);
      wall.rotation.y = (-side * Math.PI) / 2;
      scene.add(wall);
    }
    // The wall behind the visitor as they enter (+Z end) and the one ahead (-Z end).
    addCrossWall(scene, room.maxZ, -1, material, room !== first);
    addCrossWall(scene, room.minZ, 1, material, room !== last);
  }
  for (const door of layout.doors) addDoorReveal(scene, door.z, reveal);

  scene.add(new THREE.HemisphereLight(0xeef3fb, 0x6b655a, 0.28));

  const key = new THREE.DirectionalLight(0xfff6ea, 1.5);
  key.castShadow = true;
  key.shadow.mapSize.set(4096, 4096);
  const reach = Math.max(roomWidth, roomDepth) / 2 + wallThickness + 2.5;
  key.shadow.camera.left = -reach;
  key.shadow.camera.right = reach;
  key.shadow.camera.top = reach;
  key.shadow.camera.bottom = -reach;
  key.shadow.camera.near = 0.5;
  key.shadow.camera.far = 30;
  key.shadow.bias = -0.0004;
  key.shadow.normalBias = 0.02;
  scene.add(key, key.target);

  const fill = new THREE.DirectionalLight(0xcfe0ff, 0.35);
  fill.position.set(0, 3, -5);
  scene.add(fill);

  // One shadow-casting light serves the whole building: it keeps its direction
  // and simply moves to whichever room the visitor is in.
  function lightRoom(room) {
    key.target.position.set(0, 0, room.centerZ);
    key.position.copy(key.target.position).add(KEY_OFFSET);
    key.target.updateMatrixWorld();
  }
  lightRoom(first);
  return { lightRoom };
}

/** A plinth for one placement, sized to the sculpture's base. */
export function buildPlinth(placement) {
  const plinth = new THREE.Mesh(
    new THREE.BoxGeometry(placement.halfX * 2, placement.plinthHeight, placement.halfZ * 2),
    new THREE.MeshStandardMaterial({ color: PLINTH_COLOR, roughness: 0.85 }),
  );
  plinth.position.set(placement.x, placement.plinthHeight / 2, placement.z);
  plinth.castShadow = true;
  plinth.receiveShadow = true;
  return plinth;
}
