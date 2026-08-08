'use strict';

// Unit tests for src/renderer/color-utils.js.
// Pure functions, no DOM/Electron dependency.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const { normalizeHexColor, dedupeColors, hexToRgb, rgbToHex } = require('../../src/renderer/color-utils');

describe('normalizeHexColor', () => {
  test('round-trips a lowercase 6-digit hex color', () => {
    assert.equal(normalizeHexColor('#ff0080'), '#ff0080');
  });

  test('lowercases and adds a missing leading #', () => {
    assert.equal(normalizeHexColor('FF0080'), '#ff0080');
  });

  test('expands 3-digit shorthand', () => {
    assert.equal(normalizeHexColor('#abc'), '#aabbcc');
  });

  test('expands 3-digit shorthand without a leading #', () => {
    assert.equal(normalizeHexColor('abc'), '#aabbcc');
  });

  test('trims surrounding whitespace', () => {
    assert.equal(normalizeHexColor('  #ff0080  '), '#ff0080');
  });

  test('returns null for invalid-length strings', () => {
    assert.equal(normalizeHexColor('#ff00'), null);
  });

  test('returns null for non-hex characters', () => {
    assert.equal(normalizeHexColor('#gggggg'), null);
  });

  test('returns null for non-string input', () => {
    assert.equal(normalizeHexColor(null), null);
    assert.equal(normalizeHexColor(undefined), null);
    assert.equal(normalizeHexColor(123456), null);
  });
});

describe('dedupeColors', () => {
  test('removes exact duplicates', () => {
    assert.deepEqual(dedupeColors(['#ff0000', '#ff0000', '#00ff00']), ['#ff0000', '#00ff00']);
  });

  test('treats different casing as the same color', () => {
    assert.deepEqual(dedupeColors(['#FF0000', '#ff0000']), ['#ff0000']);
  });

  test('treats shorthand and expanded forms as the same color', () => {
    assert.deepEqual(dedupeColors(['#abc', '#aabbcc']), ['#aabbcc']);
  });

  test('drops invalid entries without throwing', () => {
    assert.deepEqual(dedupeColors(['#ff0000', 'not-a-color', '#00ff00']), ['#ff0000', '#00ff00']);
  });

  test('returns an empty array for an empty input', () => {
    assert.deepEqual(dedupeColors([]), []);
  });
});

describe('hexToRgb', () => {
  test('converts a 6-digit hex color', () => {
    assert.deepEqual(hexToRgb('#ff8000'), { r: 255, g: 128, b: 0 });
  });

  test('accepts 3-digit shorthand', () => {
    assert.deepEqual(hexToRgb('#fff'), { r: 255, g: 255, b: 255 });
  });

  test('is case-insensitive', () => {
    assert.deepEqual(hexToRgb('#FF8000'), { r: 255, g: 128, b: 0 });
  });

  test('returns null for invalid input', () => {
    assert.equal(hexToRgb('not-a-color'), null);
    assert.equal(hexToRgb(null), null);
  });
});

describe('rgbToHex', () => {
  test('converts in-range channel values', () => {
    assert.equal(rgbToHex(255, 128, 0), '#ff8000');
  });

  test('pads single-digit hex channels with a leading zero', () => {
    assert.equal(rgbToHex(0, 5, 15), '#00050f');
  });

  test('clamps out-of-range channels', () => {
    assert.equal(rgbToHex(-10, 300, 128), '#00ff80');
  });

  test('round-trips through hexToRgb', () => {
    const original = { r: 12, g: 34, b: 56 };
    const hex = rgbToHex(original.r, original.g, original.b);
    assert.deepEqual(hexToRgb(hex), original);
  });
});
