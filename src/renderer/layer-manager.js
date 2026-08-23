// Layer management, moved verbatim from wasrtk.js: layer CRUD, reordering,
// visibility, flattening, and the layer list UI. Layer state itself
// (layers, currentLayer) stays in the wasrtk.js module globals; this
// module reaches it through env.
//
// `env` is a closure-accessor object built once in the WASRTK constructor
// (same pattern as createFrameManager):
//   getFrames                      -- the frames array (getter, not a
//                                      captured reference -- history.js's
//                                      undo/redo reassigns it wholesale)
//   getLayers                      -- the layers metadata array (getter,
//                                      same staleness reasoning)
//   getCurrentLayer/setCurrentLayer
//   getActiveSelection
//   mainCanvas
//   createLayerCanvas
//   drawVisibleLayersToContext         -- from exporters.js, used by
//                                          flattenLayer to bake the merged
//                                          layer's own opacity/blendMode/
//                                          clipToBelow into the pixels
//   applyImageSmoothing(ctx)
//   getLayerContext(layer)
//   clearSelection()
//   saveStructureState()
//   renderCurrentFrame()
//   updateStatusBar()
const { BLEND_MODES } = require('./constants');

function createLayerManager(env) {
    function addLayer() {
        if (env.getActiveSelection()) env.clearSelection();
        env.saveStructureState(); // Save state for undo
        const layers = env.getLayers();
        const newLayer = {
            id: layers.length,
            name: `Layer ${layers.length + 1}`,
            visible: true,
            locked: false,
            opacity: 1,
            blendMode: 'source-over',
            alphaLocked: false,
            clipToBelow: false
        };

        layers.push(newLayer);

        // Add layer to all frames
        env.getFrames().forEach(frame => {
            const { canvas: layerCanvas } = env.createLayerCanvas({
                width: env.mainCanvas.width,
                height: env.mainCanvas.height,
                transparent: true,
                applySmoothing: (ctx) => env.applyImageSmoothing(ctx)
            });

            frame.layers.push({
                id: newLayer.id,
                name: newLayer.name,
                visible: newLayer.visible,
                locked: newLayer.locked,
                opacity: newLayer.opacity,
                blendMode: newLayer.blendMode,
                alphaLocked: newLayer.alphaLocked,
                clipToBelow: newLayer.clipToBelow,
                canvas: layerCanvas
            });
        });

        updateLayerList();
        env.renderCurrentFrame();
    }

    function deleteLayer() {
        if (env.getActiveSelection()) env.clearSelection();
        const layers = env.getLayers();
        if (layers.length <= 1) return;

        env.saveStructureState(); // Save state for undo

        layers.splice(env.getCurrentLayer(), 1);

        // Remove layer from all frames
        env.getFrames().forEach(frame => {
            frame.layers.splice(env.getCurrentLayer(), 1);
        });

        if (env.getCurrentLayer() >= layers.length) {
            env.setCurrentLayer(layers.length - 1);
        }

        clearClipToBelowAtBottom();
        updateLayerList();
        env.renderCurrentFrame();
    }

    function moveLayerUp() {
        if (env.getActiveSelection()) env.clearSelection();
        const layers = env.getLayers();
        const currentLayer = env.getCurrentLayer();
        if (currentLayer >= layers.length - 1) return;

        env.saveStructureState(); // Save state for undo

        // Swap with layer above
        [layers[currentLayer], layers[currentLayer + 1]] = [layers[currentLayer + 1], layers[currentLayer]];

        // Swap in each frame's layer array
        env.getFrames().forEach(frame => {
            [frame.layers[currentLayer], frame.layers[currentLayer + 1]] = [frame.layers[currentLayer + 1], frame.layers[currentLayer]];
        });

        env.setCurrentLayer(currentLayer + 1);
        clearClipToBelowAtBottom();
        updateLayerList();
        env.renderCurrentFrame();
    }

    function moveLayerDown() {
        if (env.getActiveSelection()) env.clearSelection();
        const currentLayer = env.getCurrentLayer();
        if (currentLayer <= 0) return;

        env.saveStructureState(); // Save state for undo

        const layers = env.getLayers();
        // Swap with layer below
        [layers[currentLayer], layers[currentLayer - 1]] = [layers[currentLayer - 1], layers[currentLayer]];

        // Swap in each frame's layer array
        env.getFrames().forEach(frame => {
            [frame.layers[currentLayer], frame.layers[currentLayer - 1]] = [frame.layers[currentLayer - 1], frame.layers[currentLayer]];
        });

        env.setCurrentLayer(currentLayer - 1);
        clearClipToBelowAtBottom();
        updateLayerList();
        env.renderCurrentFrame();
    }

    function flattenLayer() {
        if (env.getActiveSelection()) env.clearSelection();
        const currentLayer = env.getCurrentLayer();
        if (currentLayer <= 0) {
            alert("Cannot flatten the bottom layer.");
            return;
        }

        env.saveStructureState(); // Save state for undo

        const layerToFlattenIndex = currentLayer;
        const layerBelowIndex = currentLayer - 1;

        // Merge layer in each frame. layerBelow keeps its own
        // opacity/blendMode/clipToBelow (still applies once, on render);
        // layerToFlatten's own opacity/blendMode/clipToBelow must be baked
        // into the pixels now, or they'd silently be dropped (opacity 1,
        // normal blend) the moment the layers merge. Compositing it the
        // same way the render loop would -- onto layerBelow's own current
        // pixels, so clipToBelow masks against the real layer beneath it --
        // also means an invisible layerToFlatten contributes nothing, same
        // as it would on render.
        env.getFrames().forEach(frame => {
            const layerToFlatten = frame.layers[layerToFlattenIndex];
            const layerBelow = frame.layers[layerBelowIndex];
            const ctxBelow = env.getLayerContext(layerBelow);

            env.drawVisibleLayersToContext(ctxBelow, { layers: [layerToFlatten] }, {
                createCanvas: (w, h) => env.createLayerCanvas({ width: w, height: h, transparent: true }).canvas
            });
        });

        // Remove the flattened layer from global list
        env.getLayers().splice(layerToFlattenIndex, 1);

        // Remove flattened layer from each frame
        env.getFrames().forEach(frame => {
            frame.layers.splice(layerToFlattenIndex, 1);
        });

        env.setCurrentLayer(currentLayer - 1);
        updateLayerList();
        env.renderCurrentFrame();
    }

    // UI update methods
    function updateLayerList() {
        const layerList = document.getElementById('layerList');
        layerList.innerHTML = '';

        env.getLayers().forEach((layer, index) => {
            const layerElement = document.createElement('div');
            layerElement.className = `layer-item ${index === env.getCurrentLayer() ? 'active' : ''}`;
            layerElement.dataset.layer = index;

            const opacityPercent = Math.round((layer.opacity ?? 1) * 100);
            const blendOptions = BLEND_MODES.map(mode =>
                `<option value="${mode.value}" ${mode.value === (layer.blendMode || 'source-over') ? 'selected' : ''}>${mode.label}</option>`
            ).join('');

            layerElement.innerHTML = `
                <div class="layer-item-header">
                    <div class="layer-info">
                        <span class="layer-name">${layer.name}</span>
                        ${index === env.getCurrentLayer() ? '<i class="fas fa-pencil-alt layer-indicator"></i>' : ''}
                    </div>
                    <div class="layer-visibility">
                        <i class="fas fa-${layer.visible ? 'eye' : 'eye-slash'}"></i>
                    </div>
                </div>
                <div class="layer-controls-row">
                    <select class="layer-blend-select" title="Blend mode">${blendOptions}</select>
                    <input type="range" class="layer-opacity-slider slider" min="0" max="100" value="${opacityPercent}" title="Opacity">
                    <span class="layer-opacity-value">${opacityPercent}%</span>
                </div>
                <div class="layer-controls-row">
                    <label class="layer-checkbox-option" title="Confine painting to this layer's already-opaque pixels">
                        <input type="checkbox" class="layer-alpha-lock-toggle" ${layer.alphaLocked ? 'checked' : ''}>
                        Alpha Lock
                    </label>
                    <label class="layer-checkbox-option" title="${index === 0 ? 'The bottom layer has nothing below it to clip against' : 'Clip this layer to the shape of the layers below it'}">
                        <input type="checkbox" class="layer-clip-toggle" ${layer.clipToBelow ? 'checked' : ''} ${index === 0 ? 'disabled' : ''}>
                        Clip
                    </label>
                </div>
            `;

            const visibilityToggle = layerElement.querySelector('.layer-visibility');
            visibilityToggle.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent layer selection when toggling visibility
                toggleLayerVisibility(index);
            });

            layerElement.querySelectorAll('.layer-controls-row').forEach((row) => {
                row.addEventListener('click', (e) => e.stopPropagation()); // Don't select layer when using its controls
            });

            const blendSelect = layerElement.querySelector('.layer-blend-select');
            blendSelect.addEventListener('change', (e) => setLayerBlendMode(index, e.target.value));

            const opacitySlider = layerElement.querySelector('.layer-opacity-slider');
            const opacityValue = layerElement.querySelector('.layer-opacity-value');
            let opacityDragSaved = false;
            opacitySlider.addEventListener('pointerdown', () => {
                if (!opacityDragSaved) {
                    env.saveStructureState(); // One undo entry per drag, not per tick
                    opacityDragSaved = true;
                }
            });
            opacitySlider.addEventListener('input', (e) => {
                opacityValue.textContent = `${e.target.value}%`;
                // pointerdown above already saved one undo entry for this drag.
                setLayerOpacity(index, Number(e.target.value) / 100, { save: false });
            });
            opacitySlider.addEventListener('change', () => {
                opacityDragSaved = false;
            });

            const alphaLockToggle = layerElement.querySelector('.layer-alpha-lock-toggle');
            alphaLockToggle.addEventListener('change', (e) => setLayerAlphaLocked(index, e.target.checked));

            const clipToggle = layerElement.querySelector('.layer-clip-toggle');
            clipToggle.addEventListener('change', (e) => setLayerClipToBelow(index, e.target.checked));

            layerElement.addEventListener('click', () => selectLayer(index));
            layerList.prepend(layerElement);
        });
    }

    function selectLayer(layerIndex) {
        if (env.getActiveSelection()) {
            env.clearSelection();
        }
        env.setCurrentLayer(layerIndex);
        env.renderCurrentFrame();
        updateLayerList();
        env.updateStatusBar();
    }

    function toggleLayerVisibility(layerIndex) {
        env.saveStructureState(); // Save for undo

        const layers = env.getLayers();
        const layer_template = layers[layerIndex];
        layer_template.visible = !layer_template.visible;

        // Propagate visibility change to all frames
        env.getFrames().forEach(frame => {
            const layer = frame.layers[layerIndex];
            if (layer) {
                layer.visible = layer_template.visible;
            }
        });

        updateLayerList();
        env.renderCurrentFrame();
    }

    // Shared body for the per-layer field setters below: a layer's metadata
    // template (in `layers`) and its mirror in every frame's `frame.layers`
    // entry (same index) always carry the same value, like visible/locked.
    function setLayerField(layerIndex, field, value) {
        env.getLayers()[layerIndex][field] = value;

        env.getFrames().forEach(frame => {
            const layer = frame.layers[layerIndex];
            if (layer) layer[field] = value;
        });

        env.renderCurrentFrame();
    }

    // deleteLayer/moveLayerUp/moveLayerDown are positional array ops that
    // never look at clipToBelow, so any of them can land a *different*
    // layer at index 0 while it still carries clipToBelow: true from its
    // old position -- setLayerClipToBelow's index-0 guard never runs on
    // these paths. Left uncorrected, renderCurrentFrame's clip branch masks
    // that layer against a blank accumulator (nothing composited yet at
    // the bottom of the stack) and it silently vanishes. Called after every
    // positional mutation to keep the invariant "index 0 never clips" true
    // regardless of how a layer got there.
    function clearClipToBelowAtBottom() {
        if (env.getLayers()[0]?.clipToBelow) {
            setLayerField(0, 'clipToBelow', false);
        }
    }

    function setLayerOpacity(layerIndex, opacity, { save = true } = {}) {
        if (save) env.saveStructureState(); // Save for undo, unless the caller already did (e.g. slider drag start)
        setLayerField(layerIndex, 'opacity', opacity);
    }

    function setLayerBlendMode(layerIndex, blendMode) {
        env.saveStructureState(); // Save for undo -- discrete action, like toggleLayerVisibility
        setLayerField(layerIndex, 'blendMode', blendMode);
    }

    function setLayerAlphaLocked(layerIndex, alphaLocked) {
        env.saveStructureState();
        setLayerField(layerIndex, 'alphaLocked', alphaLocked);
    }

    function setLayerClipToBelow(layerIndex, clipToBelow) {
        if (layerIndex === 0) return; // No layer below the bottom one to clip against
        env.saveStructureState();
        setLayerField(layerIndex, 'clipToBelow', clipToBelow);
    }

    return {
        addLayer,
        deleteLayer,
        moveLayerUp,
        moveLayerDown,
        flattenLayer,
        updateLayerList,
        selectLayer,
        toggleLayerVisibility,
        setLayerOpacity,
        setLayerBlendMode,
        setLayerAlphaLocked,
        setLayerClipToBelow
    };
}

module.exports = { createLayerManager };
