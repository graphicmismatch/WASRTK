'use strict';

// Unit tests for src/renderer/project-io.js.
// project-io.js has no DOM/Electron dependency, so it can be required directly
// under node:test with no stubbing.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  parseProjectJson,
  validateProjectData,
  buildProjectData,
  serializeProjectData,
  normalizeProjectSettings
} = require('../../src/renderer/project-io');

describe('parseProjectJson', () => {
  test('parses plain JSON', () => {
    const result = parseProjectJson('{"a":1,"b":"two"}');
    assert.deepEqual(result, { a: 1, b: 'two' });
  });

  test('strips a leading UTF-8 BOM before parsing', () => {
    const withBom = '﻿{"a":1}';
    const result = parseProjectJson(withBom);
    assert.deepEqual(result, { a: 1 });
  });

  test('trims surrounding whitespace before parsing', () => {
    const padded = '  \n\t{"a":1}\n  ';
    const result = parseProjectJson(padded);
    assert.deepEqual(result, { a: 1 });
  });

  test('strips BOM and trims whitespace together', () => {
    const input = '﻿   {"a":1}   ';
    const result = parseProjectJson(input);
    assert.deepEqual(result, { a: 1 });
  });

  test('throws on invalid JSON', () => {
    assert.throws(() => parseProjectJson('{not valid json'), SyntaxError);
  });

  test('throws on empty string', () => {
    assert.throws(() => parseProjectJson(''), SyntaxError);
  });
});

describe('validateProjectData', () => {
  test('throws when frames is missing', () => {
    assert.throws(
      () => validateProjectData({ layers: [], settings: {} }),
      /Invalid project file format/
    );
  });

  test('throws when layers is missing', () => {
    assert.throws(
      () => validateProjectData({ frames: [], settings: {} }),
      /Invalid project file format/
    );
  });

  test('throws when settings is missing', () => {
    assert.throws(
      () => validateProjectData({ frames: [], layers: [] }),
      /Invalid project file format/
    );
  });

  test('throws when all three fields are missing', () => {
    assert.throws(() => validateProjectData({}), /Invalid project file format/);
  });

  test('does not throw when frames/layers/settings are present (even if empty arrays)', () => {
    assert.doesNotThrow(() => validateProjectData({ frames: [], layers: [], settings: {} }));
  });
});

describe('buildProjectData / serializeProjectData round trip', () => {
  function fakeCanvas(label) {
    return { toDataURL: (type) => `data:${type};base64,${label}` };
  }

  function makeSampleInput() {
    return {
      frames: [
        {
          id: 0,
          name: 'Frame 1',
          timestamp: 111,
          layers: [
            { id: 0, name: 'Background', visible: true, locked: false, canvas: fakeCanvas('bg') }
          ]
        }
      ],
      layers: [{ id: 0, name: 'Background', visible: true, locked: false }],
      canvas: { width: 256, height: 256 },
      settings: { fps: 12 }
    };
  }

  test('buildProjectData produces the expected shape with default metadata', () => {
    const built = buildProjectData(makeSampleInput());

    assert.equal(built.name, 'WASRTK Project');
    assert.equal(built.version, '1.0.0');
    assert.deepEqual(built.canvas, { width: 256, height: 256 });
    assert.equal(built.settings.fps, 12);

    assert.equal(built.frames.length, 1);
    assert.equal(built.frames[0].id, 0);
    assert.equal(built.frames[0].layers[0].data, 'data:image/png;base64,bg');
    // layer.canvas itself must not leak into the serialized frame layer
    assert.equal('canvas' in built.frames[0].layers[0], false);

    assert.deepEqual(built.layers, [{ id: 0, name: 'Background', visible: true, locked: false }]);

    assert.equal(built.metadata.author, 'WASRTK');
    assert.equal(built.metadata.description, 'WASRTK pixel art and animation project');
    assert.equal(typeof built.metadata.created, 'string');
    assert.equal(typeof built.metadata.modified, 'string');
    // Should be a valid ISO date string.
    assert.doesNotThrow(() => new Date(built.metadata.created).toISOString());
  });

  test('buildProjectData merges custom metadata over the defaults', () => {
    const input = makeSampleInput();
    input.metadata = { author: 'Someone', description: 'Custom desc' };

    const built = buildProjectData(input);

    assert.equal(built.metadata.author, 'Someone');
    assert.equal(built.metadata.description, 'Custom desc');
    // created/modified are always (re)computed by buildProjectData, not caller-supplied.
    assert.equal(typeof built.metadata.created, 'string');
  });

  test('serializeProjectData produces valid, re-parseable JSON', () => {
    const built = buildProjectData(makeSampleInput());
    const json = serializeProjectData(built);

    assert.equal(typeof json, 'string');
    // Pretty-printed with 2-space indent.
    assert.ok(json.includes('\n  "'));

    const reparsed = JSON.parse(json);
    assert.deepEqual(reparsed, built);
  });

  test('round trip: buildProjectData -> serializeProjectData -> parseProjectJson', () => {
    const built = buildProjectData(makeSampleInput());
    const json = serializeProjectData(built);
    const roundTripped = parseProjectJson(json);

    assert.deepEqual(roundTripped, built);
    // The round-tripped data should still satisfy validation.
    assert.doesNotThrow(() => validateProjectData(roundTripped));
  });
});

