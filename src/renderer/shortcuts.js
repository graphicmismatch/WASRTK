// Central action registry: the command palette can search and execute
// EVERY action here; only the ones flagged `rebindable: true` (the
// renderer-owned global shortcuts -- tool selection, toggle animation,
// selection copy/cut/paste) get a "click to record a new combo" row in
// the shortcuts panel. Everything else (undo/redo, layer/frame
// operations, ...) is driven by Electron's native menu accelerators
// (src/main/menu.js) -- rebuilding that live from user config is out of
// scope (disproportionate to the ask, same call the plan made for menu
// accelerators generally); the palette can still search+execute those
// actions directly since it just calls the same `app` method the menu's
// IPC listener does, no menu rebuild involved.
//
// Also out of scope: actions needing a native file dialog (New/Open/Load/
// Save/Save Animation) or a window not yet exposed over an invokable IPC
// channel (Theme Settings) -- the renderer has no way to trigger those
// itself today; adding that plumbing is a bigger change than this item's
// ask.

// Parses "Ctrl+Shift+P" (case-insensitive, any order) into a canonical
// { ctrl, shift, alt, meta, key } shape. `key` is lowercased except for
// single space, which stays ' ' (matches KeyboardEvent.key for Space).
function parseKeyCombo(combo) {
    const parts = String(combo || '').split('+').map((part) => part.trim()).filter(Boolean);
    const result = { ctrl: false, shift: false, alt: false, meta: false, key: null };
    parts.forEach((part) => {
        const lower = part.toLowerCase();
        if (lower === 'ctrl' || lower === 'control') result.ctrl = true;
        else if (lower === 'cmd' || lower === 'meta' || lower === 'command') result.meta = true;
        else if (lower === 'shift') result.shift = true;
        else if (lower === 'alt' || lower === 'option') result.alt = true;
        else if (lower === 'space') result.key = ' ';
        else result.key = lower;
    });
    return result;
}

// Inverse of parseKeyCombo, for display. Modifier order is fixed
// (Ctrl/Cmd, Shift, Alt) so the same combo always renders the same way.
function formatKeyCombo({ ctrl, meta, shift, alt, key } = {}) {
    const parts = [];
    if (ctrl) parts.push('Ctrl');
    if (meta) parts.push('Cmd');
    if (shift) parts.push('Shift');
    if (alt) parts.push('Alt');
    if (key === ' ') parts.push('Space');
    else if (key) parts.push(key.length === 1 ? key.toUpperCase() : key);
    return parts.join('+');
}

// Converts a KeyboardEvent-like object (needs only the fields listed) into
// the same canonical shape parseKeyCombo produces, so recording a
// keypress and matching it against a stored combo use identical logic.
function eventToKeyCombo(e) {
    return {
        ctrl: !!e.ctrlKey,
        meta: !!e.metaKey,
        shift: !!e.shiftKey,
        alt: !!e.altKey,
        key: e.key === ' ' ? ' ' : String(e.key || '').toLowerCase()
    };
}

// True if the given event matches `combo` (a "Ctrl+Shift+P"-style string).
// Ctrl and Cmd are treated as equivalent modifiers here (matching this
// codebase's existing `e.ctrlKey || e.metaKey` convention for
// cross-platform shortcuts) -- a stored combo naming *either* matches an
// event carrying *either*.
function matchesKeyCombo(combo, e) {
    const parsed = parseKeyCombo(combo);
    const eventCombo = eventToKeyCombo(e);
    const parsedHasCtrlOrMeta = parsed.ctrl || parsed.meta;
    const eventHasCtrlOrMeta = eventCombo.ctrl || eventCombo.meta;
    return parsed.key === eventCombo.key
        && parsedHasCtrlOrMeta === eventHasCtrlOrMeta
        && parsed.shift === eventCombo.shift
        && parsed.alt === eventCombo.alt;
}

const { ipcRenderer } = require('electron');

