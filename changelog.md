# Changelog

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
