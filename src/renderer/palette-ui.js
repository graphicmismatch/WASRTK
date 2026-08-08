// Palette selector UI, moved verbatim from wasrtk.js.
//
// `env` is a closure-accessor object built once in the WASRTK constructor:
//   colorPalettes                          -- COLOR_PALETTES, a stable
//                                              object reference mutated in
//                                              place (custom entries added/
//                                              removed on top of the
//                                              builtin ones)
//   builtinPaletteIds                      -- BUILTIN_PALETTE_IDS, read-only
//   getSelectedPalette/setSelectedPalette  -- the active palette id
//   dedupeColors                           -- shared color-utils helper
//   ipcRenderer                            -- for loading saved custom palettes
function createPaletteUI(env) {
    function refreshPaletteSelect() {
        const paletteSelect = document.getElementById('paletteSelect');
        if (!paletteSelect) {
            return;
        }

        paletteSelect.innerHTML = '';
        Object.entries(env.colorPalettes).forEach(([id, palette]) => {
            const option = document.createElement('option');
            option.value = id;
            option.textContent = palette.label;
            paletteSelect.append(option);
        });
    }

    function renderPalettePresets(paletteId) {
        const palette = env.colorPalettes[paletteId] || env.colorPalettes['lospec-journey'];
        const presetsContainer = document.getElementById('colorPresets');
        if (!presetsContainer) {
            return;
        }

        presetsContainer.innerHTML = '';
        palette.colors.forEach((color) => {
            const swatch = document.createElement('button');
            swatch.type = 'button';
            swatch.className = 'color-preset';
            swatch.style.background = color;
            swatch.dataset.color = color;
            swatch.title = color;
            presetsContainer.append(swatch);
        });
    }

    function initializePaletteUI() {
        const paletteSelect = document.getElementById('paletteSelect');
        if (!paletteSelect) {
            return;
        }

        refreshPaletteSelect();

        if (!env.colorPalettes[env.getSelectedPalette()]) {
            env.setSelectedPalette('lospec-journey');
        }
        paletteSelect.value = env.getSelectedPalette();
        renderPalettePresets(env.getSelectedPalette());
    }

    function mergeCustomPalettes(customPalettes) {
        Object.entries(env.colorPalettes).forEach(([id]) => {
            if (!env.builtinPaletteIds.has(id)) {
                delete env.colorPalettes[id];
            }
        });

        Object.entries(customPalettes).forEach(([id, palette]) => {
            if (!palette || !palette.label || !Array.isArray(palette.colors)) {
                return;
            }
            const colors = env.dedupeColors(palette.colors);
            if (!colors.length) {
                return;
            }
            env.colorPalettes[id] = {
                label: String(palette.label),
                colors
            };
        });

        refreshPaletteSelect();
        if (!env.colorPalettes[env.getSelectedPalette()]) {
            env.setSelectedPalette('lospec-journey');
        }
        document.getElementById('paletteSelect').value = env.getSelectedPalette();
        renderPalettePresets(env.getSelectedPalette());
    }

    async function loadCustomPalettesFromConfig() {
        const payload = await env.ipcRenderer.invoke('load-palettes-config');
        mergeCustomPalettes(payload.palettes || {});
    }

    return {
        initializePaletteUI,
        refreshPaletteSelect,
        mergeCustomPalettes,
        renderPalettePresets,
        loadCustomPalettesFromConfig
    };
}

module.exports = { createPaletteUI };
