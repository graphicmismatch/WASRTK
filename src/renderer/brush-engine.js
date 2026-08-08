// Brush rasterizers, moved verbatim from wasrtk.js. Every function here is
// pure with respect to app state: geometry helpers take explicit
// coordinates, and the stamp/line painters take a canvas context plus an
// options object instead of reading the wasrtk.js module globals.
//
// The options object for drawBrushStamp/drawBrushLine is assembled by
// WASRTK.getBrushRenderOptions():
//   {
//     color,      // '#rrggbb' stroke color
//     size,       // pressure-adjusted brush size (px)
//     flow,       // pressure-adjusted flow multiplier (0..1)
//     preset,     // 'hard-round' | 'soft-round' | 'pixel' | 'textured'
//     shape,      // 'circle' | 'square'
//     spacing,    // stamp spacing as a fraction of brush size (0..1)
//     antialias,  // global antialiasing toggle
//     strokeSeed  // per-stroke seed for the textured preset
//   }
const { hexToRgb } = require('./color-utils');

function getInterpolatedStrokePoints(x1, y1, x2, y2, spacing = 1) {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const distance = Math.hypot(dx, dy);
    const stepDistance = Math.max(0.25, spacing);
    const steps = Math.max(1, Math.ceil(distance / stepDistance));
    const points = [];

    for (let i = 0; i <= steps; i++) {
        const t = i / steps;
        points.push({
            x: x1 + dx * t,
            y: y1 + dy * t
        });
    }

    return points;
}

function getPixelPerfectLinePoints(x1, y1, x2, y2) {
    let startX = Math.round(x1);
    let startY = Math.round(y1);
    const endX = Math.round(x2);
    const endY = Math.round(y2);
    const points = [];
    const dx = Math.abs(endX - startX);
    const dy = Math.abs(endY - startY);
    const sx = startX < endX ? 1 : -1;
    const sy = startY < endY ? 1 : -1;
    let err = dx - dy;

    while (true) {
        points.push({ x: startX, y: startY });

        if (startX === endX && startY === endY) {
            return points;
        }

        const e2 = 2 * err;
        if (e2 > -dy) {
            err -= dy;
            startX += sx;
        }
        if (e2 < dx) {
            err += dx;
            startY += sy;
        }
    }
}

function drawPixelPerfectBrushStamp(ctx, centerX, centerY, size, shape = 'square') {
    const stampSize = Math.max(1, Math.round(size));
    const stampCenterX = Math.round(centerX);
    const stampCenterY = Math.round(centerY);
    const offset = Math.floor(stampSize / 2);

    if (shape !== 'circle' || stampSize === 1) {
        ctx.fillRect(stampCenterX - offset, stampCenterY - offset, stampSize, stampSize);
        return;
    }

    const radius = stampSize / 2;

    for (let y = 0; y < stampSize; y++) {
        for (let x = 0; x < stampSize; x++) {
            const pixelCenterX = x - offset + 0.5;
            const pixelCenterY = y - offset + 0.5;
            if ((pixelCenterX * pixelCenterX) + (pixelCenterY * pixelCenterY) <= radius * radius) {
                ctx.fillRect(stampCenterX - offset + x, stampCenterY - offset + y, 1, 1);
            }
        }
    }
}

function seededRandom(seed) {
    const value = Math.sin(seed) * 10000;
    return value - Math.floor(value);
}

