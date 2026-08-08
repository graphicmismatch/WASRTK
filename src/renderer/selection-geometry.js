// Pure selection geometry/rendering helpers, split out of
// selection-manager.js. Every function takes its canvas context and/or
// dimensions as explicit arguments instead of closing over the wasrtk.js
// env object -- the same "ctx-in, no DOM globals" shape as
// brush-engine.js. That's what makes these unit-testable with a fake
// canvas-context object (see tests/unit/selection-geometry.test.js),
// unlike the rest of the selection subsystem, which is wired through
// selection-manager.js's env accessors.
//
// drawSelectionOutline/drawLassoPreview clear their own canvas via
// `ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height)` instead of
// calling back into wasrtk.js's clearOverlay() -- the two are equivalent
// (clearOverlay is exactly that clearRect against the overlay context),
// so taking ctx explicitly removes the callback dependency entirely.

// Builds an activeSelection/selectionClipboard-style selection record with
// the fields shared by every selection-creation site (lasso, magic wand,
// rectangle select, paste); callers pass only their differences.
function createSelectionState(overrides = {}) {
    return {
        x: 0,
        y: 0,
        width: 0,
        height: 0,
        imageData: null,
        originalX: 0,
        originalY: 0,
        detached: false,
        sourceSnapshot: null,
        sourceBounds: null,
        masked: false,
        ...overrides
    };
}

function normalizeSelectionBounds(start, end, { keepSquare = false } = {}) {
    let endX = end.x;
    let endY = end.y;

    if (keepSquare) {
        const dx = end.x - start.x;
        const dy = end.y - start.y;
        const side = Math.max(Math.abs(dx), Math.abs(dy));
        endX = start.x + side * Math.sign(dx || 1);
        endY = start.y + side * Math.sign(dy || 1);
    }

    const x = Math.min(start.x, endX);
    const y = Math.min(start.y, endY);
    const width = Math.abs(endX - start.x);
    const height = Math.abs(endY - start.y);
    return {
        x: Math.round(x),
        y: Math.round(y),
        width: Math.round(width),
        height: Math.round(height)
    };
}

function drawSelectionMaskContour(ctx, selection) {
    if (!selection?.masked || !selection.imageData) {
        return;
    }

    const { width, height, data } = selection.imageData;
    ctx.beginPath();
    for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
            const pos = ((y * width) + x) * 4;
            if (data[pos + 3] === 0) {
                continue;
            }

            const left = x === 0 || data[pos - 1] === 0;
            const right = x === width - 1 || data[pos + 7] === 0;
            const top = y === 0 || data[pos - (width * 4) + 3] === 0;
            const bottom = y === height - 1 || data[pos + (width * 4) + 3] === 0;
            const px = selection.x + x + 0.5;
            const py = selection.y + y + 0.5;

            if (top) {
                ctx.moveTo(px, py);
                ctx.lineTo(px + 1, py);
            }
            if (right) {
                ctx.moveTo(px + 1, py);
                ctx.lineTo(px + 1, py + 1);
            }
            if (bottom) {
                ctx.moveTo(px + 1, py + 1);
                ctx.lineTo(px, py + 1);
            }
            if (left) {
                ctx.moveTo(px, py + 1);
                ctx.lineTo(px, py);
            }
        }
    }
    ctx.stroke();
}

function drawSelectionOutline(ctx, bounds, { showPreview = false } = {}) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (showPreview && bounds.imageData) {
        ctx.putImageData(bounds.imageData, bounds.x, bounds.y);
    }
    ctx.save();
    ctx.strokeStyle = '#1f9eff';
    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 1;
    ctx.strokeRect(bounds.x + 0.5, bounds.y + 0.5, bounds.width, bounds.height);
    drawSelectionMaskContour(ctx, bounds);
    ctx.restore();
}

function drawLassoPreview(ctx, points, currentPoint) {
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    if (!points || points.length === 0) {
        return;
    }

    ctx.save();
    ctx.strokeStyle = '#1f9eff';
    ctx.setLineDash([5, 3]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(points[0].x + 0.5, points[0].y + 0.5);
    points.forEach((point, index) => {
        if (index === 0) {
            return;
        }
        ctx.lineTo(point.x + 0.5, point.y + 0.5);
    });
    if (currentPoint) {
        ctx.lineTo(currentPoint.x + 0.5, currentPoint.y + 0.5);
    }
    ctx.stroke();
    ctx.restore();
}

function applyFeatherToImageData(imageData, radius) {
    const featherRadius = Math.max(0, Math.round(radius || 0));
    if (featherRadius <= 0) {
        return imageData;
    }

    const { width, height, data } = imageData;
    const horizontalAlpha = new Uint8ClampedArray(width * height);
    const output = new Uint8ClampedArray(data);

    for (let y = 0; y < height; y++) {
        let sum = 0;
        let count = 0;
        for (let x = -featherRadius; x <= featherRadius; x++) {
            if (x >= 0 && x < width) {
                sum += data[((y * width) + x) * 4 + 3];
                count++;
            }
        }

        for (let x = 0; x < width; x++) {
            horizontalAlpha[(y * width) + x] = Math.round(sum / count);
            const removeX = x - featherRadius;
            const addX = x + featherRadius + 1;
            if (removeX >= 0) {
                sum -= data[((y * width) + removeX) * 4 + 3];
                count--;
            }
            if (addX < width) {
                sum += data[((y * width) + addX) * 4 + 3];
                count++;
            }
        }
    }

    for (let x = 0; x < width; x++) {
        let sum = 0;
        let count = 0;
        for (let y = -featherRadius; y <= featherRadius; y++) {
            if (y >= 0 && y < height) {
                sum += horizontalAlpha[(y * width) + x];
                count++;
            }
        }

        for (let y = 0; y < height; y++) {
            output[((y * width) + x) * 4 + 3] = Math.round(sum / count);
            const removeY = y - featherRadius;
            const addY = y + featherRadius + 1;
            if (removeY >= 0) {
                sum -= horizontalAlpha[(removeY * width) + x];
                count--;
            }
            if (addY < height) {
                sum += horizontalAlpha[(addY * width) + x];
                count++;
            }
        }
    }

    return new ImageData(output, width, height);
}

function getSelectionSourceBounds(selection, canvasWidth, canvasHeight) {
    const bounds = selection?.sourceBounds || {
        x: selection?.originalX || 0,
        y: selection?.originalY || 0,
        width: selection?.sourceSnapshot?.width || selection?.width || 0,
        height: selection?.sourceSnapshot?.height || selection?.height || 0
    };

    const x = Math.max(0, Math.min(canvasWidth - 1, Math.round(bounds.x)));
    const y = Math.max(0, Math.min(canvasHeight - 1, Math.round(bounds.y)));
    return {
        x,
        y,
        width: Math.max(1, Math.min(canvasWidth - x, Math.round(bounds.width))),
        height: Math.max(1, Math.min(canvasHeight - y, Math.round(bounds.height)))
    };
}

function imageDataToCanvas(imageData) {
    const canvas = document.createElement('canvas');
    canvas.width = imageData.width;
    canvas.height = imageData.height;
    canvas.getContext('2d').putImageData(imageData, 0, 0);
    return canvas;
}

module.exports = {
    createSelectionState,
    normalizeSelectionBounds,
    drawSelectionMaskContour,
    drawSelectionOutline,
    drawLassoPreview,
    applyFeatherToImageData,
    getSelectionSourceBounds,
    imageDataToCanvas
};
