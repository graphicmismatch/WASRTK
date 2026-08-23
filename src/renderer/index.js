const { ipcRenderer } = require('electron');
const { WASRTK } = require('./wasrtk');
const { initializeThemeSync } = require('./theme');
const { makeFloatingPanelDraggable } = require('./floating-panel');

function bootstrap() {
  // process.argv in the renderer reflects Chromium's own subprocess command
  // line, not the flags passed to `electron .` -- main.js forwards the
  // --smoke flag via this env var instead (env vars ARE inherited by the
  // renderer subprocess).
  const isSmoke = process.env.WASRTK_SMOKE === '1';
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
    await initializeThemeSync();

    const { layout } = await ipcRenderer.invoke('load-layout-config');
    makeFloatingPanelDraggable(
      document.getElementById('colorPanel'),
      document.getElementById('colorPanelHandle'),
      document.querySelector('.main-content'),
      {
        initialPosition: layout.colorPanel || undefined,
        onPositionChange: (position) => ipcRenderer.invoke('save-layout-config', { colorPanel: position })
      }
    );

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