describe('normalizeProjectSettings', () => {
  test('fills in every field with defaults for an empty object', () => {
    const normalized = normalizeProjectSettings({});

    assert.equal(normalized.fps, 12);
    assert.equal(normalized.onionSkinningEnabled, false);
    assert.equal(normalized.onionSkinningRange, 3);
    assert.equal(normalized.referenceOpacity, 0.5);
    assert.equal(normalized.referenceVisible, false);
    assert.equal(normalized.antialiasingEnabled, true);
    assert.equal(normalized.currentTool, 'pen');
    assert.equal(normalized.currentColor, '#000000');
    assert.equal(normalized.currentOpacity, 1);
    assert.equal(normalized.brushSize, 1);
    assert.equal(normalized.brushShape, 'circle');
    assert.equal(normalized.brushPreset, 'hard-round');
    assert.equal(normalized.brushFlow, 1);
    assert.equal(normalized.brushSpacing, 0.25);
    assert.equal(normalized.pressureSensitivityEnabled, true);
    assert.equal(normalized.pressureAffectsSize, true);
    assert.equal(normalized.pressureAffectsFlow, true);
    assert.equal(normalized.selectionMode, 'rectangle');
    assert.equal(normalized.selectionAntialias, true);
    assert.equal(normalized.selectionFeather, 0);
    assert.equal(normalized.fillTolerance, 0);
    assert.equal(normalized.fillContiguous, true);
    assert.equal(normalized.fillSampleAllLayers, false);
    assert.equal(normalized.zoom, 1);
  });

  test('defaults when called with no argument at all', () => {
    const normalized = normalizeProjectSettings();
    assert.equal(normalized.fps, 12);
  });

  test('clamps out-of-range numeric fields', () => {
    const normalized = normalizeProjectSettings({
      fps: 1000,
      onionSkinningRange: -5,
      referenceOpacity: 5,
      currentOpacity: -1,
      brushSize: 999,
      brushFlow: 0,
      brushSpacing: 2,
      fillTolerance: 999,
      zoom: 100
    });

    assert.equal(normalized.fps, 60);
    assert.equal(normalized.onionSkinningRange, 1);
    assert.equal(normalized.referenceOpacity, 1);
    assert.equal(normalized.currentOpacity, 0);
    assert.equal(normalized.brushSize, 100);
    assert.equal(normalized.brushFlow, 0.01);
    assert.equal(normalized.brushSpacing, 1);
    assert.equal(normalized.fillTolerance, 255);
    assert.equal(normalized.zoom, 20);
  });

  test('falls back to a valid brushPreset when given an unknown value', () => {
    const normalized = normalizeProjectSettings({ brushPreset: 'not-a-real-preset' });
    assert.equal(normalized.brushPreset, 'hard-round');
  });

  test('accepts a valid brushPreset value unchanged', () => {
    const normalized = normalizeProjectSettings({ brushPreset: 'textured' });
    assert.equal(normalized.brushPreset, 'textured');
  });

  test('normalizes brushShape to "square" only for the literal value "square"', () => {
    assert.equal(normalizeProjectSettings({ brushShape: 'square' }).brushShape, 'square');
    assert.equal(normalizeProjectSettings({ brushShape: 'circle' }).brushShape, 'circle');
    assert.equal(normalizeProjectSettings({ brushShape: 'triangle' }).brushShape, 'circle');
  });

  test('falls back to a valid selectionMode when given an unknown value', () => {
    const normalized = normalizeProjectSettings({ selectionMode: 'bogus' });
    assert.equal(normalized.selectionMode, 'rectangle');
  });

  test('accepts a valid selectionMode value unchanged', () => {
    const normalized = normalizeProjectSettings({ selectionMode: 'lasso' });
    assert.equal(normalized.selectionMode, 'lasso');
  });

  test('preserves explicit false booleans instead of defaulting them', () => {
    // These fields use `!== undefined ? value : default`, so an explicit
    // false must be preserved rather than replaced by the true default.
    const normalized = normalizeProjectSettings({
      antialiasingEnabled: false,
      pressureSensitivityEnabled: false,
      pressureAffectsSize: false,
      pressureAffectsFlow: false,
      selectionAntialias: false,
      fillContiguous: false
    });

    assert.equal(normalized.antialiasingEnabled, false);
    assert.equal(normalized.pressureSensitivityEnabled, false);
    assert.equal(normalized.pressureAffectsSize, false);
    assert.equal(normalized.pressureAffectsFlow, false);
    assert.equal(normalized.selectionAntialias, false);
    assert.equal(normalized.fillContiguous, false);
  });

  test('treats explicit true booleans that default to false as truthy passthrough', () => {
    const normalized = normalizeProjectSettings({
      onionSkinningEnabled: true,
      referenceVisible: true,
      fillSampleAllLayers: true
    });

    assert.equal(normalized.onionSkinningEnabled, true);
    assert.equal(normalized.referenceVisible, true);
    assert.equal(normalized.fillSampleAllLayers, true);
  });
});
