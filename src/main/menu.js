const { app, dialog } = require('electron');
const { FILE_FILTERS } = require('./constants');

function showAboutDialog(getMainWindow) {
  dialog.showMessageBox(getMainWindow(), {
    type: 'info',
    title: 'About WASRTK',
    message: 'WASRTK',
    detail: 'A simple pixel art and animation tool built with Electron.'
  });
}

function buildToolsSubmenu(menuAction) {
  const tools = [
    ['Pen Tool', 'pen'],
    ['Line Tool', 'line'],
    ['Rectangle Tool', 'rectangle'],
    ['Circle Tool', 'circle'],
    ['Fill Tool', 'fill'],
    ['Eraser Tool', 'eraser'],
    ['Selection Tool', 'selection']
  ];

  return tools.map(([label, tool]) => ({
    label,
    click: menuAction('select-tool', tool)
  }));
}

function createMenuTemplate({ menuAction, openAndSend, saveAndSend, getMainWindow, openThemeSettingsWindow, openPaletteEditorWindow }) {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'New Project', accelerator: 'CmdOrCtrl+N', click: menuAction('new-project') },
        {
          label: 'Open Reference Image',
          accelerator: 'CmdOrCtrl+Shift+R',
          click: async () => openAndSend({ filters: FILE_FILTERS.image, channel: 'open-reference-image' })
        },
        {
          label: 'Load Project',
          accelerator: 'CmdOrCtrl+Shift+O',
          click: async () => openAndSend({ filters: FILE_FILTERS.project, channel: 'load-project' })
        },
        {
          label: 'Save Project',
          accelerator: 'CmdOrCtrl+S',
          click: async () => saveAndSend({ filters: FILE_FILTERS.projectSave, channel: 'save-project' })
        },
        {
          label: 'Save Animation',
          accelerator: 'CmdOrCtrl+Shift+S',
          click: async () => saveAndSend({ filters: FILE_FILTERS.animationSave, channel: 'save-animation' })
        },
        { type: 'separator' },
        { label: 'Exit', accelerator: process.platform === 'darwin' ? 'Cmd+Q' : 'Ctrl+Q', click: () => app.quit() }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', click: menuAction('undo') },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', click: menuAction('redo') }
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
        { label: 'Theme Settings', accelerator: 'CmdOrCtrl+Alt+T', click: openThemeSettingsWindow },
        { label: 'Palette Editor', accelerator: 'CmdOrCtrl+Alt+P', click: openPaletteEditorWindow },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Full Screen' }
      ]
    },
    {
      label: 'Animation',
      submenu: [
        { label: 'Add Frame', accelerator: 'F', click: menuAction('add-frame') },
        { label: 'Duplicate Frame', accelerator: 'D', click: menuAction('duplicate-frame') },
        { label: 'Delete Frame', accelerator: 'Delete', click: menuAction('delete-frame') },
        { type: 'separator' },
        { label: 'Play Animation', accelerator: 'Space', click: menuAction('play-animation') },
        { label: 'Stop Animation', accelerator: 'Escape', click: menuAction('stop-animation') }
      ]
    },
    {
      label: 'Layers',
      submenu: [
        { label: 'Move Layer Up', accelerator: 'CmdOrCtrl+Up', click: menuAction('move-layer-up') },
        { label: 'Move Layer Down', accelerator: 'CmdOrCtrl+Down', click: menuAction('move-layer-down') },
        { label: 'Flatten Layer', accelerator: 'CmdOrCtrl+E', click: menuAction('flatten-layer') }
      ]
    },
    {
      label: 'Reference',
      submenu: [
        { label: 'Reset Reference Position', accelerator: 'CmdOrCtrl+R', click: menuAction('reset-reference') },
        { label: 'Toggle Antialiasing', accelerator: 'CmdOrCtrl+A', click: menuAction('toggle-antialiasing') }
      ]
    },
    {
      label: 'Tools',
      submenu: buildToolsSubmenu(menuAction)
    }
  ];

  if (process.platform === 'darwin') {
    template.push({
      label: 'Help',
      submenu: [{ label: 'About WASRTK', click: () => showAboutDialog(getMainWindow) }]
    });
  }

  return template;
}

module.exports = {
  createMenuTemplate
};
