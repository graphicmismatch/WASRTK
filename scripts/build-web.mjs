// Builds the static web version into web-build/ (GitHub Pages serves it; see .github/workflows/pages.yml).
// The renderer is the same code the Electron app runs: esbuild bundles its require() graph for the browser and
// swaps the Node/Electron-only modules for browser stand-ins.
import { build } from 'esbuild';
import { cp, rm } from 'node:fs/promises';

const out = 'web-build';
const empty = './src/renderer/platform/empty.js';

await rm(out, { recursive: true, force: true });

await build({
  entryPoints: ['renderer.js', 'palette-window.js', 'theme-window.js'],
  outdir: out,
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: 'es2020',
  minify: true,
  sourcemap: true,
  logLevel: 'warning',
  alias: {
    electron: './src/renderer/platform/web-ipc.js', // ipcRenderer, answered in the page
    path: './src/renderer/platform/web-path.js',
    // Only reached from desktop-only code (MOV export, the main-process config files' disk stores).
    fs: empty,
    os: empty,
    'fluent-ffmpeg': empty,
    'ffmpeg-static': empty
  }
});

for (const file of ['index.html', 'palette-window.html', 'theme-window.html', 'styles.css', 'vendor', 'assets']) {
  await cp(file, `${out}/${file}`, { recursive: true });
}
await cp('LICENSE', `${out}/LICENSE.txt`);

console.log(`web build ready in ${out}/`);
