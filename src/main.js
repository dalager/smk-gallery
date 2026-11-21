import * as THREE from 'three';
import { buildGallery, buildPlinth } from './room.js';
import { createSculpture } from './sculpture.js';
import { BODY_RADIUS, createWalker } from './walk.js';
import { createLabel } from './label.js';
import { computeLayout, roomAt, walkableAreas } from './lib/layout.js';

const BASE = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(65, window.innerWidth / window.innerHeight, 0.05, 150);

async function loadGallery() {
  const res = await fetch(`${BASE}gallery.json`);
  if (!res.ok) throw new Error(`gallery.json: ${res.status}. Run "npm run assets" first.`);
  const gallery = await res.json();
  if (!gallery.rooms?.length) throw new Error('gallery.json has no rooms');
  return gallery;
}

/** Puts every sculpture on its plinth and returns handles for per-frame updates. */
function placeSculptures(layout) {
  return layout.placements.map((placement) => {
    scene.add(buildPlinth(placement));
    const sculpture = createSculpture(placement.item, BASE);
    sculpture.object.position.set(placement.x, placement.plinthHeight, placement.z);
    sculpture.object.rotation.y = placement.yaw;
    scene.add(sculpture.object);
    return { placement, sculpture };
  });
}

/** `?cam=x,z,yawDegrees` starts the visitor somewhere specific (handy for sharing a view). */
function applyStartPose(layout) {
  camera.position.x = layout.start.x;
  camera.position.z = layout.start.z;
  const raw = new URLSearchParams(location.search).get('cam');
  if (!raw) return;
  const [x, z, yaw = 0] = raw.split(',').map(Number);
  if (![x, z, yaw].every(Number.isFinite)) return;
  camera.position.x = x;
  camera.position.z = z;
  camera.rotation.set(0, THREE.MathUtils.degToRad(yaw), 0, 'YXZ');
}

function createStats(element) {
  let frames = 0;
  let since = performance.now();
  window.addEventListener('keydown', (e) => {
    if (e.code === 'KeyI') element.hidden = !element.hidden;
  });
  return () => {
    frames += 1;
    const now = performance.now();
    if (now - since < 500) return;
    const fps = (frames * 1000) / (now - since);
    frames = 0;
    since = now;
    if (element.hidden) return;
    const { triangles, calls } = renderer.info.render;
    element.textContent = `${fps.toFixed(0)} fps\n${triangles.toLocaleString()} triangles\n${calls} draw calls`;
  };
}

async function start() {
  const layout = computeLayout(await loadGallery());
  const building = buildGallery(scene, renderer, layout);
  const pieces = placeSculptures(layout);
  const obstacles = layout.placements.map(({ x, z, halfX, halfZ }) => ({ x, z, halfX, halfZ }));

  const walker = createWalker(camera, renderer.domElement, walkableAreas(layout, BODY_RADIUS), obstacles);
  applyStartPose(layout);
  const label = createLabel($('label'), layout.placements);
  const tickStats = createStats($('stats'));

  const intro = $('intro');
  const enter = $('enter');
  const status = $('intro-status');
  const roomName = $('room-name');
  enter.addEventListener('click', () => walker.controls.lock());
  walker.controls.addEventListener('lock', () => {
    intro.hidden = true;
    $('crosshair').hidden = false;
  });
  walker.controls.addEventListener('unlock', () => {
    intro.hidden = false;
    $('crosshair').hidden = true;
  });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  let currentRoom = null;
  const forward = new THREE.Vector3();
  const clock = new THREE.Clock();
  renderer.setAnimationLoop(() => {
    const dt = Math.min(clock.getDelta(), 0.1);
    walker.update(dt);

    const room = roomAt(layout, camera.position.z);
    if (room !== currentRoom) {
      currentRoom = room;
      building.lightRoom(room);
      roomName.textContent = `${room.index + 1} · ${room.name}`;
    }
    for (const { placement, sculpture } of pieces) {
      sculpture.update(
        Math.hypot(camera.position.x - placement.x, camera.position.z - placement.z),
      );
    }
    camera.getWorldDirection(forward);
    const flat = Math.hypot(forward.x, forward.z) || 1;
    label.update(camera.position, { x: forward.x / flat, z: forward.z / flat });
    renderer.render(scene, camera);
    tickStats();
  });

  status.textContent = `Loading ${pieces.length} sculptures…`;
  const results = await Promise.allSettled(pieces.map((p) => p.sculpture.ready));
  const failed = results.filter((r) => r.status === 'rejected');
  failed.forEach((r) => console.error(r.reason));
  status.textContent = failed.length
    ? `${pieces.length - failed.length} of ${pieces.length} sculptures loaded`
    : `${pieces.length} sculptures in ${layout.rooms.length} rooms`;
  enter.disabled = false;
}

start().catch((err) => {
  console.error(err);
  $('intro-status').textContent = `Could not start: ${err.message}`;
});
