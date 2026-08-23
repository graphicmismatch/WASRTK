const path = require('path');
const { app, BrowserWindow, Menu, ipcMain, dialog } = require('electron');
const { getWindowOptions } = require('./src/main/constants');
const { registerScreenCaptureHandlers, registerFileHandlers } = require('./src/main/ipc');
const { createMenuTemplate } = require('./src/main/menu');
const { createWindowController } = require('./src/main/window');
const { checkForCrashRecovery, markCleanExit } = require('./src/main/autosave-store');

const isSmoke = process.argv.includes('--smoke');

// The renderer process is a separate OS subprocess with its own Chromium
// command line, so it does NOT see custom flags like '--smoke' via its own
// process.argv (only env vars and recognized Chromium switches propagate).
// Forward the flag via an env var so src/renderer/index.js can detect it.
if (isSmoke) {
  process.env.WASRTK_SMOKE = '1';
}

const windowController = createWindowController({
  getWindowOptions: () => getWindowOptions(__dirname),
  loadFile: 'index.html'
});

// --smoke harness: the renderer (tests/smoke/renderer-smoke.js, wired up in
// src/renderer/index.js) runs a self-check and reports back over the
// smoke:result channel. We print that report and exit with a matching code
// so `npm run smoke` is usable in CI. A 30s failsafe guards against the
// renderer never reporting back (e.g. it crashed before self-check ran).
function setupSmokeHarness() {
  let settled = false;
  let consoleErrorCount = 0;

  const finish = (exitCode) => {
    if (settled) {
      return;
    }
    settled = true;
    clearTimeout(failsafeTimer);
    // app.exit() below skips the normal quit sequence ('before-quit' never
    // fires), so mark this shutdown clean here instead -- otherwise the
    // next real launch would see this run's autosave (if any fired) as a
    // leftover crash and prompt to recover it.
    markCleanExit();
    app.exit(exitCode);
  };

  const failsafeTimer = setTimeout(() => {
    console.error('[smoke] failsafe timeout: no smoke:result received within 30s');
    finish(1);
  }, 30000);

  ipcMain.on('smoke:result', (event, report) => {
    console.log(JSON.stringify(report));

    if (consoleErrorCount > 0) {
      console.error(`[smoke] ${consoleErrorCount} error-level console-message(s) captured`);
    }

    const ok = Boolean(report && report.ok) && consoleErrorCount === 0;
    finish(ok ? 0 : 1);
  });

  const mainWindow = windowController.getMainWindow();
  if (mainWindow) {
    mainWindow.webContents.on('console-message', (event, level, message, line, sourceId) => {
      // console-message level: 0 verbose, 1 info, 2 warning, 3 error.
      // Only count actual errors -- level 2 also covers Electron's own
      // "Security Warning" notices for the (intentionally, pre-existing)
      // disabled webSecurity/nodeIntegration settings, which are expected
      // and not a regression.
      if (level >= 3) {
        consoleErrorCount += 1;
        console.error(`[smoke] console error: ${message} (${sourceId}:${line})`);
      }
    });
  }
}

// An autosave newer than the last clean shutdown means the previous
// session ended without one -- offers to reload it through the existing
// 'load-project' channel/listener (a .wasrtk autosave loads exactly like
// any other project file). Skipped under --smoke so a headless/CI run
// never blocks on a native dialog waiting for a human.
async function checkCrashRecoveryOnStartup() {
  const recovery = checkForCrashRecovery();
  if (!recovery) {
    return;
  }

  const mainWindow = windowController.getMainWindow();
  if (!mainWindow || mainWindow.isDestroyed()) {
    return;
  }

  const { response } = await dialog.showMessageBox(mainWindow, {
    type: 'question',
    buttons: ['Restore', 'Discard'],
    defaultId: 0,
    cancelId: 1,
    title: 'Recover unsaved work?',
    message: 'WASRTK closed unexpectedly. An autosaved backup is available.',
    detail: `Autosaved at ${new Date(recovery.mtimeMs).toLocaleString()}`
  });

  if (response === 0) {
    mainWindow.webContents.send('load-project', recovery.path);
  }
}

app.whenReady().then(() => {
  windowController.createWindow();

  registerScreenCaptureHandlers();
  registerFileHandlers({
    onThemeUpdated: windowController.sendThemeUpdate,
    onPalettesUpdated: windowController.sendPaletteUpdate,
    onOpenPaletteEditor: windowController.openPaletteEditorWindow
  });

  const menuTemplate = createMenuTemplate({
    menuAction: windowController.menuAction,
    openAndSend: windowController.showOpenDialogAndSend,
    saveAndSend: windowController.showSaveDialogAndSend,
    getMainWindow: windowController.getMainWindow,
    openThemeSettingsWindow: windowController.openThemeSettingsWindow,
    openPaletteEditorWindow: windowController.openPaletteEditorWindow,
    showRestoreBackupDialog: windowController.showRestoreBackupDialog
  });

  Menu.setApplicationMenu(Menu.buildFromTemplate(menuTemplate));

  if (isSmoke) {
    setupSmokeHarness();
  } else {
    windowController.getMainWindow().webContents.once('did-finish-load', () => {
      checkCrashRecoveryOnStartup();
    });
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    windowController.createWindow();
  }
});

app.on('before-quit', () => {
  markCleanExit();
});
