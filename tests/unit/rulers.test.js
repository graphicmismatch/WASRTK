'use strict';

// Unit tests for the pure tick-spacing math in src/renderer/rulers.js.
// createRulersController needs a real DOM (canvas elements,
// getBoundingClientRect) and is exercised by the smoke suite instead.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { chooseTickSpacing, computeTickOffsets } = require('../../src/renderer/rulers');

describe('chooseTickSpacing', () => {
    test('at 100% zoom, picks a step whose on-screen spacing meets the target', () => {
        const spacing = chooseTickSpacing(1, 50);
        assert.ok(spacing * 1 >= 50);
    });

    test('zooming in (larger zoom) never needs a bigger canvas-pixel step than zooming out', () => {
        const zoomedIn = chooseTickSpacing(4, 50);
        const zoomedOut = chooseTickSpacing(0.25, 50);
        assert.ok(zoomedIn <= zoomedOut);
    });

    test('every returned spacing actually meets the target on-screen distance', () => {
        for (const zoom of [0.1, 0.25, 0.5, 1, 2, 5, 10, 20]) {
            const spacing = chooseTickSpacing(zoom, 50);
            assert.ok(spacing * zoom >= 50 || spacing === 5000, `zoom=${zoom} spacing=${spacing} gives ${spacing * zoom}px, below target`);
        }
    });

    test('a smaller target screen distance allows a smaller spacing', () => {
        const wide = chooseTickSpacing(1, 100);
        const narrow = chooseTickSpacing(1, 20);
        assert.ok(narrow <= wide);
    });

    test('caps at the largest candidate step for extreme low zoom', () => {
        const spacing = chooseTickSpacing(0.001, 50);
        assert.equal(spacing, 5000);
    });
});

describe('computeTickOffsets', () => {
    test('produces ticks from 0 to canvasLength inclusive at the given spacing', () => {
        const ticks = computeTickOffsets(100, 1, 25);
        assert.deepEqual(ticks.map((t) => t.value), [0, 25, 50, 75, 100]);
    });

    test('screenOffset is value * zoom', () => {
        const ticks = computeTickOffsets(100, 2, 50);
        assert.deepEqual(ticks.map((t) => t.screenOffset), [0, 100, 200]);
    });

    test('a canvasLength not evenly divisible by spacing stops at the last tick <= canvasLength', () => {
        const ticks = computeTickOffsets(90, 1, 25);
        assert.deepEqual(ticks.map((t) => t.value), [0, 25, 50, 75]);
    });

    test('canvasLength of 0 still returns the origin tick', () => {
        const ticks = computeTickOffsets(0, 1, 25);
        assert.deepEqual(ticks.map((t) => t.value), [0]);
    });
});
