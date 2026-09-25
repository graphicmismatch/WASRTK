// Browser stand-in for Electron's ipcRenderer, for the static web build (scripts/build-web.mjs aliases
// 'electron' to this file). It answers the same channels the main process does (src/main/ipc.js), so the
// renderer runs unchanged:
//   - settings (theme, palettes, panel layout, shortcuts) -> localStorage, validated by the same sanitizers
//   - autosave backups -> IndexedDB (web-autosave.js)
//   - reading files -> files the user picked (registerFile), saving -> downloads (several at once -> one .zip)
//   - main -> renderer pushes (menu actions, config updates) -> emit(), and across windows via BroadcastChannel
//
// The config modules below still require('electron') for their desktop stores, which resolves back to this
// file mid-load. That's fine: they only touch `app` inside functions the web build never calls.
const { sanitizeTheme, DEFAULT_THEME } = require('../../main/theme-config');
const { sanitizePalettes } = require('../../main/palette-config');
const { sanitizeLayout, mergePanelsUpdate } = require('../../main/layout-config');
const { sanitizeOverrides } = require('../../main/shortcuts-config');
const autosaves = require('./web-autosave');
const { zipStore } = require('./zip');
const { basename, extname } = require('./web-path');

const STORAGE_PATH = 'browser storage';
const listeners = new Map();
const bus = typeof BroadcastChannel === 'function' ? new BroadcastChannel('wasrtk') : null;

function emit(channel, payload) {
  (listeners.get(channel) || new Set()).forEach((listener) => listener({}, payload));
}

// Like the main process sending to every window: this one, and the palette/theme popups.
function broadcast(channel, payload) {
  emit(channel, payload);
  if (bus) bus.postMessage({ channel, payload });
}

if (bus) bus.onmessage = (e) => emit(e.data.channel, e.data.payload);

// ---- Settings: one localStorage entry each, same result shapes as src/main/*-config.js ----

function configStore(key, defaults, sanitize) {
  const storageKey = `wasrtk:${key}`;
  return {
    load() {
      try {
        const raw = localStorage.getItem(storageKey);
        return { data: sanitize(raw === null ? defaults : JSON.parse(raw)) };
      } catch (error) {
        return { data: sanitize(defaults), recoveredFromError: error.message };
      }
    },
    save(data) {
      const sanitized = sanitize(data);
      localStorage.setItem(storageKey, JSON.stringify(sanitized));
      return { data: sanitized };
    }
  };
}

const theme = configStore('theme', DEFAULT_THEME, sanitizeTheme);
const palettes = configStore('palettes', { palettes: {} }, (raw) => ({ palettes: sanitizePalettes(raw && raw.palettes) }));
const layout = configStore('layout', { panels: {} }, sanitizeLayout);
const shortcuts = configStore('shortcuts', { overrides: {} }, (raw) => ({ overrides: sanitizeOverrides(raw && raw.overrides) }));

const themeResult = (r) => ({ theme: r.data, path: STORAGE_PATH });
const paletteResult = (r) => ({ palettes: r.data.palettes, path: STORAGE_PATH });

// ---- Files: picked files are addressed by a made-up path whose basename is the file's name ----

const pickedFiles = new Map();
let fileCounter = 0;

function registerFile(file) {
  const filePath = `picked/${++fileCounter}/${file.name}`;
  pickedFiles.set(filePath, file);
  return filePath;
}

async function readPicked(filePath, as) {
  if (autosaves.isAutosavePath(filePath)) return autosaves.readAutosave(filePath); // backups are only read as text
  const file = pickedFiles.get(filePath);
  if (!file) throw new Error(`File not found: ${filePath}`);
  if (as === 'text') return file.text();
  const dataUrl = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  return dataUrl.slice(dataUrl.indexOf(',') + 1);
}

const MIME = { '.wasrtk': 'application/json', '.gif': 'image/gif', '.png': 'image/png', '.webm': 'video/webm', '.zip': 'application/zip' };

function download(name, data) {
  const blob = new Blob([data], { type: MIME[extname(name).toLowerCase()] || 'application/octet-stream' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = name;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
  window.__wasrtkLastDownload = { name, size: blob.size }; // for the web smoke test
  return name;
}

const toBytes = (data) => (typeof data === 'string' ? new TextEncoder().encode(data) : data);

// ---- Popup windows (the desktop app's separate BrowserWindows) ----

function openWindow(html, name, width, height) {
  const win = window.open(html, name, `width=${width},height=${height}`);
  if (win) win.focus();
  return { success: Boolean(win) };
}

const handlers = {
  'load-theme-config': () => themeResult(theme.load()),
  'save-theme-config': (data) => { const r = themeResult(theme.save(data)); broadcast('theme-config-updated', r); return r; },
  'reset-theme-config': () => { const r = themeResult(theme.save(DEFAULT_THEME)); broadcast('theme-config-updated', r); return r; },
  'load-palettes-config': () => paletteResult(palettes.load()),
  'save-palettes-config': (data) => { const r = paletteResult(palettes.save({ palettes: data })); broadcast('palette-config-updated', r); return r; },
  'load-layout-config': () => ({ layout: layout.load().data, path: STORAGE_PATH }),
  'save-layout-config': (partial) => ({ layout: layout.save(mergePanelsUpdate(layout.load().data, partial)).data, path: STORAGE_PATH }),
  'load-shortcuts-config': () => ({ overrides: shortcuts.load().data.overrides, path: STORAGE_PATH }),
  'save-shortcuts-config': (overrides) => ({ overrides: shortcuts.save({ overrides }).data.overrides, path: STORAGE_PATH }),

  'read-file': async (filePath) => ({ success: true, data: await readPicked(filePath, 'text') }),
  'read-binary-file': async (filePath) => ({ success: true, data: await readPicked(filePath, 'base64') }),
  'save-file': ({ filePath, data }) => ({ success: true, path: download(basename(filePath), toBytes(data)) }),
  // A PNG sequence: one .zip named after the sequence instead of a download per frame.
  'save-files': ({ zipName, files }) => ({
    success: true,
    path: download(zipName, zipStore(files.map(({ filePath, data }) => ({ name: basename(filePath), data: toBytes(data) }))))
  }),

  'save-autosave': async (data) => ({ success: true, path: await autosaves.writeAutosave(data) }),
  'list-autosaves': () => autosaves.listAutosaves(),

  'open-palette-editor-window': () => openWindow('palette-window.html', 'wasrtk-palette', 820, 760),
  'open-theme-window': () => openWindow('theme-window.html', 'wasrtk-theme', 900, 780)
};

// Channels whose failures come back as { success: false, error }, like the main process's handleWithEnvelope.
const ENVELOPED = new Set(['read-file', 'read-binary-file', 'save-file', 'save-files', 'save-autosave']);

const ipcRenderer = {
  async invoke(channel, ...args) {
    const handler = handlers[channel];
    if (!handler) throw new Error(`No handler registered for '${channel}' in the web build`);
    try {
      return await handler(...args);
    } catch (error) {
      if (ENVELOPED.has(channel)) return { success: false, error: error.message };
      throw error;
    }
  },
  on(channel, listener) {
    if (!listeners.has(channel)) listeners.set(channel, new Set());
    listeners.get(channel).add(listener);
    return ipcRenderer;
  },
  removeListener(channel, listener) {
    (listeners.get(channel) || new Set()).delete(listener);
    return ipcRenderer;
  },
  send(channel, payload) {
    if (channel === 'smoke:result') window.__wasrtkSmoke = payload;
  }
};

module.exports = { ipcRenderer, emit, registerFile };
