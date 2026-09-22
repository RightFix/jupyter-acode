# Changelog

## [Unreleased] - Remove Header Button

- Removed the header `+` button; notebooks open via file browser, file handler, or `jupyter-open` command.

## [Unreleased] - View-only Slimming

- Removed editing, running, and creation: no textareas, kernel, terminal, matplotlib, autosave, backups, or conflict flows.
- Viewer renders code (static), markdown, and saved outputs (stream/error/png/svg/html).
- Single `jupyter-open` command; header `+` button opens the picker directly.
- Read-only manifest permission (`file:read`).
- Harness rewritten: 20 view-only assertions, all green.

## [Unreleased] - Notebook Tabs in Active Files

- Open notebooks now live in a real Acode editor tab (custom `EditorFile` with the notebook UI as tab content) instead of a floating overlay — they appear in the file list, switch like normal files, and close like normal files.
- Single-tab policy: one notebook tab follows the current file (matches the single-kernel model, no orphaned UIs).
- Save As retitles the tab and re-points its URI; closing the tab snapshots a backup and clears plugin state.
- Native-tab conflict warning now ignores our own tab (no more false positives).
- Harness at 27 assertions (tab hosting, reuse, retitle, close cleanup).

## [Unreleased] - Header Button & Style Loading

- Single `+` button in Acode's top header bar: opens New notebook / Open notebook dialog (`src/ui/headerButtons.ts`).
- Header button self-repairs via MutationObserver if Acode re-renders the header; removed cleanly on plugin unload.
- Fix styles never being applied: `styles.css` was a dropped side-effect import; now injected as a `<style>` tag on init.
- Harness extended to 19 assertions (style inject/remove, header button new/open/remove).

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
