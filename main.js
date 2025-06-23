const { app, BrowserWindow, Menu, ipcMain, dialog, desktopCapturer } = require('electron');
const path = require('path');
const fs = require('fs');

let mainWindow;

function createWindow() {
  // Create the browser window with transparency support
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
      allowRunningInsecureContent: true
    },
    titleBarStyle: 'default',
    show: false
  };

  // Add icon if it exists
  const iconPath = path.join(__dirname, 'assets', 'icon.png');
  if (fs.existsSync(iconPath)) {
    windowOptions.icon = iconPath;
  }

  mainWindow = new BrowserWindow(windowOptions);

  // Load the index.html file
  mainWindow.loadFile('index.html');

  // Show window when ready to prevent visual flash
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Handle window closed
  mainWindow.on('closed', () => {
    mainWindow = null;
  });

  // Handle permissions for screen capture
  mainWindow.webContents.session.setPermissionRequestHandler((webContents, permission, callback) => {
    const allowedPermissions = ['media', 'desktop-capture', 'display-capture'];
    if (allowedPermissions.includes(permission)) {
      callback(true);
    } else {
      callback(false);
    }
  });

  // Enable screen capture
  mainWindow.webContents.on('permission-request', (event, webContents, permission, callback) => {
    if (permission === 'desktop-capture' || permission === 'display-capture') {
      callback(true);
    }
  });

  // Open DevTools in development
  if (process.argv.includes('--dev')) {
    mainWindow.webContents.openDevTools();
  }

  // IPC handlers for screen capture
  ipcMain.handle('get-screen-sources', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen', 'window'],
        thumbnailSize: { width: 150, height: 150 }
      });
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        display_id: source.display_id,
        appIcon: source.appIcon ? source.appIcon.toDataURL() : null
      }));
    } catch (error) {
      console.error('Error getting screen sources:', error);
      throw error;
    }
  });

  ipcMain.handle('get-screen-sources-fallback', async () => {
    try {
      const sources = await desktopCapturer.getSources({
        types: ['screen'],
        thumbnailSize: { width: 150, height: 150 }
      });
      return sources.map(source => ({
        id: source.id,
        name: source.name,
        thumbnail: source.thumbnail.toDataURL(),
        display_id: source.display_id,
        appIcon: source.appIcon ? source.appIcon.toDataURL() : null
      }));
    } catch (error) {
      console.error('Error getting screen sources (fallback):', error);
      throw error;
    }
  });
}

