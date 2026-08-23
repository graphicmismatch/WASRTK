// Non-destructive adjustment layers: brightness/contrast and hue/saturation
// are thin wrappers around the native canvas 2D `ctx.filter` (no math to
// write); levels and curves aren't expressible that way and need a
// per-pixel lookup table (LUT) applied through getImageData/putImageData.
//
// The pure LUT math (buildLevelsLUT/buildCurvesLUT/applyLUT) has no
// canvas/DOM dependency and is unit-testable directly; the apply* functions
// below it need a real CanvasRenderingContext2D (ctx.filter, getImageData)
// and are exercised by the smoke suite instead, same as the rest of the
// canvas-touching code in this codebase.

// Maps [0,255] input to [0,255] output per channel: blackPoint -> 0,
// whitePoint -> 255, with a gamma curve in between. Values outside
// [blackPoint, whitePoint] clamp.
function buildLevelsLUT(blackPoint, whitePoint, gamma) {
    const lut = new Uint8ClampedArray(256);
    const range = whitePoint - blackPoint;
    const invGamma = gamma > 0 ? 1 / gamma : 1;
    for (let i = 0; i < 256; i++) {
        if (range <= 0) {
            lut[i] = i < whitePoint ? 0 : 255; // degenerate range -- avoid divide by zero
            continue;
        }
        const normalized = Math.min(1, Math.max(0, (i - blackPoint) / range));
        lut[i] = Math.round(Math.pow(normalized, invGamma) * 255);
    }
    return lut;
}

// Monotonic linear interpolation between control points ({x, y} in
// [0,255], not necessarily sorted or covering the endpoints -- the curve
// is held flat from the first/last given point out to x=0/x=255).
// No points -> the identity curve (output == input).
function buildCurvesLUT(points) {
    const lut = new Uint8ClampedArray(256);
    if (!points || points.length === 0) {
        for (let i = 0; i < 256; i++) lut[i] = i;
        return lut;
    }

    const sorted = [...points].sort((a, b) => a.x - b.x);
    const withEndpoints = [...sorted];
    if (withEndpoints[0].x > 0) withEndpoints.unshift({ x: 0, y: withEndpoints[0].y });
    if (withEndpoints[withEndpoints.length - 1].x < 255) withEndpoints.push({ x: 255, y: withEndpoints[withEndpoints.length - 1].y });

    let segment = 0;
    for (let x = 0; x < 256; x++) {
        while (segment < withEndpoints.length - 2 && x > withEndpoints[segment + 1].x) segment++;
        const p0 = withEndpoints[segment];
        const p1 = withEndpoints[segment + 1];
        const t = p1.x === p0.x ? 0 : (x - p0.x) / (p1.x - p0.x);
        lut[x] = Math.round(p0.y + t * (p1.y - p0.y));
    }
    return lut;
}

// Applies a 256-entry LUT to imageData's R/G/B channels in place; alpha is
// left untouched.
function applyLUT(imageData, lut) {
    const data = imageData.data;
    for (let i = 0; i < data.length; i += 4) {
        data[i] = lut[data[i]];
        data[i + 1] = lut[data[i + 1]];
        data[i + 2] = lut[data[i + 2]];
    }
}

// ctx.filter only affects what's drawn *through* it, not pixels already on
// the canvas -- so applying a filter to existing content means copying it
// out, then redrawing it back onto itself with the filter active.
function applyCanvasFilter(targetCtx, filterString, createCanvas) {
    const width = targetCtx.canvas.width;
    const height = targetCtx.canvas.height;
    const scratch = createCanvas(width, height);
    const scratchCtx = scratch.getContext('2d');
    scratchCtx.drawImage(targetCtx.canvas, 0, 0);

    targetCtx.save();
    targetCtx.filter = filterString;
    targetCtx.clearRect(0, 0, width, height);
    targetCtx.drawImage(scratch, 0, 0);
    targetCtx.restore();
}

// brightness/contrast in [-100, 100], 0 = no change. ctx.filter's
// brightness()/contrast() are multipliers around 100%, hence the offset.
function applyBrightnessContrast(targetCtx, { brightness = 0, contrast = 0 } = {}, createCanvas) {
    applyCanvasFilter(targetCtx, `brightness(${100 + brightness}%) contrast(${100 + contrast}%)`, createCanvas);
}

// hue in degrees [-180, 180]; saturation in [-100, 100], 0 = no change,
// -100 = grayscale.
function applyHueSaturation(targetCtx, { hue = 0, saturation = 0 } = {}, createCanvas) {
    applyCanvasFilter(targetCtx, `hue-rotate(${hue}deg) saturate(${100 + saturation}%)`, createCanvas);
}

function applyLevels(targetCtx, { black = 0, white = 255, gamma = 1 } = {}) {
    const lut = buildLevelsLUT(black, white, gamma);
    const imageData = targetCtx.getImageData(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
    applyLUT(imageData, lut);
    targetCtx.putImageData(imageData, 0, 0);
}

function applyCurves(targetCtx, { points = [] } = {}) {
    const lut = buildCurvesLUT(points);
    const imageData = targetCtx.getImageData(0, 0, targetCtx.canvas.width, targetCtx.canvas.height);
    applyLUT(imageData, lut);
    targetCtx.putImageData(imageData, 0, 0);
}

const ADJUSTMENT_APPLIERS = {
    'brightness-contrast': (ctx, params, createCanvas) => applyBrightnessContrast(ctx, params, createCanvas),
    'hue-saturation': (ctx, params, createCanvas) => applyHueSaturation(ctx, params, createCanvas),
    levels: (ctx, params) => applyLevels(ctx, params),
    curves: (ctx, params) => applyCurves(ctx, params)
};

// Applies `layer` (a type: 'adjustment' entry) to targetCtx's current
// content in place. No-ops for an unrecognized adjustmentType rather than
// throwing, since a corrupt/future-version project file shouldn't crash
// the render loop.
function applyAdjustment(targetCtx, layer, createCanvas) {
    const applier = ADJUSTMENT_APPLIERS[layer.adjustmentType];
    if (applier) applier(targetCtx, layer.params, createCanvas);
}

const ADJUSTMENT_TYPES = Object.keys(ADJUSTMENT_APPLIERS);

const ADJUSTMENT_DEFAULT_PARAMS = {
    'brightness-contrast': { brightness: 0, contrast: 0 },
    'hue-saturation': { hue: 0, saturation: 0 },
    levels: { black: 0, white: 255, gamma: 1 },
    curves: { points: [] }
};

const ADJUSTMENT_LABELS = {
    'brightness-contrast': 'Brightness/Contrast',
    'hue-saturation': 'Hue/Saturation',
    levels: 'Levels',
    curves: 'Curves'
};

module.exports = {
    buildLevelsLUT,
    buildCurvesLUT,
    applyLUT,
    applyBrightnessContrast,
    applyHueSaturation,
    applyLevels,
    applyCurves,
    applyAdjustment,
    ADJUSTMENT_TYPES,
    ADJUSTMENT_DEFAULT_PARAMS,
    ADJUSTMENT_LABELS
};
