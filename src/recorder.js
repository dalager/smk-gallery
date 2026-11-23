// Renders a camera move to a video file, frame by frame. Each frame is drawn
// for its exact timestamp and only then encoded, so the result is perfectly
// smooth however slow the machine is; it just takes longer to make.

const CODECS = ['avc', 'vp9', 'av1'];

/**
 * @param {object} options
 * @param {HTMLCanvasElement} options.canvas the WebGL canvas, already at the output size
 * @param {number} options.duration seconds
 * @param {number} options.fps
 * @param {(time: number) => Promise<void>} options.drawFrame draws the scene for a timestamp
 * @param {(fraction: number) => void} [options.onProgress]
 * @param {() => boolean} [options.isCancelled]
 * @returns {Promise<{ blob: Blob, extension: string, codec: string, frames: number } | null>} null if cancelled
 */
export async function recordVideo({ canvas, duration, fps, drawFrame, onProgress, isCancelled }) {
  if (typeof VideoEncoder === 'undefined') {
    // Browsers only offer WebCodecs on secure pages: https:// or localhost.
    throw new Error(
      window.isSecureContext
        ? 'This browser cannot encode video. Try a current Chrome or Edge.'
        : 'Recording needs a secure page. Open the gallery via https:// or http://localhost.',
    );
  }
  // Loaded on demand: most visitors never record, so they should not download the encoder.
  const { BufferTarget, CanvasSource, Mp4OutputFormat, Output, Quality, getFirstEncodableVideoCodec } =
    await import('mediabunny');

  const format = new Mp4OutputFormat();
  const supported = format.getSupportedVideoCodecs();
  const codec = await getFirstEncodableVideoCodec(
    CODECS.filter((c) => supported.includes(c)),
    { width: canvas.width, height: canvas.height },
  );
  if (!codec) throw new Error('No usable video encoder in this browser at this size.');

  const output = new Output({ format, target: new BufferTarget() });
  const source = new CanvasSource(canvas, {
    codec,
    bitrate: new Quality('very-high'),
    keyFrameInterval: 2,
  });
  output.addVideoTrack(source, { frameRate: fps });
  await output.start();

  const frames = Math.round(duration * fps);
  for (let i = 0; i < frames; i++) {
    if (isCancelled?.()) {
      await output.cancel();
      return null;
    }
    await drawFrame(i / fps);
    await source.add(i / fps, 1 / fps);
    onProgress?.((i + 1) / frames);
  }
  await output.finalize();
  return {
    blob: new Blob([output.target.buffer], { type: await output.getMimeType() }),
    extension: format.fileExtension,
    codec,
    frames,
  };
}

/** Hands a finished file to the browser's download handling. */
export function saveBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}
