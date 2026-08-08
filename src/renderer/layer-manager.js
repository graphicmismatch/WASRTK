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
//   applyImageSmoothing(ctx)
//   getLayerContext(layer)
//   clearSelection()
//   saveStructureState()
//   renderCurrentFrame()
//   updateStatusBar()
function createLayerManager(env) {
    function addLayer() {
        if (env.getActiveSelection()) env.clearSelection();
        env.saveStructureState(); // Save state for undo
        const layers = env.getLayers();
        const newLayer = {
            id: layers.length,
            name: `Layer ${layers.length + 1}`,
            visible: true,
            locked: false
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

        // Merge layer in each frame
        env.getFrames().forEach(frame => {
            const layerToFlatten = frame.layers[layerToFlattenIndex];
            const layerBelow = frame.layers[layerBelowIndex];

            const ctxBelow = env.getLayerContext(layerBelow);
            ctxBelow.drawImage(layerToFlatten.canvas, 0, 0);
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

            layerElement.innerHTML = `
                <div class="layer-info">
                    <span class="layer-name">${layer.name}</span>
                    ${index === env.getCurrentLayer() ? '<i class="fas fa-pencil-alt layer-indicator"></i>' : ''}
                </div>
                <div class="layer-visibility">
                    <i class="fas fa-${layer.visible ? 'eye' : 'eye-slash'}"></i>
                </div>
            `;

            const visibilityToggle = layerElement.querySelector('.layer-visibility');
            visibilityToggle.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent layer selection when toggling visibility
                toggleLayerVisibility(index);
            });

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

    return {
        addLayer,
        deleteLayer,
        moveLayerUp,
        moveLayerDown,
        flattenLayer,
        updateLayerList,
        selectLayer,
        toggleLayerVisibility
    };
}

module.exports = { createLayerManager };
