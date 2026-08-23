// Undo/redo history, extended from the original pop-based two-stack
// version to a single `entries` array + `pointer` index, so a history
// panel can jump to any past point directly instead of only stepping one
// at a time.
//
// entries[i] holds the swappable delta needed to move between position i
// and position i+1 -- exactly the two-stack version's push/pop payloads,
// just merged into one array. Content at a given index is REPLACED every
// time the pointer crosses it (captureCurrentEntry/applyEntry in jumpTo),
// mirroring how the old undo()/redo() always captured "the state being
// left" onto the opposite stack. Because that content flips meaning with
// travel direction, named-snapshot labels and timestamps are NOT stored on
// entries -- they're kept in `positionMeta`, keyed by the stable pointer
// *position* (0..entries.length) rather than by swappable array content,
// so a label survives any number of undo/redo/jump passes back through it.
//
// `env` is a closure-accessor object built once in the WASRTK constructor
// (same pattern as buildReferenceApi):
//   getFrames/setFrames, getLayers/setLayers   -- the frames/layers arrays
//   getCurrentFrame/setCurrentFrame            -- current frame index
//   getCurrentLayer/setCurrentLayer            -- current layer index
//   getActiveLayerContext()                    -- resolves {frame, layer, ctx} | null
//   createCanvas(width, height)                -- shared blank-canvas factory, used by
//                                                 cloneFrames to copy each layer's canvas
//   onAfterRestore()                           -- post-restore refresh; preserves the
//                                                 exact renderCurrentFrame() -> updateUI()
//                                                 sequence undo/redo always ran
//   onHistoryChanged()                         -- fires after every push/undo/redo/jump/
//                                                 rename, for the History panel to redraw
function createHistory(env) {
    let entries = [];
    let pointer = 0;
    // positionMeta[i] describes position i (0..entries.length): the state
    // you're looking at when pointer === i. Index 0 (the initial state,
    // before any push) has no entry until named.
    let positionMeta = [];

    function cloneFrames(framesToClone) {
        return framesToClone.map(frame => ({
            ...frame,
            layers: frame.layers.map(layer => {
                const canvas = env.createCanvas(layer.canvas.width, layer.canvas.height);
                canvas.getContext('2d').drawImage(layer.canvas, 0, 0);
                return { ...layer, canvas: canvas };
            })
        }));
    }

    function pushEntry(entry) {
        // A new action after undoing discards the redo branch -- both the
        // stale entries past the pointer and any labels attached to those
        // now-gone positions.
        entries = entries.slice(0, pointer);
        positionMeta = positionMeta.slice(0, pointer + 1);
        entries.push(entry);
        pointer = entries.length;
        positionMeta[pointer] = { label: null, timestamp: Date.now() };
        updateUndoRedoButtons();
    }

    function saveState() {
        const layerContext = env.getActiveLayerContext();
        if (!layerContext) return;
        const { layer } = layerContext;

        const canvas = layer.canvas;
        const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

        pushEntry({
            type: 'draw',
            frameIndex: env.getCurrentFrame(),
            layerIndex: env.getCurrentLayer(),
            imageData: imageData
        });
    }

    // Only valid immediately after a saveState() that turned out to be
    // unnecessary (fill.js's "no pixels changed" case) -- pointer is
    // always at the tip right after a push, so this just un-pushes it.
    function discardLastUndoState() {
        if (entries.length === 0 || pointer !== entries.length) return;
        entries.pop();
        positionMeta.pop();
        pointer = entries.length;
        updateUndoRedoButtons();
    }

    function saveStructureState() {
        const framesCopy = cloneFrames(env.getFrames());

        pushEntry({
            type: 'structure',
            frames: framesCopy,
            layers: JSON.parse(JSON.stringify(env.getLayers())),
            currentFrame: env.getCurrentFrame(),
            currentLayer: env.getCurrentLayer()
        });
    }

    // Snapshots the CURRENT live state in the same shape as `referenceEntry`
    // (same type/frameIndex/layerIndex for a draw entry) -- used to replace
    // an entry with "what we're leaving" as the pointer crosses it.
    function captureCurrentEntry(referenceEntry) {
        if (referenceEntry.type === 'draw') {
            const frame = env.getFrames()[referenceEntry.frameIndex];
            const layer = frame.layers[referenceEntry.layerIndex];
            const canvas = layer.canvas;
            const ctx = canvas.getContext('2d');
            return {
                type: 'draw',
                frameIndex: referenceEntry.frameIndex,
                layerIndex: referenceEntry.layerIndex,
                imageData: ctx.getImageData(0, 0, canvas.width, canvas.height)
            };
        }
        return {
            type: 'structure',
            frames: cloneFrames(env.getFrames()),
            layers: JSON.parse(JSON.stringify(env.getLayers())),
            currentFrame: env.getCurrentFrame(),
            currentLayer: env.getCurrentLayer()
        };
    }

    function applyEntry(entry) {
        if (entry.type === 'draw') {
            const frame = env.getFrames()[entry.frameIndex];
            const layer = frame.layers[entry.layerIndex];
            const canvas = layer.canvas;
            const ctx = canvas.getContext('2d');
            ctx.putImageData(entry.imageData, 0, 0);
        } else if (entry.type === 'structure') {
            env.setFrames(entry.frames);
            env.setLayers(entry.layers);
            env.setCurrentFrame(Math.min(entry.currentFrame ?? env.getCurrentFrame(), entry.frames.length - 1));
            env.setCurrentLayer(entry.currentLayer);
        }
    }

    // Moves the pointer to `targetPosition` one step at a time, applying
    // the same swap-and-restore each step (capture what we're leaving,
    // apply what we're arriving at) as the original two-stack undo/redo --
    // just batched into a single onAfterRestore/updateUndoRedoButtons call
    // at the end instead of one per step.
    function jumpTo(targetPosition) {
        const clamped = Math.max(0, Math.min(entries.length, targetPosition));
        if (clamped === pointer) return;

        while (pointer !== clamped) {
            if (pointer > clamped) {
                pointer -= 1;
                const toRestore = entries[pointer];
                const captured = captureCurrentEntry(toRestore);
                applyEntry(toRestore);
                entries[pointer] = captured;
            } else {
                const toRestore = entries[pointer];
                const captured = captureCurrentEntry(toRestore);
                applyEntry(toRestore);
                entries[pointer] = captured;
                pointer += 1;
            }
        }

        env.onAfterRestore();
        updateUndoRedoButtons();
    }

    function undo() {
        jumpTo(pointer - 1);
    }

    function redo() {
        jumpTo(pointer + 1);
    }

    function nameSnapshot(position, label) {
        if (position < 0 || position > entries.length) return;
        if (!positionMeta[position]) positionMeta[position] = { label: null, timestamp: Date.now() };
        positionMeta[position].label = label;
        updateUndoRedoButtons();
    }

    // One row per position (0..entries.length) for a history panel: a
    // default label derived from the entry type when nothing was named,
    // the timestamp it was recorded at, and whether it's where the
    // pointer currently sits.
    function getTimeline() {
        const timeline = [];
        for (let position = 0; position <= entries.length; position++) {
            const meta = positionMeta[position];
            const sourceEntry = position > 0 ? entries[position - 1] : null;
            const defaultLabel = position === 0
                ? 'Start'
                : `${sourceEntry.type === 'structure' ? 'Structure change' : 'Draw'} #${position}`;
            timeline.push({
                position,
                label: (meta && meta.label) || defaultLabel,
                timestamp: (meta && meta.timestamp) || null,
                isCurrent: position === pointer
            });
        }
        return timeline;
    }

    function updateUndoRedoButtons() {
        document.getElementById('undoBtn').disabled = pointer === 0;
        document.getElementById('redoBtn').disabled = pointer === entries.length;
        env.onHistoryChanged();
    }

    return {
        saveState,
        discardLastUndoState,
        saveStructureState,
        undo,
        redo,
        jumpTo,
        nameSnapshot,
        getTimeline,
        updateUndoRedoButtons
    };
}

module.exports = { createHistory };
