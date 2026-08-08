const { hexToRgb } = require('./color-utils');
const { clampNumber } = require('./math-utils');
const { drawVisibleLayersToContext } = require('./exporters');
const { floodRegion } = require('./flood-fill');

// Core drawing/shape engine, moved verbatim from wasrtk.js: the pointer
// draw lifecycle (startDrawing/draw/stopDrawing), point/line rasterization
// entry points, flood fill, and the shape (line/rectangle/circle)
// preview+commit path.
//
// Tools are called as `tool.drawPoint(app, {...})` etc. (the duck-typed
// `app` interface), so this factory takes the live WASRTK instance
// directly rather than a pure accessor object -- `app` for every
// cross-module call (saveState, renderCurrentFrame, showStrokePreview,
// getActiveLayerContext, applyImageSmoothing, roundToPixel,
// screenToCanvas, getEventPressure, getCurrentToolConfig, the brush-engine
// delegators, and `app.startShape`, a plain instance property, not a
// module global). `env` is reserved for raw wasrtk.js module globals with
// no owning module yet, built once in the WASRTK constructor:
//   getIsDrawing/setIsDrawing
//   setCurrentStrokeSeed, setCurrentInputPressure
//   getLastMousePos/setLastMousePos
//   getCurrentTool, getCurrentColor, getBrushSize, getCurrentOpacity,
//   getAntialiasingEnabled
//   getStrokeCtx  -- a getter, not a captured reference: createStrokeLayer/
//                    commitStrokeLayer/clearStrokeLayer (still directly on
//                    WASRTK) reassign strokeCtx/strokeCanvas outright
//   getFillSampleAllLayers, getFillContiguous, getFillTolerance
//   getFrames, getCurrentFrame  -- getters, not captured references, same
//                                  undo/redo staleness reason as
//                                  frame-manager.js/layer-manager.js
//   mainCanvas, overlayCtx, createCanvas
function createCanvasEngine(app, env) {
    function startDrawing(e) {
        const tool = app.getCurrentToolConfig();

        if (tool?.saveStateOnStart) {
            app.saveState();
        }

        env.setIsDrawing(true);
        env.setCurrentStrokeSeed(Math.floor(Math.random() * 0x7fffffff));
        env.setCurrentInputPressure(app.getEventPressure(e));
        const coords = app.screenToCanvas(e.clientX, e.clientY);
        env.setLastMousePos(coords); // Initialize last position
        app.startShape = coords; // For shape tools
        tool?.onStart?.(app, {
            coords,
            modifiers: {
                keepSquare: e.shiftKey,
                straightLine: e.shiftKey,
                snapAngle: e.shiftKey && (e.ctrlKey || e.metaKey)
            }
        });
    }

    function draw(e) {
        if (!env.getIsDrawing()) return;
        env.setCurrentInputPressure(app.getEventPressure(e));
        const currentCoords = app.screenToCanvas(e.clientX, e.clientY);
        const tool = app.getCurrentToolConfig();

        tool?.onDraw?.(app, {
            currentCoords,
            lastMousePos: env.getLastMousePos(),
            startShape: app.startShape,
            modifiers: {
                keepSquare: e.shiftKey,
                straightLine: e.shiftKey,
                snapAngle: e.shiftKey && (e.ctrlKey || e.metaKey)
            }
        });

        env.setLastMousePos(currentCoords);
    }

    function stopDrawing(e) {
        if (!env.getIsDrawing()) return;
        env.setIsDrawing(false);
        env.setCurrentInputPressure(1);
        const tool = app.getCurrentToolConfig();
        tool?.onStop?.(app, {
            startShape: app.startShape,
            lastMousePos: env.getLastMousePos(),
            modifiers: {
                keepSquare: Boolean(e?.shiftKey),
                straightLine: Boolean(e?.shiftKey),
                snapAngle: Boolean(e?.shiftKey && (e?.ctrlKey || e?.metaKey))
            }
        });

        env.setLastMousePos(null);
        env.setCurrentStrokeSeed(0);
        app.startShape = null;
    }

    // Resolves the stroke-preview layer or the active unlocked layer as the
    // drawing context, and wraps `draw(ctx, useStrokeLayer)` with the
    // save/smoothing/alpha/restore + stroke-preview-or-render tail shared
    // by drawPoint and drawLine's antialiased path. No-ops if there is no
    // context to draw on.
    function withDrawContext(useStrokeCtx, draw) {
        const strokeCtx = env.getStrokeCtx();
        const useStrokeLayer = useStrokeCtx && strokeCtx && (env.getCurrentTool() === "pen" || env.getCurrentTool() === "eraser");
        const ctx = useStrokeLayer ? strokeCtx : (app.getActiveLayerContext()?.ctx ?? null);
        if (!ctx) return;
        ctx.save();
        app.applyImageSmoothing(ctx);
        ctx.globalAlpha = useStrokeLayer ? 1.0 : env.getCurrentOpacity();
        draw(ctx, useStrokeLayer);
        ctx.restore();
        if (useStrokeLayer) {
            app.showStrokePreview();
        } else {
            app.renderCurrentFrame();
        }
    }

    function drawPoint(x, y, useStrokeCtx = false) {
        withDrawContext(useStrokeCtx, (ctx) => {
            const coords = env.getAntialiasingEnabled() ? { x, y } : app.roundToPixel(x, y);
            const tool = app.getCurrentToolConfig();
            tool?.drawPoint?.(app, { ctx, coords, useStrokeCtx });
        });
    }

    function floodFill(ctx, startX, startY, fillColor) {
        const width = ctx.canvas.width;
        const height = ctx.canvas.height;
        const safeStartX = Math.max(0, Math.min(width - 1, Math.round(startX)));
        const safeStartY = Math.max(0, Math.min(height - 1, Math.round(startY)));

        if (!Number.isFinite(safeStartX) || !Number.isFinite(safeStartY)) {
            return 0;
        }

        const targetImageData = ctx.getImageData(0, 0, width, height);
        const targetPixels = targetImageData.data;
        const samplePixels = env.getFillSampleAllLayers() ? getMergedVisibleLayersImageData().data : targetPixels;

        const startPos = (safeStartY * width + safeStartX) * 4;
        const startR = samplePixels[startPos];
        const startG = samplePixels[startPos + 1];
        const startB = samplePixels[startPos + 2];
        const startA = samplePixels[startPos + 3];

        const { r: fillR, g: fillG, b: fillB } = hexToRgb(fillColor) || { r: 0, g: 0, b: 0 };
        const fillA = clampNumber(Math.round(env.getCurrentOpacity() * 255), 255, 0, 255);

        const fillTolerance = env.getFillTolerance();
        const fillContiguous = env.getFillContiguous();

        if (!env.getFillSampleAllLayers() &&
            startR === fillR &&
            startG === fillG &&
            startB === fillB &&
            startA === fillA) {
            return 0;
        }

        const colorDistance = (index) => {
            const r = samplePixels[index];
            const g = samplePixels[index + 1];
            const b = samplePixels[index + 2];
            const a = samplePixels[index + 3];
            return Math.sqrt(
                Math.pow(r - startR, 2) +
                Math.pow(g - startG, 2) +
                Math.pow(b - startB, 2) +
                Math.pow(a - startA, 2)
            );
        };

        const pixelsToFill = [];

        if (fillContiguous) {
            floodRegion(samplePixels, width, height, safeStartX, safeStartY, fillTolerance).forEach(({ pos }) => {
                if (targetPixels[pos] !== fillR ||
                    targetPixels[pos + 1] !== fillG ||
                    targetPixels[pos + 2] !== fillB ||
                    targetPixels[pos + 3] !== fillA) {
                    pixelsToFill.push(pos);
                }
            });
        } else {
            for (let pos = 0; pos < samplePixels.length; pos += 4) {
                if (colorDistance(pos) <= fillTolerance &&
                    (targetPixels[pos] !== fillR ||
                    targetPixels[pos + 1] !== fillG ||
                    targetPixels[pos + 2] !== fillB ||
                    targetPixels[pos + 3] !== fillA)) {
                    pixelsToFill.push(pos);
                }
            }
        }

        if (pixelsToFill.length === 0) {
            return 0;
        }

        pixelsToFill.forEach((pos) => {
            targetPixels[pos] = fillR;
            targetPixels[pos + 1] = fillG;
            targetPixels[pos + 2] = fillB;
            targetPixels[pos + 3] = fillA;
        });

        ctx.putImageData(targetImageData, 0, 0);
        return pixelsToFill.length;
    }

    function getMergedVisibleLayersImageData() {
        const frame = env.getFrames()[env.getCurrentFrame()];
        const tempCanvas = env.createCanvas(env.mainCanvas.width, env.mainCanvas.height);
        const tempCtx = tempCanvas.getContext('2d');
        app.applyImageSmoothing(tempCtx);

        drawVisibleLayersToContext(tempCtx, frame);

        return tempCtx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
    }

    function drawLine(x1, y1, x2, y2, useStrokeCtx = false) {
        const strokeCtx = env.getStrokeCtx();
        const useStrokeLayer = useStrokeCtx && strokeCtx && (env.getCurrentTool() === "pen" || env.getCurrentTool() === "eraser");
        if (env.getAntialiasingEnabled()) {
            withDrawContext(useStrokeCtx, (ctx) => {
                const tool = app.getCurrentToolConfig();
                tool?.drawLine?.(app, { ctx, x1, y1, x2, y2, useStrokeCtx });
            });
        } else {
            x1 = Math.round(x1);
            y1 = Math.round(y1);
            x2 = Math.round(x2);
            y2 = Math.round(y2);
            let dx = Math.abs(x2 - x1);
            let dy = Math.abs(y2 - y1);
            let sx = x1 < x2 ? 1 : -1;
            let sy = y1 < y2 ? 1 : -1;
            let err = dx - dy;
            let x = x1;
            let y = y1;
            while (true) {
                drawPoint(x, y, useStrokeCtx);
                if (x === x2 && y === y2) break;
                let e2 = 2 * err;
                if (e2 > -dy) { err -= dy; x += sx; }
                if (e2 < dx) { err += dx; y += sy; }
            }
            if (useStrokeLayer) {
                app.showStrokePreview();
            } else {
                app.renderCurrentFrame();
            }
        }
    }

    function getConstrainedShapeEndPoint(start, end, { keepSquare = false, tool } = {}) {
        if (!keepSquare || (tool !== 'rectangle' && tool !== 'circle')) {
            return end;
        }

        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const size = Math.max(Math.abs(dx), Math.abs(dy));
        const fallbackSignX = dy === 0 ? 1 : Math.sign(dy);
        const fallbackSignY = dx === 0 ? 1 : Math.sign(dx);
        const signX = dx === 0 ? fallbackSignX : Math.sign(dx);
        const signY = dy === 0 ? fallbackSignY : Math.sign(dy);

        return {
            x: start.x + (size * signX),
            y: start.y + (size * signY)
        };
    }

    // Shared path-building for the shape tools: opens a path on `ctx` and
    // adds the line/rect/ellipse geometry for `tool` between startCoords
    // and endCoords. Stroke/dash/fill settings are the caller's
    // responsibility -- drawShapePreview and commitShape's antialiased
    // branch configure those differently before calling this.
    function buildShapePath(ctx, startCoords, endCoords, tool) {
        const brushSize = env.getBrushSize();
        ctx.beginPath();

        if (tool === "line") {
            ctx.moveTo(startCoords.x, startCoords.y);
            ctx.lineTo(endCoords.x, endCoords.y);
        } else if (tool === "rectangle") {
            const halfBrush = brushSize / 2;
            const x = Math.min(startCoords.x, endCoords.x) + halfBrush;
            const y = Math.min(startCoords.y, endCoords.y) + halfBrush;
            const width = Math.abs(startCoords.x - endCoords.x) - brushSize;
            const height = Math.abs(startCoords.y - endCoords.y) - brushSize;
            if (width > 0 && height > 0) {
                ctx.rect(x, y, width, height);
            }
        } else if (tool === "circle") {
            const rx = (endCoords.x - startCoords.x) / 2;
            const ry = (endCoords.y - startCoords.y) / 2;
            const cx = startCoords.x + rx;
            const cy = startCoords.y + ry;
            const halfBrush = brushSize / 2;
            const adjustedRx = Math.max(0, Math.abs(rx) - halfBrush);
            const adjustedRy = Math.max(0, Math.abs(ry) - halfBrush);
            if (adjustedRx > 0 && adjustedRy > 0) {
                ctx.ellipse(cx, cy, adjustedRx, adjustedRy, 0, 0, 2 * Math.PI);
            }
        }
    }

    function drawShapePreview(start, end, tool, { keepSquare = false } = {}) {
        const overlayCtx = env.overlayCtx;
        overlayCtx.save();
        app.applyImageSmoothing(overlayCtx);

        const startCoords = env.getAntialiasingEnabled() ? start : app.roundToPixel(start.x, start.y);
        const constrainedEnd = getConstrainedShapeEndPoint(startCoords, end, { keepSquare, tool });
        const endCoords = env.getAntialiasingEnabled() ? constrainedEnd : app.roundToPixel(constrainedEnd.x, constrainedEnd.y);

        overlayCtx.strokeStyle = env.getCurrentColor();
        overlayCtx.lineWidth = env.getBrushSize();
        overlayCtx.globalAlpha = env.getCurrentOpacity();
        overlayCtx.setLineDash([4, 4]);
        overlayCtx.lineCap = 'round';
        overlayCtx.lineJoin = tool === 'rectangle' ? 'miter' : 'round';
        buildShapePath(overlayCtx, startCoords, endCoords, tool);

        overlayCtx.stroke();
        overlayCtx.restore();
    }

    function commitShape(start, end, tool, { keepSquare = false } = {}) {
        const layerContext = app.getActiveLayerContext();
        if (!layerContext) return;
        const { ctx } = layerContext;

        if (env.getAntialiasingEnabled()) {
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';

            const startCoords = start;
            const endCoords = getConstrainedShapeEndPoint(start, end, { keepSquare, tool });
            ctx.strokeStyle = env.getCurrentColor();
            ctx.lineWidth = env.getBrushSize();
            ctx.globalAlpha = env.getCurrentOpacity();
            ctx.lineCap = 'round';
            ctx.lineJoin = tool === 'rectangle' ? 'miter' : 'round';
            buildShapePath(ctx, startCoords, endCoords, tool);
            ctx.stroke();
        } else {
            ctx.imageSmoothingEnabled = false;

            const startCoords = app.roundToPixel(start.x, start.y);
            const constrainedEnd = getConstrainedShapeEndPoint(startCoords, end, { keepSquare, tool });
            const endCoords = app.roundToPixel(constrainedEnd.x, constrainedEnd.y);

            ctx.fillStyle = env.getCurrentColor();
            ctx.strokeStyle = env.getCurrentColor();
            ctx.globalAlpha = env.getCurrentOpacity();

            if (tool === "line") {
                app.drawPixelPerfectLineWithFillRect(ctx, startCoords.x, startCoords.y, endCoords.x, endCoords.y);
            } else if (tool === "rectangle") {
                const x = Math.min(startCoords.x, endCoords.x);
                const y = Math.min(startCoords.y, endCoords.y);
                const width = Math.abs(endCoords.x - startCoords.x);
                const height = Math.abs(endCoords.y - startCoords.y);
                const bs = Math.round(env.getBrushSize());
                if (bs <= 0) return;

                if (bs * 2 > width || bs * 2 > height) {
                    ctx.fillRect(x, y, width, height);
                } else {
                    ctx.fillRect(x, y, width, bs);
                    ctx.fillRect(x, y + height - bs, width, bs);
                    ctx.fillRect(x, y + bs, bs, height - 2 * bs);
                    ctx.fillRect(x + width - bs, y + bs, bs, height - 2 * bs);
                }
            } else if (tool === "circle") {
                const rx = (endCoords.x - startCoords.x) / 2;
                const ry = (endCoords.y - startCoords.y) / 2;
                const cx = startCoords.x + rx;
                const cy = startCoords.y + ry;
                app.drawPixelPerfectCircleWithFillRect(ctx, cx, cy, rx, ry);
            }
        }

        app.renderCurrentFrame();
    }

    return {
        startDrawing,
        draw,
        stopDrawing,
        withDrawContext,
        drawPoint,
        floodFill,
        getMergedVisibleLayersImageData,
        drawLine,
        getConstrainedShapeEndPoint,
        buildShapePath,
        drawShapePreview,
        commitShape
    };
}

module.exports = { createCanvasEngine };