// Create menu template
const template = [
  {
    label: 'File',
    submenu: [
      {
        label: 'New Project',
        accelerator: 'CmdOrCtrl+N',
        click: () => {
          mainWindow.webContents.send('new-project');
        }
      },
      {
        label: 'Open Reference Image',
        accelerator: 'CmdOrCtrl+Shift+R',
        click: async () => {
          const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
              { name: 'Images', extensions: ['png', 'jpg', 'jpeg', 'gif', 'bmp'] },
              { name: 'All Files', extensions: ['*'] }
            ]
          });
          
          if (!result.canceled && result.filePaths.length > 0) {
            mainWindow.webContents.send('open-reference-image', result.filePaths[0]);
          }
        }
      },
      {
        label: 'Load Project',
        accelerator: 'CmdOrCtrl+Shift+O',
        click: async () => {
          const result = await dialog.showOpenDialog(mainWindow, {
            properties: ['openFile'],
            filters: [
              { name: 'WASRTK Projects', extensions: ['wasrtk'] },
              { name: 'All Files', extensions: ['*'] }
            ]
          });
          
          if (!result.canceled && result.filePaths.length > 0) {
            mainWindow.webContents.send('load-project', result.filePaths[0]);
          }
        }
      },
      {
        label: 'Save Project',
        accelerator: 'CmdOrCtrl+S',
        click: async () => {
          const result = await dialog.showSaveDialog(mainWindow, {
            filters: [
              { name: 'WASRTK Projects', extensions: ['wasrtk'] }
            ]
          });
          
          if (!result.canceled) {
            mainWindow.webContents.send('save-project', result.filePath);
          }
        }
      },
      {
        label: 'Save Animation',
        accelerator: 'CmdOrCtrl+Shift+S',
        click: async () => {
          const result = await dialog.showSaveDialog(mainWindow, {
            filters: [
              { name: 'PNG Sequence', extensions: ['png'] },
              { name: 'GIF Animation', extensions: ['gif'] }
            ]
          });
          
          if (!result.canceled) {
            mainWindow.webContents.send('save-animation', result.filePath);
          }
        }
      },
      { type: 'separator' },
      {
        label: 'Exit',
        accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q',
        click: () => {
          app.quit();
        }
      }
    ]
  },
  {
    label: 'Edit',
    submenu: [
      {
        label: 'Undo',
        accelerator: 'CmdOrCtrl+Z',
        click: () => {
          mainWindow.webContents.send('undo');
        }
      },
      {
        label: 'Redo',
        accelerator: 'CmdOrCtrl+Y',
        click: () => {
          mainWindow.webContents.send('redo');
        }
      }
    ]
  },
  {
    label: 'View',
    submenu: [
      { role: 'reload', label: 'Reload' },
      { role: 'forceReload', label: 'Force Reload' },
      { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
      { type: 'separator' },
      { role: 'resetZoom', label: 'Actual Size' },
      { role: 'zoomIn', label: 'Zoom In' },
      { role: 'zoomOut', label: 'Zoom Out' },
      { type: 'separator' },
      { role: 'togglefullscreen', label: 'Toggle Full Screen' }
    ]
  },
  {
    label: 'Animation',
    submenu: [
      {
        label: 'Add Frame',
        accelerator: 'F',
        click: () => {
          mainWindow.webContents.send('add-frame');
        }
      },
      {
        label: 'Duplicate Frame',
        accelerator: 'D',
        click: () => {
          mainWindow.webContents.send('duplicate-frame');
        }
      },
      {
        label: 'Delete Frame',
        accelerator: 'Delete',
        click: () => {
          mainWindow.webContents.send('delete-frame');
        }
      },
      { type: 'separator' },
      {
        label: 'Play Animation',
        accelerator: 'Space',
        click: () => {
          mainWindow.webContents.send('play-animation');
        }
      },
      {
        label: 'Stop Animation',
        accelerator: 'Escape',
        click: () => {
          mainWindow.webContents.send('stop-animation');
        }
      }
    ]
  },
  {
    label: 'Layers',
    submenu: [
        {
            label: 'Move Layer Up',
            accelerator: 'CmdOrCtrl+Up',
            click: () => { mainWindow.webContents.send('move-layer-up'); }
        },
        {
            label: 'Move Layer Down',
            accelerator: 'CmdOrCtrl+Down',
            click: () => { mainWindow.webContents.send('move-layer-down'); }
        },
        {
            label: 'Flatten Layer',
            accelerator: 'CmdOrCtrl+E',
            click: () => { mainWindow.webContents.send('flatten-layer'); }
        }
    ]
  },
  {
    label: 'Reference',
    submenu: [
        {
            label: 'Reset Reference Position',
            accelerator: 'CmdOrCtrl+R',
            click: () => { mainWindow.webContents.send('reset-reference'); }
        },
        {
            label: 'Toggle Antialiasing',
            accelerator: 'CmdOrCtrl+A',
            click: () => { mainWindow.webContents.send('toggle-antialiasing'); }
        }
    ]
  },
  {
    label: 'Tools',
    submenu: [
      {
        label: 'Pen Tool',
        click: () => {
          mainWindow.webContents.send('select-tool', 'pen');
        }
      },
      {
        label: 'Line Tool',
        click: () => {
          mainWindow.webContents.send('select-tool', 'line');
        }
      },
      {
        label: 'Rectangle Tool',
        click: () => {
          mainWindow.webContents.send('select-tool', 'rectangle');
        }
      },
      {
        label: 'Circle Tool',
        click: () => {
          mainWindow.webContents.send('select-tool', 'circle');
        }
      },
      {
        label: 'Fill Tool',
        click: () => {
          mainWindow.webContents.send('select-tool', 'fill');
        }
      },
      {
        label: 'Eraser Tool',
        click: () => {
          mainWindow.webContents.send('select-tool', 'eraser');
        }
      },
      {
        label: 'Selection Tool',
        click: () => {
          mainWindow.webContents.send('select-tool', 'selection');
        }
      }
    ]
  }
];

// Add help menu for macOS
if (process.platform === 'darwin') {
  template.push({
    label: 'Help',
    submenu: [
      {
        label: 'About WASRTK',
        click: () => {
          dialog.showMessageBox(mainWindow, {
            type: 'info',
            title: 'About WASRTK',
            message: 'WASRTK',
            detail: 'A simple pixel art and animation tool built with Electron.'
          });
        }
      }
    ]
  });
}

// IPC handlers for file operations
ipcMain.handle('save-file', async (event, { filePath, data }) => {
  if (filePath) {
    try {
      fs.writeFileSync(filePath, data);
      return { success: true, path: filePath };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }
  return { success: false, canceled: true };
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

// App event handlers
app.whenReady().then(() => {
  createWindow();
  
  // Set up menu
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
}); 