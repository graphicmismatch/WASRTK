const { app } = require('electron');
const { createJsonConfigStore } = require('./json-config-store');

const LAYOUT_FILE_NAME = 'layout.json';

const DEFAULT_LAYOUT = { colorPanel: null };

function sanitizePosition(position) {
  if (!position || typeof position !== 'object') {
    return null;
  }

  const { top, left } = position;
  return Number.isFinite(top) && Number.isFinite(left) && top >= 0 && left >= 0
    ? { top, left }
    : null;
}

function sanitizeLayout(raw) {
  return { colorPanel: sanitizePosition(raw && raw.colorPanel) };
}

const store = createJsonConfigStore({
  getDir: () => app.getPath('userData'),
  fileName: LAYOUT_FILE_NAME,
  defaults: DEFAULT_LAYOUT,
  sanitize: sanitizeLayout
});

function toLayoutResult(result) {
  const output = { layout: result.data, path: result.path };
  if (result.recoveredFromError) {
    output.recoveredFromError = result.recoveredFromError;
  }
  return output;
}

function loadLayoutConfig() {
  return toLayoutResult(store.load());
}

function saveLayoutConfig(layout) {
  return toLayoutResult(store.save(layout));
}

module.exports = {
  loadLayoutConfig,
  saveLayoutConfig
};
