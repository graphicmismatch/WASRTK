const { app } = require('electron');
const { createJsonConfigStore } = require('./json-config-store');

const THEME_FILE_NAME = 'theme.json';

const DEFAULT_THEME = {
  'bg-dark': '#1f1f29',
  'bg-med': '#413a42',
  'bg-light': '#596070',
  'text-light': '#96a2b3',
  'text-muted': '#7c8898',
  accent: '#eaf0d8',
  'accent-contrast': '#1f1f29',
  'canvas-grid': '#413a42',
  'modal-overlay': 'rgba(0, 0, 0, 0.7)',
  'tooltip-bg': '#000000',
  'tooltip-text': '#ffffff',
  'frame-drag-outline': 'rgba(234, 240, 216, 0.35)',
  'brush-preview': 'rgba(255, 255, 255, 0.3)',
  'brush-preview-pixel': 'rgba(255, 255, 255, 0.6)',
  'brush-preview-border': 'rgba(0, 0, 0, 0.8)'
};

function sanitizeTheme(theme) {
  if (!theme || typeof theme !== 'object' || Array.isArray(theme)) {
    return { ...DEFAULT_THEME };
  }

  return Object.keys(DEFAULT_THEME).reduce((accumulator, key) => {
    const value = theme[key];
    accumulator[key] = typeof value === 'string' && value.trim() ? value.trim() : DEFAULT_THEME[key];
    return accumulator;
  }, {});
}

const store = createJsonConfigStore({
  getDir: () => app.getPath('userData'),
  fileName: THEME_FILE_NAME,
  defaults: DEFAULT_THEME,
  sanitize: sanitizeTheme
});

function toThemeResult(result) {
  const output = { theme: result.data, path: result.path };
  if (result.recoveredFromError) {
    output.recoveredFromError = result.recoveredFromError;
  }
  return output;
}

function loadThemeConfig() {
  return toThemeResult(store.load());
}

function saveThemeConfig(theme) {
  return toThemeResult(store.save(theme));
}

function resetThemeConfig() {
  return saveThemeConfig(DEFAULT_THEME);
}

module.exports = {
  DEFAULT_THEME,
  loadThemeConfig,
  saveThemeConfig,
  resetThemeConfig
};
