const { app } = require('electron');
const fs = require('fs');
const path = require('path');
const { createJsonConfigStore } = require('./json-config-store');

const AUTOSAVE_DIR_NAME = 'autosaves';
const MAX_AUTOSAVES = 8;
const META_FILE_NAME = 'autosave-meta.json';

// Pure: given the current autosave filenames (any order) and the max to
// keep, returns which filenames to delete. Filenames are timestamp-prefixed
// (autosave-<ISO, with `:`/`.` replaced by `-`>.wasrtk), so a plain string
// sort orders them chronologically -- newest-first after reversing.
function selectFilesToPrune(fileNames, maxAutosaves) {
  return [...fileNames].sort().reverse().slice(maxAutosaves);
}

// DI'd on `getDir` (same pattern as json-config-store.js) so this is
// testable against a real temp directory without Electron.
function createAutosaveStore({ getDir, maxAutosaves = MAX_AUTOSAVES }) {
  // "Was the last session's shutdown clean" needs its own tiny persisted
  // marker -- checkForCrashRecovery compares an autosave's mtime against
  // it. Reuses json-config-store rather than hand-rolling JSON read/write.
  const metaStore = createJsonConfigStore({
    getDir,
    fileName: META_FILE_NAME,
    defaults: { lastCleanExitAt: 0 },
    sanitize: (raw) => ({
      lastCleanExitAt: raw && typeof raw.lastCleanExitAt === 'number' ? raw.lastCleanExitAt : 0
    })
  });

  function getAutosaveDir() {
    return path.join(getDir(), AUTOSAVE_DIR_NAME);
  }

  function listAutosaves() {
    const dir = getAutosaveDir();
    if (!fs.existsSync(dir)) {
      return [];
    }
    const names = fs.readdirSync(dir).filter((name) => name.endsWith('.wasrtk'));
    return [...names].sort().reverse().map((name) => {
      const filePath = path.join(dir, name);
      return { name, path: filePath, mtimeMs: fs.statSync(filePath).mtimeMs };
    });
  }

  function writeAutosave(data) {
    const dir = getAutosaveDir();
    fs.mkdirSync(dir, { recursive: true });
    const fileName = `autosave-${new Date().toISOString().replace(/[:.]/g, '-')}.wasrtk`;
    const filePath = path.join(dir, fileName);
    fs.writeFileSync(filePath, data);

    const allNames = fs.readdirSync(dir).filter((name) => name.endsWith('.wasrtk'));
    selectFilesToPrune(allNames, maxAutosaves).forEach((name) => {
      fs.unlinkSync(path.join(dir, name));
    });

    return filePath;
  }

  function getLatestAutosave() {
    const files = listAutosaves();
    return files.length ? files[0] : null;
  }

  // An autosave newer than the last graceful shutdown means the previous
  // session ended without one (crash, force-quit, OS kill) -- markCleanExit
  // is only ever called from the app's 'before-quit' handler and the smoke
  // harness's own clean finish, neither of which run on those paths.
  function checkForCrashRecovery() {
    const latest = getLatestAutosave();
    if (!latest) {
      return null;
    }
    // Floored: mtimeMs carries sub-millisecond precision but
    // lastCleanExitAt is a Date.now() integer, so an autosave write and a
    // markCleanExit call landing in the same millisecond could otherwise
    // compare as "after" purely from fractional noise, even though the
    // write is (by construction, they're sequential synchronous calls)
    // always the earlier of the two in real time.
    return Math.floor(latest.mtimeMs) > metaStore.load().data.lastCleanExitAt ? latest : null;
  }

  function markCleanExit() {
    metaStore.save({ lastCleanExitAt: Date.now() });
  }

  return {
    getAutosaveDir,
    writeAutosave,
    listAutosaves,
    getLatestAutosave,
    checkForCrashRecovery,
    markCleanExit
  };
}

const productionStore = createAutosaveStore({ getDir: () => app.getPath('userData') });

module.exports = {
  createAutosaveStore,
  selectFilesToPrune,
  getAutosaveDir: productionStore.getAutosaveDir,
  writeAutosave: productionStore.writeAutosave,
  listAutosaves: productionStore.listAutosaves,
  getLatestAutosave: productionStore.getLatestAutosave,
  checkForCrashRecovery: productionStore.checkForCrashRecovery,
  markCleanExit: productionStore.markCleanExit
};
