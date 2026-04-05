const fs = require('fs');
const path = require('path');
const { app } = require('electron');

const PALETTE_FILE_NAME = 'palettes.json';

function getPaletteConfigPath() {
  return path.join(app.getPath('userData'), PALETTE_FILE_NAME);
}

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

function loadPaletteConfig() {
  const configPath = getPaletteConfigPath();
  if (!fs.existsSync(configPath)) {
    return { palettes: {}, path: configPath };
  }

  try {
    const raw = fs.readFileSync(configPath, 'utf8');
    const parsed = JSON.parse(raw);
    return { palettes: sanitizePalettes(parsed.palettes), path: configPath };
  } catch (error) {
    return { palettes: {}, path: configPath, recoveredFromError: error.message };
  }
}

function savePaletteConfig(palettes) {
  const configPath = getPaletteConfigPath();
  const sanitizedPalettes = sanitizePalettes(palettes);
  fs.writeFileSync(configPath, JSON.stringify({ palettes: sanitizedPalettes }, null, 2), 'utf8');
  return { palettes: sanitizedPalettes, path: configPath };
}

module.exports = {
  loadPaletteConfig,
  savePaletteConfig,
  getPaletteConfigPath
};
