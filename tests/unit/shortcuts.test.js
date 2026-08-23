'use strict';

// Unit tests for the pure parts of src/renderer/shortcuts.js.
// createActionRegistry needs a live WASRTK `app` instance and so isn't
// independently testable -- these are the parts that are.

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const {
    parseKeyCombo,
    formatKeyCombo,
    eventToKeyCombo,
    matchesKeyCombo,
    resolveShortcuts,
    findMatchingAction
} = require('../../src/renderer/shortcuts');

describe('parseKeyCombo', () => {
    test('a bare key with no modifiers', () => {
        assert.deepEqual(parseKeyCombo('1'), { ctrl: false, shift: false, alt: false, meta: false, key: '1' });
    });

    test('modifiers are recognized regardless of order', () => {
        assert.deepEqual(parseKeyCombo('Shift+Ctrl+P'), { ctrl: true, shift: true, alt: false, meta: false, key: 'p' });
    });

    test('Cmd/Meta/Command are all recognized as the meta modifier', () => {
        assert.equal(parseKeyCombo('Cmd+S').meta, true);
        assert.equal(parseKeyCombo('Meta+S').meta, true);
        assert.equal(parseKeyCombo('Command+S').meta, true);
    });

    test('is case-insensitive', () => {
        assert.deepEqual(parseKeyCombo('ctrl+shift+p'), parseKeyCombo('CTRL+SHIFT+P'));
    });

    test('"Space" parses to a literal space key', () => {
        assert.equal(parseKeyCombo('Space').key, ' ');
    });

    test('empty/missing input parses to no modifiers and a null key', () => {
        assert.deepEqual(parseKeyCombo(''), { ctrl: false, shift: false, alt: false, meta: false, key: null });
        assert.deepEqual(parseKeyCombo(undefined), { ctrl: false, shift: false, alt: false, meta: false, key: null });
    });
});

describe('formatKeyCombo', () => {
    test('formats modifiers in a fixed order: Ctrl/Cmd, Shift, Alt', () => {
        assert.equal(formatKeyCombo({ alt: true, shift: true, ctrl: true, key: 'p' }), 'Ctrl+Shift+Alt+P');
    });

    test('a single-letter key is uppercased', () => {
        assert.equal(formatKeyCombo({ key: 'a' }), 'A');
    });

    test('a multi-character key name (e.g. "Delete") is left as-is', () => {
        assert.equal(formatKeyCombo({ key: 'delete' }), 'delete');
    });

    test('a space key formats as "Space"', () => {
        assert.equal(formatKeyCombo({ key: ' ' }), 'Space');
    });

    test('no modifiers and no key formats to an empty string', () => {
        assert.equal(formatKeyCombo({}), '');
        assert.equal(formatKeyCombo(), '');
    });

    test('round-trips through parseKeyCombo for a representative set of combos', () => {
        for (const combo of ['1', 'Ctrl+C', 'Ctrl+Shift+P', 'Space', 'Alt+F']) {
            assert.equal(formatKeyCombo(parseKeyCombo(combo)), combo);
        }
    });
});

describe('eventToKeyCombo', () => {
    test('reads the standard KeyboardEvent modifier fields', () => {
        const e = { ctrlKey: true, metaKey: false, shiftKey: true, altKey: false, key: 'P' };
        assert.deepEqual(eventToKeyCombo(e), { ctrl: true, meta: false, shift: true, alt: false, key: 'p' });
    });

    test('lowercases the key except for a literal space', () => {
        assert.equal(eventToKeyCombo({ key: 'A' }).key, 'a');
        assert.equal(eventToKeyCombo({ key: ' ' }).key, ' ');
    });

    test('missing modifier fields default to false', () => {
        assert.deepEqual(eventToKeyCombo({ key: 'x' }), { ctrl: false, meta: false, shift: false, alt: false, key: 'x' });
    });
});

describe('matchesKeyCombo', () => {
    test('a plain key matches an event with no modifiers', () => {
        assert.equal(matchesKeyCombo('1', { key: '1' }), true);
    });

    test('Ctrl in the combo matches an event with ctrlKey OR metaKey (cross-platform)', () => {
        assert.equal(matchesKeyCombo('Ctrl+C', { key: 'c', ctrlKey: true }), true);
        assert.equal(matchesKeyCombo('Ctrl+C', { key: 'c', metaKey: true }), true);
    });

    test('does not match when the key differs', () => {
        assert.equal(matchesKeyCombo('1', { key: '2' }), false);
    });

    test('does not match when a required modifier is missing from the event', () => {
        assert.equal(matchesKeyCombo('Ctrl+C', { key: 'c' }), false);
    });

    test('does not match when the event has an extra modifier the combo does not require', () => {
        assert.equal(matchesKeyCombo('C', { key: 'c', shiftKey: true }), false);
    });

    test('is case-insensitive on the key', () => {
        assert.equal(matchesKeyCombo('p', { key: 'P' }), true);
    });
});

describe('resolveShortcuts', () => {
    const registry = [
        { id: 'tool-pen', defaultKeys: '1', rebindable: true },
        { id: 'undo', defaultKeys: 'Ctrl+Z', rebindable: false }
    ];

    test('with no overrides, effective keys are just the defaults', () => {
        const resolved = resolveShortcuts(registry, {});
        assert.equal(resolved[0].keys, '1');
        assert.equal(resolved[1].keys, 'Ctrl+Z');
    });

    test('an override replaces the default for a rebindable action', () => {
        const resolved = resolveShortcuts(registry, { 'tool-pen': 'Q' });
        assert.equal(resolved[0].keys, 'Q');
    });

    test('an override for a non-rebindable action is ignored', () => {
        const resolved = resolveShortcuts(registry, { undo: 'Ctrl+U' });
        assert.equal(resolved[1].keys, 'Ctrl+Z');
    });

    test('missing overrides argument defaults to none', () => {
        const resolved = resolveShortcuts(registry);
        assert.equal(resolved[0].keys, '1');
    });

    test('does not mutate the original registry entries', () => {
        const original = { id: 'tool-pen', defaultKeys: '1', rebindable: true };
        resolveShortcuts([original], { 'tool-pen': 'Q' });
        assert.equal(original.defaultKeys, '1');
        assert.equal('keys' in original, false);
    });
});

describe('findMatchingAction', () => {
    const resolved = [
        { id: 'tool-pen', keys: '1', rebindable: true },
        { id: 'undo', keys: 'Ctrl+Z', rebindable: false }
    ];

    test('finds a rebindable action whose keys match the event', () => {
        const match = findMatchingAction(resolved, { key: '1' });
        assert.equal(match.id, 'tool-pen');
    });

    test('never matches a non-rebindable action, even if its keys would otherwise match', () => {
        const match = findMatchingAction(resolved, { key: 'z', ctrlKey: true });
        assert.equal(match, undefined);
    });

    test('returns undefined when nothing matches', () => {
        assert.equal(findMatchingAction(resolved, { key: 'q' }), undefined);
    });

    test('an action with a null keys value never matches', () => {
        const withUnbound = [{ id: 'x', keys: null, rebindable: true }];
        assert.equal(findMatchingAction(withUnbound, { key: 'x' }), undefined);
    });
});
