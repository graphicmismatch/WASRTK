'use strict';

// loadTools lists the tool modules explicitly (so the web bundler sees them); this catches a tool file that was
// added to the folder but not to that list.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { loadTools } = require('../../src/renderer/tools');

test('every tool file in src/renderer/tools is registered', () => {
  const dir = path.join(__dirname, '../../src/renderer/tools');
  const files = fs.readdirSync(dir).filter((file) => file.endsWith('.js') && file !== 'index.js' && file !== 'load-tools.js');
  const ids = files.map((file) => require(path.join(dir, file)).id).sort();
  assert.deepEqual(Object.keys(loadTools()).sort(), ids);
});
