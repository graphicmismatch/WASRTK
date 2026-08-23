'use strict';

// Unit tests for src/main/autosave-store.js.
// Electron-free: getDir is injected so the store can be exercised against a
// real temp directory without requiring the `electron` module (same
// approach as json-config-store.test.js).

const { test, describe, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { createAutosaveStore, selectFilesToPrune } = require('../../src/main/autosave-store');

describe('selectFilesToPrune', () => {
  test('keeps everything when under the limit', () => {
    const names = ['autosave-2026-01-01T00-00-00-000Z.wasrtk', 'autosave-2026-01-02T00-00-00-000Z.wasrtk'];
    assert.deepEqual(selectFilesToPrune(names, 5), []);
  });

  test('prunes the oldest beyond the limit, keeping the newest N', () => {
    const names = [
      'autosave-2026-01-01T00-00-00-000Z.wasrtk',
      'autosave-2026-01-03T00-00-00-000Z.wasrtk',
      'autosave-2026-01-02T00-00-00-000Z.wasrtk'
    ];
    assert.deepEqual(selectFilesToPrune(names, 2), ['autosave-2026-01-01T00-00-00-000Z.wasrtk']);
  });

  test('is independent of input order', () => {
    const sortedAsc = ['a-1.wasrtk', 'a-2.wasrtk', 'a-3.wasrtk'];
    const shuffled = ['a-3.wasrtk', 'a-1.wasrtk', 'a-2.wasrtk'];
    assert.deepEqual(selectFilesToPrune(sortedAsc, 1), selectFilesToPrune(shuffled, 1));
  });

  test('prunes everything when max is 0', () => {
    assert.deepEqual(selectFilesToPrune(['a.wasrtk', 'b.wasrtk'], 0), ['b.wasrtk', 'a.wasrtk']);
  });

  test('empty input prunes nothing', () => {
    assert.deepEqual(selectFilesToPrune([], 5), []);
  });

  test('does not mutate the input array', () => {
    const names = ['a-2.wasrtk', 'a-1.wasrtk'];
    const original = [...names];
    selectFilesToPrune(names, 0);
    assert.deepEqual(names, original);
  });
});

let tmpDir;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wasrtk-autosave-store-'));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

function makeStore(overrides = {}) {
  return createAutosaveStore({ getDir: () => tmpDir, maxAutosaves: 3, ...overrides });
}

describe('createAutosaveStore', () => {
  test('listAutosaves on a fresh directory returns an empty array', () => {
    const store = makeStore();
    assert.deepEqual(store.listAutosaves(), []);
    assert.equal(store.getLatestAutosave(), null);
  });

  test('writeAutosave creates a .wasrtk file under autosaves/ and it round-trips', () => {
    const store = makeStore();
    const filePath = store.writeAutosave('{"hello":"world"}');

    assert.equal(fs.existsSync(filePath), true);
    assert.equal(path.basename(path.dirname(filePath)), 'autosaves');
    assert.equal(fs.readFileSync(filePath, 'utf8'), '{"hello":"world"}');

    const listed = store.listAutosaves();
    assert.equal(listed.length, 1);
    assert.equal(listed[0].path, filePath);
  });

  test('writing beyond maxAutosaves prunes the oldest files on disk', () => {
    const store = makeStore({ maxAutosaves: 2 });
    const dir = store.getAutosaveDir();
    fs.mkdirSync(dir, { recursive: true });
    // Seed three older autosaves directly, bypassing writeAutosave's own
    // timestamp generation so this doesn't depend on real-clock timing --
    // any name older than "now" (2026-08-24+) sorts before it.
    ['autosave-2026-01-01T00-00-00-000Z.wasrtk', 'autosave-2026-01-02T00-00-00-000Z.wasrtk', 'autosave-2026-01-03T00-00-00-000Z.wasrtk']
      .forEach((name) => fs.writeFileSync(path.join(dir, name), '{}'));

    const newestPath = store.writeAutosave('{"newest":true}');

    const listed = store.listAutosaves();
    assert.equal(listed.length, 2);
    assert.deepEqual(listed.map((f) => f.name), [path.basename(newestPath), 'autosave-2026-01-03T00-00-00-000Z.wasrtk']);
  });

  test('getLatestAutosave returns the newest file', () => {
    const store = makeStore();
    store.writeAutosave('{"n":1}');
    const latestPath = store.writeAutosave('{"n":2}');
    assert.equal(store.getLatestAutosave().path, latestPath);
  });

  test('checkForCrashRecovery is null with no autosaves', () => {
    const store = makeStore();
    assert.equal(store.checkForCrashRecovery(), null);
  });

  test('checkForCrashRecovery is null when the latest autosave predates the last clean exit', () => {
    const store = makeStore();
    const filePath = store.writeAutosave('{"n":1}');
    // Force the mtime a full second into the past -- back-to-back real
    // clock calls can land in the same millisecond, which would make this
    // assertion racy regardless of how the comparison itself is written.
    const past = new Date(Date.now() - 1000);
    fs.utimesSync(filePath, past, past);
    store.markCleanExit();
    assert.equal(store.checkForCrashRecovery(), null);
  });

  test('checkForCrashRecovery flags an autosave written after the last clean exit', () => {
    const store = makeStore();
    store.markCleanExit();
    const filePath = store.writeAutosave('{"n":1}');
    const future = new Date(Date.now() + 1000);
    fs.utimesSync(filePath, future, future);
    const recovery = store.checkForCrashRecovery();
    assert.ok(recovery);
    assert.equal(recovery.path, filePath);
  });

  test('getAutosaveDir points inside the injected getDir', () => {
    const store = makeStore();
    assert.equal(store.getAutosaveDir(), path.join(tmpDir, 'autosaves'));
  });
});
