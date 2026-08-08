// Status bar UI sync, moved verbatim from wasrtk.js.
//
// `env` is a closure-accessor object built once in the WASRTK constructor.
// updateStatusBar only reads state, never mutates it, so every entry is a
// getter (or a stable DOM reference for `mainCanvas`):
//   getCurrentTool, getCurrentColor, getPressureSensitivityEnabled,
//   getCurrentInputPressure, getBrushSize, getBrushPreset, getBrushFlow,
//   getBrushSpacing, getCurrentFrame, getFrames, mainCanvas, getLayers,
//   getCurrentLayer, getAntialiasingEnabled, getReferenceImage,
//   getReferenceVisible, getReferenceScale
function createStatusBar(env) {
    function updateStatusBar() {
        const toolNames = {
            pen: 'Pen Tool',
            line: 'Line Tool',
            rectangle: 'Rectangle Tool',
            circle: 'Circle Tool',
            fill: 'Fill Tool',
            eraser: 'Eraser Tool',
            selection: 'Selection Tool',
            eyedropper: 'Eyedropper Tool'
        };

        document.getElementById('currentTool').textContent = toolNames[env.getCurrentTool()] || 'Unknown Tool';
        document.getElementById('currentColor').textContent = `Color: ${env.getCurrentColor()}`;
        const pressureStatus = env.getPressureSensitivityEnabled()
            ? `pressure ${Math.round(env.getCurrentInputPressure() * 100)}%`
            : 'pressure off';
        const brushStatus = document.getElementById('brushSize');
        brushStatus.textContent = `Brush: ${env.getBrushSize()}px ${env.getBrushPreset()}`;
        brushStatus.title = `Flow ${Math.round(env.getBrushFlow() * 100)}%, spacing ${Math.round(env.getBrushSpacing() * 100)}%, ${pressureStatus}`;
        document.getElementById('currentFrame').textContent = `Frame: ${env.getCurrentFrame() + 1}`;
        document.getElementById('totalFrames').textContent = `Total: ${env.getFrames().length}`;
        document.getElementById('canvasDimensions').textContent = `${env.mainCanvas.width}x${env.mainCanvas.height}`;

        // Add current layer information
        const layers = env.getLayers();
        const currentLayer = env.getCurrentLayer();
        const currentLayerName = layers[currentLayer] ? layers[currentLayer].name : 'Unknown';
        const currentLayerInfo = `Layer: ${currentLayerName}`;
        const statusLeft = document.querySelector('.status-left');
        const existingLayerInfo = statusLeft.querySelector('#currentLayerInfo');
        if (existingLayerInfo) {
            existingLayerInfo.textContent = currentLayerInfo;
        } else {
            const layerInfo = document.createElement('span');
            layerInfo.id = 'currentLayerInfo';
            layerInfo.textContent = currentLayerInfo;
            statusLeft.appendChild(layerInfo);
        }

        // Add antialiasing status to status bar
        const antialiasingStatus = env.getAntialiasingEnabled() ? 'AA: On' : 'AA: Off';
        const statusRight = document.querySelector('.status-right');
        const existingAAStatus = statusRight.querySelector('#antialiasingStatus');
        if (existingAAStatus) {
            existingAAStatus.textContent = antialiasingStatus;
        } else {
            const aaStatus = document.createElement('span');
            aaStatus.id = 'antialiasingStatus';
            aaStatus.textContent = antialiasingStatus;
            statusRight.appendChild(aaStatus);
        }

        // Add reference image status
        const existingRefStatus = statusRight.querySelector('#referenceStatus');
        if (existingRefStatus) {
            existingRefStatus.remove();
        }

        if (env.getReferenceImage() && env.getReferenceVisible()) {
            const refStatus = document.createElement('span');
            refStatus.id = 'referenceStatus';
            refStatus.textContent = `Ref: ${Math.round(env.getReferenceScale() * 100)}%`;
            refStatus.title = 'Reference image loaded. Ctrl+click to drag, Ctrl+/- to scale, Ctrl+R to re-center without changing zoom';
            statusRight.appendChild(refStatus);
        }
    }

    return { updateStatusBar };
}

module.exports = { createStatusBar };
