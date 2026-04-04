const path = require('path');
const { ipcRenderer } = require('electron');
const { initializeThemeSync } = require('./theme');

let paletteEditorColors = [];
let existingPalettes = {};

function normalizeHexColor(value) {
  if (typeof value !== 'string') {
    return null;
  }

  const cleaned = value.trim().replace(/^#/, '').toLowerCase();
  if (/^[0-9a-f]{3}$/.test(cleaned)) {
    return `#${cleaned.split('').map((char) => char + char).join('')}`;
  }
  if (/^[0-9a-f]{6}$/.test(cleaned)) {
    return `#${cleaned}`;
  }

  return null;
}

function dedupeColors(colors) {
  const unique = [];
  const seen = new Set();
  colors.forEach((color) => {
    const normalized = normalizeHexColor(color);
    if (!normalized || seen.has(normalized)) {
      return;
    }
    seen.add(normalized);
    unique.push(normalized);
  });
  return unique;
}

function parseHexLikeText(content) {
  const matches = content.match(/#?[0-9a-fA-F]{6}\b|#?[0-9a-fA-F]{3}\b/g) || [];
  return dedupeColors(matches);
}

function parseGimpPalette(content) {
  const colors = [];
  content.split(/\r?\n/).forEach((line) => {
    if (!line || line.startsWith('#') || line.startsWith('GIMP') || line.startsWith('Name:') || line.startsWith('Columns:')) {
      return;
    }
    const channels = line.trim().split(/\s+/).slice(0, 3).map(Number);
    if (channels.length < 3 || channels.some((value) => Number.isNaN(value))) {
      return;
    }
    const hex = `#${channels.map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`;
    colors.push(hex);
  });
  return dedupeColors(colors);
}

function parseJascPal(content) {
  const lines = content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  if (lines[0] !== 'JASC-PAL') {
    return [];
  }

  const colors = [];
  for (let index = 3; index < lines.length; index += 1) {
    const channels = lines[index].split(/\s+/).map(Number);
    if (channels.length < 3 || channels.some((value) => Number.isNaN(value))) {
      continue;
    }
    const hex = `#${channels.slice(0, 3).map((value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0')).join('')}`;
    colors.push(hex);
  }
  return dedupeColors(colors);
}

function buildPaletteIdFromName(name) {
  const normalized = name.toLowerCase().trim().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  const base = normalized || `palette-${Date.now()}`;
  if (!existingPalettes[base]) {
    return base;
  }
  let suffix = 2;
  while (existingPalettes[`${base}-${suffix}`]) {
    suffix += 1;
  }
  return `${base}-${suffix}`;
}

function renderPaletteEditorSwatches() {
  const container = document.getElementById('paletteEditorSwatches');
  container.innerHTML = '';
  paletteEditorColors.forEach((color, index) => {
    const swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'palette-editor-swatch';
    swatch.style.background = color;
    swatch.title = `${color} (click to remove)`;
    swatch.addEventListener('click', () => {
      paletteEditorColors.splice(index, 1);
      renderPaletteEditorSwatches();
    });
    container.append(swatch);
  });
}

async function persistPalette(name, colors) {
  existingPalettes[buildPaletteIdFromName(name)] = {
    label: name,
    colors: dedupeColors(colors)
  };
  const result = await ipcRenderer.invoke('save-palettes-config', existingPalettes);
  existingPalettes = result.palettes || {};
  document.getElementById('paletteConfigPath').textContent = result.path || 'Unavailable';
}

async function importPaletteFromImageFile(file) {
  const imageUrl = URL.createObjectURL(file);
  const img = await new Promise((resolve, reject) => {
    const instance = new Image();
    instance.onload = () => resolve(instance);
    instance.onerror = () => reject(new Error('Unable to load image for palette extraction.'));
    instance.src = imageUrl;
  });

  const tempCanvas = document.createElement('canvas');
  const maxSize = 200;
  const scale = Math.min(maxSize / img.width, maxSize / img.height, 1);
  tempCanvas.width = Math.max(1, Math.round(img.width * scale));
  tempCanvas.height = Math.max(1, Math.round(img.height * scale));
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.drawImage(img, 0, 0, tempCanvas.width, tempCanvas.height);

  const { data } = tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
  const colorFrequency = new Map();
  for (let index = 0; index < data.length; index += 4) {
    if (data[index + 3] < 10) {
      continue;
    }

    // Reduce noise by quantizing to 5-bit precision per channel.
    const red = Math.round(data[index] / 8) * 8;
    const green = Math.round(data[index + 1] / 8) * 8;
    const blue = Math.round(data[index + 2] / 8) * 8;
    const hex = `#${[red, green, blue].map((channel) => Math.max(0, Math.min(255, channel)).toString(16).padStart(2, '0')).join('')}`;
    colorFrequency.set(hex, (colorFrequency.get(hex) || 0) + 1);
  }
  URL.revokeObjectURL(imageUrl);

  const rankedColors = Array.from(colorFrequency.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([color]) => color);

  const uniqueColors = dedupeColors(rankedColors).slice(0, 64);
  if (!rankedColors.length || !uniqueColors.length) {
    throw new Error('No visible colors could be extracted from this image.');
  }
  const extension = path.extname(file.name || '');
  const baseName = `${path.basename(file.name, extension) || 'Image'} Palette`;
  await persistPalette(baseName, uniqueColors);
}

async function importPaletteFromFile(file) {
  const extension = path.extname(file.name || '').toLowerCase();
  const lowerName = (file.name || '').toLowerCase();
  if (['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'].includes(extension)) {
    await importPaletteFromImageFile(file);
    return;
  }
  if (extension === '.aco' || extension === '.ase' || extension === '.act' || lowerName.includes('photoshop')) {
    throw new Error('Photoshop palette formats are not supported.');
  }

  const text = await file.text();
  if (/^;\s*paint\.net palette file/m.test(text)) {
    throw new Error('Paint.NET palette format is not supported.');
  }

  let colors = [];
  if (extension === '.json') {
    const parsed = JSON.parse(text);
    if (Array.isArray(parsed)) {
      colors = dedupeColors(parsed);
    } else if (Array.isArray(parsed.colors)) {
      colors = dedupeColors(parsed.colors);
    }
  } else if (extension === '.gpl') {
    colors = parseGimpPalette(text);
  } else if (extension === '.pal') {
    colors = parseJascPal(text);
  } else {
    colors = parseHexLikeText(text);
  }

  if (!colors.length) {
    throw new Error('No valid colors were found in this file.');
  }

  const baseName = path.basename(file.name, extension).trim() || 'Imported Palette';
  await persistPalette(baseName, colors);
}

function initializePaletteWindow() {
  document.addEventListener('DOMContentLoaded', async () => {
    await initializeThemeSync();

    const initialData = await ipcRenderer.invoke('load-palettes-config');
    existingPalettes = initialData.palettes || {};
    document.getElementById('paletteConfigPath').textContent = initialData.path || 'Unavailable';

    document.getElementById('addPaletteColorBtn').addEventListener('click', () => {
      const color = normalizeHexColor(document.getElementById('paletteEditorColorInput').value);
      if (!color || paletteEditorColors.includes(color)) {
        return;
      }
      paletteEditorColors.push(color);
      renderPaletteEditorSwatches();
    });

    document.getElementById('clearPaletteEditorBtn').addEventListener('click', () => {
      paletteEditorColors = [];
      renderPaletteEditorSwatches();
    });

    document.getElementById('savePaletteBtn').addEventListener('click', async () => {
      const paletteName = document.getElementById('paletteNameInput').value.trim();
      if (!paletteName) {
        alert('Please provide a palette name.');
        return;
      }
      if (!paletteEditorColors.length) {
        alert('Add at least one color to save a palette.');
        return;
      }

      await persistPalette(paletteName, paletteEditorColors);
      paletteEditorColors = [];
      document.getElementById('paletteNameInput').value = '';
      renderPaletteEditorSwatches();
      alert('Palette saved. It is now available in the main editor palette list.');
    });

    const paletteFileInput = document.getElementById('paletteFileInput');
    document.getElementById('importPaletteFileBtn').addEventListener('click', () => {
      paletteFileInput.value = '';
      paletteFileInput.click();
    });
    paletteFileInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      try {
        await importPaletteFromFile(file);
        alert('Palette imported.');
      } catch (error) {
        alert(error.message);
      }
    });

    const paletteImageInput = document.getElementById('paletteImageInput');
    document.getElementById('importPaletteImageBtn').addEventListener('click', () => {
      paletteImageInput.value = '';
      paletteImageInput.click();
    });
    paletteImageInput.addEventListener('change', async (event) => {
      const file = event.target.files?.[0];
      if (!file) {
        return;
      }
      try {
        await importPaletteFromImageFile(file);
        alert('Palette imported from image.');
      } catch (error) {
        alert(error.message);
      }
    });

    ipcRenderer.on('palette-config-updated', (event, payload) => {
      existingPalettes = payload.palettes || {};
      document.getElementById('paletteConfigPath').textContent = payload.path || 'Unavailable';
    });
  });
}

module.exports = {
  initializePaletteWindow
};
