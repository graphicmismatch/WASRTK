const { app } = require('electron');
const { createJsonConfigStore } = require('./json-config-store');

const LAYOUT_FILE_NAME = 'layout.json';

// Generalized panel-id -> {top, left, width, height} position/size map
// (item 7's job -- item 6 left this as two hardcoded top-level keys,
// colorPanel/historyPanel, since generalizing it wasn't item 6's to do).
const DEFAULT_LAYOUT = { panels: {} };

// A panel's persisted state: any of top/left/width/height that are valid
// non-negative numbers are kept independently (a panel that's only been
// dragged, never resized, has no width/height yet, and vice versa). An
// entirely-invalid/empty state sanitizes to null (dropped).
function sanitizePanelState(state) {
  if (!state || typeof state !== 'object') {
    return null;
  }

  const sanitized = {};
  for (const key of ['top', 'left', 'width', 'height']) {
    const value = state[key];
    if (Number.isFinite(value) && value >= 0) {
      sanitized[key] = value;
    }
  }
  return Object.keys(sanitized).length > 0 ? sanitized : null;
}

function sanitizeLayout(raw) {
  const rawPanels = (raw && typeof raw.panels === 'object' && raw.panels) || {};
  const panels = {};
  for (const [id, state] of Object.entries(rawPanels)) {
    const sanitized = sanitizePanelState(state);
    if (sanitized) {
      panels[id] = sanitized;
    }
  }
  return { panels };
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

// Merges a partial { panels: { [id]: {...} } } update onto the currently
// stored layout instead of replacing it wholesale. Each panel saves its
// own position/size independently (floating-panel.js's onPositionChange/
// onSizeChange each fire with just their own panel's id), so a plain
// replace-on-save would silently wipe out every OTHER panel's already-
// saved state on each call -- exactly what happened before this merge
// was added, the first time a second panel (historyPanel) existed to
// notice it on. Pure and exported separately from saveLayoutConfig so the
// merge behavior itself -- the actual fix -- is unit-testable without a
// real store/Electron app, matching every other function here being
// hardwired to app.getPath('userData') and so untestable in isolation.
function mergePanelsUpdate(currentLayout, partialLayout) {
  const incomingPanels = (partialLayout && partialLayout.panels) || {};
  return {
    panels: { ...(currentLayout && currentLayout.panels), ...incomingPanels }
  };
}

function saveLayoutConfig(partialLayout) {
  const current = store.load().data;
  return toLayoutResult(store.save(mergePanelsUpdate(current, partialLayout)));
}

module.exports = {
  loadLayoutConfig,
  saveLayoutConfig,
  sanitizeLayout,
  mergePanelsUpdate
};
