// MOV export through ffmpeg: desktop (Electron) only. Required lazily by wasrtk.js so the web build never loads
// ffmpeg; the web version exports WebM instead (exporters-webm.js).
const path = require('path');
const fs = require('fs');
const os = require('os');
const ffmpeg = require('fluent-ffmpeg');
const { drawVisibleLayersToContext, dataUrlToBytes } = require('./exporters');

// ffmpeg-static's binary can't execute from inside an asar archive;
// electron-builder unpacks it to a sibling ".unpacked" directory in packaged
// builds, so the path needs the same substitution at runtime.
ffmpeg.setFfmpegPath(require('ffmpeg-static').replace('app.asar', 'app.asar.unpacked'));

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
        const buffer = dataUrlToBytes(dataUrl);
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
  saveAsMov
};
