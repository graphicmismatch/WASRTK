// Autosave backups for the web build, in IndexedDB (projects hold every layer as a PNG data URL, so they outgrow
// localStorage's ~5 MB fast). Mirrors src/main/autosave-store.js: newest-first list, keep the last 8, and a
// "last clean exit" stamp so an autosave newer than it means the previous visit ended without one.

const DB_NAME = 'wasrtk';
const STORE = 'autosaves';
const MAX_AUTOSAVES = 8;
const CLEAN_EXIT_KEY = 'wasrtk:lastCleanExitAt';
const PREFIX = 'autosave:';

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => request.result.createObjectStore(STORE, { keyPath: 'name' });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function run(mode, fn) {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const result = fn(tx.objectStore(STORE));
    tx.oncomplete = () => { db.close(); resolve(result && 'result' in result ? result.result : undefined); };
    tx.onerror = () => { db.close(); reject(tx.error); };
  });
}

// Newest first, like the desktop list: { name, path, mtimeMs } (no data).
async function listAutosaves() {
  const all = (await run('readonly', (store) => store.getAll())) || [];
  return all
    .sort((a, b) => b.mtimeMs - a.mtimeMs)
    .map(({ name, mtimeMs }) => ({ name, path: PREFIX + name, mtimeMs }));
}

async function writeAutosave(data) {
  const mtimeMs = Date.now();
  const name = `autosave-${new Date(mtimeMs).toISOString().replace(/[:.]/g, '-')}.wasrtk`;
  await run('readwrite', (store) => store.put({ name, mtimeMs, data }));
  const stale = (await listAutosaves()).slice(MAX_AUTOSAVES);
  if (stale.length) await run('readwrite', (store) => stale.forEach(({ name: old }) => store.delete(old)));
  return PREFIX + name;
}

function isAutosavePath(filePath) {
  return String(filePath).startsWith(PREFIX);
}

async function readAutosave(filePath) {
  const record = await run('readonly', (store) => store.get(String(filePath).slice(PREFIX.length)));
  if (!record) throw new Error('That backup no longer exists.');
  return record.data;
}

function markCleanExit() {
  try { localStorage.setItem(CLEAN_EXIT_KEY, String(Date.now())); } catch (_) { /* storage blocked */ }
}

async function checkForCrashRecovery() {
  const [latest] = await listAutosaves();
  let lastClean = 0;
  try { lastClean = Number(localStorage.getItem(CLEAN_EXIT_KEY)) || 0; } catch (_) { /* storage blocked */ }
  return latest && latest.mtimeMs > lastClean ? latest : null;
}

module.exports = { listAutosaves, writeAutosave, isAutosavePath, readAutosave, markCleanExit, checkForCrashRecovery };
