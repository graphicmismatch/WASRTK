'use strict';

// Unit tests for the pure parts of src/main/layout-config.js:
// sanitizeLayout and mergePanelsUpdate. loadLayoutConfig/saveLayoutConfig
// are hardwired to Electron's app.getPath('userData') (same pattern as
// theme-config.js/palette-config.js) and so aren't independently
// testable -- these two are exported separately for exactly that reason.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { sanitizeLayout, mergePanelsUpdate } = require('../../src/main/layout-config');

describe('sanitizeLayout', () => {
  test('a well-formed panels map passes through unchanged', () => {
    const input = { panels: { colorPanel: { top: 10, left: 20, width: 200, height: 300 } } };
    assert.deepEqual(sanitizeLayout(input), input);
  });

  test('missing/non-object input sanitizes to an empty panels map', () => {
    assert.deepEqual(sanitizeLayout(undefined), { panels: {} });
    assert.deepEqual(sanitizeLayout(null), { panels: {} });
    assert.deepEqual(sanitizeLayout('not an object'), { panels: {} });
  });

  test('a panel entry keeps only the fields that are valid non-negative numbers', () => {
    const result = sanitizeLayout({
      panels: {
        colorPanel: { top: 10, left: -5, width: 'nope', height: 300 }
      }
    });
    assert.deepEqual(result.panels.colorPanel, { top: 10, height: 300 });
  });

  test('a panel with no valid fields at all is dropped entirely', () => {
    const result = sanitizeLayout({
      panels: {
        colorPanel: { top: -1, left: NaN, width: 'x', height: undefined }
      }
    });
    assert.equal('colorPanel' in result.panels, false);
  });

  test('a panel entry that is only a size (never dragged) keeps just width/height', () => {
    const result = sanitizeLayout({ panels: { toolsPanel: { width: 150, height: 400 } } });
    assert.deepEqual(result.panels.toolsPanel, { width: 150, height: 400 });
  });

  test('a panel entry that is only a position (never resized) keeps just top/left', () => {
    const result = sanitizeLayout({ panels: { toolsPanel: { top: 5, left: 5 } } });
    assert.deepEqual(result.panels.toolsPanel, { top: 5, left: 5 });
  });

  test('multiple panels are sanitized independently', () => {
    const result = sanitizeLayout({
      panels: {
        colorPanel: { top: 1, left: 1 },
        historyPanel: { top: 2, left: 2 },
        toolsPanel: { top: -1, left: -1 } // dropped
      }
    });
    assert.deepEqual(Object.keys(result.panels).sort(), ['colorPanel', 'historyPanel']);
  });

  test('a non-object panels value is treated as empty', () => {
    assert.deepEqual(sanitizeLayout({ panels: 'not an object' }), { panels: {} });
    assert.deepEqual(sanitizeLayout({ panels: null }), { panels: {} });
  });
});

describe('mergePanelsUpdate', () => {
  test('merges a new panel id in without touching existing ones', () => {
    const current = { panels: { colorPanel: { top: 1, left: 1 } } };
    const result = mergePanelsUpdate(current, { panels: { historyPanel: { top: 2, left: 2 } } });
    assert.deepEqual(result.panels, {
      colorPanel: { top: 1, left: 1 },
      historyPanel: { top: 2, left: 2 }
    });
  });

  test('regression: saving one panel does not wipe out an already-saved different panel', () => {
    // This is the exact bug: floating-panel.js's onPositionChange only
    // ever sends its own panel's id, so a plain replace (rather than a
    // merge) would silently drop every other panel's saved state.
    const current = {
      panels: {
        colorPanel: { top: 76, left: 300 },
        historyPanel: { top: 76, left: 620 }
      }
    };
    const result = mergePanelsUpdate(current, { panels: { colorPanel: { top: 100, left: 100 } } });
    assert.deepEqual(result.panels.colorPanel, { top: 100, left: 100 });
    assert.deepEqual(result.panels.historyPanel, { top: 76, left: 620 }, 'historyPanel must survive a colorPanel-only save');
  });

  test('updating one panel replaces that panel wholesale, not a deep-merge of its own fields', () => {
    const current = { panels: { colorPanel: { top: 1, left: 1, width: 240, height: 300 } } };
    // A resize-only update for the same panel replaces the whole entry --
    // callers (floating-panel.js) are expected to send the full current
    // state, not a partial field.
    const result = mergePanelsUpdate(current, { panels: { colorPanel: { width: 500, height: 500 } } });
    assert.deepEqual(result.panels.colorPanel, { width: 500, height: 500 });
  });

  test('an update with no panels key is a no-op merge', () => {
    const current = { panels: { colorPanel: { top: 1, left: 1 } } };
    const result = mergePanelsUpdate(current, {});
    assert.deepEqual(result.panels, current.panels);
  });

  test('a missing/empty current layout merges cleanly into just the incoming panels', () => {
    const result = mergePanelsUpdate({ panels: {} }, { panels: { colorPanel: { top: 1, left: 1 } } });
    assert.deepEqual(result.panels, { colorPanel: { top: 1, left: 1 } });
  });

  test('does not throw when currentLayout itself is missing/malformed', () => {
    assert.doesNotThrow(() => mergePanelsUpdate(undefined, { panels: { a: { top: 1, left: 1 } } }));
    assert.doesNotThrow(() => mergePanelsUpdate(null, { panels: { a: { top: 1, left: 1 } } }));
  });
});
