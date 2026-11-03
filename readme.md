# Jupyter Notebook for Acode

Read, edit, and **run** Jupyter notebooks (`.ipynb`) directly in the Acode mobile editor. Notebooks open as real editor tabs with code, markdown, saved outputs, and a live Python kernel behind them.

## Features

- **Notebook Editing**: open `.ipynb` files from the file browser or command palette; add/remove code and markdown cells; edit source in place (auto-grow textarea, markdown Edit/Preview toggle)
- **Cell Execution**: per-cell ▶ button, toolbar **Run all** and **Stop**, `In [*]` while busy; outputs and execution counts are written back into the saved notebook
- **Python Kernel**: one isolated `py-runner` session per open notebook; sessions are closed with the tab and recreated automatically if the server restarts
- **Kernel Picker**: toolbar pill shows the kernel state and connects/creates a session on demand
- **Managed Backend**: on first install the extension offers to `pip install` `py-runner-kernel` and can start `py-runner-serve` headlessly (Terminal plugin / Executor); manual commands are shown if the sandbox blocks it
- **Rich Outputs**: text streams, tracebacks, inline PNG/SVG images, HTML
- **Real Editor Tabs**: notebooks appear as first-class tabs — visible in the file list, switchable, closable
- **Cell Rendering**: code cells with execution counts, rendered markdown, saved outputs
- **Notebook Icons**: `.ipynb` files show the Jupyter logo (select the Jupyter pack in Settings → Icon pack; requires a recent Acode build)
- **Live Reload**: re-renders automatically when the file changes on disk (own auto-saves are skipped)
- **New Notebook**: create blank `.ipynb` files via `jupyter-new` (folder picker + name prompt)

## Usage

1. Open any `.ipynb` file in Acode (or run `jupyter-open` from the command palette)
2. The notebook renders in its own tab; tap **Select kernel** in the toolbar to connect (the extension installs/starts the backend if needed)
3. Run a cell with ▶, or use **Run all** / **Stop** in the toolbar
4. Edits save automatically; run outputs persist into the `.ipynb`

## Commands

Available via the command palette:

- `jupyter-open` — open a Jupyter notebook
- `jupyter-new` — create a new notebook
- `jupyter-setup-backend` — install/upgrade `py-runner-kernel` in the global Python
- `jupyter-start-server` — start (or reuse) the local `py-runner-serve` backend
- `jupyter-server-url` — set and health-check the backend URL (default `http://localhost:8000`)

## Requirements

- Acode Editor v290+
- `python` available in Termux (global interpreter — no virtualenv resolution)
- `py-runner-kernel` (auto-installed on first run, or `pip install -U py-runner-kernel`)
- For automatic backend setup/start: the Acode Terminal plugin (Executor API). Without it, run the printed commands manually:

  ```sh
  pip install -U py-runner-kernel
  python -m py_runner.server --port 8000
  ```

- `py-runner-kernel` 0.1.3+ is recommended: it binds dual-stack `localhost`, so `http://localhost:8000` works for both IPv4 and IPv6 clients. Older releases work with `http://127.0.0.1:8000` (set via `jupyter-server-url`).

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
