const { ipcRenderer } = require('electron');
const { WASRTK } = require('./wasrtk');
const { initializeThemeSync } = require('./theme');
const { makeFloatingPanelDraggable, makeFloatingPanelResizable } = require('./floating-panel');
const { isWeb } = require('./platform');

const FLOATING_PANEL_IDS = ['toolsPanel', 'colorPanel', 'historyPanel'];

function bootstrap() {
  // process.argv in the renderer reflects Chromium's own subprocess command
  // line, not the flags passed to `electron .` -- main.js forwards the
  // --smoke flag via this env var instead (env vars ARE inherited by the
  // renderer subprocess). The web build takes it as ?smoke in the URL.
  const isSmoke = isWeb
    ? new URLSearchParams(window.location.search).has('smoke')
    : process.env.WASRTK_SMOKE === '1';
  const smokeErrors = [];

  if (isSmoke) {
    // Installed before WASRTK is constructed so the smoke self-check can
    // report whether the constructor (or anything during it) threw an
    // uncaught error.
    window.onerror = (message) => {
      smokeErrors.push(String(message));
      return false;
    };
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const app = new WASRTK();
    window.wasrtkApp = app; // the web menu's unsaved-changes check, and handy in devtools
    await initializeThemeSync();

    const { overrides } = await ipcRenderer.invoke('load-shortcuts-config');
    app.loadShortcutOverrides(overrides);

    const { layout } = await ipcRenderer.invoke('load-layout-config');
    const bounds = document.querySelector('.main-content');

    FLOATING_PANEL_IDS.forEach((id) => {
      const panelEl = document.getElementById(id);
      const handleEl = document.getElementById(`${id}Handle`);
      if (!panelEl || !handleEl) return;

      // layout-config.js's save replaces a panel's whole entry (not a
      // deep-merge of its own fields), so position and size are tracked
      // together here and the full combined state is sent regardless of
      // which one just changed -- otherwise a resize would drop the
      // saved position, or a drag would drop the saved size.
      const state = { ...(layout.panels[id] || {}) };
      const persist = () => ipcRenderer.invoke('save-layout-config', { panels: { [id]: state } });

      makeFloatingPanelDraggable(panelEl, handleEl, bounds, {
        initialPosition: state.top !== undefined && state.left !== undefined
          ? { top: state.top, left: state.left }
          : undefined,
        onPositionChange: (position) => {
          state.top = position.top;
          state.left = position.left;
          persist();
        }
      });

      makeFloatingPanelResizable(panelEl, {
        initialSize: state.width && state.height ? { width: state.width, height: state.height } : undefined,
        onSizeChange: (size) => {
          state.width = size.width;
          state.height = size.height;
          persist();
        }
      });
    });

    app.updateHistoryPanel();

    if (isWeb) {
      // The desktop's native menu, dialogs and crash recovery, done in the page. Not under smoke: the recovery
      // prompt would block it.
      const webMenu = require('./platform/web-menu');
      if (!isSmoke) await webMenu.install();
    }

    if (isSmoke) {
      // Kept in its own file so index.js stays tiny; only required under
      // the --smoke flag so it never loads during normal startup.
      const { runSmokeChecks } = require('../../tests/smoke/renderer-smoke');
      const report = await runSmokeChecks(app, { errors: smokeErrors });
      ipcRenderer.send('smoke:result', report);
    }
  });
}

module.exports = {
  bootstrap
};
