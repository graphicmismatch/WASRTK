// Horizontal/vertical pixel rulers for the canvas workspace. Zoom is
// applied via CSS scaling of #canvas-scaler (see zoom.js), not a canvas
// transform, so the simplest way to find where the canvas's origin lands
// on screen -- already accounting for zoom, scroll position, and the
// wrapper's centering -- is mainCanvas.getBoundingClientRect() rather than
// re-deriving that math here.

const NICE_STEPS = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];

// Picks a "nice" canvas-pixel spacing between major ruler ticks so they
// stay readable across the zoom range: the smallest step from a fixed
// candidate list whose on-screen spacing (step * zoom) is at least
// targetScreenPx.
function chooseTickSpacing(zoom, targetScreenPx = 50) {
    const idealCanvasPx = targetScreenPx / zoom;
    return NICE_STEPS.find((step) => step >= idealCanvasPx) || NICE_STEPS[NICE_STEPS.length - 1];
}

// Tick positions (canvas-space values 0, spacing, 2*spacing, ... up to
// canvasLength) paired with their on-screen offset from the canvas's own
// origin. Pure -- a drawing caller just adds its own canvas-origin offset
// within the ruler strip.
function computeTickOffsets(canvasLength, zoom, spacing) {
    const ticks = [];
    for (let value = 0; value <= canvasLength; value += spacing) {
        ticks.push({ value, screenOffset: value * zoom });
    }
    return ticks;
}

// `env` is a closure-accessor object built once in the WASRTK constructor:
//   getZoom()        -- current zoom level
//   mainCanvas       -- for width/height and getBoundingClientRect()
function createRulersController(env) {
    function drawRuler(canvas, ticks, origin, { vertical }) {
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = '#1f1f29';
        ctx.fillRect(0, 0, width, height);
        ctx.strokeStyle = '#96a2b3';
        ctx.fillStyle = '#96a2b3';
        ctx.font = '9px sans-serif';
        ctx.textBaseline = 'top';

        ticks.forEach((tick) => {
            const pos = origin + tick.screenOffset;
            if (pos < 0 || pos > (vertical ? height : width)) return;
            ctx.beginPath();
            if (vertical) {
                ctx.moveTo(width - 6, pos + 0.5);
                ctx.lineTo(width, pos + 0.5);
            } else {
                ctx.moveTo(pos + 0.5, height - 6);
                ctx.lineTo(pos + 0.5, height);
            }
            ctx.stroke();
            if (vertical) {
                ctx.fillText(String(tick.value), 2, pos + 2);
            } else {
                ctx.fillText(String(tick.value), pos + 2, 1);
            }
        });
    }

    function redraw() {
        const hCanvas = document.getElementById('rulerHorizontal');
        const vCanvas = document.getElementById('rulerVertical');
        if (!hCanvas || !vCanvas) return;

        // Resize each ruler's backing store to match its own on-screen
        // size (the CSS grid controls that) so ticks stay crisp regardless
        // of panel/window resizing -- cheap since redraw only runs on
        // scroll/zoom, not per frame.
        hCanvas.width = hCanvas.clientWidth;
        hCanvas.height = hCanvas.clientHeight;
        vCanvas.width = vCanvas.clientWidth;
        vCanvas.height = vCanvas.clientHeight;

        const zoom = env.getZoom();
        const canvasRect = env.mainCanvas.getBoundingClientRect();
        const hRect = hCanvas.getBoundingClientRect();
        const vRect = vCanvas.getBoundingClientRect();

        const spacing = chooseTickSpacing(zoom);
        const hTicks = computeTickOffsets(env.mainCanvas.width, zoom, spacing);
        const vTicks = computeTickOffsets(env.mainCanvas.height, zoom, spacing);

        drawRuler(hCanvas, hTicks, canvasRect.left - hRect.left, { vertical: false });
        drawRuler(vCanvas, vTicks, canvasRect.top - vRect.top, { vertical: true });
    }

    return { redraw };
}

module.exports = { chooseTickSpacing, computeTickOffsets, createRulersController };
