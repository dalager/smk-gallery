#!/usr/bin/env node
// Asset pipeline: SMK STL scans -> compressed GLB at several detail levels,
// plus public/gallery.json with the metadata the viewer needs.
//
//   npm run assets                 # everything
//   npm run assets -- KAS385 KAS66 # only these, keeping the rest of gallery.json
//
// Sculptures are listed in config/sculptures.json. `source` is a local STL;
// if it is missing, the smallest STL the SMK API offers is downloaded to .cache/.

import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Document, Logger, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization } from '@gltf-transform/extensions';
import { cloneDocument, meshopt, simplify, weld } from '@gltf-transform/functions';
import { MeshoptEncoder, MeshoptSimplifier } from 'meshoptimizer';
import { downloadWithResume } from './download.mjs';
import { parseBinaryStl } from '../src/lib/stl.mjs';
import {
  computeVertexNormals,
  detectUpAxis,
  normalizeToFloor,
  orientYUp,
  rotateY,
} from '../src/lib/mesh.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const CONFIG = path.join(ROOT, 'config/sculptures.json');
const OUT_DIR = path.join(ROOT, 'public');
const MODEL_DIR = path.join(OUT_DIR, 'models');
const CACHE_DIR = path.join(ROOT, '.cache');
const API = 'https://api.smk.dk/api/v1/art/';
const OBJECT_NUMBER = /^[A-Za-z0-9._-]+$/;

const round = (n, digits = 3) => Number(n.toFixed(digits));
const mb = (bytes) => `${(bytes / 1e6).toFixed(2)} MB`;

async function fetchMetadata(objectNumber) {
  const res = await fetch(`${API}?object_number=${encodeURIComponent(objectNumber)}`);
  if (!res.ok) throw new Error(`SMK API ${res.status} for ${objectNumber}`);
  const item = (await res.json()).items?.[0];
  if (!item) throw new Error(`SMK API has no object ${objectNumber}`);
  return item;
}

function dimensionInMeters(item, type) {
  const dim = (item.dimensions ?? []).find((d) => d.type === type);
  const value = Number(dim?.value);
  if (!(value > 0)) return null;
  const perMeter = { centimeter: 100, millimeter: 1000, meter: 1 }[dim.unit];
  return perMeter ? value / perMeter : null;
}

/** Where the cast's original is, when the object is a cast of something else. */
function originalOf(item) {
  const original = item.original?.[0];
  if (!original) return null;
  return {
    technique: original.technique?.[0] ?? null,
    owner: original.current_owner?.[0] ?? null,
  };
}

async function loadStl(entry, item) {
  const local = path.resolve(ROOT, entry.source ?? '');
  if (entry.source && (await stat(local).catch(() => null))?.isFile()) {
    return { bytes: await readFile(local), origin: entry.source };
  }
  const files = (item.files_3D ?? []).filter((f) => f.mime_type === 'model/stl' && f.file_size > 0);
  if (!files.length) throw new Error(`${entry.objectNumber}: no local STL and none in the API`);
  const smallest = files.reduce((a, b) => (a.file_size <= b.file_size ? a : b));
  const cached = path.join(CACHE_DIR, `${entry.objectNumber}.stl`);
  if (!(await stat(cached).catch(() => null))) {
    console.log(`  downloading ${smallest.url} (${mb(smallest.file_size)})`);
    await mkdir(CACHE_DIR, { recursive: true });
    await downloadWithResume(smallest.url, cached);
  }
  return { bytes: await readFile(cached), origin: smallest.url };
}

async function buildWeldedDocument(positions, name) {
  const doc = new Document().setLogger(new Logger(Logger.Verbosity.WARN));
  const buffer = doc.createBuffer();
  const position = doc.createAccessor().setType('VEC3').setArray(positions).setBuffer(buffer);
  const prim = doc.createPrimitive().setAttribute('POSITION', position);
  const mesh = doc.createMesh(name).addPrimitive(prim);
  doc.createScene(name).addChild(doc.createNode(name).setMesh(mesh));
  await doc.transform(weld());
  return doc;
}

const primitiveOf = (doc) => doc.getRoot().listMeshes()[0].listPrimitives()[0];
const triangleCount = (doc) => primitiveOf(doc).getIndices().getCount() / 3;

