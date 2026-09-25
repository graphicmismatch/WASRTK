// Stands in for Node-only modules (fs, os, fluent-ffmpeg, ffmpeg-static) in the web build. Code that needs them
// (MOV export, the main-process config stores) is only ever run under Electron.
module.exports = {};
