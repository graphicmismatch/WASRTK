const fs = require('fs');
const path = require('path');

// Generic JSON-file config persistence: resolve path -> ensure directory ->
// sanitize -> load with corrupt-JSON recovery -> save. `getDir` is injected
// (rather than calling `app.getPath` directly) so the store is testable
// without Electron.
function createJsonConfigStore({ getDir, fileName, defaults, sanitize }) {
  function getConfigPath() {
    return path.join(getDir(), fileName);
  }

  function ensureDirectory() {
    const configPath = getConfigPath();
    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    return configPath;
  }

  function load() {
    const configPath = ensureDirectory();

    if (!fs.existsSync(configPath)) {
      const initial = sanitize(defaults);
      fs.writeFileSync(configPath, JSON.stringify(initial, null, 2), 'utf8');
      return { data: initial, path: configPath };
    }

    try {
      const parsed = JSON.parse(fs.readFileSync(configPath, 'utf8'));
      const data = sanitize(parsed);
      return { data, path: configPath };
    } catch (error) {
      try {
        fs.copyFileSync(configPath, `${configPath}.bak`);
      } catch (backupError) {
        // Best-effort: a failed backup should never block recovery.
      }
      const recovered = sanitize(defaults);
      fs.writeFileSync(configPath, JSON.stringify(recovered, null, 2), 'utf8');
      return { data: recovered, path: configPath, recoveredFromError: error.message };
    }
  }

  function save(data) {
    const configPath = ensureDirectory();
    const sanitized = sanitize(data);
    fs.writeFileSync(configPath, JSON.stringify(sanitized, null, 2), 'utf8');
    return { data: sanitized, path: configPath };
  }

  function reset() {
    return save(defaults);
  }

  return {
    getConfigPath,
    load,
    save,
    reset
  };
}

module.exports = {
  createJsonConfigStore
};
