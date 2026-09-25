// The slice of Node's 'path' the renderer uses, for the web build (POSIX-style names; the web has no real paths).
function basename(p, ext) {
  const name = String(p).split(/[\\/]/).pop();
  return ext && name.endsWith(ext) ? name.slice(0, -ext.length) : name;
}

function extname(p) {
  const name = basename(p);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot) : '';
}

function dirname(p) {
  const parts = String(p).split(/[\\/]/);
  parts.pop();
  return parts.join('/') || '.';
}

function join(...parts) {
  return parts.filter((part) => part !== '' && part !== '.').join('/').replace(/\/+/g, '/');
}

module.exports = { basename, extname, dirname, join, sep: '/' };
