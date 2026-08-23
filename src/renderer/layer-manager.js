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
const {
    isGroupHeader,
    computeGroupMembership,
    getBlockRange,
    swapAdjacentBlocks
} = require('./layer-groups');

// Shared field set every layer entry carries (see layer-groups.js's header
// comment for why group entries carry the same shape, opacity/blendMode/
// alphaLocked/clipToBelow included, even though those never do anything
// for a group in this version).
function baseLayerFields() {
    return { visible: true, locked: false, opacity: 1, blendMode: 'source-over', alphaLocked: false, clipToBelow: false };
}

function createLayerManager(env) {
    // Builds a new blank, transparent layer canvas for every existing
    // frame and inserts a metadata+canvas entry for it at `insertIndex` in
    // each frame's `frame.layers` (mirroring the entry already added to
    // the global `layers` array at the same index). Used by newGroup;
    // addLayer inlines the equivalent loop since it also needs to bump an
    // existing group's memberCount in the same pass.
    function insertLayerEntryIntoFrames(insertIndex, metadata) {
        env.getFrames().forEach(frame => {
            const { canvas } = env.createLayerCanvas({
                width: env.mainCanvas.width,
                height: env.mainCanvas.height,
                transparent: true,
                applySmoothing: (ctx) => env.applyImageSmoothing(ctx)
            });
            frame.layers.splice(insertIndex, 0, { ...metadata, canvas });
        });
    }

    function addLayer() {
        if (env.getActiveSelection()) env.clearSelection();
        env.saveStructureState(); // Save state for undo
        const layers = env.getLayers();
        const currentLayer = env.getCurrentLayer();
        const membership = computeGroupMembership(layers);
        // If the current layer is a group (its header, or one of its
        // members), the new layer joins that group, inserted directly
        // above the current selection -- otherwise it's appended at the
        // very end, ungrouped, same as before groups existed.
        const headerIndex = isGroupHeader(layers[currentLayer]) ? currentLayer : membership[currentLayer];
        const insertIndex = headerIndex === null
            ? layers.length
            : (isGroupHeader(layers[currentLayer]) ? currentLayer : currentLayer + 1);

        // Bump the group's memberCount on its still-correctly-indexed
        // object *before* splicing -- once we splice at insertIndex <=
        // headerIndex, headerIndex no longer points at the header.
        if (headerIndex !== null) {
            layers[headerIndex].memberCount = (layers[headerIndex].memberCount || 0) + 1;
        }

        const newLayer = {
            id: layers.length,
            name: `Layer ${layers.length + 1}`,
            type: 'layer',
            ...baseLayerFields()
        };
        layers.splice(insertIndex, 0, newLayer);

        env.getFrames().forEach(frame => {
            if (headerIndex !== null) {
                frame.layers[headerIndex].memberCount = (frame.layers[headerIndex].memberCount || 0) + 1;
            }
            const { canvas } = env.createLayerCanvas({
                width: env.mainCanvas.width,
                height: env.mainCanvas.height,
                transparent: true,
                applySmoothing: (ctx) => env.applyImageSmoothing(ctx)
            });
            frame.layers.splice(insertIndex, 0, { id: newLayer.id, name: newLayer.name, type: newLayer.type, ...baseLayerFields(), canvas });
        });

        env.setCurrentLayer(insertIndex);
        updateLayerList();
        env.renderCurrentFrame();
    }

    // Wraps the currently selected (ungrouped, non-header) layer in a new
    // single-member group. The header is inserted directly above the
    // wrapped layer -- see layer-groups.js for why headers sit at the top
    // of their own block. No nesting (v1 scope): both grouping an
    // already-grouped layer and grouping a group header itself are no-ops.
    function newGroup() {
        if (env.getActiveSelection()) env.clearSelection();
        const layers = env.getLayers();
        const currentLayer = env.getCurrentLayer();
        if (isGroupHeader(layers[currentLayer])) return;
        const membership = computeGroupMembership(layers);
        if (membership[currentLayer] !== null) return;

        env.saveStructureState();

        const insertIndex = currentLayer + 1;
        const newHeader = {
            id: layers.length,
            name: `Group ${layers.length + 1}`,
            type: 'group',
            collapsed: false,
            memberCount: 1,
            ...baseLayerFields()
        };
        layers.splice(insertIndex, 0, newHeader);
        insertLayerEntryIntoFrames(insertIndex, {
            id: newHeader.id, name: newHeader.name, type: newHeader.type,
            collapsed: newHeader.collapsed, memberCount: newHeader.memberCount,
            ...baseLayerFields()
        });

        env.setCurrentLayer(insertIndex);
        updateLayerList();
        env.renderCurrentFrame();
    }

    function deleteLayer() {
        if (env.getActiveSelection()) env.clearSelection();
        const layers = env.getLayers();
        if (layers.length <= 1) return;

        const currentLayer = env.getCurrentLayer();
        const membership = computeGroupMembership(layers);

        // Deleting a group header removes the whole block (header +
        // members) as a unit; deleting a member just removes that one
        // entry and shrinks its group; anything else is an ordinary
        // single-layer delete.
        let deleteStart, deleteCount, shrinkHeaderIndex = null;
        if (isGroupHeader(layers[currentLayer])) {
            const [start, end] = getBlockRange(layers, membership, currentLayer);
            deleteStart = start;
            deleteCount = end - start + 1;
        } else {
            deleteStart = currentLayer;
            deleteCount = 1;
            shrinkHeaderIndex = membership[currentLayer];
        }

        if (layers.length - deleteCount < 1) return; // must always keep at least 1 layer

        env.saveStructureState(); // Save state for undo

        // Shrink the group on its still-correctly-indexed object *before*
        // splicing (shrinkHeaderIndex is always above deleteStart here, so
        // the splice would otherwise shift it out from under this index).
        if (shrinkHeaderIndex !== null) {
            layers[shrinkHeaderIndex].memberCount -= 1;
        }
        layers.splice(deleteStart, deleteCount);

        env.getFrames().forEach(frame => {
            if (shrinkHeaderIndex !== null) {
                frame.layers[shrinkHeaderIndex].memberCount -= 1;
            }
            frame.layers.splice(deleteStart, deleteCount);
        });

        if (env.getCurrentLayer() >= layers.length) {
            env.setCurrentLayer(layers.length - 1);
        }

        clearClipToBelowAtBottom();
        updateLayerList();
        env.renderCurrentFrame();
    }

    // moveLayerUp/moveLayerDown move whichever *block* contains the
    // current layer past its adjacent block: a group header's block is
    // header+members (moves as a unit, keeping the group intact), while a
    // member or an ordinary layer's block is just itself. A member is
    // confined to move only within its own group's range -- reaching the
    // group's own edge blocks further movement in that direction (v1
    // scope cut: the move buttons alone never add/remove group membership,
    // see addLayer for how members actually get added to a group).
    function moveLayerUp() {
        if (env.getActiveSelection()) env.clearSelection();
        const layers = env.getLayers();
        const currentLayer = env.getCurrentLayer();
        const membership = computeGroupMembership(layers);
        const headerIndex = membership[currentLayer];
        if (headerIndex !== null && currentLayer === headerIndex - 1) return; // topmost member, adjacent to its header

        const [start, end] = getBlockRange(layers, membership, currentLayer);
        const offsetWithinBlock = currentLayer - start;
        if (end + 1 >= layers.length) return; // already at the top of the stack

        const [nStart, nEnd] = getBlockRange(layers, membership, end + 1);

        env.saveStructureState(); // Save state for undo

        swapAdjacentBlocks(layers, start, end, nStart, nEnd);
        env.getFrames().forEach(frame => swapAdjacentBlocks(frame.layers, start, end, nStart, nEnd));

        const neighborSize = nEnd - nStart + 1;
        env.setCurrentLayer(start + neighborSize + offsetWithinBlock);
        clearClipToBelowAtBottom();
        updateLayerList();
        env.renderCurrentFrame();
    }

    function moveLayerDown() {
        if (env.getActiveSelection()) env.clearSelection();
        const layers = env.getLayers();
        const currentLayer = env.getCurrentLayer();
        const membership = computeGroupMembership(layers);
        const headerIndex = membership[currentLayer];
        if (headerIndex !== null && currentLayer === headerIndex - (layers[headerIndex].memberCount || 0)) return; // bottommost member

        const [start, end] = getBlockRange(layers, membership, currentLayer);
        const offsetWithinBlock = currentLayer - start;
        if (start - 1 < 0) return; // already at the bottom of the stack

        const [nStart, nEnd] = getBlockRange(layers, membership, start - 1);

        env.saveStructureState(); // Save state for undo

        swapAdjacentBlocks(layers, nStart, nEnd, start, end);
        env.getFrames().forEach(frame => swapAdjacentBlocks(frame.layers, nStart, nEnd, start, end));

        env.setCurrentLayer(nStart + offsetWithinBlock);
        clearClipToBelowAtBottom();
        updateLayerList();
        env.renderCurrentFrame();
    }

    function flattenLayer() {
        if (env.getActiveSelection()) env.clearSelection();
        const layers = env.getLayers();
        const currentLayer = env.getCurrentLayer();
        if (currentLayer <= 0) {
            alert("Cannot flatten the bottom layer.");
            return;
        }
        if (isGroupHeader(layers[currentLayer])) {
            alert("Cannot flatten a group.");
            return;
        }

        const layerToFlattenIndex = currentLayer;
        const layerBelowIndex = currentLayer - 1;
        if (isGroupHeader(layers[layerBelowIndex])) {
            alert("Cannot flatten into a group.");
            return;
        }

        const membership = computeGroupMembership(layers);
        const shrinkHeaderIndex = membership[currentLayer]; // set if the flattened layer was a group member

        env.saveStructureState(); // Save state for undo

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

        // Shrink the group on its still-correctly-indexed object *before*
        // splicing, same reasoning as deleteLayer.
        if (shrinkHeaderIndex !== null) {
            layers[shrinkHeaderIndex].memberCount -= 1;
        }
        layers.splice(layerToFlattenIndex, 1);

        env.getFrames().forEach(frame => {
            if (shrinkHeaderIndex !== null) {
                frame.layers[shrinkHeaderIndex].memberCount -= 1;
            }
            frame.layers.splice(layerToFlattenIndex, 1);
        });

        env.setCurrentLayer(currentLayer - 1);
        clearClipToBelowAtBottom();
        updateLayerList();
        env.renderCurrentFrame();
    }

    // UI update methods
    function updateLayerList() {
        const layerList = document.getElementById('layerList');
        layerList.innerHTML = '';

        const layers = env.getLayers();
        const membership = computeGroupMembership(layers);

        layers.forEach((layer, index) => {
            const headerIndex = membership[index];
            // A member row is hidden entirely while its group is collapsed
            // (its content still renders on canvas -- only the panel entry
            // collapses, matching the usual folder-collapse convention).
            if (headerIndex !== null && layers[headerIndex].collapsed) return;

            const layerElement = document.createElement('div');
            const isGroup = isGroupHeader(layer);
            const classes = ['layer-item'];
            if (index === env.getCurrentLayer()) classes.push('active');
            if (isGroup) classes.push('layer-item-group');
            if (headerIndex !== null) classes.push('layer-item-member');
            layerElement.className = classes.join(' ');
            layerElement.dataset.layer = index;

            if (isGroup) {
                layerElement.innerHTML = `
                    <div class="layer-item-header">
                        <div class="layer-info">
                            <i class="fas fa-${layer.collapsed ? 'chevron-right' : 'chevron-down'} layer-group-collapse-toggle" title="${layer.collapsed ? 'Expand group' : 'Collapse group'}"></i>
                            <i class="fas fa-folder"></i>
                            <span class="layer-name">${layer.name}</span>
                            ${index === env.getCurrentLayer() ? '<i class="fas fa-pencil-alt layer-indicator"></i>' : ''}
                        </div>
                        <div class="layer-visibility">
                            <i class="fas fa-${layer.visible ? 'eye' : 'eye-slash'}"></i>
                        </div>
                    </div>
                    <div class="layer-controls-row">
                        <label class="layer-checkbox-option" title="Lock this group -- blocks editing every layer inside it">
                            <input type="checkbox" class="layer-group-lock-toggle" ${layer.locked ? 'checked' : ''}>
                            Lock Group
                        </label>
                    </div>
                `;

                layerElement.querySelector('.layer-group-collapse-toggle').addEventListener('click', (e) => {
                    e.stopPropagation();
                    toggleGroupCollapsed(index);
                });

                layerElement.querySelector('.layer-group-lock-toggle').addEventListener('change', (e) => setLayerGroupLocked(index, e.target.checked));
            } else {
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

                layerElement.querySelector('.layer-alpha-lock-toggle').addEventListener('change', (e) => setLayerAlphaLocked(index, e.target.checked));
                layerElement.querySelector('.layer-clip-toggle').addEventListener('change', (e) => setLayerClipToBelow(index, e.target.checked));
            }

            const visibilityToggle = layerElement.querySelector('.layer-visibility');
            visibilityToggle.addEventListener('click', (e) => {
                e.stopPropagation(); // Prevent layer selection when toggling visibility
                toggleLayerVisibility(index);
            });

            layerElement.querySelectorAll('.layer-controls-row').forEach((row) => {
                row.addEventListener('click', (e) => e.stopPropagation()); // Don't select layer when using its controls
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

    function setLayerGroupLocked(headerIndex, locked) {
        env.saveStructureState(); // Discrete action, like toggleLayerVisibility -- blocks editing every member
        setLayerField(headerIndex, 'locked', locked);
    }

    // Collapse is panel-display-only -- it never affects the rendered
    // canvas (updateLayerList just hides member rows while collapsed), so
    // unlike the other per-layer toggles it isn't undo-tracked, matching
    // how zoom/theme aren't either. Still mirrored into every frame for
    // consistency with the rest of the layer metadata and because
    // project-io.js persists it.
    function toggleGroupCollapsed(headerIndex) {
        setLayerField(headerIndex, 'collapsed', !env.getLayers()[headerIndex].collapsed);
        updateLayerList();
    }

    return {
        addLayer,
        newGroup,
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
        setLayerClipToBelow,
        setLayerGroupLocked,
        toggleGroupCollapsed
    };
}

module.exports = { createLayerManager };