async function writeLod(base, lod, file, io) {
  const doc = cloneDocument(base);
  const total = triangleCount(doc);
  if (lod.triangles && lod.triangles < total) {
    await doc.transform(
      simplify({ simplifier: MeshoptSimplifier, ratio: lod.triangles / total, error: 0.01 }),
    );
  }
  const prim = primitiveOf(doc);
  const normals = computeVertexNormals(
    prim.getAttribute('POSITION').getArray(),
    prim.getIndices().getArray(),
  );
  prim.setAttribute(
    'NORMAL',
    doc.createAccessor().setType('VEC3').setArray(normals).setBuffer(doc.getRoot().listBuffers()[0]),
  );
  const triangles = triangleCount(doc);
  await doc.transform(meshopt({ encoder: MeshoptEncoder, level: 'medium' }));
  const glb = await io.writeBinary(doc);
  await writeFile(path.join(MODEL_DIR, file), glb);
  return {
    name: lod.name,
    file: `models/${file}`,
    triangles,
    bytes: glb.byteLength,
    distance: lod.distance,
    loadWithin: lod.loadWithin ?? null,
  };
}

async function processSculpture(entry, lodConfig, io) {
  if (!OBJECT_NUMBER.test(entry.objectNumber ?? '')) {
    throw new Error(`Invalid objectNumber in config: ${JSON.stringify(entry.objectNumber)}`);
  }
  console.log(`\n${entry.objectNumber}`);
  const item = await fetchMetadata(entry.objectNumber);
  const { bytes, origin } = await loadStl(entry, item);
  const { positions, triangleCount: sourceTriangles } = parseBinaryStl(bytes);

  const heightMeters = dimensionInMeters(item, 'højde');
  const catalogue = {
    height: heightMeters,
    width: dimensionInMeters(item, 'bredde'),
    depth: dimensionInMeters(item, 'dybde'),
  };
  const up = !entry.up || entry.up === 'auto' ? detectUpAxis(positions, catalogue) : entry.up;
  orientYUp(positions, up);
  rotateY(positions, entry.rotateY ?? 0);
  const { size, base, scale } = normalizeToFloor(positions, { heightMeters });
  if (!heightMeters) console.warn('  no height in the API, assuming the STL is in millimetres');
  console.log(
    `  ${origin}: ${sourceTriangles} triangles, ${mb(bytes.byteLength)}, up=${up}, ` +
      `scale=${scale.toPrecision(4)} -> ${size.width.toFixed(2)} x ${size.height.toFixed(2)} x ${size.depth.toFixed(2)} m`,
  );

  const welded = await buildWeldedDocument(positions, entry.objectNumber);
  const lods = [];
  for (const lod of lodConfig) {
    const result = await writeLod(welded, lod, `${entry.objectNumber}-${lod.name}.glb`, io);
    console.log(`  ${result.file}: ${result.triangles} triangles, ${mb(result.bytes)}`);
    lods.push(result);
  }

  return {
    objectNumber: item.object_number,
    room: entry.room ?? null,
    title: item.titles?.[0]?.title ?? item.object_number,
    artists: (item.production ?? []).map((p) => p.creator).filter(Boolean),
    heightCm: heightMeters ? round(heightMeters * 100, 1) : null,
    techniques: item.techniques ?? [],
    materials: item.materials ?? [],
    original: originalOf(item),
    publicDomain: item.public_domain === true,
    rights: item.rights ?? null,
    url: item.frontend_url ?? null,
    thumbnail: item.image_thumbnail ?? null,
    size: { width: round(size.width), height: round(size.height), depth: round(size.depth) },
    base: { width: round(base.width), depth: round(base.depth) },
    lods,
  };
}

async function main() {
  const config = JSON.parse(await readFile(CONFIG, 'utf8'));
  await mkdir(MODEL_DIR, { recursive: true });
  await Promise.all([MeshoptEncoder.ready, MeshoptSimplifier.ready]);
  const io = new NodeIO()
    .registerExtensions([EXTMeshoptCompression, KHRMeshQuantization])
    .registerDependencies({ 'meshopt.encoder': MeshoptEncoder });

  const out = path.join(OUT_DIR, 'gallery.json');
  const only = new Set(process.argv.slice(2));
  const previous = only.size
    ? JSON.parse(await readFile(out, 'utf8').catch(() => '{"sculptures":[]}')).sculptures
    : [];
  const sculptures = [];
  for (const entry of config.sculptures) {
    if (only.size && !only.has(entry.objectNumber)) {
      const kept = previous.find((s) => s.objectNumber === entry.objectNumber);
      if (kept) sculptures.push({ ...kept, room: entry.room ?? null });
      continue;
    }
    sculptures.push(await processSculpture(entry, config.lods, io));
  }
  await writeFile(out, `${JSON.stringify({ rooms: config.rooms ?? [], sculptures }, null, 2)}\n`);
  console.log(`\nwrote ${path.relative(ROOT, out)} (${sculptures.length} sculpture(s))`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
