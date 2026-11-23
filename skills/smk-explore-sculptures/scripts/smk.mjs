#!/usr/bin/env node
// Explore the SMK Open objects that have a 3D scan. No dependencies; Node 18+.
//
//   node smk.mjs types                         # what kinds of object there are, with counts
//   node smk.mjs search [filters]              # a table of matching objects
//   node smk.mjs show KAS385 [KAS66 ...]       # full detail for a few objects
//
// Filters for `search`:
//   --q <text>          words in the title, artist, type, material or original's owner
//   --type <name>       object type, e.g. Statue, Statuegruppe, Buste (case-insensitive, substring)
//   --min-height <cm>   --max-height <cm>
//   --max-mb <n>        smallest STL no bigger than this (default: no limit)
//   --usable            public domain, has a height, STL <= 45 MB, object number without "/"
//   --free-standing     leave out reliefs, heads, busts, masks and fragments
//   --unused            leave out what config/sculptures.json already shows
//   --sort height|mb|number   (default: number)
//   --limit <n>         --json (raw records, for further scripting)
//   --refresh           fetch the list again instead of using the cached copy
//
// The list of 3D objects (about 370) is fetched once and cached in .cache/smk-3d-index.json
// at the project root, or in the current directory when not run from the project.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const API = 'https://api.smk.dk/api/v1/art/';
const PAGE = 100;
const USABLE_MAX_MB = 45;
const NOT_FREE_STANDING = /relief|hoved|buste|maske|fragment|plade|medaljon|portrætmedaljon/i;

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = findProjectRoot(HERE) ?? findProjectRoot(process.cwd()) ?? process.cwd();
const CACHE = path.join(ROOT, '.cache', 'smk-3d-index.json');
const CONFIG = path.join(ROOT, 'config', 'sculptures.json');

function findProjectRoot(start) {
  for (let dir = start; ; dir = path.dirname(dir)) {
    if (existsSync(path.join(dir, 'config', 'sculptures.json'))) return dir;
    if (path.dirname(dir) === dir) return null;
  }
}

