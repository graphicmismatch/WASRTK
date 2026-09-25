// Which host the renderer runs in: Electron (Node integration on) or a plain browser (the static web build,
// where scripts/build-web.mjs swaps 'electron' for ./web-ipc.js).
const isWeb = typeof process === 'undefined' || !process.versions || !process.versions.electron;

module.exports = { isWeb };
