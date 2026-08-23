const path = require('path');
const fs = require('fs');
const { app } = require('electron');

const THUMBNAIL_SIZE = { width: 150, height: 150 };

// Computed once here instead of re-parsing process.argv at each call site
// that wants to know whether devtools should auto-open. Independent of the
// `--smoke` flag (main.js) -- devtools must never open during a smoke run,
// and `--smoke` must never imply `--dev`.
const isDev = process.argv.includes('--dev');

const FILE_FILTERS = {
  image: [
    { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] },
    { name: 'All Files', extensions: ['*'] }
  ],
  project: [
    { name: 'WASRTK Projects', extensions: ['wasrtk'] },
    { name: 'All Files', extensions: ['*'] }
  ],
  projectSave: [{ name: 'WASRTK Projects', extensions: ['wasrtk'] }],
  animationSave: [
    { name: 'PNG Sequence', extensions: ['png'] },
    { name: 'GIF Animation', extensions: ['gif'] },
    { name: 'MOV Video', extensions: ['mov'] }
  ]
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
      webSecurity: false,
      allowRunningInsecureContent: true
    },
    titleBarStyle: 'default',
    show: false
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
  isDev
};
