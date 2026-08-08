const path = require('path');
const { BrowserWindow, dialog } = require('electron');
const { isDev } = require('./constants');

function createWindowController({ getWindowOptions, loadFile }) {
  let mainWindow = null;
  let themeWindow = null;
  let paletteWindow = null;

  function getMainWindow() {
    return mainWindow;
  }

  function sendToRenderer(channel, payload) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    mainWindow.webContents.send(channel, payload);
  }

  function menuAction(channel, payload) {
    return () => sendToRenderer(channel, payload);
  }

  function broadcastToWindows(windows, channel, payload) {
    windows.forEach((win) => {
      if (win && !win.isDestroyed()) {
        win.webContents.send(channel, payload);
      }
    });
  }

  function sendThemeUpdate(payload) {
    broadcastToWindows([mainWindow, themeWindow], 'theme-config-updated', payload);
  }

  function sendPaletteUpdate(payload) {
    broadcastToWindows([mainWindow, paletteWindow], 'palette-config-updated', payload);
  }

  async function showOpenDialogAndSend({ filters, channel }) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters
    });

    if (!result.canceled && result.filePaths.length > 0) {
      sendToRenderer(channel, result.filePaths[0]);
    }
  }

  async function showSaveDialogAndSend({ filters, channel }) {
    if (!mainWindow || mainWindow.isDestroyed()) {
      return;
    }

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

    if (isDev) {
      mainWindow.webContents.openDevTools();
    }
  }

  // Collapses the near-identical theme/palette editor window setup: focus
  // if already open, else create hidden -> remove menu -> load its html ->
  // show once ready -> clear the reference on close -> open devtools in
  // --dev. `getWindow`/`setWindow` close over the module-scoped
  // `themeWindow`/`paletteWindow` variables so each caller keeps its own
  // window reference.
  function createChildWindow({ getWindow, setWindow, htmlFile, title, width, height, minWidth, minHeight }) {
    const existing = getWindow();
    if (existing && !existing.isDestroyed()) {
      existing.focus();
      return existing;
    }

    const childWindow = new BrowserWindow({
      ...getWindowOptions(),
      width,
      height,
      minWidth,
      minHeight,
      parent: mainWindow || undefined,
      title,
      show: false
    });
    setWindow(childWindow);

    childWindow.removeMenu();
    childWindow.loadFile(path.resolve(__dirname, '../../', htmlFile));

    childWindow.once('ready-to-show', () => {
      childWindow.show();
    });

    childWindow.on('closed', () => {
      setWindow(null);
    });

    if (isDev) {
      childWindow.webContents.openDevTools({ mode: 'detach' });
    }

    return childWindow;
  }

  function openThemeSettingsWindow() {
    return createChildWindow({
      getWindow: () => themeWindow,
      setWindow: (win) => {
        themeWindow = win;
      },
      htmlFile: 'theme-window.html',
      title: 'WASRTK Theme Settings',
      width: 900,
      height: 780,
      minWidth: 700,
      minHeight: 640
    });
  }

  function openPaletteEditorWindow() {
    return createChildWindow({
      getWindow: () => paletteWindow,
      setWindow: (win) => {
        paletteWindow = win;
      },
      htmlFile: 'palette-window.html',
      title: 'WASRTK Palette Editor',
      width: 820,
      height: 760,
      minWidth: 640,
      minHeight: 560
    });
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
