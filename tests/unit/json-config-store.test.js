'use strict';

// Unit tests for src/main/json-config-store.js.
// Electron-free: getDir is injected so the store can be exercised against a
// real temp directory without requiring the `electron` module.

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createJsonConfigStore } = require('../../src/main/json-config-store');

const DEFAULTS = { color: 'red', size: 10 };

function sanitize(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return { ...DEFAULTS };
  }
  return {
    color: typeof input.color === 'string' && input.color.trim() ? input.color.trim() : DEFAULTS.color,
    size: typeof input.size === 'number' && Number.isFinite(input.size) ? input.size : DEFAULTS.size
  };
}

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasrtk-json-config-store-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeStore(overrides = {}) {
  return createJsonConfigStore({
    getDir: () => tmpDir,
    fileName: 'config.json',
    defaults: DEFAULTS,
    sanitize,
    ...overrides
  });
}

describe('createJsonConfigStore', () => {
  test('fresh load returns defaults and creates the file on disk', () => {
    const store = makeStore();
    const configPath = store.getConfigPath();

    assert.equal(fs.existsSync(configPath), false);

    const result = store.load();

    assert.deepEqual(result.data, DEFAULTS);
    assert.equal(result.path, configPath);
    assert.equal(fs.existsSync(configPath), true);

    const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepEqual(onDisk, DEFAULTS);
  });

  test('creates the target directory if it does not exist yet', () => {
    const nestedDir = path.join(tmpDir, 'nested', 'deeper');
    const store = makeStore({ getDir: () => nestedDir });

    const result = store.load();

    assert.equal(fs.existsSync(nestedDir), true);
    assert.deepEqual(result.data, DEFAULTS);
  });

  test('round-trips a save then load', () => {
    const store = makeStore();

    const saved = store.save({ color: 'blue', size: 42 });
    assert.deepEqual(saved.data, { color: 'blue', size: 42 });

    const loaded = store.load();
    assert.deepEqual(loaded.data, { color: 'blue', size: 42 });
  });

  test('corrupt JSON on disk recovers to sanitized defaults on load', () => {
    const store = makeStore();
    const configPath = store.getConfigPath();

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, '{ not valid json', 'utf8');

    const result = store.load();

    assert.deepEqual(result.data, DEFAULTS);
    assert.equal(typeof result.recoveredFromError, 'string');
  });

  test('corrupt JSON on disk is rewritten to the recovered defaults', () => {
    const store = makeStore();
    const configPath = store.getConfigPath();

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, 'not json at all', 'utf8');

    store.load();

    const onDisk = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    assert.deepEqual(onDisk, DEFAULTS);
  });

  test('corrupt JSON on disk is backed up before being overwritten', () => {
    const store = makeStore();
    const configPath = store.getConfigPath();

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, 'not json at all', 'utf8');

    store.load();

    const backupPath = `${configPath}.bak`;
    assert.equal(fs.existsSync(backupPath), true);
    assert.equal(fs.readFileSync(backupPath, 'utf8'), 'not json at all');
  });

  test('a successful load does not report recoveredFromError', () => {
    const store = makeStore();
    store.load();
    const result = store.load();
    assert.equal(result.recoveredFromError, undefined);
  });

  test('sanitize is applied on load for well-formed but invalid data', () => {
    const store = makeStore();
    const configPath = store.getConfigPath();

    fs.mkdirSync(path.dirname(configPath), { recursive: true });
    fs.writeFileSync(configPath, JSON.stringify({ color: '  green  ', size: 'not-a-number' }), 'utf8');

    const result = store.load();

    assert.deepEqual(result.data, { color: 'green', size: DEFAULTS.size });
  });

  test('sanitize is applied on save', () => {
    const store = makeStore();

    const result = store.save({ color: '  purple  ', size: 'nope' });

    assert.deepEqual(result.data, { color: 'purple', size: DEFAULTS.size });

    const onDisk = JSON.parse(fs.readFileSync(store.getConfigPath(), 'utf8'));
    assert.deepEqual(onDisk, { color: 'purple', size: DEFAULTS.size });
  });

  test('reset writes sanitized defaults', () => {
    const store = makeStore();
    store.save({ color: 'blue', size: 42 });

    const result = store.reset();

    assert.deepEqual(result.data, DEFAULTS);
    assert.deepEqual(store.load().data, DEFAULTS);
  });

  test('getConfigPath joins the injected directory and file name', () => {
    const store = makeStore();
    assert.equal(store.getConfigPath(), path.join(tmpDir, 'config.json'));
  });
});
