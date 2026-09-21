# Changelog

## [Unreleased] - Edit Safety: Auto-save, Backups, Conflict Detection

- Auto-save ON by default (2.5 s debounce, skips while kernel runs); toggle via `jupyter-toggle-autosave`, preference persisted.
- Dirty indicator: `●` filename + highlighted Save button.
- Conflict detection: mtime baseline at open/save; manual save offers Overwrite / Save As / Cancel, auto-save skips with a warning toast.
- Crash-safe backups: debounced localStorage snapshots (outputs stripped on quota pressure), recovery prompt on open, emergency snapshot on unload.
- Native-tab coexistence: warns when the file is also open in the text editor; external `save-file` reloads when clean or warns when dirty.
- Silent picker cancellation (no more error alerts on cancel).
- `createNewNotebook` round-trip covered by harness (`/tmp/opencode`).

## [2.0.1] - TypeScript Migration & VS Code Editor

- Migrate from JavaScript to TypeScript (`src/main.js` → `src/main.ts`).
- Add `tsconfig.json` with strict compiler options.
- Restructure code into modular files: `types.ts`, `nbformat.ts`, `kernel/session.ts`, `render/markdown.ts`, `render/outputs.ts`, `render/sanitize.ts`, `ui/notebook.ts`, `ui/toolbar.ts`, `ui/filehandler.ts`.
- Update `esbuild.config.mjs` entry point to `src/main.ts` with `.ts` loader.
- Add `typescript` to devDependencies.
- License updated to AGPL-3.0.
- Package `changelog.md` + `LICENSE` into `dist.zip`.

## [2.0.0] - Command API Fix & Persistent Kernel

- Fix `t.add is not a function` crash in command registration.
- Use Commands API `addCommand({name, description, exec})` / `removeCommand(name)` with fallbacks.
- Harden `registerCommands` / `destroy` with `try/catch`.
- Replace one-shot `python3 -c` execution with persistent Python session (`kernel/session.ts`).
- Add matplotlib support with `MPLBACKEND=Agg` and PNG figure capture.
- Output renderers for `stream`, `error`, `image/png`, `image/svg+xml`, `text/html`, `text/plain`.
- Add `runAllCells`, `restartKernel`, `clearOutputs` commands.
- Add `setOutputs`, `setPrompt`, `updateCellOutputs` to NotebookUI.
- Add `runAll()` method to NotebookUI.
- Add `clearOutputs()` method to NotebookUI.

## [1.0.0] - Initial Release

- Full notebook viewer with cell rendering.
- Support for code, markdown, and raw cells.
- Rich markdown preview with syntax highlighting.
- Cell editing capabilities.
- Cell operations: add, delete, move, toggle type.
- Code execution support (Python 3).
- Output display for executed cells.
- Save functionality.
