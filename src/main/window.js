const path = require('path');
const { BrowserWindow, dialog } = require('electron');

function createWindowController({ getWindowOptions, loadFile }) {
  let mainWindow = null;
  let themeWindow = null;
  let paletteWindow = null;

  function getMainWindow() {
    return mainWindow;
  }

  function sendToRenderer(channel, payload) {
    if (!mainWindow) {
      return;
    }

    mainWindow.webContents.send(channel, payload);
  }

  function menuAction(channel, payload) {
    return () => sendToRenderer(channel, payload);
  }

  function sendThemeUpdate(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('theme-config-updated', payload);
    }

    if (themeWindow && !themeWindow.isDestroyed()) {
      themeWindow.webContents.send('theme-config-updated', payload);
    }
  }

  function sendPaletteUpdate(payload) {
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('palette-config-updated', payload);
    }

    if (paletteWindow && !paletteWindow.isDestroyed()) {
      paletteWindow.webContents.send('palette-config-updated', payload);
    }
  }

  async function showOpenDialogAndSend({ filters, channel }) {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters
    });

    if (!result.canceled && result.filePaths.length > 0) {
      sendToRenderer(channel, result.filePaths[0]);
    }
  }

  async function showSaveDialogAndSend({ filters, channel }) {
    const result = await dialog.showSaveDialog(mainWindow, { filters });

    if (!result.canceled) {
      sendToRenderer(channel, result.filePath);
    }
  }

  function setupPermissions() {
    mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
      const allowedPermissions = ['media', 'desktop-capture', 'display-capture'];
      callback(allowedPermissions.includes(permission));
    });

    mainWindow.webContents.on('permission-request', (event, webContents, permission, callback) => {
      if (permission === 'desktop-capture' || permission === 'display-capture') {
        callback(true);
      }
    });
  }

  function createWindow() {
    mainWindow = new BrowserWindow(getWindowOptions());
    mainWindow.loadFile(loadFile);

    mainWindow.once('ready-to-show', () => {
      mainWindow.show();
    });

    mainWindow.on('closed', () => {
      mainWindow = null;
    });

    setupPermissions();

    if (process.argv.includes('--dev')) {
      mainWindow.webContents.openDevTools();
    }
  }

  function openThemeSettingsWindow() {
    if (themeWindow && !themeWindow.isDestroyed()) {
      themeWindow.focus();
      return themeWindow;
    }

    themeWindow = new BrowserWindow({
      ...getWindowOptions(),
      width: 900,
      height: 780,
      minWidth: 700,
      minHeight: 640,
      parent: mainWindow || undefined,
      title: 'WASRTK Theme Settings',
      show: false
    });

    themeWindow.removeMenu();
    themeWindow.loadFile(path.resolve(__dirname, '../../theme-window.html'));

    themeWindow.once('ready-to-show', () => {
      themeWindow.show();
    });

    themeWindow.on('closed', () => {
      themeWindow = null;
    });

    if (process.argv.includes('--dev')) {
      themeWindow.webContents.openDevTools({ mode: 'detach' });
    }

    return themeWindow;
  }

  function openPaletteEditorWindow() {
    if (paletteWindow && !paletteWindow.isDestroyed()) {
      paletteWindow.focus();
      return paletteWindow;
    }

    paletteWindow = new BrowserWindow({
      ...getWindowOptions(),
      width: 820,
      height: 760,
      minWidth: 640,
      minHeight: 560,
      parent: mainWindow || undefined,
      title: 'WASRTK Palette Editor',
      show: false
    });

    paletteWindow.removeMenu();
    paletteWindow.loadFile(path.resolve(__dirname, '../../palette-window.html'));

    paletteWindow.once('ready-to-show', () => {
      paletteWindow.show();
    });

    paletteWindow.on('closed', () => {
      paletteWindow = null;
    });

    if (process.argv.includes('--dev')) {
      paletteWindow.webContents.openDevTools({ mode: 'detach' });
    }

    return paletteWindow;
  }

  return {
    createWindow,
    getMainWindow,
    sendToRenderer,
    sendThemeUpdate,
    sendPaletteUpdate,
    menuAction,
    openThemeSettingsWindow,
    openPaletteEditorWindow,
    showOpenDialogAndSend,
    showSaveDialogAndSend
  };
}

module.exports = {
  createWindowController
};
