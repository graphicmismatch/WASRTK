const { ipcRenderer } = require('electron');
const { THEME_FIELDS, applyTheme, initializeThemeSync } = require('./theme');

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function channelToHex(value) {
  return clamp(value, 0, 255).toString(16).padStart(2, '0');
}

function rgbaStringFromParts({ r, g, b, a }) {
  return `rgba(${clamp(r, 0, 255)}, ${clamp(g, 0, 255)}, ${clamp(b, 0, 255)}, ${clamp(a, 0, 1).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')})`;
}

function parseColorValue(value) {
  const normalizedValue = (value || '').trim();

  if (/^#[0-9a-f]{6}$/i.test(normalizedValue)) {
    return {
      format: 'hex',
      hex: normalizedValue.toLowerCase(),
      alpha: 1,
    };
  }

  const rgbMatch = normalizedValue.match(/^rgba?\(([^)]+)\)$/i);
  if (rgbMatch) {
    const parts = rgbMatch[1].split(',').map((part) => part.trim());
    const [r = '0', g = '0', b = '0', alpha = '1'] = parts;
    const red = clamp(parseInt(r, 10) || 0, 0, 255);
    const green = clamp(parseInt(g, 10) || 0, 0, 255);
    const blue = clamp(parseInt(b, 10) || 0, 0, 255);
    const parsedAlpha = clamp(parseFloat(alpha) || 0, 0, 1);

    return {
      format: parts.length === 4 ? 'rgba' : 'rgb',
      hex: `#${channelToHex(red)}${channelToHex(green)}${channelToHex(blue)}`,
      alpha: parsedAlpha,
    };
  }

  return {
    format: 'hex',
    hex: '#000000',
    alpha: 1,
  };
}

function setThemePath(pathValue) {
  document.getElementById('themeConfigPath').textContent = pathValue || 'Unavailable';
}

function populateThemeControls(theme) {
  THEME_FIELDS.forEach(({ key, type }) => {
    const input = document.querySelector(`[data-theme-key="${key}"]`);
    if (!input) {
      return;
    }

    if (type === 'rgba') {
      const { hex, alpha } = parseColorValue(theme[key]);
      const alphaInput = document.querySelector(`[data-theme-alpha-key="${key}"]`);
      const alphaValue = document.querySelector(`[data-theme-alpha-value="${key}"]`);

      input.value = hex;
      if (alphaInput) {
        alphaInput.value = Math.round(alpha * 100);
      }
      if (alphaValue) {
        alphaValue.textContent = `${Math.round(alpha * 100)}%`;
      }
    } else {
      input.value = theme[key] || '';
    }
  });

  document.getElementById('themeConfigEditor').value = JSON.stringify(theme, null, 2);
}

function collectThemeFromControls(currentTheme) {
  return THEME_FIELDS.reduce(
    (accumulator, { key, type }) => {
      const input = document.querySelector(`[data-theme-key="${key}"]`);

      if (!input) {
        accumulator[key] = currentTheme[key];
        return accumulator;
      }

      if (type === 'rgba') {
        const alphaInput = document.querySelector(`[data-theme-alpha-key="${key}"]`);
        const alpha = alphaInput ? Number(alphaInput.value) / 100 : 1;
        const { hex } = parseColorValue(input.value);
        const red = parseInt(hex.slice(1, 3), 16);
        const green = parseInt(hex.slice(3, 5), 16);
        const blue = parseInt(hex.slice(5, 7), 16);
        accumulator[key] = rgbaStringFromParts({ r: red, g: green, b: blue, a: alpha });
        return accumulator;
      }

      accumulator[key] = input.value.trim();
      return accumulator;
    },
    { ...currentTheme }
  );
}

function buildThemeFieldsMarkup() {
  return THEME_FIELDS.map(({ key, label, type = 'color' }) => {
    if (type === 'rgba') {
      return `
        <div class="theme-color-field theme-color-card theme-rgba-field">
          <span class="theme-field-label">${label}</span>
          <input class="theme-color-input" type="color" data-theme-key="${key}">
          <div class="theme-alpha-control">
            <label for="theme-alpha-${key}">Opacity</label>
            <input id="theme-alpha-${key}" type="range" min="0" max="100" value="100" data-theme-alpha-key="${key}">
            <span data-theme-alpha-value="${key}">100%</span>
          </div>
        </div>
      `;
    }

    return `
      <label class="theme-color-field theme-color-card">
        <span class="theme-field-label">${label}</span>
        <input class="theme-color-input" type="${type}" data-theme-key="${key}">
      </label>
    `;
  }).join('');
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

  document.querySelectorAll('[data-theme-alpha-key]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const alphaKey = event.target.dataset.themeAlphaKey;
      const alphaValue = document.querySelector(`[data-theme-alpha-value="${alphaKey}"]`);
      if (alphaValue) {
        alphaValue.textContent = `${event.target.value}%`;
      }
    });
  });

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
  initializeThemeWindow,
};
