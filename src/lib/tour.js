// Scripted "drone" flights through the gallery. Pure maths, no three.js:
// a camera path and a look-at path, both smooth curves through waypoints,
// played back on a timeline that lets each stretch have its own pace.

import { CRUISE_SPEED, ROUTES } from './tour-routes.js';

const FADE_SECONDS = 1.5;
const SAMPLES_PER_SEGMENT = 24;
// A plaque is up from shortly before the camera is aimed at its sculpture until the piece slides out of frame.
const PLAQUE_BEFORE = 2.0; // seconds
const PLAQUE_AFTER = 2.0;

/**
 * Centripetal Catmull-Rom spline through 3D points (Barry-Goldman form).
 * Centripetal spacing keeps the curve from overshooting when waypoints are
 * unevenly spaced, which matters next to door jambs and plinths.
 * @param {number[][]} points
 * @returns {(segment: number, t: number) => number[]} point on segment [i, i+1] at t in [0, 1]
 */
export function catmullRom(points) {
  const knot = (a, b) => Math.max(0.05, Math.sqrt(Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])));
  const mix = (a, b, ta, tb, t) => {
    const w = (t - ta) / (tb - ta);
    return [a[0] + (b[0] - a[0]) * w, a[1] + (b[1] - a[1]) * w, a[2] + (b[2] - a[2]) * w];
  };
  const last = points.length - 1;
  return (segment, t) => {
    const p0 = points[Math.max(0, segment - 1)];
    const p1 = points[segment];
    const p2 = points[Math.min(last, segment + 1)];
    const p3 = points[Math.min(last, segment + 2)];
    const t0 = 0;
    const t1 = t0 + knot(p0, p1);
    const t2 = t1 + knot(p1, p2);
    const t3 = t2 + knot(p2, p3);
    const u = t1 + (t2 - t1) * t;
    const a1 = mix(p0, p1, t0, t1, u);
    const a2 = mix(p1, p2, t1, t2, u);
    const a3 = mix(p2, p3, t2, t3, u);
    const b1 = mix(a1, a2, t0, t2, u);
    const b2 = mix(a2, a3, t1, t3, u);
    return mix(b1, b2, t1, t2, u);
  };
}

/**
 * Smooth, never-reversing interpolation through (x, y) knots with increasing x
 * and non-decreasing y (monotone cubic, Fritsch-Carlson). It starts and ends
 * with zero slope, which is what eases a flight away from rest and back to it;
 * between stretches of different pace it blends the speeds without a jolt.
 * @param {number[]} xs
 * @param {number[]} ys
 * @returns {(x: number) => number}
 */
export function monotoneCurve(xs, ys) {
  const n = xs.length;
  const h = [];
  const slope = [];
  for (let i = 0; i < n - 1; i++) {
    h.push(xs[i + 1] - xs[i]);
    slope.push((ys[i + 1] - ys[i]) / h[i]);
  }
  const tangent = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    if (slope[i - 1] * slope[i] <= 0) continue;
    const w1 = 2 * h[i] + h[i - 1];
    const w2 = h[i] + 2 * h[i - 1];
    tangent[i] = (w1 + w2) / (w1 / slope[i - 1] + w2 / slope[i]);
  }
  return (x) => {
    if (x <= xs[0]) return ys[0];
    if (x >= xs[n - 1]) return ys[n - 1];
    let i = 0;
    while (x > xs[i + 1]) i++;
    const t = (x - xs[i]) / h[i];
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * ys[i] +
      (t3 - 2 * t2 + t) * h[i] * tangent[i] +
      (-2 * t3 + 3 * t2) * ys[i + 1] +
      (t3 - t2) * h[i] * tangent[i + 1]
    );
  };
}

/**
 * @param {object} layout from computeLayout()
 * @param {{ route?: 'grand'|'quick', duration?: number }} [options]
 *   `duration` in seconds stretches or squeezes the whole flight; by default each
 *   route runs at the pace written into its waypoints.
 * @returns {{
 *   duration: number, length: number, waypoints: object[],
 *   sample: (time: number) => { position: number[], look: number[], fade: number, focus: object|null },
 * }}
 */
export function createTourPath(layout, options = {}) {
  const waypoints = (ROUTES[options.route] ?? ROUTES.grand)(layout);
  const cameraAt = catmullRom(waypoints.map((w) => w.camera));
  const lookAt = catmullRom(waypoints.map((w) => w.look));
  const segments = waypoints.length - 1;

  // Distance travelled at evenly spaced curve parameters: turns "how far along"
  // into "where on the curve", so speed is under our control.
  const table = [0];
  let previous = cameraAt(0, 0);
  for (let i = 0; i < segments; i++) {
    for (let s = 1; s <= SAMPLES_PER_SEGMENT; s++) {
      const point = cameraAt(i, s / SAMPLES_PER_SEGMENT);
      const step = Math.hypot(point[0] - previous[0], point[1] - previous[1], point[2] - previous[2]);
      table.push(table.at(-1) + step);
      previous = point;
    }
  }
  const length = table.at(-1);

  // When the camera reaches each waypoint, and how far it has flown by then.
  const times = [0];
  const distances = [0];
  for (let i = 1; i <= segments; i++) {
    const distance = table[i * SAMPLES_PER_SEGMENT];
    const { seconds, speed = CRUISE_SPEED } = waypoints[i];
    times.push(times.at(-1) + (seconds > 0 ? seconds : (distance - distances.at(-1)) / speed));
    distances.push(distance);
  }
  // A route may hold its final view; the flight itself is over by then.
  const natural = times.at(-1) + (waypoints.at(-1).hold ?? 0);
  const duration = options.duration > 0 ? options.duration : natural;
  const stretch = duration / natural;
  const distanceAt = monotoneCurve(times.map((t) => t * stretch), distances);

  /** The sculpture whose plaque is up at a given time, if any. */
  function focusAt(time) {
    for (let i = 0; i < waypoints.length; i++) {
      if (!waypoints[i].focus) continue;
      const at = times[i] * stretch;
      // Never during the opening fade from black.
      const from = Math.max(at - PLAQUE_BEFORE, FADE_SECONDS);
      if (time >= from && time < at + PLAQUE_AFTER) return waypoints[i].focus;
    }
    return null;
  }

  /** Curve parameter (segment index plus fraction) at a given distance along the path. */
  function parameterAt(distance) {
    let lo = 0;
    let hi = table.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (table[mid] <= distance) lo = mid;
      else hi = mid;
    }
    const span = table[hi] - table[lo];
    const index = lo + (span > 0 ? (distance - table[lo]) / span : 0);
    const segment = Math.min(segments - 1, Math.floor(index / SAMPLES_PER_SEGMENT));
    return { segment, t: index / SAMPLES_PER_SEGMENT - segment };
  }

  function sample(time) {
    const clamped = Math.min(duration, Math.max(0, time));
    const { segment, t } = parameterAt(distanceAt(clamped));
    const fade = Math.min(1, clamped / FADE_SECONDS, (duration - clamped) / FADE_SECONDS);
    return {
      position: cameraAt(segment, t),
      look: lookAt(segment, t),
      fade: Math.max(0, fade),
      focus: focusAt(clamped),
    };
  }

  return { duration, length, waypoints, sample };
}
