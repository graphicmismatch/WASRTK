// Frame/playback management, moved verbatim from wasrtk.js: frame CRUD,
// reordering (including the timeline's drag-and-drop reorder), playback,
// and onion skinning. Frame state itself (frames, currentFrame) stays in
// the wasrtk.js module globals; this module reaches it through env.
//
// `env` is a closure-accessor object built once in the WASRTK constructor
// (same pattern as createHistory/createSelectionManager):
//   getFrames                          -- the frames array (getter only --
//                                          this module mutates it in place
//                                          via push/splice, never reassigns
//                                          it; history.js's undo/redo does
//                                          reassign it, so a getter avoids
//                                          holding a stale reference)
//   getCurrentFrame/setCurrentFrame    -- current frame index
//   getLayers                          -- the layers metadata array (read
//                                          only, for addFrame's per-layer
//                                          canvas seeding)
//   getDraggedFrameIndex/setDraggedFrameIndex
//                                       -- timeline drag-and-drop state
//   getIsAnimating/setIsAnimating      -- playback state
//   getOnionSkinningEnabled, getOnionSkinningRange
//   getReferenceImage, getReferenceVisible, getReferenceOpacity,
//   getReferenceX, getReferenceY, getReferenceScale
//   getHasTransparentBackground, getProjectBackgroundColor
//                                       -- project settings read by addFrame
//   mainCanvas, mainCtx                -- canvas elements/context
//   createLayerCanvas                  -- shared layer-canvas factory
//   drawVisibleLayersToContext         -- from exporters.js
//   applyImageSmoothing(ctx)
//   clearSelection()
//   saveStructureState()
//   updateStatusBar()
function createFrameManager(env) {
    function addFrame() {
        if (env.getActiveSelection()) env.clearSelection();
        env.saveStructureState();
        const frames = env.getFrames();
        const newFrame = {
            id: frames.length,
            name: `Frame ${frames.length + 1}`,
            layers: [],
            timestamp: Date.now()
        };
        // Create empty layers matching the global layers array
        env.getLayers().forEach(layerTemplate => {
            // Only the background layer (id 0) honors the project background
            // setting; every other layer is always transparent.
            const isBackgroundLayer = layerTemplate.id === 0;
            const { canvas: newLayerCanvas } = env.createLayerCanvas({
                width: env.mainCanvas.width,
                height: env.mainCanvas.height,
                transparent: !isBackgroundLayer || env.getHasTransparentBackground(),
                backgroundColor: env.getProjectBackgroundColor(),
                applySmoothing: (ctx) => env.applyImageSmoothing(ctx)
            });
            const newLayer = {
                id: layerTemplate.id,
                name: layerTemplate.name,
                visible: layerTemplate.visible,
                locked: layerTemplate.locked,
                canvas: newLayerCanvas
            };
            newFrame.layers.push(newLayer);
        });
        frames.push(newFrame);
        selectFrame(frames.length - 1);
        updateTimeline();
    }

    function duplicateFrame() {
        if (env.getActiveSelection()) env.clearSelection();
        const frames = env.getFrames();
        if (frames.length === 0) return;

        env.saveStructureState();

        const duplicatedFrame = {
            id: frames.length,
            name: `Frame ${frames.length + 1}`,
            layers: [],
            timestamp: Date.now()
        };

        frames[env.getCurrentFrame()].layers.forEach(layer => {
            const { canvas: newLayerCanvas, ctx } = env.createLayerCanvas({
                width: env.mainCanvas.width,
                height: env.mainCanvas.height,
                transparent: true,
                applySmoothing: (ctx) => env.applyImageSmoothing(ctx)
            });
            const newLayer = {
                id: layer.id,
                name: layer.name,
                visible: layer.visible,
                locked: layer.locked,
                canvas: newLayerCanvas
            };

            ctx.drawImage(layer.canvas, 0, 0);
            duplicatedFrame.layers.push(newLayer);
        });

        frames.push(duplicatedFrame);
        selectFrame(frames.length - 1);
        updateTimeline();
    }

    function deleteFrame() {
        if (env.getActiveSelection()) env.clearSelection();
        const frames = env.getFrames();
        if (frames.length <= 1) return;

        env.saveStructureState();
        frames.splice(env.getCurrentFrame(), 1);
        reindexFrames();

        if (env.getCurrentFrame() >= frames.length) {
            env.setCurrentFrame(frames.length - 1);
        }

        selectFrame(env.getCurrentFrame());
        updateTimeline();
    }

    function reindexFrames() {
        env.getFrames().forEach((frame, index) => {
            frame.id = index;
            frame.name = `Frame ${index + 1}`;
        });
    }

    function moveFrame(fromIndex, toIndex) {
        if (env.getActiveSelection()) env.clearSelection();
        const frames = env.getFrames();
        if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0 || fromIndex >= frames.length || toIndex >= frames.length) {
            return;
        }

        env.saveStructureState();

        const [movedFrame] = frames.splice(fromIndex, 1);
        frames.splice(toIndex, 0, movedFrame);
        reindexFrames();
        env.setCurrentFrame(toIndex);
        renderCurrentFrame();
        updateTimeline();
        env.updateStatusBar();
    }

    function moveFrameLeft() {
        if (env.getCurrentFrame() <= 0) return;
        moveFrame(env.getCurrentFrame(), env.getCurrentFrame() - 1);
    }

    function moveFrameRight() {
        if (env.getCurrentFrame() >= env.getFrames().length - 1) return;
        moveFrame(env.getCurrentFrame(), env.getCurrentFrame() + 1);
    }

    function selectFrame(frameIndex) {
        if (env.getActiveSelection()) {
            env.clearSelection();
        }
        env.setCurrentFrame(frameIndex);
        // renderCurrentFrame() already calls updateTimeline() -- no need to
        // rebuild the timeline DOM a second time here.
        renderCurrentFrame();
        env.updateStatusBar();
    }

    // Animation methods
    function toggleAnimation() {
        if (env.getFrames().length <= 1) return;

        if (env.getIsAnimating()) {
            // Stop animation
            env.setIsAnimating(false);
            const playPauseBtn = document.getElementById('playPauseBtn');
            playPauseBtn.innerHTML = '<i class="fas fa-play"></i>';
            playPauseBtn.title = 'Play Animation (Space)';
        } else {
            // Start animation
            env.setIsAnimating(true);
            const playPauseBtn = document.getElementById('playPauseBtn');
            playPauseBtn.innerHTML = '<i class="fas fa-pause"></i>';
            playPauseBtn.title = 'Pause Animation (Space)';
            animate();
        }
    }

    function animate() {
        if (!env.getIsAnimating()) return;

        const fps = parseInt(document.getElementById('fpsSlider').value);
        const frameDelay = 1000 / fps;

        setTimeout(() => {
            if (!env.getIsAnimating()) return;

            env.setCurrentFrame((env.getCurrentFrame() + 1) % env.getFrames().length);
            selectFrame(env.getCurrentFrame());
            animate();
        }, frameDelay);
    }

    // Rendering methods
    function renderCurrentFrame() {
        // Clear main canvas
        env.mainCtx.clearRect(0, 0, env.mainCanvas.width, env.mainCanvas.height);
        // Apply smoothing settings to main canvas context
        env.applyImageSmoothing(env.mainCtx);
        const frames = env.getFrames();
        if (frames.length === 0) return;
        const frame = frames[env.getCurrentFrame()];
        // Draw layers of the current frame first
        frame.layers.forEach(layer => {
            if (layer.visible) {
                env.mainCtx.globalAlpha = layer.locked ? 0.5 : 1.0;
                env.mainCtx.drawImage(layer.canvas, 0, 0);
            }
        });
        // Then, draw onion skinning on top
        if (env.getOnionSkinningEnabled()) {
            drawOnionSkinning();
        }
        if (env.getReferenceImage() && env.getReferenceVisible()) {
            env.mainCtx.globalAlpha = env.getReferenceOpacity();
            const scaledWidth = env.getReferenceImage().width * env.getReferenceScale();
            const scaledHeight = env.getReferenceImage().height * env.getReferenceScale();
            env.mainCtx.drawImage(env.getReferenceImage(), env.getReferenceX(), env.getReferenceY(), scaledWidth, scaledHeight);
        }
        env.mainCtx.globalAlpha = 1.0;
        // --- Live update timeline after every frame render ---
        updateTimeline();
    }

    function drawOnionSkinning() {
        const range = env.getOnionSkinningRange();
        const currentIndex = env.getCurrentFrame();
        const frames = env.getFrames();

        // Draw previous frames
        for (let i = 1; i <= range; i++) {
            const frameIndex = currentIndex - i;
            if (frameIndex >= 0) {
                drawFrameAsOnionSkin(frames[frameIndex], 0.3 / i);
            }
        }

        // Draw next frames
        for (let i = 1; i <= range; i++) {
            const frameIndex = currentIndex + i;
            if (frameIndex < frames.length) {
                drawFrameAsOnionSkin(frames[frameIndex], 0.2 / i);
            }
        }
    }

    function drawFrameAsOnionSkin(frame, alpha) {
        env.mainCtx.globalAlpha = alpha;
        env.drawVisibleLayersToContext(env.mainCtx, frame);
    }

    // UI update methods
    function updateTimeline() {
        const timeline = document.getElementById('timeline');
        timeline.innerHTML = '';
        env.getFrames().forEach((frame, index) => {
            const frameElement = document.createElement('div');
            frameElement.className = `frame-item ${index === env.getCurrentFrame() ? 'active' : ''}`;
            frameElement.dataset.frame = index;
            frameElement.draggable = true;
            frameElement.addEventListener('dragstart', (event) => {
                env.setDraggedFrameIndex(index);
                frameElement.classList.add('dragging');
                if (event.dataTransfer) {
                    event.dataTransfer.effectAllowed = 'move';
                    event.dataTransfer.setData('text/plain', String(index));
                }
            });
            frameElement.addEventListener('dragend', () => {
                env.setDraggedFrameIndex(null);
                frameElement.classList.remove('dragging');
                timeline.querySelectorAll('.frame-item').forEach((item) => item.classList.remove('drag-over'));
            });
            frameElement.addEventListener('dragover', (event) => {
                if (env.getDraggedFrameIndex() === null || env.getDraggedFrameIndex() === index) {
                    return;
                }
                event.preventDefault();
                frameElement.classList.add('drag-over');
                if (event.dataTransfer) {
                    event.dataTransfer.dropEffect = 'move';
                }
            });
            frameElement.addEventListener('dragleave', () => {
                frameElement.classList.remove('drag-over');
            });
            frameElement.addEventListener('drop', (event) => {
                event.preventDefault();
                frameElement.classList.remove('drag-over');
                if (env.getDraggedFrameIndex() === null || env.getDraggedFrameIndex() === index) {
                    return;
                }
                moveFrame(env.getDraggedFrameIndex(), index);
            });
            // Create a canvas for the preview
            const previewCanvas = document.createElement('canvas');
            previewCanvas.width = 50;
            previewCanvas.height = 40;
            const previewCtx = previewCanvas.getContext('2d');

            // Fill with background color
            previewCtx.fillStyle = '#222';
            previewCtx.fillRect(0, 0, previewCanvas.width, previewCanvas.height);
            // Composite all visible layers, scaled to fit
            const scaleX = previewCanvas.width / env.mainCanvas.width;
            const scaleY = previewCanvas.height / env.mainCanvas.height;
            frame.layers.forEach(layer => {
                if (layer.visible) {
                    previewCtx.save();
                    previewCtx.globalAlpha = layer.locked ? 0.5 : 1.0;
                    previewCtx.setTransform(scaleX, 0, 0, scaleY, 0, 0);
                    previewCtx.drawImage(layer.canvas, 0, 0);
                    previewCtx.setTransform(1, 0, 0, 1, 0, 0);
                    previewCtx.restore();
                }
            });
            // Add the preview canvas to the frame preview div
            const previewDiv = document.createElement('div');
            previewDiv.className = 'frame-preview';
            previewDiv.appendChild(previewCanvas);
            // Add frame number
            const numberSpan = document.createElement('span');
            numberSpan.className = 'frame-number';
            numberSpan.textContent = (index + 1).toString();
            frameElement.appendChild(previewDiv);
            frameElement.appendChild(numberSpan);
            frameElement.addEventListener('click', () => selectFrame(index));
            timeline.appendChild(frameElement);
        });
    }

    return {
        addFrame,
        duplicateFrame,
        deleteFrame,
        reindexFrames,
        moveFrame,
        moveFrameLeft,
        moveFrameRight,
        selectFrame,
        toggleAnimation,
        animate,
        renderCurrentFrame,
        drawOnionSkinning,
        drawFrameAsOnionSkin,
        updateTimeline
    };
}

module.exports = { createFrameManager };
