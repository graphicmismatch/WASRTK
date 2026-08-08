// Undo/redo history, moved verbatim from wasrtk.js. The undo/redo stacks
// live in this module's closure; everything outside reaches them through
// the returned methods only.
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
function createHistory(env) {
    let undoStack = [];
    let redoStack = [];

    function saveState() {
        const layerContext = env.getActiveLayerContext();
        if (!layerContext) return;
        const { layer } = layerContext;

        const canvas = layer.canvas;
        const imageData = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height);

        undoStack.push({
            type: 'draw',
            frameIndex: env.getCurrentFrame(),
            layerIndex: env.getCurrentLayer(),
            imageData: imageData
        });

        redoStack = [];
        updateUndoRedoButtons();
    }

    function discardLastUndoState() {
        if (undoStack.length > 0) {
            undoStack.pop();
            updateUndoRedoButtons();
        }
    }

    function saveStructureState() {
        const framesCopy = cloneFrames(env.getFrames());

        undoStack.push({
            type: 'structure',
            frames: framesCopy,
            layers: JSON.parse(JSON.stringify(env.getLayers())),
            currentFrame: env.getCurrentFrame(),
            currentLayer: env.getCurrentLayer()
        });

        redoStack = [];
        updateUndoRedoButtons();
    }

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

    // Shared body for undo() and redo(): pops a history entry off
    // fromStack, restores it, and pushes the pre-restore state onto
    // toStack so the transfer can be reversed. undo() and redo() are thin
    // wrappers that just pick which stack is which.
    function applyHistoryTransfer(fromStack, toStack) {
        if (fromStack.length === 0) return;

        const stateToRestore = fromStack.pop();

        if (stateToRestore.type === 'draw') {
            const frameToSave = env.getFrames()[stateToRestore.frameIndex];
            const layerToSave = frameToSave.layers[stateToRestore.layerIndex];
            const canvasToSave = layerToSave.canvas;
            const ctxToSave = canvasToSave.getContext('2d');
            const currentStateForOther = ctxToSave.getImageData(0, 0, canvasToSave.width, canvasToSave.height);

            toStack.push({
                type: 'draw',
                frameIndex: stateToRestore.frameIndex,
                layerIndex: stateToRestore.layerIndex,
                imageData: currentStateForOther
            });

            const frameToRestore = env.getFrames()[stateToRestore.frameIndex];
            const layerToRestore = frameToRestore.layers[stateToRestore.layerIndex];
            const canvasToRestore = layerToRestore.canvas;
            const ctxToRestore = canvasToRestore.getContext('2d');
            ctxToRestore.putImageData(stateToRestore.imageData, 0, 0);
        } else if (stateToRestore.type === 'structure') {
            const currentStateForOther = {
                type: 'structure',
                frames: cloneFrames(env.getFrames()),
                layers: JSON.parse(JSON.stringify(env.getLayers())),
                currentFrame: env.getCurrentFrame(),
                currentLayer: env.getCurrentLayer()
            };
            toStack.push(currentStateForOther);

            env.setFrames(stateToRestore.frames);
            env.setLayers(stateToRestore.layers);
            env.setCurrentFrame(Math.min(stateToRestore.currentFrame ?? env.getCurrentFrame(), stateToRestore.frames.length - 1));
            env.setCurrentLayer(stateToRestore.currentLayer);
        }

        env.onAfterRestore();
    }

    function undo() {
        applyHistoryTransfer(undoStack, redoStack);
    }

    function redo() {
        applyHistoryTransfer(redoStack, undoStack);
    }

    function updateUndoRedoButtons() {
        document.getElementById('undoBtn').disabled = undoStack.length === 0;
        document.getElementById('redoBtn').disabled = redoStack.length === 0;
    }

    return {
        saveState,
        discardLastUndoState,
        saveStructureState,
        undo,
        redo,
        updateUndoRedoButtons
    };
}

module.exports = { createHistory };
