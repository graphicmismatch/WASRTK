# Contributing

## Workflow

1. Fork the repository.
2. Create a branch for one focused change.
3. Make the change.
4. Validate the affected workflow manually.
5. Open a pull request with a clear description of behavior changes.

## What to include in a PR

- What changed
- Why it changed
- How you verified it
- Any known gaps or follow-up work

## Coding expectations

- Keep changes scoped.
- Prefer small helper modules over growing `wasrtk.js` further when practical.
- Preserve existing project file compatibility unless the change is explicitly a format change.
- Update docs when behavior, shortcuts, menus, or file formats change.

## Documentation expectations

Documentation should reflect the code that ships in this repo today.

Check these areas when behavior changes:

- `README.md`
- `QUICKSTART.md`
- `docs/api/keyboard-shortcuts.md`
- `docs/api/file-formats.md`
- `docs/api/ipc-communication.md`
- Feature and implementation pages relevant to the change

## Manual verification guidance

Because the repo has no automated tests, include a short manual verification list. Common checks:

- Launch with `npm start` or `npm run dev`
- Draw on the canvas with the affected tool
- Save and reload a project
- Export a PNG sequence or GIF when export code changed
- Exercise screen capture or reference image behavior when relevant
- Open Theme Settings when theme-related code changed

## Areas of ownership

- `src/main/`: Electron shell, menus, dialogs, IPC registration, theme persistence
- `src/renderer/`: editor behavior, serialization, exporters, theme sync, references
- `index.html` and `styles.css`: layout and interaction affordances

## Notes on compatibility

- `.wasrtk` files are JSON-based and store raster layer data as PNG data URLs.
- Theme configuration is stored separately in the user data directory and is not part of project files.
- Reference images and live capture sources are runtime-only and are not embedded in saved projects.
