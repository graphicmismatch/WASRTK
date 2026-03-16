const { BrowserWindow, dialog } = require('electron');

function createWindowController({ getWindowOptions, loadFile }) {
  let mainWindow = null;

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

  return {
    createWindow,
    getMainWindow,
    sendToRenderer,
    menuAction,
    showOpenDialogAndSend,
    showSaveDialogAndSend
  };
}

module.exports = {
  createWindowController
};