async function getJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SMK API ${res.status} for ${url}`);
  return res.json();
}

/** Every object with a 3D file, from cache unless asked to refresh. */
export async function loadIndex({ refresh = false } = {}) {
  if (!refresh && existsSync(CACHE)) return JSON.parse(await readFile(CACHE, 'utf8'));
  const items = [];
  for (let offset = 0; ; offset += PAGE) {
    const url = `${API}search/?keys=*&filters=%5Bhas_3d_file:true%5D&offset=${offset}&rows=${PAGE}`;
    const page = await getJson(url);
    items.push(...page.items);
    if (!page.items.length || items.length >= page.found) break;
  }
  await mkdir(path.dirname(CACHE), { recursive: true });
  await writeFile(CACHE, JSON.stringify(items));
  return items;
}

/** A flat summary of the fields that matter for an exhibition. */
export function summarize(item) {
  const dim = (type) => {
    const d = (item.dimensions ?? []).find((x) => x.type === type);
    const v = Number(d?.value);
    if (!(v > 0)) return null;
    const perCm = { centimeter: 1, millimeter: 0.1, meter: 100 }[d.unit];
    return perCm ? Math.round(v * perCm * 10) / 10 : null;
  };
  const stls = (item.files_3D ?? []).filter((f) => f.mime_type === 'model/stl' && f.file_size > 0);
  const smallest = stls.length ? stls.reduce((a, b) => (a.file_size <= b.file_size ? a : b)) : null;
  const original = item.original?.[0];
  return {
    objectNumber: item.object_number,
    title: item.titles?.[0]?.title ?? '',
    type: item.object_names?.[0]?.name ?? '',
    artist: (item.production ?? []).map((p) => p.creator).filter(Boolean).join('; '),
    date: item.production_date?.[0]?.period ?? original?.production_date_notes?.[0] ?? '',
    heightCm: dim('højde'),
    widthCm: dim('bredde'),
    depthCm: dim('dybde'),
    materials: item.materials ?? [],
    techniques: item.techniques ?? [],
    originalMaterial: original?.technique?.[0] ?? null,
    originalOwner: original?.current_owner?.[0] ?? null,
    publicDomain: item.public_domain === true,
    stlMb: smallest ? Math.round(smallest.file_size / 1e5) / 10 : null,
    stlUrl: smallest?.url ?? null,
    onDisplay: item.on_display === true,
    url: item.frontend_url,
    thumbnail: item.image_thumbnail ?? null,
  };
}

export function usableProblems(s) {
  const problems = [];
  if (!s.publicDomain) problems.push('not public domain');
  if (!s.heightCm) problems.push('no height in catalogue');
  if (s.stlMb == null) problems.push('no STL');
  else if (s.stlMb > USABLE_MAX_MB) problems.push(`STL ${s.stlMb} MB`);
  if (s.objectNumber.includes('/')) problems.push('"/" in object number');
  return problems;
}

async function usedObjectNumbers() {
  if (!existsSync(CONFIG)) return new Set();
  const config = JSON.parse(await readFile(CONFIG, 'utf8'));
  return new Set((config.sculptures ?? []).map((s) => s.objectNumber));
}

function parseArgs(argv) {
  const opts = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) opts._.push(a);
    else if (['usable', 'free-standing', 'unused', 'json', 'refresh'].includes(a.slice(2))) opts[a.slice(2)] = true;
    else opts[a.slice(2)] = argv[++i];
  }
  return opts;
}

const cell = (v, w) => String(v ?? '').slice(0, w).padEnd(w);

function printTable(rows, used) {
  console.log(`${cell('object', 9)} ${cell('type', 15)} ${cell('h cm', 6)} ${cell('MB', 5)} ${cell('PD', 2)} ${cell('title', 44)} artist / original`);
  for (const s of rows) {
    const mark = used.has(s.objectNumber) ? '*' : ' ';
    const who = s.artist || (s.originalOwner ? `orig. ${s.originalOwner}` : '');
    console.log(
      `${cell(s.objectNumber + mark, 9)} ${cell(s.type, 15)} ${cell(s.heightCm, 6)} ${cell(s.stlMb, 5)} ${cell(s.publicDomain ? 'y' : 'n', 2)} ${cell(s.title, 44)} ${who}`,
    );
  }
  console.log(`\n${rows.length} objects${used.size ? '  (* = already in config/sculptures.json)' : ''}`);
}

async function main() {
  const [command = 'help', ...rest] = process.argv.slice(2);
  const opts = parseArgs(rest);
  if (command === 'help' || command === '--help') {
    console.log((await readFile(fileURLToPath(import.meta.url), 'utf8')).split('\n').slice(1, 22).join('\n').replace(/^\/\/ ?/gm, ''));
    return;
  }
  const index = await loadIndex({ refresh: opts.refresh });
  const used = await usedObjectNumbers();

  if (command === 'types') {
    const counts = new Map();
    for (const item of index) {
      const t = item.object_names?.[0]?.name ?? '(none)';
      counts.set(t, (counts.get(t) ?? 0) + 1);
    }
    for (const [t, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`${String(n).padStart(4)}  ${t}`);
    console.log(`\n${index.length} objects with a 3D file`);
    return;
  }

  if (command === 'show') {
    if (!opts._.length) throw new Error('show needs one or more object numbers');
    const byNumber = new Map(index.map((i) => [i.object_number.toUpperCase(), i]));
    const out = [];
    for (const n of opts._) {
      let item = byNumber.get(n.toUpperCase());
      if (!item) item = (await getJson(`${API}?object_number=${encodeURIComponent(n)}`)).items?.[0];
      if (!item) {
        console.error(`${n}: not found`);
        continue;
      }
      const s = summarize(item);
      out.push({ ...s, usableProblems: usableProblems(s), inConfig: used.has(s.objectNumber) });
    }
    console.log(JSON.stringify(out, null, 2));
    return;
  }

  if (command === 'search') {
    const q = opts.q?.toLowerCase();
    let rows = index.map(summarize).filter((s) => {
      if (opts.type && !s.type.toLowerCase().includes(opts.type.toLowerCase())) return false;
      if (opts['min-height'] && !(s.heightCm >= Number(opts['min-height']))) return false;
      if (opts['max-height'] && !(s.heightCm <= Number(opts['max-height']))) return false;
      if (opts['max-mb'] && !(s.stlMb <= Number(opts['max-mb']))) return false;
      if (opts.usable && usableProblems(s).length) return false;
      if (opts['free-standing'] && NOT_FREE_STANDING.test(s.type)) return false;
      if (opts.unused && used.has(s.objectNumber)) return false;
      if (q) {
        const hay = [s.title, s.type, s.artist, s.originalOwner, s.originalMaterial, ...s.materials].join(' ').toLowerCase();
        if (!q.split(/\s+/).every((word) => hay.includes(word))) return false;
      }
      return true;
    });
    const sortKey = { height: (s) => -(s.heightCm ?? 0), mb: (s) => s.stlMb ?? Infinity }[opts.sort];
    rows.sort(sortKey ? (a, b) => sortKey(a) - sortKey(b) : (a, b) => a.objectNumber.localeCompare(b.objectNumber, 'en', { numeric: true }));
    if (opts.limit) rows = rows.slice(0, Number(opts.limit));
    if (opts.json) console.log(JSON.stringify(rows, null, 2));
    else printTable(rows, used);
    return;
  }

  throw new Error(`unknown command "${command}"; try: types, search, show, help`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
