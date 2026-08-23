const { eventToKeyCombo, formatKeyCombo } = require('./shortcuts');

// Searchable overlay over the FULL action registry (menu-driven and
// renderer-owned actions alike) -- see shortcuts.js's header comment for
// why executing a menu-driven action here needs no menu rebuild.
function createCommandPalette(app) {
    const modal = document.getElementById('commandPaletteModal');
    const input = document.getElementById('commandPaletteInput');
    const list = document.getElementById('commandPaletteList');
    let filtered = [];
    let selectedIndex = 0;

    function updateSelectionHighlight() {
        Array.from(list.children).forEach((row, index) => {
            row.classList.toggle('selected', index === selectedIndex);
        });
        const selectedRow = list.children[selectedIndex];
        if (selectedRow) {
            selectedRow.scrollIntoView({ block: 'nearest' });
        }
    }

    function runAction(action) {
        close();
        action.handler();
    }

    function renderList() {
        const query = input.value.trim().toLowerCase();
        const registry = app.getActionRegistry();
        filtered = query
            ? registry.filter((action) => action.label.toLowerCase().includes(query) || action.category.toLowerCase().includes(query))
            : registry;
        selectedIndex = 0;
        list.innerHTML = '';
        filtered.forEach((action) => {
            const row = document.createElement('div');
            row.className = 'command-palette-row';
            const label = document.createElement('span');
            label.className = 'command-palette-label';
            label.textContent = action.label;
            const category = document.createElement('span');
            category.className = 'command-palette-category';
            category.textContent = action.keys ? `${action.category} · ${action.keys}` : action.category;
            row.appendChild(label);
            row.appendChild(category);
            row.addEventListener('click', () => runAction(action));
            list.appendChild(row);
        });
        updateSelectionHighlight();
    }

    function moveSelection(delta) {
        if (!filtered.length) return;
        selectedIndex = ((selectedIndex + delta) % filtered.length + filtered.length) % filtered.length;
        updateSelectionHighlight();
    }

    function open() {
        app.showModal('commandPaletteModal');
        input.value = '';
        renderList();
        input.focus();
    }

    function close() {
        app.hideModal('commandPaletteModal');
    }

    input.addEventListener('input', renderList);
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            e.preventDefault();
            close();
        } else if (e.key === 'ArrowDown') {
            e.preventDefault();
            moveSelection(1);
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            moveSelection(-1);
        } else if (e.key === 'Enter') {
            e.preventDefault();
            if (filtered[selectedIndex]) runAction(filtered[selectedIndex]);
        }
    });
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    return { open, close };
}

// Rebinding UI for the ~dozen renderer-owned actions (rebindable: true) --
// menu-driven actions have no row here, only in the command palette (see
// shortcuts.js's header comment for why that split exists).
function createShortcutsPanel(app) {
    const modal = document.getElementById('shortcutsModal');
    const list = document.getElementById('shortcutsList');
    const resetBtn = document.getElementById('resetShortcutsBtn');
    const closeBtn = document.getElementById('closeShortcutsBtn');
    let stopRecording = null;

    function cancelRecording() {
        if (stopRecording) {
            stopRecording();
            stopRecording = null;
        }
    }

    function render() {
        cancelRecording();
        list.innerHTML = '';
        const resolved = app.getResolvedShortcuts().filter((action) => action.rebindable);

        const keyCounts = {};
        resolved.forEach((action) => {
            if (action.keys) keyCounts[action.keys] = (keyCounts[action.keys] || 0) + 1;
        });

        resolved.forEach((action) => {
            const row = document.createElement('div');
            row.className = 'shortcut-row';
            const label = document.createElement('span');
            label.className = 'shortcut-label';
            label.textContent = action.label;
            const btn = document.createElement('button');
            btn.className = 'btn btn-secondary shortcut-key-btn';
            btn.textContent = action.keys || '(unbound)';
            const conflict = action.keys && keyCounts[action.keys] > 1;
            btn.classList.toggle('shortcut-conflict', !!conflict);
            row.title = conflict ? `Conflicts with another shortcut using "${action.keys}"` : '';
            btn.addEventListener('click', () => startRecording(action, btn));
            row.appendChild(label);
            row.appendChild(btn);
            list.appendChild(row);
        });
    }

    // Captured on document in the capture phase so it runs before -- and
    // via stopPropagation, instead of -- the app's own bubble-phase
    // keydown listener (event-bindings.js's bindKeyboardShortcuts), which
    // would otherwise also react to the same keypress (e.g. recording "1"
    // would simultaneously select the Pen tool).
    function startRecording(action, btn) {
        cancelRecording();
        btn.textContent = 'Press a key...';
        btn.classList.add('recording');

        function handler(e) {
            e.preventDefault();
            e.stopPropagation();
            if (e.key === 'Escape') {
                cancelRecording();
                render();
                return;
            }
            app.setShortcutOverride(action.id, formatKeyCombo(eventToKeyCombo(e)));
            cancelRecording();
            render();
        }

        document.addEventListener('keydown', handler, true);
        stopRecording = () => {
            document.removeEventListener('keydown', handler, true);
            btn.classList.remove('recording');
        };
    }

    function open() {
        app.showModal('shortcutsModal');
        render();
    }

    function close() {
        cancelRecording();
        app.hideModal('shortcutsModal');
    }

    resetBtn.addEventListener('click', () => {
        app.resetShortcutOverrides();
        render();
    });
    closeBtn.addEventListener('click', close);
    modal.addEventListener('click', (e) => {
        if (e.target === modal) close();
    });

    return { open, close };
}

module.exports = {
    createCommandPalette,
    createShortcutsPanel
};
