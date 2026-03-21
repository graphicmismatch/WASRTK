const path = require('path');
const { app, BrowserWindow, Menu } = require('electron');
const { getWindowOptions } = require('./src/main/constants');
const { registerScreenCaptureHandlers, registerFileHandlers } = require('./src/main/ipc');
const { createMenuTemplate } = require('./src/main/menu');
const { createWindowController } = require('./src/main/window');

const windowController = createWindowController({
  getWindowOptions: () => getWindowOptions(__dirname),
  loadFile: 'index.html'
});

app.whenReady().then(() => {
  windowController.createWindow();

  registerScreenCaptureHandlers();
  registerFileHandlers({ onThemeUpdated: windowController.sendThemeUpdate });

  const menuTemplate = createMenuTemplate({
    menuAction: windowController.menuAction,
    openAndSend: windowController.showOpenDialogAndSend,
    saveAndSend: windowController.showSaveDialogAndSend,
    getMainWindow: windowController.getMainWindow,
    openThemeSettingsWindow: windowController.openThemeSettingsWindow
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowController.createWindow();
  }
});
