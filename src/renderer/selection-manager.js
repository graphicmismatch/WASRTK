// Selection subsystem, moved from wasrtk.js: shape-specific selection
// creation (lasso / polygon / magic-wand / rectangle), the drag/move
// interaction state machine, detach + commit/cancel of floating
// selections, and clipboard copy/cut/paste. Pure geometry/rendering math
// (bounds/outline/contour/feather, imageData<->canvas helpers) now lives
// in selection-geometry.js; pixel transforms (flip/rotate/scale/skew) in
// selection-transforms.js. This file re-exports drawSelectionOutline/
// drawLassoPreview/getSelectionSourceBounds as thin wrappers that supply
// the overlay context / canvas dimensions the pure versions take
// explicitly, so every other call site in this file is unchanged.
//
// `env` is a closure-accessor object built once in the WASRTK constructor
// (same pattern as buildReferenceApi / createHistory). The selection state
// itself still lives in the wasrtk.js module globals -- keydown handlers,
// selectTool, and frame/layer operations there keep reading them directly:
//   activeSelection, selectionInteraction, selectionClipboard
//       -- getter/setter properties over the wasrtk.js globals
//   getSelectionMode(), getSelectionAntialias(), getSelectionFeather(),
//   getFillTolerance()
//       -- read-only settings (their UI handlers stay in wasrtk.js)
//   mainCanvas, overlayCtx
//       -- direct canvas references
//   getActiveLayerContext(), clearOverlay(), applyImageSmoothing(ctx),
//   saveState(), renderCurrentFrame()
//       -- callbacks into the app
const { clampNumber } = require('./math-utils');
const { floodRegion } = require('./flood-fill');
const selectionGeometry = require('./selection-geometry');
const {
    createSelectionState,
    normalizeSelectionBounds,
    applyFeatherToImageData,
    imageDataToCanvas
} = selectionGeometry;
const { createSelectionTransforms } = require('./selection-transforms');

