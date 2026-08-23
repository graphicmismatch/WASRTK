'use strict';

// Unit tests for src/renderer/math-utils.js.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { clampNumber, snapToAxisTargets } = require('../../src/renderer/math-utils');

describe('clampNumber', () => {
  test('returns the value when within range', () => {
    assert.equal(clampNumber(5, 0, 0, 10), 5);
  });

  test('clamps to max when above range', () => {
    assert.equal(clampNumber(50, 0, 0, 10), 10);
  });

  test('clamps to min when below range', () => {
    assert.equal(clampNumber(-5, 0, 0, 10), 0);
  });

  test('returns fallback for NaN', () => {
    assert.equal(clampNumber(NaN, 7, 0, 10), 7);
  });

  test('returns fallback for non-finite values (Infinity)', () => {
    assert.equal(clampNumber(Infinity, 7, 0, 10), 7);
    assert.equal(clampNumber(-Infinity, 7, 0, 10), 7);
  });

  test('returns fallback for non-numeric strings', () => {
    assert.equal(clampNumber('not-a-number', 3, 0, 10), 3);
  });

  test('coerces numeric strings', () => {
    assert.equal(clampNumber('5', 0, 0, 10), 5);
  });

  test('returns fallback for undefined/null', () => {
    // Number(null) is 0, which is finite -> clamped, not the fallback.
    assert.equal(clampNumber(null, 7, 0, 10), 0);
    // Number(undefined) is NaN -> fallback.
    assert.equal(clampNumber(undefined, 7, 0, 10), 7);
  });
});

describe('snapToAxisTargets', () => {
  // A 20px thing dragged along a 100px axis: start-edge landmark at 0,
  // end-edge landmark at 80 (so the thing's far edge lands on 100), center
  // landmark at 40 (so the thing sits centered, guide drawn at 50).

  test('snaps to the start edge when within threshold, guide line at 0', () => {
    const result = snapToAxisTargets(3, 20, 100, 5);
    assert.equal(result.value, 0);
    assert.equal(result.snapped, true);
    assert.equal(result.guideLine, 0);
  });

  test('snaps to the end edge, value is canvasSize - size but guide line is canvasSize', () => {
    const result = snapToAxisTargets(78, 20, 100, 5);
    assert.equal(result.value, 80);
    assert.equal(result.snapped, true);
    assert.equal(result.guideLine, 100);
  });

  test('snaps to center, value is (canvasSize - size) / 2 but guide line is canvasSize / 2', () => {
    const result = snapToAxisTargets(38, 20, 100, 5);
    assert.equal(result.value, 40);
    assert.equal(result.snapped, true);
    assert.equal(result.guideLine, 50);
  });

  test('does not snap when outside every threshold, returns the original value unchanged', () => {
    const result = snapToAxisTargets(60, 20, 100, 5);
    assert.equal(result.value, 60);
    assert.equal(result.snapped, false);
    assert.equal(result.guideLine, null);
  });

  test('is inclusive at exactly the threshold distance', () => {
    const result = snapToAxisTargets(5, 20, 100, 5);
    assert.equal(result.snapped, true);
    assert.equal(result.value, 0);
  });

  test('picks the first matching candidate when two landmarks are both within threshold', () => {
    // A tiny axis where start (0) and center ((10-4)/2=3) are both within
    // a threshold of 5 from value=2 -- start-edge (declared first) wins.
    const result = snapToAxisTargets(2, 4, 10, 5);
    assert.equal(result.value, 0);
    assert.equal(result.guideLine, 0);
  });

  test('threshold 0 never snaps except an exact match', () => {
    assert.equal(snapToAxisTargets(0.5, 20, 100, 0).snapped, false);
    assert.equal(snapToAxisTargets(0, 20, 100, 0).snapped, true);
  });
});
