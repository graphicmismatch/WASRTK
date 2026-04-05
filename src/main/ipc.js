const fs = require('fs');
const { ipcMain, desktopCapturer } = require('electron');
const { THUMBNAIL_SIZE } = require('./constants');
const { loadThemeConfig, saveThemeConfig, resetThemeConfig, getThemeConfigPath } = require('./theme-config');
const { loadPaletteConfig, savePaletteConfig, getPaletteConfigPath } = require('./palette-config');

function mapScreenSource(source) {
  return {
    id: source.id,
    name: source.name,
    thumbnail: source.thumbnail.toDataURL(),
    display_id: source.display_id,
    appIcon: source.appIcon ? source.appIcon.toDataURL() : null
  };
}

async function getScreenSources(types) {
  const sources = await desktopCapturer.getSources({
    types,
    thumbnailSize: THUMBNAIL_SIZE
  });

  return sources.map(mapScreenSource);
}

function registerScreenCaptureHandlers() {
  ipcMain.handle('get-screen-sources', async () => {
    try {
      return await getScreenSources(['screen', 'window']);
    } catch (error) {
      console.error('Error getting screen sources:', error);
      throw error;
    }
  });

  ipcMain.handle('get-screen-sources-fallback', async () => {
    try {
      return await getScreenSources(['screen']);
    } catch (error) {
      console.error('Error getting screen sources (fallback):', error);
      throw error;
    }
  });
}

function registerFileHandlers({ onThemeUpdated, onPalettesUpdated, onOpenPaletteEditor } = {}) {
  function hasValidFilePath(filePath) {
    return typeof filePath === 'string' && filePath.trim().length > 0;
  }

  ipcMain.handle('save-file', async (event, { filePath, data }) => {
    if (!hasValidFilePath(filePath)) {
      return { success: false, canceled: true };
    }

    try {
      fs.writeFileSync(filePath, data);
      return { success: true, path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('read-file', async (event, filePath) => {
    if (!hasValidFilePath(filePath)) {
      return { success: false, error: 'Invalid file path.' };
    }

    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('read-binary-file', async (event, filePath) => {
    if (!hasValidFilePath(filePath)) {
      return { success: false, error: 'Invalid file path.' };
    }

    try {
      const data = fs.readFileSync(filePath);
      return { success: true, data: data.toString('base64') };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('load-theme-config', async () => loadThemeConfig());
  ipcMain.handle('save-theme-config', async (event, theme) => {
    const result = saveThemeConfig(theme);
    if (typeof onThemeUpdated === 'function') {
      onThemeUpdated(result);
    }
    return result;
  });
  ipcMain.handle('reset-theme-config', async () => {
    const result = resetThemeConfig();
    if (typeof onThemeUpdated === 'function') {
      onThemeUpdated(result);
    }
    return result;
  });
  ipcMain.handle('get-theme-config-path', async () => getThemeConfigPath());

  ipcMain.handle('load-palettes-config', async () => loadPaletteConfig());
  ipcMain.handle('save-palettes-config', async (event, palettes) => {
    const result = savePaletteConfig(palettes);
    if (typeof onPalettesUpdated === 'function') {
      onPalettesUpdated(result);
    }
    return result;
  });
  ipcMain.handle('get-palettes-config-path', async () => getPaletteConfigPath());
  ipcMain.handle('open-palette-editor-window', async () => {
    if (typeof onOpenPaletteEditor === 'function') {
      onOpenPaletteEditor();
    }
    return { success: true };
  });
}

module.exports = {
  registerScreenCaptureHandlers,
  registerFileHandlers
};
