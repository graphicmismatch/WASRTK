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
  { key: 'modal-overlay', label: 'Modal overlay', type: 'text' },
  { key: 'tooltip-bg', label: 'Tooltip background' },
  { key: 'tooltip-text', label: 'Tooltip text' },
  { key: 'frame-drag-outline', label: 'Frame drag outline', type: 'text' },
  { key: 'brush-preview', label: 'Brush preview', type: 'text' },
  { key: 'brush-preview-pixel', label: 'Brush pixel preview', type: 'text' },
  { key: 'brush-preview-border', label: 'Brush preview border', type: 'text' }
];

function setThemePath(pathValue) {
  const pathLabel = document.getElementById('themeConfigPath');
  if (pathLabel) {
    pathLabel.textContent = pathValue || 'Unavailable';
  }
}

function applyTheme(theme) {
  const rootStyle = document.documentElement.style;
  Object.entries(theme).forEach(([key, value]) => {
    rootStyle.setProperty(`--${key}`, value);
  });
}

function populateThemeControls(theme) {
  THEME_FIELDS.forEach(({ key }) => {
    const input = document.querySelector(`[data-theme-key="${key}"]`);
    if (input) {
      input.value = theme[key] || '';
    }
  });

  const textarea = document.getElementById('themeConfigEditor');
  if (textarea) {
    textarea.value = JSON.stringify(theme, null, 2);
  }
}

function collectThemeFromControls(currentTheme) {
  return THEME_FIELDS.reduce((accumulator, { key }) => {
    const input = document.querySelector(`[data-theme-key="${key}"]`);
    accumulator[key] = input ? input.value.trim() : currentTheme[key];
    return accumulator;
  }, { ...currentTheme });
}

function buildThemeFieldsMarkup() {
  return THEME_FIELDS.map(({ key, label, type = 'color' }) => `
    <label class="theme-color-field">
      <span>${label}</span>
      <input type="${type}" data-theme-key="${key}">
    </label>
  `).join('');
}

async function loadThemeState() {
  const result = await ipcRenderer.invoke('load-theme-config');
  applyTheme(result.theme);
  populateThemeControls(result.theme);
  setThemePath(result.path);
  return result;
}

function initializeThemeManager(app) {
  document.getElementById('themeFields').innerHTML = buildThemeFieldsMarkup();

  let themeState = null;

  const showEditor = () => app.showModal('themeConfigModal');
  const hideEditor = () => app.hideModal('themeConfigModal');

  document.getElementById('editThemeConfigBtn').addEventListener('click', showEditor);
  document.getElementById('closeThemeConfigBtn').addEventListener('click', hideEditor);
  document.getElementById('saveThemeBtn').addEventListener('click', async () => {
    const updatedTheme = collectThemeFromControls(themeState.theme);
    const result = await ipcRenderer.invoke('save-theme-config', updatedTheme);
    themeState = result;
    applyTheme(result.theme);
    populateThemeControls(result.theme);
    setThemePath(result.path);
    app.updateBrushPreview();
    app.hideModal('themeConfigModal');
  });

  document.getElementById('resetThemeBtn').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('reset-theme-config');
    themeState = result;
    applyTheme(result.theme);
    populateThemeControls(result.theme);
    setThemePath(result.path);
    app.updateBrushPreview();
  });

  document.getElementById('saveThemeConfigFileBtn').addEventListener('click', async () => {
    try {
      const parsedTheme = JSON.parse(document.getElementById('themeConfigEditor').value);
      const result = await ipcRenderer.invoke('save-theme-config', parsedTheme);
      themeState = result;
      applyTheme(result.theme);
      populateThemeControls(result.theme);
      setThemePath(result.path);
      app.updateBrushPreview();
      hideEditor();
    } catch (error) {
      alert(`Invalid theme configuration: ${error.message}`);
    }
  });

  return loadThemeState().then((result) => {
    themeState = result;
  });
}

module.exports = {
  initializeThemeManager
};
