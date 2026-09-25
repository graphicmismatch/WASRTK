// The web build's stand-in for the desktop app's native menu (src/main/menu.js): an in-page menu bar that sends
// the same channels through web-ipc.js, its keyboard accelerators, file pickers in place of native dialogs, the
// Restore Backup list, and crash recovery from autosaves (src/main/autosave-store.js does this on the desktop).
const { emit, registerFile, ipcRenderer } = require('./web-ipc');
const autosaves = require('./web-autosave');
const { matchesKeyCombo } = require('../shortcuts');

let projectName = 'project.wasrtk';

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function pickFile(accept) {
  return new Promise((resolve) => {
    const input = el('input');
    input.type = 'file';
    input.accept = accept;
    input.onchange = () => resolve(input.files[0] || null);
    input.click();
  });
}

// A dialog in the app's own modal style. build(body, close) fills it; returns close().
function showModal(title, build) {
  const overlay = el('div', 'modal show');
  const box = el('div', 'modal-content');
  box.append(el('h2', null, title));
  const body = el('div');
  box.append(body);
  const close = () => overlay.remove();
  const cancel = el('button', 'btn btn-secondary', 'Cancel');
  cancel.onclick = close;
  box.append(cancel);
  overlay.append(box);
  overlay.addEventListener('mousedown', (e) => { if (e.target === overlay) close(); });
  document.body.append(overlay);
  build(body, close);
  return close;
}

async function openReference() {
  const file = await pickFile('image/png,image/jpeg,image/gif,image/bmp');
  if (file) emit('open-reference-image', registerFile(file));
}

async function loadProject() {
  const file = await pickFile('.wasrtk,application/json');
  if (!file) return;
  projectName = file.name;
  emit('load-project', registerFile(file));
}

function saveAnimation() {
  showModal('Save Animation', (body, close) => {
    const name = el('input');
    name.type = 'text';
    name.value = projectName.replace(/\.wasrtk$/i, '') || 'animation';
    name.setAttribute('aria-label', 'File name');
    name.style.cssText = 'width:100%;margin:8px 0 12px;';
    body.append(name);
    const formats = [
      ['PNG sequence (.zip)', 'png'],
      ['GIF animation', 'gif'],
      // WebCodecs: Chrome/Edge 94+, Firefox 130+, Safari 16.4+.
      ['WebM video', 'webm', typeof VideoEncoder === 'undefined' ? 'Needs a browser with WebCodecs' : null]
    ];
    const row = el('div');
    row.style.cssText = 'display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px;';
    formats.forEach(([label, ext, unavailable]) => {
      const button = el('button', 'btn btn-primary', label);
      button.disabled = Boolean(unavailable);
      if (unavailable) button.title = unavailable;
      button.onclick = () => {
        close();
        emit('save-animation', `${name.value.trim() || 'animation'}.${ext}`);
      };
      row.append(button);
    });
    body.append(row);
    name.focus();
  });
}

async function restoreBackup() {
  const list = await autosaves.listAutosaves();
  showModal('Restore Backup', (body, close) => {
    if (!list.length) {
      body.append(el('p', null, 'No backups yet. WASRTK autosaves your work in this browser while you draw.'));
      return;
    }
    const items = el('div', 'web-backups');
    list.forEach((backup) => {
      const button = el('button', 'btn btn-secondary', new Date(backup.mtimeMs).toLocaleString());
      button.onclick = () => { close(); emit('load-project', backup.path); };
      items.append(button);
    });
    body.append(items);
  });
}

function about() {
  showModal('About WASRTK', (body) => {
    body.append(el('p', null, 'A pixel art and animation tool. This is the web version; your work stays in this browser.'));
  });
}

const send = (channel, payload) => () => emit(channel, payload);
const TOOLS = [['Pen', 'pen', '1'], ['Line', 'line', '2'], ['Rectangle', 'rectangle', '3'], ['Circle', 'circle', '4'],
  ['Fill', 'fill', '5'], ['Eraser', 'eraser', '6'], ['Selection', 'selection', '7'], ['Eyedropper', 'eyedropper', '8']];

