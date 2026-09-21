import plugin from '../plugin.json';
import './styles.css';
import { CellType, NotebookData } from './types';
import { loadNotebook, saveNotebook } from './nbformat';
import { PythonSession, nextExecCount } from './kernel/session';
import { NotebookUI } from './ui/notebook';
import { FileHandler } from './ui/filehandler';
import { registerCommands, removeCommands } from './ui/toolbar';

const COMMAND_NAMES = [
  'jupyter-open', 'jupyter-add-code', 'jupyter-add-markdown',
  'jupyter-delete-cell', 'jupyter-move-up', 'jupyter-move-down',
  'jupyter-save', 'jupyter-run-cell', 'jupyter-run-all',
  'jupyter-toggle-type', 'jupyter-restart-kernel', 'jupyter-clear-outputs',
];

class JupyterPlugin {
  private session: PythonSession | null = null;
  private ui: NotebookUI | null = null;
  private fileHandler: FileHandler | null = null;
  private currentFile: string | null = null;
  private currentFileName: string | null = null;
  private isModified = false;
  private switchFileHook: ((file: { uri: string }) => void) | null = null;

  async init(): Promise<void> {
    const win = window as Window & { acode?: AcodeModule; editorManager?: EditorManager };
    (globalThis as any).acode = win.acode;
    (globalThis as any).editorManager = win.editorManager;

    this.session = new PythonSession();
    this.fileHandler = new FileHandler(plugin.id, (info) => this.openFile(info.uri, info.name));
    this.registerAllCommands();
    this.setupEditorHooks();
  }

  private registerAllCommands(): void {
    registerCommands([
      { name: COMMAND_NAMES[0], description: 'Open Jupyter Notebook', exec: () => this.openPicker() },
      { name: COMMAND_NAMES[1], description: 'Add Code Cell', exec: () => this.ui?.addCell('code') },
      { name: COMMAND_NAMES[2], description: 'Add Markdown Cell', exec: () => this.ui?.addCell('markdown') },
      { name: COMMAND_NAMES[3], description: 'Delete Cell', exec: () => this.ui?.deleteCell() },
      { name: COMMAND_NAMES[4], description: 'Move Cell Up', exec: () => this.ui?.moveCell(-1) },
      { name: COMMAND_NAMES[5], description: 'Move Cell Down', exec: () => this.ui?.moveCell(1) },
      { name: COMMAND_NAMES[6], description: 'Save Notebook', exec: () => this.save() },
      { name: COMMAND_NAMES[7], description: 'Run Cell', exec: () => this.runCell() },
      { name: COMMAND_NAMES[8], description: 'Run All Cells', exec: () => this.runAll() },
      { name: COMMAND_NAMES[9], description: 'Toggle Cell Type', exec: () => this.ui?.toggleType() },
      { name: COMMAND_NAMES[10], description: 'Restart Kernel', exec: () => this.restartKernel() },
      { name: COMMAND_NAMES[11], description: 'Clear All Outputs', exec: () => this.ui?.clearOutputs() },
    ]);
  }

  private async openPicker(): Promise<void> {
    try {
      const result = await acode.fileBrowser?.('file', 'Select notebook');
      if (result?.url) await this.openFile(result.url, result.filename || 'notebook.ipynb');
    } catch (e) { acode.alert?.('Error', String(e)); }
  }

  private async openFile(uri: string, filename: string): Promise<void> {
    try {
      this.currentFile = uri;
      this.currentFileName = filename || 'notebook.ipynb';
      this.isModified = false;

      const fs = acode.fsOperation!(uri);
      const content = await fs.readFile('utf-8');
      const notebookData = loadNotebook(content);

      this.ui = new NotebookUI(notebookData, {
        onRunCell: (i: number) => this.runCellAt(i),
        onDeleteCell: () => this.ui?.deleteCell(),
        onMoveCell: (d: number) => this.ui?.moveCell(d),
        onToggleType: () => this.ui?.toggleType(),
        onSave: () => this.save(),
        onModified: () => { this.isModified = true; },
        onSelectCell: () => {},
      });
      this.ui.mount();
    } catch (e) {
      acode.alert?.('Error', `Failed to open: ${String(e)}`);
    }
  }

  private async runCellAt(index: number): Promise<void> {
    if (!this.session || !this.ui || !this.currentFile) return;
    const cell = this.ui.getCell(index);
    if (!cell || cell.cell_type !== 'code') return;
    const code = this.ui.getSource(index);
    if (!code.trim()) return;

    try {
      const result = await this.session.run(code);
      const count = nextExecCount();
      this.ui.setOutputs(index, result.outputs, count);
      this.ui.setPrompt(index, count);
      this.isModified = true;
    } catch (e) {
      this.ui.setOutputs(index, [{ output_type: 'error', evalue: String(e), traceback: [String(e)] }], null);
      this.ui.setPrompt(index, null);
    }
  }

  private async runCell(): Promise<void> {
    await this.runCellAt(this.ui?.selectedIndex ?? -1);
  }

  private async runAll(): Promise<void> {
    if (!this.ui) return;
    for (const i of this.ui.getCodeCells()) {
      await this.runCellAt(i);
    }
  }

  private async save(): Promise<void> {
    if (!this.currentFile || !this.ui) return;
    try {
      const data = this.ui.getNotebookData();
      const json = saveNotebook(data);
      const fs = acode.fsOperation!(this.currentFile);
      await fs.writeFile(json);
      this.isModified = false;
      acode.toast?.('Saved!', 2000);
    } catch (e) { acode.alert?.('Error', `Failed to save: ${String(e)}`); }
  }

  private async restartKernel(): Promise<void> {
    if (this.session) await this.session.stop();
    this.session = new PythonSession();
    this.ui?.clearOutputs();
    acode.toast?.('Kernel restarted');
  }

  private setupEditorHooks(): void {
    try {
      this.switchFileHook = (file: { uri: string }) => {
        if (file.uri === this.currentFile) { this.ui?.show(); }
        else { this.ui?.hide(); }
      };
      editorManager.on('switch-file', this.switchFileHook);
    } catch (e) { console.warn('Jupyter: switch-file hook failed', e); }
  }

  async destroy(): Promise<void> {
    try { this.fileHandler?.unregister(); } catch { /* ignore */ }
    if (this.switchFileHook) {
      try { editorManager.off('switch-file', this.switchFileHook); } catch { /* ignore */ }
    }
    removeCommands(COMMAND_NAMES);
    await this.session?.stop();
    this.ui?.remove();
    this.ui = null;
    this.fileHandler = null;
  }
}

const win = window as Window & { acode?: AcodeModule };
if (win.acode) {
  const jupyterPlugin = new JupyterPlugin();
  win.acode.setPluginInit(plugin.id, async (_baseUrl: string, _page: unknown, _ctx: unknown) => {
    await jupyterPlugin.init();
  });
  win.acode.setPluginUnmount(plugin.id, () => jupyterPlugin.destroy());
}

export {};
