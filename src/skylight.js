import * as THREE from 'three';
import { RectAreaLightUniformsLib } from 'three/addons/lights/RectAreaLightUniformsLib.js';
import { PLAN } from './lib/layout.js';

const CEILING_COLOR = 0xd8d4c8;
const WELL_COLOR = 0xf4f1ea;
const GLAZING_BAR_COLOR = 0x4b4f52;
const DAYLIGHT = 0xeaf2ff;
const BAR = 0.06; // glazing bar thickness

/** A soft blue-to-white sky, bright enough to read as the light source it is. */
function skyTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 4;
  canvas.height = 128;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#bcd6f2');
  gradient.addColorStop(0.6, '#e4eefa');
  gradient.addColorStop(1, '#fbfcff');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** One flat ceiling for the whole building with a rectangular opening over each room. */
function buildCeiling(layout) {
  const { roomWidth, roomHeight, skylightWidth, skylightLength } = PLAN;
  const first = layout.rooms[0];
  const last = layout.rooms.at(-1);
  // Shape coordinates are (world x, world z); the mesh is then turned to face down.
  const shape = new THREE.Shape()
    .moveTo(-roomWidth / 2, last.minZ)
    .lineTo(roomWidth / 2, last.minZ)
    .lineTo(roomWidth / 2, first.maxZ)
    .lineTo(-roomWidth / 2, first.maxZ)
    .closePath();
  for (const room of layout.rooms) {
    const hx = skylightWidth / 2;
    const hz = skylightLength / 2;
    shape.holes.push(
      new THREE.Path()
        .moveTo(-hx, room.centerZ - hz)
        .lineTo(-hx, room.centerZ + hz)
        .lineTo(hx, room.centerZ + hz)
        .lineTo(hx, room.centerZ - hz)
        .closePath(),
    );
  }
  const ceiling = new THREE.Mesh(
    new THREE.ShapeGeometry(shape),
    new THREE.MeshStandardMaterial({ color: CEILING_COLOR, roughness: 1 }),
  );
  ceiling.rotation.x = Math.PI / 2;
  ceiling.position.y = roomHeight;
  return ceiling;
}

/** The light well above one opening: four white walls, glazing bars and the sky beyond. */
function buildLantern(room, materials) {
  const { roomHeight, skylightWidth, skylightLength, skylightWell } = PLAN;
  const group = new THREE.Group();
  group.position.set(0, roomHeight, room.centerZ);

  const walls = [
    { size: skylightLength, x: -skylightWidth / 2, z: 0, turn: Math.PI / 2 },
    { size: skylightLength, x: skylightWidth / 2, z: 0, turn: -Math.PI / 2 },
    { size: skylightWidth, x: 0, z: -skylightLength / 2, turn: 0 },
    { size: skylightWidth, x: 0, z: skylightLength / 2, turn: Math.PI },
  ];
  for (const w of walls) {
    const wall = new THREE.Mesh(new THREE.PlaneGeometry(w.size, skylightWell), materials.well);
    wall.position.set(w.x, skylightWell / 2, w.z);
    wall.rotation.y = w.turn;
    group.add(wall);
  }

  const sky = new THREE.Mesh(new THREE.PlaneGeometry(skylightWidth, skylightLength), materials.sky);
  sky.rotation.x = Math.PI / 2;
  sky.position.y = skylightWell + 0.05;
  group.add(sky);

  // Glazing bars: a ridge along the room and a cross bar roughly every metre.
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(BAR * 1.5, BAR * 1.5, skylightLength), materials.bar);
  ridge.position.y = skylightWell;
  group.add(ridge);
  const panes = Math.round(skylightLength);
  for (let i = 0; i <= panes; i++) {
    const bar = new THREE.Mesh(new THREE.BoxGeometry(skylightWidth, BAR, BAR), materials.bar);
    bar.position.set(0, skylightWell, -skylightLength / 2 + (i * skylightLength) / panes);
    group.add(bar);
  }
  return group;
}

/**
 * Ceiling with a roof lantern over every room, and the daylight that falls
 * through it. Each lantern is a soft area light, which is what gives a
 * top-lit sculpture gallery its even, shadowless fill.
 */
export function buildSkylights(scene, layout) {
  RectAreaLightUniformsLib.init();
  scene.add(buildCeiling(layout));

  const materials = {
    // The well and sky are light sources in their own right, so they ignore scene lighting.
    well: new THREE.MeshBasicMaterial({ color: WELL_COLOR }),
    sky: new THREE.MeshBasicMaterial({ map: skyTexture(), toneMapped: false }),
    bar: new THREE.MeshBasicMaterial({ color: GLAZING_BAR_COLOR }),
  };
  const { roomHeight, skylightWidth, skylightLength, skylightWell } = PLAN;
  for (const room of layout.rooms) {
    scene.add(buildLantern(room, materials));
    const daylight = new THREE.RectAreaLight(DAYLIGHT, 2, skylightWidth, skylightLength);
    daylight.position.set(0, roomHeight + skylightWell * 0.5, room.centerZ);
    daylight.rotation.x = -Math.PI / 2; // shine straight down
    scene.add(daylight);
  }
}
