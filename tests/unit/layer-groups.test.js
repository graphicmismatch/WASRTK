'use strict';

// Unit tests for src/renderer/layer-groups.js. Pure array logic, no
// DOM/Electron dependency -- requireable directly under node:test.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
  isGroupHeader,
  computeGroupMembership,
  getBlockRange,
  getEffectiveVisibility,
  getEffectiveLocked,
  swapAdjacentBlocks
} = require('../../src/renderer/layer-groups');

function plain(overrides = {}) {
  return { type: 'layer', visible: true, locked: false, ...overrides };
}

function group(memberCount, overrides = {}) {
  return { type: 'group', visible: true, locked: false, memberCount, ...overrides };
}

describe('isGroupHeader', () => {
  test('true only for type: group', () => {
    assert.equal(isGroupHeader(group(0)), true);
    assert.equal(isGroupHeader(plain()), false);
  });
});

describe('computeGroupMembership', () => {
  test('no groups -> everything null', () => {
    const layers = [plain(), plain(), plain()];
    assert.deepEqual(computeGroupMembership(layers), [null, null, null]);
  });

  test('one group: members below the header map to it, header maps to null', () => {
    // [member0, member1, header(2 members)] at indices [0, 1, 2]
    const layers = [plain(), plain(), group(2)];
    assert.deepEqual(computeGroupMembership(layers), [2, 2, null]);
  });

  test('ungrouped layers above and below a group stay null', () => {
    // bottom(0), member(1), header(2), top(3)
    const layers = [plain(), plain(), group(1), plain()];
    assert.deepEqual(computeGroupMembership(layers), [null, 2, null, null]);
  });

  test('two separate groups do not bleed into each other', () => {
    // groupA: member(0), header(1); groupB: member(2), header(3)
    const layers = [plain(), group(1), plain(), group(1)];
    assert.deepEqual(computeGroupMembership(layers), [1, null, 3, null]);
  });

  test('an empty group (memberCount 0) claims no members', () => {
    const layers = [plain(), group(0)];
    assert.deepEqual(computeGroupMembership(layers), [null, null]);
  });

  test('memberCount that would run off the start of the array is clamped, not out of range', () => {
    // Pathological input (shouldn't occur from real mutations), but the
    // function must not throw or write negative indices.
    const layers = [group(5)];
    assert.doesNotThrow(() => computeGroupMembership(layers));
    assert.deepEqual(computeGroupMembership(layers), [null]);
  });
});

describe('getBlockRange', () => {
  test('a plain, ungrouped layer is its own size-1 block', () => {
    const layers = [plain(), plain()];
    const membership = computeGroupMembership(layers);
    assert.deepEqual(getBlockRange(layers, membership, 0), [0, 0]);
    assert.deepEqual(getBlockRange(layers, membership, 1), [1, 1]);
  });

  test('a group header block spans its members plus itself', () => {
    const layers = [plain(), plain(), group(2)];
    const membership = computeGroupMembership(layers);
    assert.deepEqual(getBlockRange(layers, membership, 2), [0, 2]);
  });

  test('querying from a member index (not just the header) returns the full group block', () => {
    const layers = [plain(), plain(), group(2)];
    const membership = computeGroupMembership(layers);
    assert.deepEqual(getBlockRange(layers, membership, 0), [0, 2]);
    assert.deepEqual(getBlockRange(layers, membership, 1), [0, 2]);
  });

  test('an interior member and an edge member of the same group both resolve to the same block', () => {
    const layers = [plain(), plain(), plain(), group(3)];
    const membership = computeGroupMembership(layers);
    assert.deepEqual(getBlockRange(layers, membership, 0), [0, 3]);
    assert.deepEqual(getBlockRange(layers, membership, 1), [0, 3]);
    assert.deepEqual(getBlockRange(layers, membership, 2), [0, 3]);
  });
});

describe('getEffectiveVisibility / getEffectiveLocked', () => {
  test('an ungrouped layer is unaffected by any group state', () => {
    const layers = [plain({ visible: false, locked: true })];
    const membership = computeGroupMembership(layers);
    assert.equal(getEffectiveVisibility(layers, membership, 0), false);
    assert.equal(getEffectiveLocked(layers, membership, 0), true);
  });

  test('a visible member in a visible group is effectively visible', () => {
    const layers = [plain({ visible: true }), group(1, { visible: true })];
    const membership = computeGroupMembership(layers);
    assert.equal(getEffectiveVisibility(layers, membership, 0), true);
  });

  test('a visible member in a hidden group is effectively hidden', () => {
    const layers = [plain({ visible: true }), group(1, { visible: false })];
    const membership = computeGroupMembership(layers);
    assert.equal(getEffectiveVisibility(layers, membership, 0), false);
  });

  test('a hidden member in a visible group is still effectively hidden', () => {
    const layers = [plain({ visible: false }), group(1, { visible: true })];
    const membership = computeGroupMembership(layers);
    assert.equal(getEffectiveVisibility(layers, membership, 0), false);
  });

  test('an unlocked member in a locked group is effectively locked', () => {
    const layers = [plain({ locked: false }), group(1, { locked: true })];
    const membership = computeGroupMembership(layers);
    assert.equal(getEffectiveLocked(layers, membership, 0), true);
  });

  test('a locked member in an unlocked group is still effectively locked', () => {
    const layers = [plain({ locked: true }), group(1, { locked: false })];
    const membership = computeGroupMembership(layers);
    assert.equal(getEffectiveLocked(layers, membership, 0), true);
  });
});

describe('swapAdjacentBlocks', () => {
  test('swaps two size-1 blocks (the plain-layer case, equivalent to the old direct swap)', () => {
    const arr = ['a', 'b', 'c'];
    swapAdjacentBlocks(arr, 0, 0, 1, 1);
    assert.deepEqual(arr, ['b', 'a', 'c']);
  });

  test('swaps a size-1 block with a size-N block on either side', () => {
    const arr = ['x', 'm1', 'm2', 'header', 'y'];
    // Move 'x' (size 1) up past the group block ['m1','m2','header'] (size 3)
    swapAdjacentBlocks(arr, 0, 0, 1, 3);
    assert.deepEqual(arr, ['m1', 'm2', 'header', 'x', 'y']);
  });

  test('swaps two multi-element blocks', () => {
    const arr = ['a1', 'a2', 'b1', 'b2', 'b3'];
    swapAdjacentBlocks(arr, 0, 1, 2, 4);
    assert.deepEqual(arr, ['b1', 'b2', 'b3', 'a1', 'a2']);
  });

  test('mutates the array in place and returns undefined', () => {
    const arr = ['a', 'b'];
    const result = swapAdjacentBlocks(arr, 0, 0, 1, 1);
    assert.equal(result, undefined);
    assert.deepEqual(arr, ['b', 'a']);
  });
});
