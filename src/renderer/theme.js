const { ipcRenderer } = require('electron');

const THEME_FIELDS = [
  { key: 'bg-dark', label: 'Background dark' },
  { key: 'bg-med', label: 'Background medium' },
  { key: 'bg-light', label: 'Background light' },
  { key: 'text-light', label: 'Text' },
  { key: 'text-muted', label: 'Muted text' },
  { key: 'accent', label: 'Accent' },
  { key: 'accent-contrast', label: 'Accent contrast' },
  { key: 'canvas-grid', label: 'Canvas grid' },
  { key: 'modal-overlay', label: 'Modal overlay', type: 'rgba' },
  { key: 'tooltip-bg', label: 'Tooltip background' },
  { key: 'tooltip-text', label: 'Tooltip text' },
  { key: 'frame-drag-outline', label: 'Frame drag outline', type: 'rgba' },
  { key: 'brush-preview', label: 'Brush preview', type: 'rgba' },
  { key: 'brush-preview-pixel', label: 'Brush pixel preview', type: 'rgba' },
  { key: 'brush-preview-border', label: 'Brush preview border', type: 'rgba' }
];

function applyTheme(theme) {
  const rootStyle = document.documentElement.style;
  Object.entries(theme).forEach(([key, value]) => {
    rootStyle.setProperty(`--${key}`, value);
  });
}

async function loadThemeState() {
  const result = await ipcRenderer.invoke('load-theme-config');
  applyTheme(result.theme);
  return result;
}

function initializeThemeSync(onThemeApplied) {
  let currentTheme = null;

  const handleThemeUpdate = (event, payload) => {
    currentTheme = payload.theme;
    applyTheme(payload.theme);
    if (typeof onThemeApplied === 'function') {
      onThemeApplied(payload);
    }
  };

  ipcRenderer.on('theme-config-updated', handleThemeUpdate);

  return loadThemeState().then((payload) => {
    currentTheme = payload.theme;
    if (typeof onThemeApplied === 'function') {
      onThemeApplied(payload);
    }

    return {
      getTheme: () => currentTheme,
      dispose: () => ipcRenderer.removeListener('theme-config-updated', handleThemeUpdate)
    };
  });
}

module.exports = {
  THEME_FIELDS,
  applyTheme,
  loadThemeState,
  initializeThemeSync
};
