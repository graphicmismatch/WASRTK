const path = require('path');
const { BrowserWindow, dialog } = require('electron');

function createWindowController({ getWindowOptions, loadFile }) {
  let mainWindow = null;
  let themeWindow = null;

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

  return {
    createWindow,
    getMainWindow,
    sendToRenderer,
    sendThemeUpdate,
    menuAction,
    openThemeSettingsWindow,
    showOpenDialogAndSend,
    showSaveDialogAndSend
  };
}

module.exports = {
  createWindowController
};
