const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');

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

function drawVisibleLayersToContext(targetCtx, frame) {
  const layers = Array.isArray(frame?.layers) ? frame.layers : [];

  layers.forEach((layer) => {
    if (layer.visible) {
      targetCtx.drawImage(layer.canvas, 0, 0);
    }
  });
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

    drawVisibleLayersToContext(tempCtx, frame);

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

      drawVisibleLayersToContext(tempCtx, frame);

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
        drawVisibleLayersToContext(tempCtx, frame);

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
