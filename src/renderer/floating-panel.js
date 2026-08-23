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

module.exports = { makeFloatingPanelDraggable };
