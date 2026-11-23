#!/usr/bin/env node
// Check an exhibition config before spending time on `npm run assets`.
//
//   node check-exhibit.mjs [path/to/sculptures.json] [--offline]
//
// Reads config/sculptures.json (found from the project root) unless a path is given.
// Checks the config's shape, then each object against the SMK API (skipped with
// --offline), then whether each room's pieces fit the floor plan in src/lib/layout.js.
// Exits 1 on errors; warnings are printed but do not fail.
//
// Footprints come from public/gallery.json for pieces already built (the measured
// base of the scan), otherwise from the catalogue's width and depth, which include
// outstretched arms and so overestimate.

import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const API = 'https://api.smk.dk/api/v1/art/';
const OBJECT_NUMBER = /^[A-Za-z0-9._-]+$/; // same rule as scripts/build-assets.mjs
const MAX_STL_MB = 45;
const MIN_GAP = 0.6; // metres of floor a visitor needs between neighbouring plinths
const MIN_AISLE = 1.6; // clear width down the centre of each room
const ROOM_SOFT_MAX = 8;

const args = process.argv.slice(2);
const offline = args.includes('--offline');
const explicit = args.find((a) => !a.startsWith('--'));
const ROOT = findProjectRoot(path.dirname(fileURLToPath(import.meta.url))) ?? findProjectRoot(process.cwd());
if (!ROOT && !explicit) fail('Cannot find the project (a folder with config/sculptures.json). Pass the config path.');
const CONFIG = explicit ? path.resolve(explicit) : path.join(ROOT, 'config', 'sculptures.json');

const errors = [];
const warnings = [];
const error = (m) => errors.push(m);
const warn = (m) => warnings.push(m);

function findProjectRoot(start) {
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'config', 'sculptures.json'))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

function fail(message) {
  console.error(message);
  process.exit(1);
}

async function loadPlan() {
  const file = ROOT && path.join(ROOT, 'src', 'lib', 'layout.js');
  if (file && existsSync(file)) return (await import(pathToFileURL(file).href)).PLAN;
  warn('src/lib/layout.js not found; using the default floor plan');
  return { roomWidth: 12, roomDepth: 14, roomHeight: 5.5, aisleOffset: 3.2, plinthMargin: 0.12 };
}

async function loadBuilt() {
  const file = ROOT && path.join(ROOT, 'public', 'gallery.json');
  if (!file || !existsSync(file)) return new Map();
  const gallery = JSON.parse(await readFile(file, 'utf8'));
  return new Map((gallery.sculptures ?? []).map((s) => [s.objectNumber, s]));
}

function metres(item, type) {
  const d = (item.dimensions ?? []).find((x) => x.type === type);
  const v = Number(d?.value);
  const perMetre = { centimeter: 100, millimeter: 1000, meter: 1 }[d?.unit];
  return v > 0 && perMetre ? v / perMetre : null;
}

async function fetchRecord(objectNumber) {
  const res = await fetch(`${API}?object_number=${encodeURIComponent(objectNumber)}`);
  if (!res.ok) throw new Error(`SMK API ${res.status}`);
  return (await res.json()).items?.[0] ?? null;
}

