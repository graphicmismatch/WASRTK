const fs = require('fs');
const { ipcMain, desktopCapturer } = require('electron');
const { THUMBNAIL_SIZE } = require('./constants');
const { loadThemeConfig, saveThemeConfig, resetThemeConfig } = require('./theme-config');
const { loadPaletteConfig, savePaletteConfig } = require('./palette-config');
const { loadLayoutConfig, saveLayoutConfig } = require('./layout-config');

function mapScreenSource(source) {
  return {
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    display_id: source.display_id,
    appIcon: source.appIcon ? source.appIcon.toDataURL() : null
  };
}

async function getScreenSources(types, { errorLabel = '' } = {}) {
  try {
    const sources = await desktopCapturer.getSources({
      types,
      thumbnailSize: THUMBNAIL_SIZE
    });

    return sources.map(mapScreenSource);
  } catch (error) {
    console.error(`Error getting screen sources${errorLabel}:`, error);
    throw error;
  }
}

function registerScreenCaptureHandlers() {
  ipcMain.handle('get-screen-sources', () => getScreenSources(['screen', 'window']));
  ipcMain.handle('get-screen-sources-fallback', () => getScreenSources(['screen'], { errorLabel: ' (fallback)' }));
}

// Collapses the repeated try/catch -> {success, error} envelope shared by
// the file-read/write handlers below. The guard checks and success-shape
// construction stay per-handler since they differ (e.g. save-file's
// canceled response vs read-file/read-binary-file's error message).
function handleWithEnvelope(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    try {
      return await fn(event, ...args);
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

// Registers the 2-3 channel block shared by the theme and palette config
// stores: `load-<prefix>-config`, `save-<prefix>-config` (broadcasting via
// onUpdated), and an optional `reset-<prefix>-config`.
function registerConfigChannels({ prefix, load, save, reset, onUpdated }) {
  ipcMain.handle(`load-${prefix}-config`, async () => load());

  ipcMain.handle(`save-${prefix}-config`, async (event, data) => {
    const result = save(data);
    if (typeof onUpdated === 'function') {
      onUpdated(result);
    }
    return result;
  });

  if (reset) {
    ipcMain.handle(`reset-${prefix}-config`, async () => {
      const result = reset();
      if (typeof onUpdated === 'function') {
        onUpdated(result);
      }
      return result;
    });
  }
}

function registerFileHandlers({ onThemeUpdated, onPalettesUpdated, onOpenPaletteEditor } = {}) {
  function hasValidFilePath(filePath) {
    return typeof filePath === 'string' && filePath.trim().length > 0;
  }

  handleWithEnvelope('save-file', async (event, { filePath, data }) => {
    if (!hasValidFilePath(filePath)) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(filePath, data);
    return { success: true, path: filePath };
  });

  handleWithEnvelope('read-file', async (event, filePath) => {
    if (!hasValidFilePath(filePath)) {
      return { success: false, error: 'Invalid file path.' };
    }

    const data = fs.readFileSync(filePath, 'utf8');
    return { success: true, data };
  });

  handleWithEnvelope('read-binary-file', async (event, filePath) => {
    if (!hasValidFilePath(filePath)) {
      return { success: false, error: 'Invalid file path.' };
    }

    const data = fs.readFileSync(filePath);
    return { success: true, data: data.toString('base64') };
  });

  registerConfigChannels({
    prefix: 'theme',
    load: loadThemeConfig,
    save: saveThemeConfig,
    reset: resetThemeConfig,
    onUpdated: onThemeUpdated
  });

  registerConfigChannels({
    prefix: 'palettes',
    load: loadPaletteConfig,
    save: savePaletteConfig,
    onUpdated: onPalettesUpdated
  });

  registerConfigChannels({
    prefix: 'layout',
    load: loadLayoutConfig,
    save: saveLayoutConfig
  });

  ipcMain.handle('open-palette-editor-window', async () => {
    if (typeof onOpenPaletteEditor !== 'function') {
      return { success: false };
    }
    onOpenPaletteEditor();
    return { success: true };
  });
}

module.exports = {
  registerScreenCaptureHandlers,
  registerFileHandlers
};
