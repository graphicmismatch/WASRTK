const path = require('path');

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
  const baseName = path.basename(filePath, '.png');

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
      workerScript: './node_modules/gif.js/dist/gif.worker.js',
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

module.exports = {
  getMimeType,
  saveAsPngSequence,
  saveAsGif,
  drawVisibleLayersToContext
};
