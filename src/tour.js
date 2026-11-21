import * as THREE from 'three';
import { createTourPath } from './lib/tour.js';
import { createFrameCompositor } from './plaque-canvas.js';
import { recordVideo, saveBlob } from './recorder.js';

// In a tour the camera sees whole rooms from a height, so models keep their
// detail much further away than they need to for a visitor on foot.
const TOUR_DETAIL_SCALE = 2.5;

/**
 * Plays the scripted drone flight in real time, or renders it to a video file.
 *
 * @param {object} deps
 * @param {THREE.PerspectiveCamera} deps.camera
 * @param {THREE.WebGLRenderer} deps.renderer
 * @param {object} deps.layout
 * @param {Array<{ sculpture: object }>} deps.pieces
 * @param {() => void} deps.drawScene updates scene state for the current camera and renders
 * @param {number} deps.exposure normal tone-mapping exposure, scaled down during fades
 */
export function createTourDirector({ camera, renderer, layout, pieces, drawScene, exposure }) {
  const target = new THREE.Vector3();
  let saved = null;
  let path = null;
  let startedAt = 0;
  let focus = null;

  function begin({ route, duration }) {
    path = createTourPath(layout, { route, duration });
    saved = { position: camera.position.clone(), quaternion: camera.quaternion.clone() };
    for (const { sculpture } of pieces) sculpture.setDetailScale(TOUR_DETAIL_SCALE);
  }

  function end() {
    if (!saved) return;
    camera.position.copy(saved.position);
    camera.quaternion.copy(saved.quaternion);
    renderer.toneMappingExposure = exposure;
    for (const { sculpture } of pieces) sculpture.setDetailScale(1);
    saved = null;
    path = null;
    focus = null;
  }

  function apply(time) {
    const { position, look, fade, focus: item } = path.sample(time);
    focus = item;
    camera.position.fromArray(position);
    camera.lookAt(target.fromArray(look));
    renderer.toneMappingExposure = exposure * fade * fade;
    return fade;
  }

  return {
    get playing() {
      return saved !== null;
    },

    /** The sculpture whose plaque the tour wants up right now, if any. */
    get focus() {
      return focus;
    },

    play(options) {
      begin(options);
      startedAt = performance.now();
    },

    /** Moves the camera for the current moment. Returns false once the flight is over. */
    tick() {
      const time = (performance.now() - startedAt) / 1000;
      apply(time);
      return time < path.duration;
    },

    stop: end,

    /**
     * Renders the whole flight to a video and offers it as a download.
     * The caller must have paused its own render loop first.
     * @returns {Promise<object|null>} details of the file, or null if cancelled
     */
    async record({ width, height, fps, route, duration, onProgress, isCancelled }) {
      const previous = {
        pixelRatio: renderer.getPixelRatio(),
        size: renderer.getSize(new THREE.Vector2()),
        aspect: camera.aspect,
      };
      begin({ route, duration });
      renderer.setPixelRatio(1);
      renderer.setSize(width, height, false); // keep the on-page size, change only the pixels
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      try {
        const compositor = createFrameCompositor(renderer.domElement, fps);
        const result = await recordVideo({
          canvas: compositor.canvas,
          duration: path.duration,
          fps,
          onProgress,
          isCancelled,
          drawFrame: async (time) => {
            const fade = apply(time);
            // First pass asks for whatever detail this viewpoint needs; once it
            // has arrived, the second pass draws the frame with it in place.
            drawScene();
            await Promise.all(pieces.map(({ sculpture }) => sculpture.settled()));
            drawScene();
            compositor.compose(focus, fade);
          },
        });
        if (result) {
          saveBlob(result.blob, `smk-gallery-${route ?? 'grand'}-tour.${result.extension.replace(/^\./, '')}`);
        }
        return result;
      } finally {
        end();
        renderer.setPixelRatio(previous.pixelRatio);
        renderer.setSize(previous.size.x, previous.size.y, false);
        camera.aspect = previous.aspect;
        camera.updateProjectionMatrix();
      }
    },
  };
}

/**
 * Tour settings from the page address, e.g. `?record&route=quick&size=1280x720&fps=60`.
 * Anything missing or out of range falls back to 1080p, 30 fps and the natural duration.
 */
export function tourSettings(search) {
  const params = new URLSearchParams(search);
  const within = (value, min, max, fallback) => {
    const n = Number(value);
    return Number.isFinite(n) && n >= min && n <= max ? n : fallback;
  };
  const [w, h] = (params.get('size') ?? '').split('x');
  // H.264 needs even dimensions.
  const even = (n) => Math.round(n / 2) * 2;
  return {
    route: params.get('route') === 'quick' ? 'quick' : 'grand',
    autoPlay: params.has('tour'),
    autoRecord: params.has('record'),
    width: even(within(w, 160, 3840, 1920)),
    height: even(within(h, 90, 2160, 1080)),
    fps: within(params.get('fps'), 1, 60, 30),
    duration: within(params.get('duration'), 5, 900, undefined),
  };
}
