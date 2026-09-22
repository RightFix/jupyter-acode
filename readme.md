# Jupyter Notebook Viewer for Acode

A lightweight extension that renders Jupyter notebooks (`.ipynb` files) directly in the Acode mobile editor — code, markdown, and saved outputs (text, errors, PNG/SVG images, HTML).

## Features

- **Notebook Viewer**: open `.ipynb` files from the file browser or command palette
- **Real Editor Tabs**: notebooks open as first-class tabs — visible in the file list, switchable, closable
- **Cell Rendering**: code cells with execution counts, rendered markdown, saved outputs
- **Output Display**: text streams, tracebacks, inline PNG/SVG images, HTML outputs
- **Live Reload**: re-renders automatically when the file changes on disk
- **Read-only**: never modifies your files (edit/run coming later)

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

1. Download the plugin
2. In Acode, go to Settings > Plugins
3. Click the `+` button
4. Select "Local" and choose the downloaded zip file

## License

AGPL-3.0

## Author

**RightFix**
- Email: righteousnessude@gmail.com
- GitHub: https://github.com/RightFix
