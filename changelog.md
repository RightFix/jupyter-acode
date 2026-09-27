# Changelog

## [Unreleased] - Cell execution via py-runner backend

- Run code cells against a `py-runner-serve` backend: per-cell ▶/⏹ button, toolbar Run-all + Stop, `In [*]` prompt while busy.
- One server session per open notebook (isolated namespaces); sessions closed on tab close and plugin unload; auto-recreate if the server restarted.
- Server results mapped to nbformat outputs (stream, `execute_result`, `display_data` incl. PNG, `error`); outputs + execution counts persist into the saved `.ipynb`.
- Managed backend setup: on first plugin install, prompt once and install `py-runner-kernel` globally headlessly via the Executor API (opencode-acode pattern, no terminal).
- VS Code-style kernel picker per notebook toolbar: checks port health, starts `py-runner-serve` as a headless foreground process if down, then mints a unique session id (second notebooks reuse the live port, new id each).
- Server auto-starts under the hood on first run (health-gated, no typing needed); stopped on plugin unload. CORS enabled server-side for WebView fetches.
- All commands run on the global Alpine `python` — no virtualenv resolution.
- Commands: `jupyter-setup-backend`, `jupyter-start-server`, `jupyter-server-url` (persisted, health-checked).
- Graceful degradation without the Terminal plugin: raw commands shown for manual Termux use.

## [Unreleased] - Cell structure editing

- Add code/markdown cells above/below any cell (type picker) and at end via toolbar.
- Delete any cell with confirmation; deleting the last cell is allowed.
- Auto-save on every add/remove (`file:write` permission); own saves skip live-reload.
- New notebook files via `jupyter-new` (folder picker + name prompt).
- Fold state re-indexed on insert/delete.
- In-place source editing for code/markdown/raw with auto-grow; markdown Edit/Preview toggle; auto-save debounced + on blur.

## [0.1.0] - Notebook Viewer

- Open `.ipynb` files from the file browser, file handler, or `jupyter-open` command.
- Each notebook renders in its own real editor tab: independent views, reuse on reopen, per-tab close cleanup.
- Code cells with execution counts, rendered markdown, saved outputs (stream, error, PNG/SVG images, HTML).
- IN / OUT / MARKDOWN type tags (RAW fallback), IN and OUT sharing one identification color.
- Independent folding per input, output, and markdown block; fold state kept for the session.
- Copy button on every block: raw source for code/markdown, streams + plain text + tracebacks for outputs.
- Dark-first adaptive styling with full-height cells and visible scrollbars.
- Notebook file icons: File Icons pack registration plus legacy override, tabs pinned via `tabIcon`.
- Live reload when the file changes on disk; invalid notebooks report an error.
- Read-only (`file:read` permission); nothing is ever written.