function createSelectionManager(env) {
    const { mainCanvas, overlayCtx } = env;

    function drawSelectionOutline(bounds, options) {
        selectionGeometry.drawSelectionOutline(overlayCtx, bounds, options);
    }

    function drawLassoPreview(points, currentPoint) {
        selectionGeometry.drawLassoPreview(overlayCtx, points, currentPoint);
    }

    function getSelectionSourceBounds(selection) {
        return selectionGeometry.getSelectionSourceBounds(selection, mainCanvas.width, mainCanvas.height);
    }

    function createLassoSelectionFromPoints(points) {
        if (!points || points.length < 3) {
            env.activeSelection = null;
            env.clearOverlay();
            return;
        }

        const layerContext = env.getActiveLayerContext();
        if (!layerContext) {
            return;
        }
        const { ctx } = layerContext;
        const source = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
        const sourcePixels = source.data;

        const xs = points.map((point) => Math.round(point.x));
        const ys = points.map((point) => Math.round(point.y));
        const minX = Math.max(0, Math.min(...xs));
        const maxX = Math.min(mainCanvas.width - 1, Math.max(...xs));
        const minY = Math.max(0, Math.min(...ys));
        const maxY = Math.min(mainCanvas.height - 1, Math.max(...ys));

        if (maxX <= minX || maxY <= minY) {
            env.activeSelection = null;
            env.clearOverlay();
            return;
        }

        const width = (maxX - minX) + 1;
        const height = (maxY - minY) + 1;
        const selectedPixels = new Uint8ClampedArray(width * height * 4);

        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = mainCanvas.width;
        maskCanvas.height = mainCanvas.height;
        const maskCtx = maskCanvas.getContext('2d');
        const path = new Path2D();
        path.moveTo(points[0].x, points[0].y);
        points.slice(1).forEach((point) => path.lineTo(point.x, point.y));
        path.closePath();

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                let coverage = 0;
                if (env.getSelectionAntialias()) {
                    const samples = [
                        [x + 0.25, y + 0.25],
                        [x + 0.75, y + 0.25],
                        [x + 0.25, y + 0.75],
                        [x + 0.75, y + 0.75]
                    ];
                    samples.forEach(([sx, sy]) => {
                        if (maskCtx.isPointInPath(path, sx, sy)) {
                            coverage += 0.25;
                        }
                    });
                } else if (maskCtx.isPointInPath(path, x + 0.5, y + 0.5)) {
                    coverage = 1;
                }

                if (coverage <= 0) {
                    continue;
                }

                const sourcePos = (y * mainCanvas.width + x) * 4;
                const localPos = ((y - minY) * width + (x - minX)) * 4;
                selectedPixels[localPos] = sourcePixels[sourcePos];
                selectedPixels[localPos + 1] = sourcePixels[sourcePos + 1];
                selectedPixels[localPos + 2] = sourcePixels[sourcePos + 2];
                selectedPixels[localPos + 3] = Math.round(sourcePixels[sourcePos + 3] * coverage);
            }
        }

        let selectionImageData = new ImageData(selectedPixels, width, height);
        selectionImageData = applyFeatherToImageData(selectionImageData, env.getSelectionFeather());

        env.activeSelection = createSelectionState({
            x: minX,
            y: minY,
            width,
            height,
            imageData: selectionImageData,
            originalX: minX,
            originalY: minY,
            masked: true
        });

        drawSelectionOutline(env.activeSelection);
    }

    function createMagicWandSelection(coords) {
        const layerContext = env.getActiveLayerContext();
        if (!layerContext) {
            return;
        }
        const { ctx } = layerContext;
        const imageData = ctx.getImageData(0, 0, mainCanvas.width, mainCanvas.height);
        const pixels = imageData.data;
        const width = imageData.width;
        const height = imageData.height;
        const startX = clampNumber(Math.round(coords.x), 0, 0, width - 1);
        const startY = clampNumber(Math.round(coords.y), 0, 0, height - 1);

        const selected = floodRegion(pixels, width, height, startX, startY, env.getFillTolerance());
        let minX = width;
        let minY = height;
        let maxX = 0;
        let maxY = 0;

        selected.forEach(({ x, y }) => {
            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x);
            maxY = Math.max(maxY, y);
        });

        if (selected.length === 0) {
            env.activeSelection = null;
            env.clearOverlay();
            return;
        }

        const selectionWidth = (maxX - minX) + 1;
        const selectionHeight = (maxY - minY) + 1;
        const selectedPixels = new Uint8ClampedArray(selectionWidth * selectionHeight * 4);

        selected.forEach(({ x, y, pos }) => {
            const localX = x - minX;
            const localY = y - minY;
            const localPos = (localY * selectionWidth + localX) * 4;
            selectedPixels[localPos] = pixels[pos];
            selectedPixels[localPos + 1] = pixels[pos + 1];
            selectedPixels[localPos + 2] = pixels[pos + 2];
            selectedPixels[localPos + 3] = pixels[pos + 3];
        });

        let selectionImageData = new ImageData(selectedPixels, selectionWidth, selectionHeight);
        selectionImageData = applyFeatherToImageData(selectionImageData, env.getSelectionFeather());

        env.activeSelection = createSelectionState({
            x: minX,
            y: minY,
            width: selectionWidth,
            height: selectionHeight,
            imageData: selectionImageData,
            originalX: minX,
            originalY: minY,
            masked: true
        });

        drawSelectionOutline(env.activeSelection);
    }

    function startSelectionInteraction(coords) {
        if (env.activeSelection &&
            coords.x >= env.activeSelection.x &&
            coords.x <= env.activeSelection.x + env.activeSelection.width &&
            coords.y >= env.activeSelection.y &&
            coords.y <= env.activeSelection.y + env.activeSelection.height) {
            detachSelectionFromLayer();
            env.selectionInteraction = {
                mode: 'move',
                start: coords,
                originalX: env.activeSelection.x,
                originalY: env.activeSelection.y
            };
            return;
        }

        if (env.getSelectionMode() === 'magic-wand') {
            createMagicWandSelection(coords);
            env.selectionInteraction = null;
            return;
        }

        if (env.getSelectionMode() === 'lasso') {
            env.activeSelection = null;
            env.selectionInteraction = {
                mode: 'lasso',
                points: [coords],
                current: coords
            };
            drawLassoPreview(env.selectionInteraction.points, coords);
            return;
        }

        if (env.getSelectionMode() === 'polygon') {
            if (!env.selectionInteraction || env.selectionInteraction.mode !== 'polygon') {
                env.activeSelection = null;
                env.selectionInteraction = {
                    mode: 'polygon',
                    points: [coords],
                    current: coords
                };
                drawLassoPreview(env.selectionInteraction.points, coords);
                return;
            }

            const points = env.selectionInteraction.points;
            const firstPoint = points[0];
            const closeDistance = Math.hypot(coords.x - firstPoint.x, coords.y - firstPoint.y);
            if (points.length >= 3 && closeDistance <= 6) {
                createLassoSelectionFromPoints(points);
                env.selectionInteraction = null;
                return;
            }

            points.push(coords);
            env.selectionInteraction.current = coords;
            drawLassoPreview(points, coords);
            return;
        }

        env.activeSelection = null;
        env.selectionInteraction = {
            mode: 'select',
            start: coords,
            current: coords
        };
        drawSelectionOutline(normalizeSelectionBounds(coords, coords));
    }

    function updateSelectionInteraction(coords, { keepSquare = false } = {}) {
        if (!env.selectionInteraction) {
            return;
        }

        if (env.selectionInteraction.mode === 'select') {
            env.selectionInteraction.current = coords;
            const bounds = normalizeSelectionBounds(env.selectionInteraction.start, coords, { keepSquare });
            drawSelectionOutline(bounds);
            return;
        }

        if (env.selectionInteraction.mode === 'lasso') {
            const lastPoint = env.selectionInteraction.points[env.selectionInteraction.points.length - 1];
            const distance = Math.hypot(coords.x - lastPoint.x, coords.y - lastPoint.y);
            if (distance >= 1) {
                env.selectionInteraction.points.push(coords);
            }
            env.selectionInteraction.current = coords;
            drawLassoPreview(env.selectionInteraction.points, coords);
            return;
        }

        if (env.selectionInteraction.mode === 'move' && env.activeSelection) {
            const dx = Math.round(coords.x - env.selectionInteraction.start.x);
            const dy = Math.round(coords.y - env.selectionInteraction.start.y);
            const target = clampSelectionPosition(env.activeSelection, env.selectionInteraction.originalX + dx, env.selectionInteraction.originalY + dy);
            env.activeSelection.x = target.x;
            env.activeSelection.y = target.y;
            drawSelectionOutline(env.activeSelection, { showPreview: true });
        }
    }

    function finishSelectionInteraction() {
        if (!env.selectionInteraction) {
            return;
        }

        const layerContext = env.getActiveLayerContext();
        if (!layerContext) {
            env.selectionInteraction = null;
            return;
        }
        const { ctx } = layerContext;

        if (env.selectionInteraction.mode === 'select') {
            const rawBounds = normalizeSelectionBounds(env.selectionInteraction.start, env.selectionInteraction.current);
            const bounds = {
                x: Math.max(0, rawBounds.x),
                y: Math.max(0, rawBounds.y),
                width: Math.min(mainCanvas.width - Math.max(0, rawBounds.x), rawBounds.width),
                height: Math.min(mainCanvas.height - Math.max(0, rawBounds.y), rawBounds.height)
            };
            if (bounds.width < 1 || bounds.height < 1) {
                env.activeSelection = null;
                env.clearOverlay();
            } else {
                const imageData = ctx.getImageData(bounds.x, bounds.y, bounds.width, bounds.height);
                env.activeSelection = createSelectionState({
                    ...bounds,
                    imageData,
                    originalX: bounds.x,
                    originalY: bounds.y
                });
                drawSelectionOutline(env.activeSelection);
            }
        } else if (env.selectionInteraction.mode === 'lasso') {
            createLassoSelectionFromPoints(env.selectionInteraction.points || []);
        } else if (env.selectionInteraction.mode === 'polygon') {
            drawLassoPreview(env.selectionInteraction.points || [], env.selectionInteraction.current);
            return;
        } else if (env.selectionInteraction.mode === 'move' && env.activeSelection) {
            drawSelectionOutline(env.activeSelection, { showPreview: true });
        }

        env.selectionInteraction = null;
    }

    function clampSelectionPosition(selection, x, y) {
        const maxX = Math.max(0, mainCanvas.width - Math.max(1, selection?.width || 1));
        const maxY = Math.max(0, mainCanvas.height - Math.max(1, selection?.height || 1));
        return {
            x: Math.max(0, Math.min(maxX, Math.round(x))),
            y: Math.max(0, Math.min(maxY, Math.round(y)))
        };
    }

    function clearSelectionPixels(ctx, selection, x = selection.originalX, y = selection.originalY) {
        const sourceBounds = selection?.sourceBounds;
        const maskSource = sourceBounds && x === sourceBounds.x && y === sourceBounds.y && selection.sourceClearImageData
            ? selection.sourceClearImageData
            : selection?.imageData;
        if (!maskSource) {
            return;
        }

        if (!selection.masked) {
            ctx.clearRect(x, y, maskSource.width, maskSource.height);
            return;
        }

        const maskImageData = new ImageData(
            new Uint8ClampedArray(maskSource.data),
            maskSource.width,
            maskSource.height
        );
        for (let pos = 0; pos < maskImageData.data.length; pos += 4) {
            maskImageData.data[pos] = 0;
            maskImageData.data[pos + 1] = 0;
            maskImageData.data[pos + 2] = 0;
        }
        const maskCanvas = imageDataToCanvas(maskImageData);

        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.drawImage(maskCanvas, x, y);
        ctx.restore();
    }

    function detachSelectionFromLayer() {
        if (!env.activeSelection || env.activeSelection.detached) {
            return;
        }
        const layerContext = env.getActiveLayerContext();
        if (!layerContext) {
            return;
        }
        const { ctx } = layerContext;
        const sourceBounds = getSelectionSourceBounds(env.activeSelection);
        env.activeSelection.sourceBounds = sourceBounds;
        env.activeSelection.sourceSnapshot = ctx.getImageData(sourceBounds.x, sourceBounds.y, sourceBounds.width, sourceBounds.height);
        env.activeSelection.sourceClearImageData = new ImageData(
            new Uint8ClampedArray(env.activeSelection.imageData.data),
            env.activeSelection.imageData.width,
            env.activeSelection.imageData.height
        );
        clearSelectionPixels(ctx, env.activeSelection, sourceBounds.x, sourceBounds.y);
        env.activeSelection.detached = true;
        env.renderCurrentFrame();
    }

    // Shared guard prefix for commit/cancel: bails out (returning null)
    // unless there is a detached selection and an active, unlocked layer to
    // paint it back onto. Returns {ctx, sourceBounds} on success. Does NOT
    // restore the source snapshot itself -- commit needs saveState() to run
    // (and capture pixels) before that restore, while cancel restores
    // immediately, so callers invoke restoreSourceSnapshot() at their own
    // point in the sequence.
    function beginDetachedSelectionRestore() {
        if (!env.activeSelection || !env.activeSelection.detached) {
            return null;
        }
        const layerContext = env.getActiveLayerContext();
        if (!layerContext) {
            return null;
        }
        const { ctx } = layerContext;
        const sourceBounds = getSelectionSourceBounds(env.activeSelection);
        return { ctx, sourceBounds };
    }

    // Shared sourceSnapshot-restore step for commit/cancel.
    function restoreSourceSnapshot(ctx, sourceBounds) {
        if (env.activeSelection.sourceSnapshot) {
            ctx.putImageData(env.activeSelection.sourceSnapshot, sourceBounds.x, sourceBounds.y);
        }
    }

    // Shared reset tail for commit/cancel: re-anchors the selection at
    // (x, y), clears the detached/source-snapshot bookkeeping, and
    // refreshes the outline + canvas.
    function finishDetachedSelectionRestore(x, y) {
        env.activeSelection.x = x;
        env.activeSelection.y = y;
        env.activeSelection.originalX = x;
        env.activeSelection.originalY = y;
        env.activeSelection.detached = false;
        env.activeSelection.sourceSnapshot = null;
        env.activeSelection.sourceBounds = null;
        env.activeSelection.sourceClearImageData = null;
        drawSelectionOutline(env.activeSelection);
        env.renderCurrentFrame();
    }

    function commitDetachedSelection() {
        const restore = beginDetachedSelectionRestore();
        if (!restore) {
            return;
        }
        const { ctx, sourceBounds } = restore;
        const target = clampSelectionPosition(env.activeSelection, env.activeSelection.x, env.activeSelection.y);
        env.saveState();
        restoreSourceSnapshot(ctx, sourceBounds);
        clearSelectionPixels(ctx, env.activeSelection, sourceBounds.x, sourceBounds.y);
        ctx.putImageData(env.activeSelection.imageData, target.x, target.y);
        finishDetachedSelectionRestore(target.x, target.y);
    }

    function cancelDetachedSelection() {
        const restore = beginDetachedSelectionRestore();
        if (!restore) {
            return;
        }
        const { ctx, sourceBounds } = restore;
        restoreSourceSnapshot(ctx, sourceBounds);
        finishDetachedSelectionRestore(sourceBounds.x, sourceBounds.y);
    }

    function clearSelection({ commitDetached = false } = {}) {
        if (env.activeSelection?.detached) {
            if (commitDetached) {
                commitDetachedSelection();
            } else {
                cancelDetachedSelection();
            }
        }
        env.activeSelection = null;
        env.selectionInteraction = null;
        env.clearOverlay();
    }

    function copySelectionToClipboard({ cut = false } = {}) {
        if (!env.activeSelection) {
            return;
        }

        env.selectionClipboard = {
            width: env.activeSelection.width,
            height: env.activeSelection.height,
            imageData: new ImageData(new Uint8ClampedArray(env.activeSelection.imageData.data), env.activeSelection.width, env.activeSelection.height)
        };

        if (cut) {
            const layerContext = env.getActiveLayerContext();
            if (!layerContext) {
                return;
            }
            const { ctx } = layerContext;
            env.saveState();
            clearSelectionPixels(ctx, env.activeSelection, env.activeSelection.originalX, env.activeSelection.originalY);
            env.renderCurrentFrame();
            clearSelection();
        }
    }

    function pasteSelectionFromClipboard() {
        if (!env.selectionClipboard) {
            return;
        }
        const layerContext = env.getActiveLayerContext();
        if (!layerContext) {
            return;
        }
        const { ctx } = layerContext;
        const pasteX = env.activeSelection
            ? Math.max(0, Math.min(mainCanvas.width - env.selectionClipboard.width, env.activeSelection.x + 1))
            : 0;
        const pasteY = env.activeSelection
            ? Math.max(0, Math.min(mainCanvas.height - env.selectionClipboard.height, env.activeSelection.y + 1))
            : 0;
        // Paste starts life already "detached" (floating) instead of baking
        // the clipboard pixels straight onto the layer. Mirrors
        // detachSelectionFromLayer: snapshot the real pre-paste layer
        // content first, then never write to the layer until commit. The
        // previous version called ctx.putImageData() here immediately,
        // permanently destroying whatever was under the paste target before
        // commitDetachedSelection/cancelDetachedSelection ever got a chance
        // to snapshot it -- so moving the pasted floater and pressing
        // Escape restored the (already-baked) pasted pixels instead of the
        // true original background.
        const sourceBounds = getSelectionSourceBounds({
            originalX: pasteX,
            originalY: pasteY,
            width: env.selectionClipboard.width,
            height: env.selectionClipboard.height
        });
        const sourceSnapshot = ctx.getImageData(sourceBounds.x, sourceBounds.y, sourceBounds.width, sourceBounds.height);
        const pastedImageData = new ImageData(
            new Uint8ClampedArray(env.selectionClipboard.imageData.data),
            env.selectionClipboard.width,
            env.selectionClipboard.height
        );
        env.activeSelection = createSelectionState({
            x: pasteX,
            y: pasteY,
            width: env.selectionClipboard.width,
            height: env.selectionClipboard.height,
            imageData: pastedImageData,
            originalX: pasteX,
            originalY: pasteY,
            detached: true,
            sourceSnapshot,
            sourceBounds,
            sourceClearImageData: new ImageData(
                new Uint8ClampedArray(pastedImageData.data),
                pastedImageData.width,
                pastedImageData.height
            )
        });
        drawSelectionOutline(env.activeSelection, { showPreview: true });
        env.renderCurrentFrame();
    }

    const selectionTransforms = createSelectionTransforms({
        get activeSelection() { return env.activeSelection; },
        set activeSelection(value) { env.activeSelection = value; },
        getActiveLayerContext: env.getActiveLayerContext,
        applyImageSmoothing: env.applyImageSmoothing,
        saveState: env.saveState,
        renderCurrentFrame: env.renderCurrentFrame,
        detachSelectionFromLayer,
        clampSelectionPosition,
        drawSelectionOutline
    });

    function applyTransformAction(options) {
        selectionTransforms.applyTransformAction(options);
    }


    return {
        startSelectionInteraction,
        updateSelectionInteraction,
        finishSelectionInteraction,
        clearSelection,
        commitDetachedSelection,
        copySelectionToClipboard,
        pasteSelectionFromClipboard,
        createLassoSelectionFromPoints,
        detachSelectionFromLayer,
        clampSelectionPosition,
        drawSelectionOutline,
        drawLassoPreview,
        applyTransformAction
    };
}

module.exports = { createSelectionManager };
