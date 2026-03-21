const fs = require('fs');
const path = require('path');
const { app } = require('electron');

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

function getThemeConfigPath() {
  return path.join(app.getPath('userData'), THEME_FILE_NAME);
}

function ensureThemeDirectory() {
  const configPath = getThemeConfigPath();
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  return configPath;
}

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

function loadThemeConfig() {
  const configPath = ensureThemeDirectory();

  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_THEME, null, 2), 'utf8');
    return { theme: { ...DEFAULT_THEME }, path: configPath };
  }

  try {
    const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    const theme = sanitizeTheme(parsed);
    return { theme, path: configPath };
  } catch (error) {
    fs.writeFileSync(configPath, JSON.stringify(DEFAULT_THEME, null, 2), 'utf8');
    return { theme: { ...DEFAULT_THEME }, path: configPath, recoveredFromError: error.message };
  }
}

function saveThemeConfig(theme) {
  const configPath = ensureThemeDirectory();
  const sanitizedTheme = sanitizeTheme(theme);
  fs.writeFileSync(configPath, JSON.stringify(sanitizedTheme, null, 2), 'utf8');
  return { theme: sanitizedTheme, path: configPath };
}

function resetThemeConfig() {
  return saveThemeConfig(DEFAULT_THEME);
}

module.exports = {
  DEFAULT_THEME,
  getThemeConfigPath,
  loadThemeConfig,
  saveThemeConfig,
  resetThemeConfig,
  sanitizeTheme
};
