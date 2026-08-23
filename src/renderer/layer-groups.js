// Pure helpers for the single-level layer-group model (no nesting).
//
// A group is a `type: 'group'` entry (the header) plus `memberCount` regular
// entries immediately BELOW it in the array -- members occupy
// [headerIndex - memberCount, headerIndex - 1], with the header itself at
// the block's *highest* index. That "header on top" convention is what it
// is because of how the layer panel is built: layer-manager.js's
// updateLayerList() iterates the layers array ascending and *prepends* each
// row, so the last-processed (highest-index) entry of a block ends up
// visually on top. Putting the header there means it renders above its own
// members for free, with no group-aware reordering logic needed in the UI
// layer -- just the ordinary per-index loop already in place.
//
// Group entries carry every field a regular layer does (visible, locked,
// opacity: 1, blendMode: 'source-over', alphaLocked: false,
// clipToBelow: false) plus a real, never-drawn-on blank canvas in their
// frame.layers mirror. That's deliberate: every existing loop over
// frame.layers (history.js's cloneFrames, project-io.js's toDataURL,
// getLayerContext, the render/export compositing path, ...) already
// assumes every entry has a working canvas and the usual fields. Giving
// group entries the same shape means none of those sites need a `type ===
// 'group'` guard -- a group's canvas is simply blank, so drawing it is a
// harmless no-op. Only code that cares about *group semantics specifically*
// (this module, the panel UI, moveLayerUp/Down, deleteLayer, addLayer,
// flattenLayer, and the render loop's effective-visibility/lock check)
// needs to know groups exist at all.
//
// ponytail: a blank full-size canvas per group per frame costs real memory
// at large canvas sizes / frame counts (e.g. 256x256 x100 frames x3 groups
// ~= 7.5MB) and pads project save files with blank PNGs. Upgrade path if
// that ever matters: switch to a lighter canvas-less sentinel and thread a
// `type !== 'group'` guard through the handful of sites this module's
// header comment lists.

function isGroupHeader(layer) {
  return layer.type === 'group';
}

// Maps every member index to its group's header index; everything else
// (headers themselves, ungrouped layers) maps to null. O(n) single pass.
function computeGroupMembership(layers) {
  const membership = new Array(layers.length).fill(null);
  for (let i = 0; i < layers.length; i++) {
    if (isGroupHeader(layers[i])) {
      const memberCount = layers[i].memberCount || 0;
      for (let m = 1; m <= memberCount; m++) {
        const memberIndex = i - m;
        if (memberIndex >= 0) membership[memberIndex] = i;
      }
    }
  }
  return membership;
}

// Returns the [start, end] inclusive range (array indices) of the block
// containing `index` -- its own group's full header+members span if
// `index` is a header or a member of one, otherwise just [index, index].
// Works for any index within a block, not just its boundary, so callers
// never need to reason about which position within a block they were
// given.
function getBlockRange(layers, membership, index) {
  if (isGroupHeader(layers[index])) {
    const memberCount = layers[index].memberCount || 0;
    return [index - memberCount, index];
  }
  const headerIndex = membership[index];
  if (headerIndex !== null) {
    const memberCount = layers[headerIndex].memberCount || 0;
    return [headerIndex - memberCount, headerIndex];
  }
  return [index, index];
}

// Effective visible/locked accounting for group ancestry: a member is only
// visible if it and its group both are, and is locked (for edit-blocking
// and the editor-only dim) if either it or its group is.
function getEffectiveVisibility(layers, membership, index) {
  const layer = layers[index];
  const headerIndex = membership[index];
  return headerIndex === null ? layer.visible : layer.visible && layers[headerIndex].visible;
}

function getEffectiveLocked(layers, membership, index) {
  const layer = layers[index];
  const headerIndex = membership[index];
  return headerIndex === null ? layer.locked : layer.locked || layers[headerIndex].locked;
}

// Swaps two adjacent blocks in place: [..., A, B, ...] -> [..., B, A, ...].
// Requires aEnd + 1 === bStart (caller's responsibility -- every call site
// in this codebase derives bStart from aEnd + 1 or vice versa).
function swapAdjacentBlocks(arr, aStart, aEnd, bStart, bEnd) {
  const blockA = arr.splice(aStart, aEnd - aStart + 1);
  const blockB = arr.splice(aStart, bEnd - bStart + 1);
  arr.splice(aStart, 0, ...blockB, ...blockA);
}

module.exports = {
  isGroupHeader,
  computeGroupMembership,
  getBlockRange,
  getEffectiveVisibility,
  getEffectiveLocked,
  swapAdjacentBlocks
};
