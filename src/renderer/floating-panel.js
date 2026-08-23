const { clampNumber } = require('./math-utils');

// Makes `panelEl` draggable by `handleEl`, clamped so it always stays fully
// inside `boundsEl` (the workspace) -- on drag, and on window resize.
// `initialPosition` ({ left, top }) seeds the starting spot (falls back to
// the panel's own inline/default position when omitted); `onPositionChange`
// fires once per drag, after release, with the clamped { left, top }.
function makeFloatingPanelDraggable(panelEl, handleEl, boundsEl, { initialPosition, onPositionChange } = {}) {
    let dragOffsetX = 0;
    let dragOffsetY = 0;

    function setPosition(left, top) {
        const bounds = boundsEl.getBoundingClientRect();
        const panel = panelEl.getBoundingClientRect();
        const maxLeft = Math.max(0, bounds.width - panel.width);
        const maxTop = Math.max(0, bounds.height - panel.height);
        panelEl.style.left = `${clampNumber(left, 0, 0, maxLeft)}px`;
        panelEl.style.top = `${clampNumber(top, 0, 0, maxTop)}px`;
    }

    function onPointerMove(e) {
        const bounds = boundsEl.getBoundingClientRect();
        setPosition(e.clientX - bounds.left - dragOffsetX, e.clientY - bounds.top - dragOffsetY);
    }

    function onPointerUp() {
        document.removeEventListener('pointermove', onPointerMove);
        document.removeEventListener('pointerup', onPointerUp);
        if (onPositionChange) {
            onPositionChange({ left: panelEl.offsetLeft, top: panelEl.offsetTop });
        }
    }

    handleEl.addEventListener('pointerdown', (e) => {
        const panel = panelEl.getBoundingClientRect();
        dragOffsetX = e.clientX - panel.left;
        dragOffsetY = e.clientY - panel.top;
        document.addEventListener('pointermove', onPointerMove);
        document.addEventListener('pointerup', onPointerUp);
        e.preventDefault();
    });

    window.addEventListener('resize', () => setPosition(panelEl.offsetLeft, panelEl.offsetTop));
    setPosition(initialPosition ? initialPosition.left : panelEl.offsetLeft, initialPosition ? initialPosition.top : panelEl.offsetTop);
}

// Restores a panel's persisted size (if any) and reports future
// user-driven resizes. The actual resize handle is native CSS
// (`resize: both` on `resizeEl`, normally the panel element itself --
// see .floating-panel in styles.css); there's no resize *event* for an
// element the way there is for the window, so a ResizeObserver is the
// only way to detect it.
function makeFloatingPanelResizable(resizeEl, { initialSize, onSizeChange } = {}) {
    if (initialSize && initialSize.width) resizeEl.style.width = `${initialSize.width}px`;
    if (initialSize && initialSize.height) resizeEl.style.height = `${initialSize.height}px`;

    if (typeof ResizeObserver === 'undefined' || !onSizeChange) return;

    // The observer fires once immediately on observe() with the current
    // size -- skip that first callback so restoring initialSize above
    // doesn't immediately re-report the same value right back as if the
    // user had just resized it.
    let isFirstCallback = true;
    const observer = new ResizeObserver((entries) => {
        if (isFirstCallback) {
            isFirstCallback = false;
            return;
        }
        const entry = entries[0];
        if (!entry) return;
        const { width, height } = entry.contentRect;
        onSizeChange({ width: Math.round(width), height: Math.round(height) });
    });
    observer.observe(resizeEl);
}

module.exports = { makeFloatingPanelDraggable, makeFloatingPanelResizable };
