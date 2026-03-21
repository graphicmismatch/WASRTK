# First-Time Contributors

## Good first areas

- Fixing stale UI copy or menu labels
- Tightening documentation to match the current code
- Improving error messages in file, export, or capture flows
- Refactoring renderer logic into smaller helpers
- Polishing theme-window behavior

## How the app is organized

- Electron startup and desktop integration live in `src/main/`
- The editor and almost all app state live in `src/renderer/wasrtk.js`
- Tools are individual modules in `src/renderer/tools/`
- Reference behavior is split between `reference/settings.js`, `reference/modes/image.js`, and `reference/modes/screen-capture.js`

## Recommended first pass

1. Read [Development Setup](./setup.md).
2. Launch the app with `npm run dev`.
3. Read [Architecture Overview](../architecture/overview.md).
4. Inspect the specific module you want to change.
5. Test the relevant workflow manually.

## Things to watch for

- Global renderer state is shared across many methods.
- Frame and layer operations often need to update both data and UI.
- Menu accelerators are wired through IPC, not direct DOM listeners.
- Some older UI/menu affordances can drift from the implemented tool set, so verify behavior in code before documenting or extending it.

## Manual checks that matter

- Creating a new project
- Drawing with the changed tool or interaction
- Saving and reloading a `.wasrtk` file
- Exporting PNG or GIF if export code changed
- Trying reference image loading or screen capture if relevant
