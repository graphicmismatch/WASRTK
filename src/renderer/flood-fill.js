// Shared stack-based 4-neighbor flood traversal, used by the fill tool
// (canvas-engine.js's contiguous floodFill branch) and the magic-wand
// selection tool (selection-manager.js's createMagicWandSelection). Both
// used to hand-roll an identical Uint8Array-visited/colorDistance/stack
// loop; this is that loop, pixels-in/positions-out with no canvas or `env`
// dependency, matching the convention used by brush-engine.js and
// selection-geometry.js.
//
// Returns every pixel reachable from (startX, startY) by 4-connected
// neighbors whose Euclidean RGBA distance from the start pixel is within
// `tolerance`. Callers do their own thing with the result (paint fill
// color, or crop an ImageData region for a selection).
function floodRegion(pixels, width, height, startX, startY, tolerance) {
    const safeStartX = Math.max(0, Math.min(width - 1, Math.round(startX)));
    const safeStartY = Math.max(0, Math.min(height - 1, Math.round(startY)));

    if (!Number.isFinite(safeStartX) || !Number.isFinite(safeStartY)) {
        return [];
    }

    const startPos = (safeStartY * width + safeStartX) * 4;
    const startR = pixels[startPos];
    const startG = pixels[startPos + 1];
    const startB = pixels[startPos + 2];
    const startA = pixels[startPos + 3];

    const colorDistance = (pos) => {
        const dr = pixels[pos] - startR;
        const dg = pixels[pos + 1] - startG;
        const db = pixels[pos + 2] - startB;
        const da = pixels[pos + 3] - startA;
        return Math.sqrt((dr * dr) + (dg * dg) + (db * db) + (da * da));
    };

    const visited = new Uint8Array(width * height);
    const stack = [[safeStartX, safeStartY]];
    const region = [];

    while (stack.length) {
        const [x, y] = stack.pop();
        if (x < 0 || x >= width || y < 0 || y >= height) {
            continue;
        }

        const idx = (y * width) + x;
        if (visited[idx]) {
            continue;
        }
        visited[idx] = 1;

        const pos = idx * 4;
        if (colorDistance(pos) > tolerance) {
            continue;
        }

        region.push({ x, y, pos });
        stack.push([x + 1, y], [x - 1, y], [x, y + 1], [x, y - 1]);
    }

    return region;
}

module.exports = { floodRegion };
