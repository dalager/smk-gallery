import * as THREE from 'three';
import { buildGallery, buildPlinth } from './room.js';
import { createSculpture } from './sculpture.js';
import { BODY_RADIUS, createWalker } from './walk.js';
import { createLabel } from './label.js';
import { computeLayout, roomAt, walkableAreas } from './lib/layout.js';
import { createTourDirector, tourSettings } from './tour.js';

const BASE = import.meta.env.BASE_URL;
const $ = (id) => document.getElementById(id);

const renderer = new THREE.WebGLRenderer({ canvas: $('scene'), antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
const EXPOSURE = 1.05;
renderer.toneMappingExposure = EXPOSURE;

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
  const playButton = $('tour-play');
  const recordButton = $('tour-record');
  const status = $('intro-status');
  const roomName = $('room-name');
  const settings = tourSettings(location.search);
  const routeSelect = $('tour-route');
  routeSelect.value = settings.route;
  routeSelect.addEventListener('change', () => {
    settings.route = routeSelect.value;
  });

  /** Everything that depends on where the camera is, then the render itself. */
  let currentRoom = null;
  const forward = new THREE.Vector3();
  function drawScene() {
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
    if (director.playing) {
      label.show(director.focus); // on a tour the route decides which plaque is up
    } else {
      camera.getWorldDirection(forward);
      const flat = Math.hypot(forward.x, forward.z) || 1;
      label.update(camera.position, { x: forward.x / flat, z: forward.z / flat });
    }
    renderer.render(scene, camera);
  }

  const director = createTourDirector({
    camera,
    renderer,
    layout,
    pieces,
    drawScene,
    exposure: EXPOSURE,
  });
  const clock = new THREE.Clock();
  function loop() {
    const dt = Math.min(clock.getDelta(), 0.1);
    if (director.playing) {
      if (!director.tick()) stopTour();
    } else {
      walker.update(dt);
    }
    drawScene();
    tickStats();
  }

  function playTour() {
    intro.hidden = true;
    director.play(settings);
  }
  function stopTour() {
    director.stop();
    intro.hidden = false;
  }

  let recording = false;
  let cancelRecording = false;
  async function recordTour() {
    if (recording) return;
    recording = true;
    cancelRecording = false;
    for (const button of [enter, playButton, recordButton]) button.disabled = true;
    renderer.setAnimationLoop(null);
    const { width, height, fps } = settings;
    try {
      const result = await director.record({
        ...settings,
        isCancelled: () => cancelRecording,
        onProgress: (fraction) => {
          status.textContent = `Recording ${width}×${height} at ${fps} fps: ${Math.round(fraction * 100)}% (Esc to cancel)`;
        },
      });
      status.textContent = result
        ? `Saved ${(result.blob.size / 1e6).toFixed(1)} MB video (${result.frames} frames, ${result.codec})`
        : 'Recording cancelled';
    } catch (err) {
      console.error(err);
      status.textContent = `Recording failed: ${err.message}`;
    } finally {
      recording = false;
      for (const button of [enter, playButton, recordButton]) button.disabled = false;
      clock.getDelta();
      renderer.setAnimationLoop(loop);
    }
  }

  enter.addEventListener('click', () => walker.controls.lock());
  playButton.addEventListener('click', playTour);
  recordButton.addEventListener('click', recordTour);
  renderer.domElement.addEventListener('click', () => {
    if (director.playing && !recording) stopTour();
  });
  window.addEventListener('keydown', (event) => {
    if (event.code !== 'Escape') return;
    if (recording) cancelRecording = true;
    else if (director.playing) stopTour();
  });
  walker.controls.addEventListener('lock', () => {
    intro.hidden = true;
    $('crosshair').hidden = false;
  });
  walker.controls.addEventListener('unlock', () => {
    intro.hidden = false;
    $('crosshair').hidden = true;
  });

  window.addEventListener('resize', () => {
    if (recording) return; // the canvas is pinned to the video size until the recording ends
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop(loop);

  status.textContent = `Loading ${pieces.length} sculptures…`;
  const results = await Promise.allSettled(pieces.map((p) => p.sculpture.ready));
  const failed = results.filter((r) => r.status === 'rejected');
  failed.forEach((r) => console.error(r.reason));
  status.textContent = failed.length
    ? `${pieces.length - failed.length} of ${pieces.length} sculptures loaded`
    : `${pieces.length} sculptures in ${layout.rooms.length} rooms`;
  for (const button of [enter, playButton, recordButton]) button.disabled = false;

  if (settings.autoRecord) recordTour();
  else if (settings.autoPlay) playTour();
}

start().catch((err) => {
  console.error(err);
  $('intro-status').textContent = `Could not start: ${err.message}`;
});
