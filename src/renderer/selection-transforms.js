const { imageDataToCanvas } = require('./selection-geometry');

// Pixel transforms (flip/rotate/scale/skew) for the active selection or
// the whole current layer, split out of selection-manager.js.
//
// `env` here is not the raw wasrtk.js env selection-manager.js itself
// receives -- it's a small object selection-manager.js builds, proxying
// the pieces of its own env this needs (activeSelection as a live
// getter/setter -- object-spreading env would evaluate the getter once
// and freeze a stale value, so it's re-declared explicitly instead of
// spread) plus three functions still defined in selection-manager.js's
// own closure that these transforms call into:
//   activeSelection (get/set)  -- proxied from the wasrtk.js env
//   getActiveLayerContext()
//   applyImageSmoothing(ctx)
//   saveState()
//   renderCurrentFrame()
//   detachSelectionFromLayer()
//   clampSelectionPosition(selection, x, y)
//   drawSelectionOutline(bounds, options)
function createSelectionTransforms(env) {
    function buildTransformedImageData(sourceImageData, { flipX = false, flipY = false, rotate90 = false, scaleX = 1, scaleY = 1, skewX = 0, skewY = 0 } = {}) {
        const sourceCanvas = imageDataToCanvas(sourceImageData);

        const sx = (flipX ? -1 : 1) * scaleX;
        const sy = (flipY ? -1 : 1) * scaleY;
        const tanX = Math.tan(skewX);
        const tanY = Math.tan(skewY);
        const corners = [
            { x: -sourceCanvas.width / 2, y: -sourceCanvas.height / 2 },
            { x: sourceCanvas.width / 2, y: -sourceCanvas.height / 2 },
            { x: sourceCanvas.width / 2, y: sourceCanvas.height / 2 },
            { x: -sourceCanvas.width / 2, y: sourceCanvas.height / 2 }
        ].map((corner) => transformPointForBounds(corner, { sx, sy, rotate90, tanX, tanY }));

        const minX = Math.floor(Math.min(...corners.map((point) => point.x)));
        const maxX = Math.ceil(Math.max(...corners.map((point) => point.x)));
        const minY = Math.floor(Math.min(...corners.map((point) => point.y)));
        const maxY = Math.ceil(Math.max(...corners.map((point) => point.y)));

        const outputCanvas = document.createElement('canvas');
        outputCanvas.width = Math.max(1, maxX - minX);
        outputCanvas.height = Math.max(1, maxY - minY);
        const outCtx = outputCanvas.getContext('2d');
        env.applyImageSmoothing(outCtx);

        outCtx.save();
        outCtx.translate(-minX, -minY);
        outCtx.transform(1, tanY, tanX, 1, 0, 0);
        if (rotate90) {
            outCtx.rotate(Math.PI / 2);
        }
        outCtx.scale(sx, sy);
        outCtx.drawImage(sourceCanvas, -sourceCanvas.width / 2, -sourceCanvas.height / 2);
        outCtx.restore();

        return outCtx.getImageData(0, 0, outputCanvas.width, outputCanvas.height);
    }

    function transformPointForBounds(point, { sx, sy, rotate90, tanX, tanY }) {
        let x = point.x * sx;
        let y = point.y * sy;

        if (rotate90) {
            const rotatedX = -y;
            y = x;
            x = rotatedX;
        }

        return {
            x: x + (tanX * y),
            y: (tanY * x) + y
        };
    }

    function transformActiveSelection({ flipX = false, flipY = false, rotate90 = false, scaleX = 1, scaleY = 1, skewX = 0, skewY = 0 } = {}) {
        if (!env.activeSelection) {
            return;
        }

        if (!env.activeSelection.detached) {
            env.detachSelectionFromLayer();
        }

        env.activeSelection.imageData = buildTransformedImageData(env.activeSelection.imageData, { flipX, flipY, rotate90, scaleX, scaleY, skewX, skewY });
        env.activeSelection.width = env.activeSelection.imageData.width;
        env.activeSelection.height = env.activeSelection.imageData.height;

        const target = env.clampSelectionPosition(env.activeSelection, env.activeSelection.x, env.activeSelection.y);
        env.activeSelection.x = target.x;
        env.activeSelection.y = target.y;

        env.drawSelectionOutline(env.activeSelection, { showPreview: true });
    }

    function transformCurrentLayer({ flipX = false, flipY = false, rotate90 = false, scaleX = 1, scaleY = 1, skewX = 0, skewY = 0 } = {}) {
        const layerContext = env.getActiveLayerContext();
        if (!layerContext) {
            return;
        }
        const { layer, ctx } = layerContext;

        env.saveState();

        const sourceImageData = ctx.getImageData(0, 0, layer.canvas.width, layer.canvas.height);
        const transformed = buildTransformedImageData(sourceImageData, { flipX, flipY, rotate90, scaleX, scaleY, skewX, skewY });

        ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);

        const offsetX = Math.floor((layer.canvas.width - transformed.width) / 2);
        const offsetY = Math.floor((layer.canvas.height - transformed.height) / 2);
        ctx.drawImage(imageDataToCanvas(transformed), offsetX, offsetY);

        env.renderCurrentFrame();
    }

    function applyTransformAction({ flipX = false, flipY = false, rotate90 = false, scaleX = 1, scaleY = 1, skewX = 0, skewY = 0 } = {}) {
        if (env.activeSelection) {
            transformActiveSelection({ flipX, flipY, rotate90, scaleX, scaleY, skewX, skewY });
            return;
        }

        transformCurrentLayer({ flipX, flipY, rotate90, scaleX, scaleY, skewX, skewY });
    }

    return {
        applyTransformAction,
        buildTransformedImageData,
        transformPointForBounds,
        transformActiveSelection,
        transformCurrentLayer
    };
}

module.exports = { createSelectionTransforms };
