const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const THUMBNAIL_SIZE = { width: 150, height: 150 };

const FILE_FILTERS = {
  image: [
    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] },
    { name: 'All Files', extensions: ['*'] },
  ],
  project: [
    { name: 'WASRTK Projects', extensions: ['wasrtk'] },
    { name: 'All Files', extensions: ['*'] },
  ],
  projectSave: [{ name: 'WASRTK Projects', extensions: ['wasrtk'] }],
  animationSave: [
    { name: 'PNG Sequence', extensions: ['png'] },
    { name: 'GIF Animation', extensions: ['gif'] },
  ],
};

function getWindowOptions(baseDir) {
  const windowOptions = {
    width: 1400,
    height: 900,
    minWidth: 800,
    minHeight: 600,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false,
      enableRemoteModule: true,
      webSecurity: false,
      allowRunningInsecureContent: true,
    },
    titleBarStyle: 'default',
    show: false,
  };

  const packagedIconPath = path.join(process.resourcesPath, 'assets', 'icon.png');
  const localIconPath = path.join(baseDir, 'assets', 'icon.png');
  const iconPath = app.isPackaged ? packagedIconPath : localIconPath;

  if (fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }

  return windowOptions;
}

module.exports = {
  THUMBNAIL_SIZE,
  FILE_FILTERS,
  getWindowOptions,
};
