const { app } = require('electron');
const { createJsonConfigStore } = require('./json-config-store');

const SHORTCUTS_FILE_NAME = 'shortcuts.json';

// Combo strings are validated loosely here (non-empty string) -- the
// renderer's shortcuts.js is the source of truth for what's a well-formed
// combo and which actionIds are actually rebindable; an override for an
// unknown/non-rebindable actionId is simply ignored by resolveShortcuts.
function sanitizeOverrides(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const sanitized = {};
  Object.entries(input).forEach(([actionId, combo]) => {
    const key = String(actionId || '').trim();
    const value = String(combo || '').trim();
    if (key && value) {
      sanitized[key] = value;
    }
  });
  return sanitized;
}

function sanitizeConfig(raw) {
  return { overrides: sanitizeOverrides(raw && raw.overrides) };
}

const store = createJsonConfigStore({
  getDir: () => app.getPath('userData'),
  fileName: SHORTCUTS_FILE_NAME,
  defaults: { overrides: {} },
  sanitize: sanitizeConfig
});

function toShortcutsResult(result) {
  const output = { overrides: result.data.overrides, path: result.path };
  if (result.recoveredFromError) {
    output.recoveredFromError = result.recoveredFromError;
  }
  return output;
}

function loadShortcutsConfig() {
  return toShortcutsResult(store.load());
}

function saveShortcutsConfig(overrides) {
  return toShortcutsResult(store.save({ overrides }));
}

module.exports = {
  sanitizeOverrides,
  loadShortcutsConfig,
  saveShortcutsConfig
};
