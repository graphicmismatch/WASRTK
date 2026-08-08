const { app } = require('electron');
const { createJsonConfigStore } = require('./json-config-store');

const PALETTE_FILE_NAME = 'palettes.json';

function sanitizePaletteEntry(entry) {
  if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
    return null;
  }

  const label = String(entry.label || '').trim();
  if (!label || !Array.isArray(entry.colors)) {
    return null;
  }

  const colors = entry.colors
    .map((color) => String(color || '').trim().toLowerCase())
    .filter((color) => /^#[0-9a-f]{6}$/.test(color));

  if (!colors.length) {
    return null;
  }

  return {
    label,
    colors: [...new Set(colors)]
  };
}

function sanitizePalettes(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return {};
  }

  const sanitized = {};
  Object.entries(input).forEach(([id, entry]) => {
    const key = String(id || '').trim();
    if (!key) {
      return;
    }
    const palette = sanitizePaletteEntry(entry);
    if (!palette) {
      return;
    }
    sanitized[key] = palette;
  });
  return sanitized;
}

// The file (and the store's `defaults`/`sanitize` contract) always deal in
// the wrapped `{ palettes }` shape; the public API here deals in the bare
// palettes map, so the wrapper functions translate between the two.
function sanitizeConfig(raw) {
  return { palettes: sanitizePalettes(raw && raw.palettes) };
}

const store = createJsonConfigStore({
  getDir: () => app.getPath('userData'),
  fileName: PALETTE_FILE_NAME,
  defaults: { palettes: {} },
  sanitize: sanitizeConfig
});

function toPaletteResult(result) {
  const output = { palettes: result.data.palettes, path: result.path };
  if (result.recoveredFromError) {
    output.recoveredFromError = result.recoveredFromError;
  }
  return output;
}

function loadPaletteConfig() {
  return toPaletteResult(store.load());
}

function savePaletteConfig(palettes) {
  return toPaletteResult(store.save({ palettes }));
}

module.exports = {
  loadPaletteConfig,
  savePaletteConfig
};