// `app` is the live WASRTK instance -- handlers close over it directly,
// matching how tools/reference code already call arbitrary methods on it.
function createActionRegistry(app) {
    const tool = (id, label, key) => ({
        id: `tool-${id}`, label: `${label} Tool`, category: 'Tools',
        defaultKeys: key, rebindable: true, handler: () => app.selectTool(id)
    });

    return [
        tool('pen', 'Pen', '1'),
        tool('line', 'Line', '2'),
        tool('rectangle', 'Rectangle', '3'),
        tool('circle', 'Circle', '4'),
        tool('fill', 'Fill', '5'),
        tool('eraser', 'Eraser', '6'),
        tool('selection', 'Selection', '7'),
        tool('eyedropper', 'Eyedropper', '8'),

        { id: 'toggle-animation', label: 'Play/Stop Animation', category: 'Animation', defaultKeys: 'Space', rebindable: true, handler: () => app.toggleAnimation() },
        { id: 'copy-selection', label: 'Copy Selection', category: 'Edit', defaultKeys: 'Ctrl+C', rebindable: true, handler: () => app.copySelectionToClipboard() },
        { id: 'cut-selection', label: 'Cut Selection', category: 'Edit', defaultKeys: 'Ctrl+X', rebindable: true, handler: () => app.copySelectionToClipboard({ cut: true }) },
        { id: 'paste-selection', label: 'Paste', category: 'Edit', defaultKeys: 'Ctrl+V', rebindable: true, handler: () => app.pasteSelectionFromClipboard() },

        // Menu-driven (search+execute only -- see the header comment).
        { id: 'undo', label: 'Undo', category: 'Edit', defaultKeys: 'Ctrl+Z', rebindable: false, handler: () => app.undo() },
        { id: 'redo', label: 'Redo', category: 'Edit', defaultKeys: 'Ctrl+Y', rebindable: false, handler: () => app.redo() },
        { id: 'add-frame', label: 'Add Frame', category: 'Animation', defaultKeys: 'F', rebindable: false, handler: () => app.addFrame() },
        { id: 'duplicate-frame', label: 'Duplicate Frame', category: 'Animation', defaultKeys: 'D', rebindable: false, handler: () => app.duplicateFrame() },
        { id: 'delete-frame', label: 'Delete Frame', category: 'Animation', defaultKeys: 'Delete', rebindable: false, handler: () => app.deleteFrame() },
        { id: 'move-layer-up', label: 'Move Layer Up', category: 'Layers', defaultKeys: 'Ctrl+Up', rebindable: false, handler: () => app.moveLayerUp() },
        { id: 'move-layer-down', label: 'Move Layer Down', category: 'Layers', defaultKeys: 'Ctrl+Down', rebindable: false, handler: () => app.moveLayerDown() },
        { id: 'flatten-layer', label: 'Flatten Layer', category: 'Layers', defaultKeys: 'Ctrl+E', rebindable: false, handler: () => app.flattenLayer() },
        { id: 'toggle-antialiasing', label: 'Toggle Antialiasing', category: 'View', defaultKeys: 'Ctrl+A', rebindable: false, handler: () => app.setAntialiasingEnabled(!document.getElementById('antialiasingEnabled').checked) },

        // Useful actions with no existing shortcut at all.
        { id: 'new-layer', label: 'New Layer', category: 'Layers', defaultKeys: null, rebindable: false, handler: () => app.addLayer() },
        { id: 'new-group', label: 'New Group', category: 'Layers', defaultKeys: null, rebindable: false, handler: () => app.newGroup() },
        { id: 'new-adjustment-brightness-contrast', label: 'New Adjustment Layer: Brightness/Contrast', category: 'Layers', defaultKeys: null, rebindable: false, handler: () => app.newAdjustmentLayer('brightness-contrast') },
        { id: 'new-adjustment-hue-saturation', label: 'New Adjustment Layer: Hue/Saturation', category: 'Layers', defaultKeys: null, rebindable: false, handler: () => app.newAdjustmentLayer('hue-saturation') },
        { id: 'new-adjustment-levels', label: 'New Adjustment Layer: Levels', category: 'Layers', defaultKeys: null, rebindable: false, handler: () => app.newAdjustmentLayer('levels') },
        { id: 'new-adjustment-curves', label: 'New Adjustment Layer: Curves', category: 'Layers', defaultKeys: null, rebindable: false, handler: () => app.newAdjustmentLayer('curves') },
        { id: 'zoom-in', label: 'Zoom In', category: 'View', defaultKeys: null, rebindable: false, handler: () => app.zoomIn() },
        { id: 'zoom-out', label: 'Zoom Out', category: 'View', defaultKeys: null, rebindable: false, handler: () => app.zoomOut() },
        { id: 'reset-zoom', label: 'Reset Zoom', category: 'View', defaultKeys: null, rebindable: false, handler: () => app.resetZoom() },
        { id: 'open-palette-editor', label: 'Open Palette Editor', category: 'View', defaultKeys: null, rebindable: false, handler: () => ipcRenderer.invoke('open-palette-editor-window') }
    ];
}

// Merges saved overrides (from shortcuts.json, actionId -> combo string)
// onto the registry's defaultKeys, producing each action's *effective*
// combo. Only rebindable actions honor an override -- an override
// present for a non-rebindable action (e.g. a corrupt/hand-edited config
// file) is ignored rather than silently making something rebindable that
// shouldn't be.
function resolveShortcuts(registry, overrides = {}) {
    return registry.map((action) => ({
        ...action,
        keys: (action.rebindable && overrides[action.id]) || action.defaultKeys
    }));
}

// Finds the resolved action (if any) whose effective keys match the given
// event, considering only rebindable actions -- the command palette's own
// shortcut and every context-dependent selection key (Enter/Escape/
// Delete/arrows) are handled separately in event-bindings.js, not through
// this registry.
function findMatchingAction(resolvedActions, e) {
    return resolvedActions.find((action) => action.rebindable && action.keys && matchesKeyCombo(action.keys, e));
}

module.exports = {
    parseKeyCombo,
    formatKeyCombo,
    eventToKeyCombo,
    matchesKeyCombo,
    createActionRegistry,
    resolveShortcuts,
    findMatchingAction
};
