// Shared hex/RGB color helpers used across the renderer (main window,
// palette editor, theme window). Moved here verbatim from wasrtk.js so
// every module normalizes, dedupes, and converts colors the same way.

function normalizeHexColor(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const cleaned = value.trim().replace(/^#/, '').toLowerCase();
    if (/^[0-9a-f]{3}$/.test(cleaned)) {
        return `#${cleaned.split('').map((c) => c + c).join('')}`;
    }
    if (/^[0-9a-f]{6}$/.test(cleaned)) {
        return `#${cleaned}`;
    }

    return null;
}

function dedupeColors(colors) {
    const uniqueColors = [];
    const seen = new Set();
    colors.forEach((color) => {
        const normalized = normalizeHexColor(color);
        if (!normalized || seen.has(normalized)) {
            return;
        }
        seen.add(normalized);
        uniqueColors.push(normalized);
    });
    return uniqueColors;
}

// Converts a hex color string to {r, g, b} (0-255 ints). Runs the value
// through normalizeHexColor first, so it accepts shorthand (#abc), a
// missing/duplicate leading '#', and is case-insensitive; returns null for
// anything that doesn't resolve to a valid hex color. This is the most
// permissive of the hex->rgb variants this module replaces — call sites
// that need a non-null fallback on invalid input supply their own
// `hexToRgb(value) || { r, g, b }`.
function hexToRgb(hex) {
    const normalized = normalizeHexColor(hex);
    if (!normalized) {
        return null;
    }
    return {
        r: parseInt(normalized.slice(1, 3), 16),
        g: parseInt(normalized.slice(3, 5), 16),
        b: parseInt(normalized.slice(5, 7), 16)
    };
}

// Converts r, g, b (any numbers) to a '#rrggbb' string, clamping each
// channel to [0, 255]. Matches the clamp-then-hex behavior already used by
// the palette import/parse helpers; also correct for already-in-range
// integer channels (eyedropper pixel sampling, theme color fields).
function rgbToHex(r, g, b) {
    const toChannel = (value) => Math.max(0, Math.min(255, value)).toString(16).padStart(2, '0');
    return `#${toChannel(r)}${toChannel(g)}${toChannel(b)}`;
}

module.exports = {
    normalizeHexColor,
    dedupeColors,
    hexToRgb,
    rgbToHex
};
