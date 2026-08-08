const { ZOOM_MIN, ZOOM_MAX } = require('./constants');

// Canvas zoom controller, moved verbatim from wasrtk.js.
//
// `env` is a closure-accessor object built once in the WASRTK constructor
// (same pattern as createHistory/createSelectionManager):
//   getZoom/setZoom                 -- the zoom level (module global)
//   mainCanvas, overlayCanvas       -- canvas elements (dimensions/style)
//   canvasWrapper                   -- scrollable wrapper element
//   clampNumber                     -- shared numeric clamp helper
//   refreshBrushPreviewFromCursor() -- keeps the brush cursor lens in sync
//                                      with the new zoom level
function createZoomController(env) {
    function updateZoom() {
        const scaler = document.getElementById('canvas-scaler');
        const zoom = env.getZoom();
        scaler.style.width = `${env.mainCanvas.width * zoom}px`;
        scaler.style.height = `${env.mainCanvas.height * zoom}px`;

        env.mainCanvas.style.transform = '';
        env.overlayCanvas.style.transform = '';

        // Update zoom input and slider
        const zoomPercentage = Math.round(zoom * 100);
        document.getElementById('zoomInput').value = zoomPercentage;
        document.getElementById('zoomSlider').value = zoomPercentage;

        // Update brush size preview to reflect new zoom level
        env.refreshBrushPreviewFromCursor();
    }

    function zoomIn() {
        env.setZoom(Math.min(env.getZoom() * 1.2, ZOOM_MAX));
        updateZoom();
    }

    function zoomOut() {
        env.setZoom(Math.max(env.getZoom() / 1.2, ZOOM_MIN));
        updateZoom();
    }

    function zoomAtPoint(zoomFactor, mouseX, mouseY) {
        const canvasWrapper = env.canvasWrapper;
        const rect = canvasWrapper.getBoundingClientRect();

        const mouseWrapperX = mouseX - rect.left;
        const mouseWrapperY = mouseY - rect.top;

        const scrollX = mouseWrapperX + canvasWrapper.scrollLeft;
        const scrollY = mouseWrapperY + canvasWrapper.scrollTop;

        const oldZoom = env.getZoom();
        const newZoom = env.clampNumber(oldZoom * zoomFactor, oldZoom, ZOOM_MIN, ZOOM_MAX);

        if (newZoom === oldZoom) {
            return;
        }

        const canvasX = scrollX / oldZoom;
        const canvasY = scrollY / oldZoom;

        const newScrollX = canvasX * newZoom;
        const newScrollY = canvasY * newZoom;

        const newScrollLeft = newScrollX - mouseWrapperX;
        const newScrollTop = newScrollY - mouseWrapperY;

        env.setZoom(newZoom);
        updateZoom();

        canvasWrapper.scrollLeft = newScrollLeft;
        canvasWrapper.scrollTop = newScrollTop;
    }

    function resetZoom() {
        env.setZoom(1);
        updateZoom();
        const canvasWrapper = env.canvasWrapper;
        const scaler = document.getElementById('canvas-scaler');
        canvasWrapper.scrollLeft = (scaler.offsetWidth - canvasWrapper.clientWidth) / 2;
        canvasWrapper.scrollTop = (scaler.offsetHeight - canvasWrapper.clientHeight) / 2;
    }

    return {
        zoomIn,
        zoomOut,
        zoomAtPoint,
        resetZoom,
        updateZoom
    };
}

module.exports = { createZoomController };
