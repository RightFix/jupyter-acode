# Changelog

## [Unreleased] - Legacy Icon Override (Works on All Builds)

- `helpers.getIconForFile` chaining per the proven material-icons pattern: `.ipynb` resolves to the logo class, everything else delegates untouched; original restored on unload (re-install safe).
- Manifest `url` field added so the PNG asset resolves to a servable localhost URL.
- New-API pack registration kept as the forward path; legacy CSS override covers builds without it.
- Harness at 60 assertions (intercept, delegate, restore, replace-safe reinstall).

## [Unreleased] - Canonical Icon Pack Layout

- Icon associations now live in `icons/file_icons.json`, loaded via `fs` per the docs' icon-pack-extension pattern; inline map kept as fallback when packaged JSON is unreadable.
- Harness at 53 assertions (both JSON and fallback load paths).

## [Unreleased] - Copyable Blocks & Fixed Toast Path

- Copy button on every IN / OUT / MARKDOWN block: raw source for code and markdown; streams + plain text + tracebacks for outputs (images skipped).
- Clipboard via `navigator.clipboard` with hidden-textarea fallback; success/failure toast.
- Toasts fixed on the documented API: shared `showToast` (`acode.require('toast')` → `window.toast`); main consolidated onto it.
- Explicit `user-select: text` on code, markdown, and output text.
- Harness at 50 assertions (exact copied text per block type).

## [Unreleased] - Independent Cell Folding

- Every input, output, and markdown block gets its own fold button (▾/▸) beside its type tag.
- Code input and outputs fold independently of each other.
- Fold state persists across re-renders within the session.
- Harness at 45 assertions.

## [Unreleased] - Cell Type Tags & Visible Scrollbars

- `IN` tag above code inputs, `OUT` above outputs, `MARKDOWN` above markdown (`RAW` fallback), color-coded to match prompts/accents.
- Scoped `::-webkit-scrollbar` styling (8px, theme-visible thumbs) on all scrollable surfaces — code, output text/HTML, markdown blocks, tables. Never touches Acode's own UI.
- Harness at 38 assertions.

## [Unreleased] - Toast Fix, Natural Cell Heights

- Fix toasts never firing: `acode.toast` does not exist per official types; new `showToast` uses `acode.require('toast')` with `window.toast` fallback. Removed both diagnostic canaries.
- Removed the nested viewport scroll pane: cells flow naturally and size by content, whole tab scrolls.
- Stripped leftover inline white backgrounds so the adaptive palette owns all color.
- No version bump (test phase).

## [2.2.0] - Notebook File Icons

- Registers a `Jupyter` icon pack mapping `ipynb` → bundled `icons/ipynb.png` (File Icons API, feature-detected for older Acode builds).
- Notebook tabs resolve the pack icon class at creation; registration disposed on unload.
- First-run toast points at Settings → Icon pack (manual selection is required by Acode).
- `dist.zip` now bundles the `icons/` directory.

## [2.1.0] - Styles Reach Tabs + Versioned Releases

- Fix styles not applying: custom tab content is Shadow-DOM isolated, so the stylesheet is now injected inside each tab host (head injection kept as fallback).
- Version bumped to 2.1.0 in `plugin.json`/`package.json` so Acode recognizes updates; versions will bump every release from here on.
- Harness covers per-tab style injection.

## [Unreleased] - Dark Restyle & Legibility

- Rebuilt palette on Acode's documented vars (`--text-color`, `--background-color`, `--border-color`, `--primary-color`) with dark-first `light-dark()` fallbacks; removed all legacy `--theme-*` names causing the washed-out text.
- Explicit background+foreground contrast pairs everywhere; no opacity-dimmed text.
- Plot images on solid white backing, capped at 200px, tap-to-expand to full size.
- Long code cells capped at 240px with scrolling.
- Harness at 29 assertions (palette, caps, expand toggle included).

## [Unreleased] - Real Filenames & Multi-Tab

- Fix opened files showing `notebook.ipynb`: handler now prefers `fileInfo.name` (what Acode actually sends) with basename fallback.
- Multiple notebooks open side by side: one tab + independent view per file URI, no more overwriting.
- Per-tab reload on external change, per-tab close cleanup; reopening reuses the existing tab.

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