function checkShape(config) {
  if (!Array.isArray(config.rooms) || !config.rooms.length) error('"rooms" must be a non-empty array');
  if (!Array.isArray(config.sculptures)) error('"sculptures" must be an array');
  if (!Array.isArray(config.lods)) warn('"lods" is missing; the asset pipeline needs it');
  const roomIds = new Set();
  for (const room of config.rooms ?? []) {
    if (!/^[a-z0-9-]+$/.test(room.id ?? '')) error(`room id ${JSON.stringify(room.id)} should be lower-case letters, digits or "-"`);
    if (roomIds.has(room.id)) error(`room id "${room.id}" is used twice`);
    roomIds.add(room.id);
    if (!room.name) error(`room "${room.id}" has no name (shown above its doorway)`);
    else if (room.name.length > 30) warn(`room "${room.id}": name is ${room.name.length} characters; above ~30 it gets cramped over the door`);
    if (!/^#[0-9a-fA-F]{6}$/.test(room.wallColor ?? '')) error(`room "${room.id}": wallColor must be "#rrggbb"`);
  }
  const seen = new Set();
  for (const s of config.sculptures ?? []) {
    const n = s.objectNumber;
    if (!OBJECT_NUMBER.test(n ?? '')) error(`objectNumber ${JSON.stringify(n)} is not accepted by the asset pipeline (no "/" or spaces)`);
    if (seen.has(n)) error(`${n} is listed twice`);
    seen.add(n);
    if (!roomIds.has(s.room)) error(`${n}: room "${s.room}" is not in "rooms"`);
    if (s.up !== undefined && !['x', 'y', 'z', 'auto'].includes(s.up)) error(`${n}: "up" must be x, y, z or auto`);
    if (s.rotateY !== undefined && typeof s.rotateY !== 'number') error(`${n}: "rotateY" must be a number of degrees`);
  }
  for (const id of roomIds) {
    const count = (config.sculptures ?? []).filter((s) => s.room === id).length;
    if (!count) warn(`room "${id}" is empty`);
    if (count > ROOM_SOFT_MAX) warn(`room "${id}" has ${count} pieces; check the fit below`);
  }
}

async function checkRecords(config) {
  const records = new Map();
  const entries = config.sculptures ?? [];
  for (let i = 0; i < entries.length; i += 6) {
    await Promise.all(
      entries.slice(i, i + 6).map(async ({ objectNumber: n }) => {
        try {
          const item = await fetchRecord(n);
          if (!item) return error(`${n}: SMK API has no such object`);
          records.set(n, item);
          const stls = (item.files_3D ?? []).filter((f) => f.mime_type === 'model/stl' && f.file_size > 0);
          if (!stls.length) error(`${n}: no STL in the API (a local "source" file would be needed)`);
          else {
            const mb = Math.min(...stls.map((f) => f.file_size)) / 1e6;
            if (mb > MAX_STL_MB) warn(`${n}: smallest STL is ${mb.toFixed(0)} MB`);
          }
          if (item.public_domain !== true) warn(`${n}: not public domain (${item.rights ?? 'no rights field'})`);
          if (!metres(item, 'højde')) warn(`${n}: no height in the catalogue; it will be scaled as if the STL were in millimetres`);
        } catch (err) {
          error(`${n}: ${err.message}`);
        }
      }),
    );
  }
  return records;
}

/** Mirrors computeLayout: alternate pieces go left and right, spread evenly along each side. */
function checkFit(config, plan, records, built) {
  const wallGap = plan.roomWidth / 2 - plan.aisleOffset;
  for (const room of config.rooms ?? []) {
    const items = (config.sculptures ?? []).filter((s) => s.room === room.id);
    const columns = [items.filter((_, i) => i % 2 === 0), items.filter((_, i) => i % 2 === 1)];
    columns.forEach((column, side) => {
      if (!column.length) return;
      const pitch = plan.roomDepth / column.length;
      for (const s of column) {
        const fp = footprint(s, records, built);
        if (!fp) continue;
        const along = fp.width + 2 * plan.plinthMargin;
        const across = fp.depth + 2 * plan.plinthMargin;
        const source = fp.measured ? 'measured base' : 'catalogue size';
        if (pitch - along < MIN_GAP) {
          warn(`${room.id} ${side ? 'right' : 'left'}: ${s.objectNumber} is ${fp.width.toFixed(2)} m wide (${source}) but gets ${pitch.toFixed(2)} m of wall; move a piece to the other side or another room`);
        }
        if (across / 2 > wallGap) warn(`${room.id}: ${s.objectNumber} is ${fp.depth.toFixed(2)} m deep (${source}) and reaches the wall`);
        if (plan.aisleOffset - across / 2 < MIN_AISLE / 2) warn(`${room.id}: ${s.objectNumber} is ${fp.depth.toFixed(2)} m deep (${source}) and narrows the aisle`);
        if (fp.height && fp.height + 1.2 > plan.roomHeight) warn(`${room.id}: ${s.objectNumber} is ${fp.height.toFixed(2)} m tall; close to the ${plan.roomHeight} m ceiling`);
      }
    });
  }
}

function footprint(s, records, built) {
  const b = built.get(s.objectNumber);
  if (b?.base) return { width: b.base.width, depth: b.base.depth, height: b.size?.height, measured: true };
  const item = records.get(s.objectNumber);
  if (!item) return null;
  const width = metres(item, 'bredde');
  const depth = metres(item, 'dybde');
  if (!width || !depth) return null;
  // A quarter turn swaps which catalogue dimension runs along the wall.
  const turned = Math.abs(((s.rotateY ?? 0) % 180) / 90) === 1;
  return { width: turned ? depth : width, depth: turned ? width : depth, height: metres(item, 'højde'), measured: false };
}

const config = JSON.parse(await readFile(CONFIG, 'utf8'));
checkShape(config);
const plan = await loadPlan();
const built = await loadBuilt();
const records = offline ? new Map() : await checkRecords(config);
checkFit(config, plan, records, built);

const perRoom = (config.rooms ?? []).map((r) => `${r.id} ${(config.sculptures ?? []).filter((s) => s.room === r.id).length}`);
console.log(`${path.relative(process.cwd(), CONFIG) || CONFIG}: ${config.rooms?.length ?? 0} rooms, ${config.sculptures?.length ?? 0} sculptures (${perRoom.join(', ')})`);
const unbuilt = (config.sculptures ?? []).filter((s) => !built.has(s.objectNumber)).map((s) => s.objectNumber);
if (unbuilt.length) console.log(`not built yet: npm run assets -- ${unbuilt.join(' ')}`);
for (const w of warnings) console.log(`warning: ${w}`);
for (const e of errors) console.log(`error:   ${e}`);
console.log(errors.length ? `\n${errors.length} error(s)` : '\nok');
process.exit(errors.length ? 1 : 0);
