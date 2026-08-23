'use strict';

// Unit tests for the pure LUT math in src/renderer/adjustment-layers.js.
// The apply*/applyAdjustment functions need a real CanvasRenderingContext2D
// (ctx.filter, getImageData) and are exercised by the smoke suite instead,
// same as the rest of the canvas-touching code in this codebase.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
    buildLevelsLUT,
    buildCurvesLUT,
    applyLUT,
    ADJUSTMENT_TYPES,
    ADJUSTMENT_DEFAULT_PARAMS,
    ADJUSTMENT_LABELS
} = require('../../src/renderer/adjustment-layers');

describe('buildLevelsLUT', () => {
    test('identity: black=0, white=255, gamma=1 leaves every value unchanged', () => {
        const lut = buildLevelsLUT(0, 255, 1);
        assert.equal(lut[0], 0);
        assert.equal(lut[128], 128);
        assert.equal(lut[255], 255);
    });

    test('maps blackPoint to 0 and whitePoint to 255', () => {
        const lut = buildLevelsLUT(50, 200, 1);
        assert.equal(lut[50], 0);
        assert.equal(lut[200], 255);
    });

    test('clamps below blackPoint to 0 and above whitePoint to 255', () => {
        const lut = buildLevelsLUT(50, 200, 1);
        assert.equal(lut[0], 0);
        assert.equal(lut[49], 0);
        assert.equal(lut[255], 255);
    });

    test('gamma > 1 brightens midtones, gamma < 1 darkens them', () => {
        const brightened = buildLevelsLUT(0, 255, 2);
        const darkened = buildLevelsLUT(0, 255, 0.5);
        assert.ok(brightened[128] > 128);
        assert.ok(darkened[128] < 128);
    });

    test('a degenerate range (white <= black) does not throw or divide by zero', () => {
        assert.doesNotThrow(() => buildLevelsLUT(200, 100, 1));
        const lut = buildLevelsLUT(200, 100, 1);
        assert.equal(lut.length, 256);
    });

    test('output is monotonically non-decreasing for a normal range', () => {
        const lut = buildLevelsLUT(20, 220, 1.4);
        for (let i = 1; i < 256; i++) {
            assert.ok(lut[i] >= lut[i - 1], `lut[${i}]=${lut[i]} should be >= lut[${i - 1}]=${lut[i - 1]}`);
        }
    });
});

describe('buildCurvesLUT', () => {
    test('no points -> identity curve', () => {
        const lut = buildCurvesLUT([]);
        assert.equal(lut[0], 0);
        assert.equal(lut[128], 128);
        assert.equal(lut[255], 255);
    });

    test('null/undefined points -> identity curve, does not throw', () => {
        assert.doesNotThrow(() => buildCurvesLUT(undefined));
        const lut = buildCurvesLUT(undefined);
        assert.equal(lut[100], 100);
    });

    test('a single point pulls the whole curve toward it (flat outside)', () => {
        const lut = buildCurvesLUT([{ x: 128, y: 200 }]);
        assert.equal(lut[128], 200);
        // Flat below and above the single point, per the "hold at nearest
        // point" endpoint-filling rule.
        assert.equal(lut[0], 200);
        assert.equal(lut[255], 200);
    });

    test('two points interpolate linearly between them', () => {
        const lut = buildCurvesLUT([{ x: 0, y: 0 }, { x: 255, y: 255 }]);
        assert.equal(lut[0], 0);
        assert.equal(lut[128], 128);
        assert.equal(lut[255], 255);
    });

    test('an inverted curve (0,255) -> (255,0) flips every value', () => {
        const lut = buildCurvesLUT([{ x: 0, y: 255 }, { x: 255, y: 0 }]);
        assert.equal(lut[0], 255);
        assert.equal(lut[255], 0);
        assert.equal(lut[128], 127); // midpoint rounds down by 0.5
    });

    test('unsorted input points are sorted before interpolating', () => {
        const sorted = buildCurvesLUT([{ x: 0, y: 0 }, { x: 128, y: 200 }, { x: 255, y: 255 }]);
        const unsorted = buildCurvesLUT([{ x: 255, y: 255 }, { x: 0, y: 0 }, { x: 128, y: 200 }]);
        assert.deepEqual(Array.from(sorted), Array.from(unsorted));
    });

    test('three interior points produce three correct linear segments', () => {
        const lut = buildCurvesLUT([{ x: 64, y: 0 }, { x: 128, y: 255 }, { x: 192, y: 0 }]);
        assert.equal(lut[64], 0);
        assert.equal(lut[128], 255);
        assert.equal(lut[192], 0);
        assert.equal(lut[96], 128); // midpoint of the rising segment [64,128]
        assert.equal(lut[160], 128); // midpoint of the falling segment [128,192]
    });
});

describe('applyLUT', () => {
    function fakeImageData(pixels) {
        return { data: new Uint8ClampedArray(pixels) };
    }

    test('remaps R/G/B through the LUT and leaves alpha untouched', () => {
        const lut = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) lut[i] = 255 - i; // invert
        const imageData = fakeImageData([10, 20, 30, 40]);

        applyLUT(imageData, lut);

        assert.deepEqual(Array.from(imageData.data), [245, 235, 225, 40]);
    });

    test('applies across every pixel in the buffer, not just the first', () => {
        const lut = new Uint8ClampedArray(256);
        for (let i = 0; i < 256; i++) lut[i] = 0; // maps everything to 0
        const imageData = fakeImageData([1, 2, 3, 255, 4, 5, 6, 128]);

        applyLUT(imageData, lut);

        assert.deepEqual(Array.from(imageData.data), [0, 0, 0, 255, 0, 0, 0, 128]);
    });
});

describe('adjustment type metadata', () => {
    test('every adjustment type has default params and a label', () => {
        for (const type of ADJUSTMENT_TYPES) {
            assert.ok(ADJUSTMENT_DEFAULT_PARAMS[type], `missing default params for ${type}`);
            assert.ok(ADJUSTMENT_LABELS[type], `missing label for ${type}`);
        }
    });

    test('covers exactly the four types the README asks for', () => {
        assert.deepEqual(new Set(ADJUSTMENT_TYPES), new Set(['brightness-contrast', 'hue-saturation', 'levels', 'curves']));
    });
});