// `keys` is shown and bound here; `hint` is only shown (the page already handles it, or the browser keeps it).
const MENUS = [
  ['File', [
    { label: 'New Project', run: send('new-project') },
    { label: 'Open Reference Image...', run: openReference },
    { label: 'Load Project...', keys: 'Ctrl+Shift+O', run: loadProject },
    { label: 'Save Project', keys: 'Ctrl+S', run: () => emit('save-project', projectName) },
    { label: 'Save Animation...', keys: 'Ctrl+Shift+S', run: saveAnimation },
    null,
    { label: 'Restore Backup...', run: restoreBackup }
  ]],
  ['Edit', [
    { label: 'Undo', keys: 'Ctrl+Z', run: send('undo') },
    { label: 'Redo', keys: 'Ctrl+Y', run: send('redo') }
  ]],
  ['View', [
    { label: 'Theme Settings', keys: 'Ctrl+Alt+T', run: () => ipcRenderer.invoke('open-theme-window') },
    { label: 'Palette Editor', keys: 'Ctrl+Alt+P', run: () => ipcRenderer.invoke('open-palette-editor-window') },
    null,
    { label: 'Command Palette', keys: 'Ctrl+Shift+P', run: send('open-command-palette') },
    { label: 'Keyboard Shortcuts...', run: send('open-shortcuts-panel') },
    null,
    { label: 'Toggle Full Screen', run: () => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()) }
  ]],
  ['Animation', [
    { label: 'Add Frame', keys: 'F', run: send('add-frame') },
    { label: 'Duplicate Frame', keys: 'D', run: send('duplicate-frame') },
    { label: 'Delete Frame', keys: 'Delete', run: send('delete-frame') },
    null,
    { label: 'Play / Stop Animation', hint: 'Space', run: send('play-animation') }
  ]],
  ['Layers', [
    { label: 'Move Layer Up', keys: 'Ctrl+ArrowUp', run: send('move-layer-up') },
    { label: 'Move Layer Down', keys: 'Ctrl+ArrowDown', run: send('move-layer-down') },
    { label: 'Flatten Layer', keys: 'Ctrl+E', run: send('flatten-layer') }
  ]],
  ['Reference', [
    { label: 'Reset Reference Position', run: send('reset-reference') },
    { label: 'Toggle Antialiasing', keys: 'Ctrl+A', run: send('toggle-antialiasing') }
  ]],
  ['Tools', TOOLS.map(([label, id, key]) => ({ label: `${label} Tool`, hint: key, run: send('select-tool', id) }))],
  ['Help', [{ label: 'About WASRTK', run: about }]]
];

function buildMenuBar() {
  const bar = el('nav', 'web-menubar');
  bar.setAttribute('aria-label', 'Menu');
  let openMenu = null;
  const setOpen = (menu) => {
    if (openMenu) openMenu.classList.remove('open');
    openMenu = menu;
    if (menu) menu.classList.add('open');
  };

  MENUS.forEach(([title, items]) => {
    const menu = el('div', 'web-menu');
    const button = el('button', 'web-menu-title', title);
    button.setAttribute('aria-haspopup', 'true');
    button.onclick = () => setOpen(openMenu === menu ? null : menu);
    button.onmouseenter = () => { if (openMenu && openMenu !== menu) setOpen(menu); };
    const list = el('div', 'web-menu-items');
    list.setAttribute('role', 'menu');
    items.forEach((item) => {
      if (!item) { list.append(el('hr')); return; }
      const entry = el('button');
      entry.setAttribute('role', 'menuitem');
      entry.append(el('span', null, item.label));
      if (item.keys || item.hint) entry.append(el('kbd', null, (item.keys || item.hint).replace('Arrow', '')));
      entry.onclick = () => { setOpen(null); item.run(); };
      list.append(entry);
    });
    menu.append(button, list);
    bar.append(menu);
  });

  document.addEventListener('mousedown', (e) => { if (openMenu && !bar.contains(e.target)) setOpen(null); });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && openMenu) setOpen(null); });
  return bar;
}

// Menu accelerators. Runs after the page's own shortcut handler (event-bindings.js), so keys it already
// handled (selection Delete/arrows, tool keys, Space, copy/paste) are left alone.
function bindAccelerators() {
  const bound = MENUS.flatMap(([, items]) => items).filter((item) => item && item.keys);
  document.addEventListener('keydown', (e) => {
    if (e.defaultPrevented || (e.target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName))) return;
    if (document.querySelector('.modal.show')) return;
    const item = bound.find((candidate) => matchesKeyCombo(candidate.keys, e));
    if (!item) return;
    e.preventDefault();
    item.run();
  });
}

async function offerCrashRecovery() {
  const latest = await autosaves.checkForCrashRecovery().catch(() => null);
  if (latest && window.confirm(`WASRTK closed without saving last time. Restore the backup from ${new Date(latest.mtimeMs).toLocaleString()}?`)) {
    emit('load-project', latest.path);
  }
}

function install() {
  document.body.classList.add('has-web-menu');
  document.body.prepend(buildMenuBar());
  bindAccelerators();
  window.addEventListener('pagehide', autosaves.markCleanExit);
  window.addEventListener('beforeunload', (e) => {
    if (window.wasrtkApp && window.wasrtkApp.getIsDirty()) {
      e.preventDefault();
      e.returnValue = '';
    }
  });
  return offerCrashRecovery();
}

module.exports = { install };
