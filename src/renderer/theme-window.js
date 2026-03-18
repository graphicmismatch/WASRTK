const { ipcRenderer } = require('electron');
const { THEME_FIELDS, applyTheme, initializeThemeSync } = require('./theme');

function setThemePath(pathValue) {
  document.getElementById('themeConfigPath').textContent = pathValue || 'Unavailable';
}

function populateThemeControls(theme) {
  THEME_FIELDS.forEach(({ key }) => {
    const input = document.querySelector(`[data-theme-key="${key}"]`);
    if (input) {
      input.value = theme[key] || '';
    }
  });

  document.getElementById('themeConfigEditor').value = JSON.stringify(theme, null, 2);
}

function collectThemeFromControls(currentTheme) {
  return THEME_FIELDS.reduce((accumulator, { key }) => {
    const input = document.querySelector(`[data-theme-key="${key}"]`);
    accumulator[key] = input ? input.value.trim() : currentTheme[key];
    return accumulator;
  }, { ...currentTheme });
}

function buildThemeFieldsMarkup() {
  return THEME_FIELDS.map(({ key, label, type = 'color' }) => `
    <label class="theme-color-field">
      <span>${label}</span>
      <input type="${type}" data-theme-key="${key}">
    </label>
  `).join('');
}

async function initializeThemeWindow() {
  document.getElementById('themeFields').innerHTML = buildThemeFieldsMarkup();

  let themeState = null;

  const applyThemeState = (payload) => {
    themeState = payload;
    applyTheme(payload.theme);
    populateThemeControls(payload.theme);
    setThemePath(payload.path);
  };

  await initializeThemeSync(applyThemeState);

  document.getElementById('saveThemeBtn').addEventListener('click', async () => {
    const updatedTheme = collectThemeFromControls(themeState.theme);
    const result = await ipcRenderer.invoke('save-theme-config', updatedTheme);
    applyThemeState(result);
  });

  document.getElementById('resetThemeBtn').addEventListener('click', async () => {
    const result = await ipcRenderer.invoke('reset-theme-config');
    applyThemeState(result);
  });

  document.getElementById('saveThemeConfigFileBtn').addEventListener('click', async () => {
    try {
      const parsedTheme = JSON.parse(document.getElementById('themeConfigEditor').value);
      const result = await ipcRenderer.invoke('save-theme-config', parsedTheme);
      applyThemeState(result);
    } catch (error) {
      alert(`Invalid theme configuration: ${error.message}`);
    }
  });
}

module.exports = {
  initializeThemeWindow
};
