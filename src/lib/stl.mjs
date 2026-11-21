// Binary STL parsing. Pure, no I/O, so it runs in Node tests and in the pipeline.

const HEADER_BYTES = 80;
const TRIANGLE_BYTES = 50;

/**
 * Parse a binary STL into a flat, non-indexed position array.
 * @param {ArrayBuffer|Uint8Array} input
 * @returns {{ positions: Float32Array, triangleCount: number }} 9 floats per triangle
 */
export function parseBinaryStl(input) {
  const bytes = input instanceof Uint8Array ? input : new Uint8Array(input);
  if (bytes.byteLength < HEADER_BYTES + 4) {
    throw new Error('STL too small to contain a header');
  }
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const triangleCount = view.getUint32(HEADER_BYTES, true);
  const expected = HEADER_BYTES + 4 + triangleCount * TRIANGLE_BYTES;
  if (expected !== bytes.byteLength) {
    throw new Error(
      `Not a binary STL: header says ${triangleCount} triangles (${expected} bytes) ` +
        `but file is ${bytes.byteLength} bytes. ASCII STL is not supported.`,
    );
  }

  const positions = new Float32Array(triangleCount * 9);
  let offset = HEADER_BYTES + 4;
  for (let t = 0; t < triangleCount; t++) {
    offset += 12; // skip the facet normal, it is recomputed later
    for (let i = 0; i < 9; i++) {
      positions[t * 9 + i] = view.getFloat32(offset, true);
      offset += 4;
    }
    offset += 2; // attribute byte count
  }
  return { positions, triangleCount };
}
