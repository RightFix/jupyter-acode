# Jupyter Notebook Viewer for Acode

A lightweight extension that renders Jupyter notebooks (`.ipynb` files) directly in the Acode mobile editor — code, markdown, and saved outputs (text, errors, PNG/SVG images, HTML).

## Features

- **Notebook Viewer**: open `.ipynb` files from the file browser or command palette
- **Real Editor Tabs**: notebooks open as first-class tabs — visible in the file list, switchable, closable
- **Cell Rendering**: code cells with execution counts, rendered markdown, saved outputs
- **Output Display**: text streams, tracebacks, inline PNG/SVG images, HTML outputs
- **Notebook Icons**: ipynb files show the Jupyter logo (select the Jupyter pack in Settings → Icon pack; requires a recent Acode build)
- **Live Reload**: re-renders automatically when the file changes on disk
- **Cell Editing (structure)**: add code/markdown cells above/below any cell or at end, delete cells with confirmation, auto-save on every change
- **Cell Source Editing**: code, markdown, and raw cells edit in place (textarea, auto-grow); markdown has Edit/Preview toggle; auto-save on debounce + blur
- **New Notebook**: create `.ipynb` files via command palette (`jupyter-new`)

## Usage

1. Open any `.ipynb` file in Acode (or run `jupyter-open` from the command palette)
2. The notebook renders in its own tab
3. Use authorship tools (VS Code, Jupyter) to edit and run — reopen to see results

### Commands

The following command is available via command palette:

- `jupyter-open` - Open a Jupyter Notebook file

## Requirements

- Acode Editor v290+

## Installation

1. In Acode, open the plugin search
2. Search for **Jupyter Notebook**
3. Tap install

## License

AGPL-3.0

## Author

**RightFix**
- Email: righteousnessude@gmail.com
- GitHub: https://github.com/RightFix
