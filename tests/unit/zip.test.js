'use strict';

// The web build's .zip writer (src/renderer/platform/zip.js), checked against Python's zipfile when available.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { crc32, zipStore } = require('../../src/renderer/platform/zip');

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xCBF43926);
});

test('zipStore writes an archive that unzips to the same files', (t) => {
  const files = [
    { name: 'walk-0001.png', data: Uint8Array.from([1, 2, 3]) },
    { name: 'walk-0002.png', data: new TextEncoder().encode('frame two') }
  ];
  const zip = zipStore(files);
  assert.deepEqual([...zip.subarray(0, 4)], [0x50, 0x4B, 0x03, 0x04]);

  const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'wasrtk-zip-')), 'out.zip');
  fs.writeFileSync(file, zip);
  let listing;
  try {
    listing = execFileSync('python3', ['-c', `import zipfile,sys,json
z = zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None
print(json.dumps({n: list(z.read(n)) for n in z.namelist()}))`, file], { encoding: 'utf8' });
  } catch (error) {
    if (error.code === 'ENOENT') return t.skip('python3 not available');
    throw error;
  }
  assert.deepEqual(JSON.parse(listing), Object.fromEntries(files.map((f) => [f.name, [...f.data]])));
});
