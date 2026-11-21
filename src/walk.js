import * as THREE from 'three';
import { PointerLockControls } from 'three/addons/controls/PointerLockControls.js';
import { resolvePosition } from './lib/collision.js';

const EYE_HEIGHT = 1.65;
export const BODY_RADIUS = 0.3;
const WALK_SPEED = 1.6; // m/s, a museum stroll
const RUN_SPEED = 4.2;
const ACCELERATION = 10;

const KEYS = {
  KeyW: [0, -1],
  ArrowUp: [0, -1],
  KeyS: [0, 1],
  ArrowDown: [0, 1],
  KeyA: [-1, 0],
  ArrowLeft: [-1, 0],
  KeyD: [1, 0],
  ArrowRight: [1, 0],
};

/**
 * First-person walking: pointer-lock mouse look, WASD, collision with walls and plinths.
 * @param {Array<object>} areas walkable rectangles, already shrunk by BODY_RADIUS
 * @param {Array<object>} obstacles plinth boxes
 */
export function createWalker(camera, domElement, areas, obstacles) {
  const controls = new PointerLockControls(camera, domElement);
  const pressed = new Set();
  const velocity = new THREE.Vector2();
  const forward = new THREE.Vector3();
  let running = false;

  camera.position.y = EYE_HEIGHT;

  const onKey = (down) => (event) => {
    if (event.code === 'ShiftLeft' || event.code === 'ShiftRight') running = down;
    if (!(event.code in KEYS)) return;
    if (controls.isLocked) event.preventDefault();
    if (down) pressed.add(event.code);
    else pressed.delete(event.code);
  };
  window.addEventListener('keydown', onKey(true));
  window.addEventListener('keyup', onKey(false));
  window.addEventListener('blur', () => pressed.clear());
  controls.addEventListener('unlock', () => pressed.clear());

  function update(dt) {
    let ix = 0;
    let iz = 0;
    if (controls.isLocked) {
      for (const code of pressed) {
        ix += KEYS[code][0];
        iz += KEYS[code][1];
      }
    }
    const len = Math.hypot(ix, iz);
    const speed = running ? RUN_SPEED : WALK_SPEED;

    // Input is in camera space; turn it into a world-space target velocity on the floor.
    camera.getWorldDirection(forward);
    const yaw = Math.atan2(forward.x, forward.z);
    const sin = Math.sin(yaw);
    const cos = Math.cos(yaw);
    let tx = 0;
    let tz = 0;
    if (len > 0) {
      const lx = (ix / len) * speed;
      const lz = (iz / len) * speed;
      tx = -lz * sin - lx * cos;
      tz = -lz * cos + lx * sin;
    }
    const blend = 1 - Math.exp(-ACCELERATION * dt);
    velocity.x += (tx - velocity.x) * blend;
    velocity.y += (tz - velocity.y) * blend;

    const next = resolvePosition(
      { x: camera.position.x + velocity.x * dt, z: camera.position.z + velocity.y * dt },
      areas,
      obstacles,
      BODY_RADIUS,
    );
    camera.position.x = next.x;
    camera.position.z = next.z;
  }

  return { controls, update };
}
