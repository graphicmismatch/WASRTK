const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const { computeGroupMembership, getEffectiveVisibility, getEffectiveLocked } = require('./layer-groups');
const { applyAdjustment } = require('./adjustment-layers');

// ffmpeg-static's binary can't execute from inside an asar archive;
// electron-builder unpacks it to a sibling ".unpacked" directory in packaged
// builds, so the path needs the same substitution at runtime.
ffmpeg.setFfmpegPath(require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked'));

const MIME_TYPES = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.bmp': 'image/bmp'
};

function getMimeType(fileExtension) {
  return MIME_TYPES[String(fileExtension || '').toLowerCase()] || 'application/octet-stream';
}

// Composites a frame's visible layers onto targetCtx, in place, honoring
// opacity, blend mode, and clipToBelow. targetCtx accumulates progressively
// (each layer draws on top of what's already there), which is exactly what
// clipToBelow needs to mask against: "everything composited so far".
//
// `createCanvas` is required whenever the frame has a clipped layer (the
// destination-in mask's scratch canvas) or an adjustment layer
// (applyAdjustment's ctx.filter scratch copy) -- omit it only for frames
// with neither, same as before those needed it.
// `dimLocked` is an editor-only affordance (the 0.5 alpha shown for a locked
// layer on the live canvas) and must stay false for exports/samples, which
// need the true composited result, not an edit-lock indicator.
//
// Group entries (layer-groups.js) are ordinary array members here -- a
// group's own canvas is blank, so drawing it is a harmless no-op. What
// *does* need group awareness is visibility/lock: a member layer is only
// effectively visible if it and its group both are (getEffectiveVisibility),
// and effectively locked -- for dimLocked purposes -- if either is.
//
// Adjustment layers (adjustment-layers.js) are the one entry type that
// *isn't* drawn at all -- their canvas is a blank placeholder too, but
// unlike a group they have real, order-dependent work to do: applyAdjustment
// transforms targetCtx's current accumulated content in place (levels,
// curves, brightness/contrast, hue/saturation), so it has to run in the
// same bottom-up pass as everything else, at the point in the stack where
// the adjustment layer sits.
function drawVisibleLayersToContext(targetCtx, frame, { createCanvas, dimLocked = false } = {}) {
  const layers = Array.isArray(frame?.layers) ? frame.layers : [];
  const membership = computeGroupMembership(layers);

  layers.forEach((layer, index) => {
    if (!getEffectiveVisibility(layers, membership, index)) return;

    if (layer.type === 'adjustment') {
      applyAdjustment(targetCtx, layer, createCanvas);
      return;
    }

    let sourceCanvas = layer.canvas;
    if (layer.clipToBelow) {
      const clipCanvas = createCanvas(targetCtx.canvas.width, targetCtx.canvas.height);
      const clipCtx = clipCanvas.getContext('2d');
      clipCtx.drawImage(layer.canvas, 0, 0);
      clipCtx.globalCompositeOperation = 'destination-in';
      clipCtx.drawImage(targetCtx.canvas, 0, 0);
      sourceCanvas = clipCanvas;
    }

    const opacity = layer.opacity ?? 1;
    targetCtx.globalAlpha = dimLocked && getEffectiveLocked(layers, membership, index) ? opacity * 0.5 : opacity;
    targetCtx.globalCompositeOperation = layer.blendMode || 'source-over';
    targetCtx.drawImage(sourceCanvas, 0, 0);
  });

  targetCtx.globalAlpha = 1;
  targetCtx.globalCompositeOperation = 'source-over';
}

function getFrameDelayMs(fps) {
  const parsedFps = Number(fps);

  if (!Number.isFinite(parsedFps) || parsedFps <= 0) {
    return 100;
  }

  return Math.max(1, Math.round(1000 / parsedFps));
}

async function saveAsPngSequence({ filePath, frames, width, height, invoke, createCanvas }) {
  const dir = path.dirname(filePath);
  const baseName = path.basename(filePath, path.extname(filePath));

  for (let i = 0; i < frames.length; i++) {
    const frame = frames[i];
    const frameNumber = (i + 1).toString().padStart(4, '0');
    const framePath = path.join(dir, `${baseName}-${frameNumber}.png`);

    const tempCanvas = createCanvas(width, height);
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.clearRect(0, 0, width, height);

    drawVisibleLayersToContext(tempCtx, frame, { createCanvas });

    const dataUrl = tempCanvas.toDataURL('image/png');
    const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');

    const result = await invoke('save-file', { filePath: framePath, data: buffer });
    if (!result.success) {
      throw new Error(result.error || `Failed to save frame ${frameNumber}.`);
    }
  }
}

function saveAsGif({ filePath, frames, width, height, fps, invoke, createCanvas, GIF }) {
  return new Promise((resolve, reject) => {
    const frameDelayMs = getFrameDelayMs(fps);

    const gif = new GIF({
      workers: 2,
      quality: 10,
      width,
      height,
      workerScript: './vendor/gif/gif.worker.js',
      transparent: null,
      background: null,
      dither: false
    });

    frames.forEach((frame) => {
      const tempCanvas = createCanvas(width, height);
      const tempCtx = tempCanvas.getContext('2d');
      tempCtx.clearRect(0, 0, width, height);

      drawVisibleLayersToContext(tempCtx, frame, { createCanvas });

      gif.addFrame(tempCanvas, { delay: frameDelayMs });
    });

    gif.on('finished', async (blob) => {
      try {
        const arrayBuffer = await blob.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        const result = await invoke('save-file', { filePath, data: buffer });

        if (!result.success) {
          reject(new Error(result.error || 'Failed to save GIF file.'));
          return;
        }

        resolve();
      } catch (error) {
        reject(error);
      }
    });

    gif.render();
  });
}

function saveAsMov({ filePath, frames, width, height, fps, createCanvas, createFfmpegCommand = ffmpeg }) {
  return new Promise((resolve, reject) => {
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasrtk-mov-'));
    const cleanup = () => fs.rmSync(tempDir, { recursive: true, force: true });

    try {
      frames.forEach((frame, index) => {
        const tempCanvas = createCanvas(width, height);
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.clearRect(0, 0, width, height);
        drawVisibleLayersToContext(tempCtx, frame, { createCanvas });

        const dataUrl = tempCanvas.toDataURL('image/png');
        const buffer = Buffer.from(dataUrl.split(',')[1], 'base64');
        const frameNumber = (index + 1).toString().padStart(4, '0');
        fs.writeFileSync(path.join(tempDir, `frame-${frameNumber}.png`), buffer);
      });
    } catch (error) {
      cleanup();
      reject(error);
      return;
    }

    const parsedFps = Number(fps);
    const frameRate = Number.isFinite(parsedFps) && parsedFps > 0 ? parsedFps : 10;

    createFfmpegCommand()
      .input(path.join(tempDir, 'frame-%04d.png'))
      .inputFPS(frameRate)
      // H.264 requires even dimensions; odd canvas sizes are common for pixel art.
      .videoFilters('scale=trunc(iw/2)*2:trunc(ih/2)*2')
      .videoCodec('libx264')
      .outputOptions(['-pix_fmt yuv420p'])
      .output(filePath)
      .on('end', () => {
        cleanup();
        resolve();
      })
      .on('error', (error) => {
        cleanup();
        reject(error);
      })
      .run();
  });
}

module.exports = {
  getMimeType,
  getFrameDelayMs,
  saveAsPngSequence,
  saveAsGif,
  saveAsMov,
  drawVisibleLayersToContext
};
