const fs = require('fs');
const { ipcMain, desktopCapturer } = require('electron');
const { THUMBNAIL_SIZE } = require('./constants');

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

function registerFileHandlers() {
  ipcMain.handle('save-file', async (event, { filePath, data }) => {
    if (!filePath) {
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
    try {
      const data = fs.readFileSync(filePath, 'utf8');
      return { success: true, data };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });

  ipcMain.handle('read-binary-file', async (event, filePath) => {
    try {
      const data = fs.readFileSync(filePath);
      return { success: true, data: data.toString('base64') };
    } catch (error) {
      return { success: false, error: error.message };
    }
  });
}

module.exports = {
  registerScreenCaptureHandlers,
  registerFileHandlers
};
