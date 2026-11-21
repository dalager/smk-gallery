// Resumable download. The SMK 3D endpoint closes connections after a few MB,
// but it honours Range requests, so we keep asking for "the rest" until done.

import { createWriteStream } from 'node:fs';
import { rename, rm, stat } from 'node:fs/promises';
import { once } from 'node:events';

const MAX_STALLED_ATTEMPTS = 8;
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function appendBody(res, file) {
  const out = createWriteStream(file, { flags: 'a' });
  try {
    for await (const chunk of res.body) {
      if (!out.write(chunk)) await once(out, 'drain');
    }
  } finally {
    out.end();
    await once(out, 'close');
  }
}

/** Total size according to the response: Content-Range for a partial reply, else Content-Length. */
function totalBytes(res) {
  const range = res.headers.get('content-range')?.match(/\/(\d+)$/);
  if (range) return Number(range[1]);
  const length = Number(res.headers.get('content-length'));
  return res.status === 200 && length > 0 ? length : null;
}

/**
 * @param {string} url
 * @param {string} dest final path; a `.part` file next to it holds progress
 */
export async function downloadWithResume(url, dest) {
  const part = `${dest}.part`;
  let total = null; // learned from the server; the API's file_size is not always right
  let stalled = 0;
  for (;;) {
    const have = (await stat(part).catch(() => null))?.size ?? 0;
    if (total !== null && have === total) break;
    if (total !== null && have > total) {
      await rm(part);
      continue;
    }
    try {
      const res = await fetch(url, { headers: have ? { Range: `bytes=${have}-` } : {} });
      if (res.status === 416) {
        // Nothing left to send: a leftover .part from an earlier run is already complete.
        await res.body?.cancel();
        break;
      }
      if (have && res.status !== 206) {
        // Server ignored the range: start over rather than append a full copy.
        await res.body?.cancel();
        await rm(part);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      total = totalBytes(res) ?? total;
      if (total === null) throw new Error('HTTP response without a size');
      await appendBody(res, part);
    } catch (err) {
      if (err.message?.startsWith('HTTP ')) throw new Error(`${url}: ${err.message}`);
      // A dropped connection is expected here; progress is whatever reached the disk.
    }
    const now = (await stat(part).catch(() => null))?.size ?? 0;
    stalled = now > have ? 0 : stalled + 1;
    // Several failures in a row usually means the server wants a pause, so back off.
    if (stalled) await sleep(1000 * stalled);
    if (stalled >= MAX_STALLED_ATTEMPTS) {
      throw new Error(`${url}: no progress after ${stalled} attempts (${now}/${total ?? '?'} bytes)`);
    }
  }
  await rename(part, dest);
}
