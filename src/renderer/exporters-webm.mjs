// WebM export: the web build's video format, since a browser can't run ffmpeg (desktop MOV is exporters-mov.js).
// Encodes with WebCodecs (the browser's own VP9 encoder) and muxes with Mediabunny; frames are timed exactly from
// fps and encoding runs faster than real time. Only the web build loads it (wasrtk.js requires it on first use).
// An ES module so the bundler keeps just the parts of Mediabunny used here.
import { Output, WebMOutputFormat, BufferTarget, CanvasSource, QUALITY_HIGH } from 'mediabunny';
import { drawVisibleLayersToContext } from './exporters.js';

export async function saveAsWebm({ filePath, frames, width, height, fps, invoke, createCanvas }) {
  if (typeof VideoEncoder === 'undefined') {
    throw new Error('WebM export needs a browser with WebCodecs: Chrome, Edge, Firefox 130+ or Safari 16.4+.');
  }
  const parsedFps = Number(fps);
  const frameRate = Number.isFinite(parsedFps) && parsedFps > 0 ? parsedFps : 10;

  // VP9 wants even dimensions and odd sizes are common for pixel art, so odd sizes get a 1px empty edge
  // (the MOV export scales instead; a pixel-art frame shouldn't be resampled here).
  const canvas = createCanvas(width + (width % 2), height + (height % 2));
  const ctx = canvas.getContext('2d');
  const output = new Output({ format: new WebMOutputFormat(), target: new BufferTarget() });
  const source = new CanvasSource(canvas, { codec: 'vp9', bitrate: QUALITY_HIGH });
  output.addVideoTrack(source, { frameRate });
  await output.start();

  for (let i = 0; i < frames.length; i++) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawVisibleLayersToContext(ctx, frames[i], { createCanvas });
    await source.add(i / frameRate, 1 / frameRate);
  }
  await output.finalize();

  const result = await invoke('save-file', { filePath, data: new Uint8Array(output.target.buffer) });
  if (!result.success) {
    throw new Error(result.error || 'Failed to save WebM file.');
  }
}