function drawBrushStamp(ctx, x, y, opts) {
    const { color, preset, antialias } = opts;
    const usePixelPreset = preset === 'pixel';
    const shape = usePixelPreset ? 'square' : opts.shape;
    const size = Math.max(1, opts.size);
    const isSquare = shape === 'square';
    const originalAlpha = ctx.globalAlpha;
    const baseAlpha = originalAlpha * opts.flow;
    ctx.globalAlpha = baseAlpha;

    if (usePixelPreset || !antialias) {
        ctx.fillStyle = color;
        drawPixelPerfectBrushStamp(ctx, x, y, size, shape);
        ctx.globalAlpha = originalAlpha;
        return;
    }

    if (preset === 'soft-round' && !isSquare) {
        const radius = Math.max(0.5, size / 2);
        const rgb = hexToRgb(color) || { r: 0, g: 0, b: 0 };
        const gradient = ctx.createRadialGradient(x, y, radius * 0.05, x, y, radius);
        gradient.addColorStop(0, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 1)`);
        gradient.addColorStop(1, `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, 0)`);
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = originalAlpha;
        return;
    }

    if (preset === 'textured') {
        ctx.fillStyle = color;
        const scatterCount = Math.max(8, Math.round(size * 2));
        const strokeSeed = opts.strokeSeed || 1;
        const stampSeed = (Math.round(x * 73856093) ^ Math.round(y * 19349663) ^ strokeSeed) >>> 0;
        for (let i = 0; i < scatterCount; i++) {
            const angle = seededRandom(stampSeed + (i * 1013)) * Math.PI * 2;
            const radius = Math.sqrt(seededRandom(stampSeed + (i * 1619))) * (size / 2);
            const dotX = x + Math.cos(angle) * radius;
            const dotY = y + Math.sin(angle) * radius;
            const dotSize = Math.max(1, Math.round(size / (5 + Math.floor(seededRandom(stampSeed + (i * 3571)) * 4))));
            ctx.globalAlpha = baseAlpha * (0.35 + (seededRandom(stampSeed + (i * 2371)) * 0.65));
            ctx.fillRect(Math.round(dotX), Math.round(dotY), dotSize, dotSize);
        }
        ctx.globalAlpha = originalAlpha;
        return;
    }

    ctx.fillStyle = color;
    if (isSquare) {
        const offset = size / 2;
        ctx.fillRect(x - offset, y - offset, size, size);
        ctx.globalAlpha = originalAlpha;
        return;
    }

    if (size === 1) {
        ctx.fillRect(x, y, 1, 1);
        ctx.globalAlpha = originalAlpha;
        return;
    }

    ctx.beginPath();
    ctx.arc(x, y, size / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = originalAlpha;
}

function drawBrushLine(ctx, x1, y1, x2, y2, opts) {
    const { color, preset } = opts;
    const usePixelPreset = preset === 'pixel';
    const shape = usePixelPreset ? 'square' : opts.shape;
    const adjustedSize = opts.size;
    const stampSpacing = Math.max(0.25, adjustedSize * opts.spacing);

    if (usePixelPreset || !opts.antialias) {
        const points = getPixelPerfectLinePoints(x1, y1, x2, y2);
        points.forEach(({ x, y }) => {
            drawBrushStamp(ctx, x, y, opts);
        });
        return;
    }

    if (preset === 'soft-round' || preset === 'textured' || shape === 'square') {
        const points = getInterpolatedStrokePoints(x1, y1, x2, y2, stampSpacing);
        points.forEach(({ x, y }) => {
            drawBrushStamp(ctx, x, y, opts);
        });
        return;
    }

    const originalAlpha = ctx.globalAlpha;
    ctx.globalAlpha = originalAlpha * opts.flow;
    ctx.strokeStyle = color;
    ctx.lineWidth = adjustedSize;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.globalAlpha = originalAlpha;
}

// Non-antialiased shape-tool rasterizers (commitShape's line/circle
// branches). These intentionally take the raw brush size/shape, NOT the
// pressure-adjusted options object -- shape tools have never applied
// pressure or flow.
function drawPixelPerfectLineWithFillRect(ctx, x1, y1, x2, y2, size, shape) {
    const points = getPixelPerfectLinePoints(x1, y1, x2, y2);

    points.forEach(({ x, y }) => {
        drawPixelPerfectBrushStamp(ctx, x, y, size, shape);
    });
}

function drawPixelPerfectCircleWithFillRect(ctx, cx, cy, rx, ry, size) {
    rx = Math.round(Math.abs(rx));
    ry = Math.round(Math.abs(ry));
    const thickness = Math.round(size);

    if (thickness <= 0 || (rx === 0 && ry === 0)) return;

    const outer_rx = rx;
    const outer_ry = ry;

    const isFilled = thickness >= outer_rx || thickness >= outer_ry;

    const inner_rx = isFilled ? 0 : outer_rx - thickness;
    const inner_ry = isFilled ? 0 : outer_ry - thickness;

    const outer_rx_sq = outer_rx * outer_rx;
    const outer_ry_sq = outer_ry * outer_ry;
    const inner_rx_sq = inner_rx * inner_rx;
    const inner_ry_sq = inner_ry * inner_ry;

    const cx_round = Math.round(cx);
    const cy_round = Math.round(cy);

    const outer_limit = outer_rx_sq * outer_ry_sq;
    const inner_limit = inner_rx_sq * inner_ry_sq;

    for (let y = -outer_ry; y <= outer_ry; y++) {
        for (let x = -outer_rx; x <= outer_rx; x++) {
            const x_sq = x * x;
            const y_sq = y * y;

            if (x_sq * outer_ry_sq + y_sq * outer_rx_sq <= outer_limit) {
                if (isFilled) {
                    ctx.fillRect(cx_round + x, cy_round + y, 1, 1);
                } else {
                    if (inner_limit === 0 || x_sq * inner_ry_sq + y_sq * inner_rx_sq > inner_limit) {
                        ctx.fillRect(cx_round + x, cy_round + y, 1, 1);
                    }
                }
            }
        }
    }
}

module.exports = {
    getInterpolatedStrokePoints,
    getPixelPerfectLinePoints,
    drawPixelPerfectBrushStamp,
    seededRandom,
    drawBrushStamp,
    drawBrushLine,
    drawPixelPerfectLineWithFillRect,
    drawPixelPerfectCircleWithFillRect
};
