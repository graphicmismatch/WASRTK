'use strict';

// Unit tests for src/renderer/math-utils.js.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { clampNumber } = require('../../src/renderer/math-utils');

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
