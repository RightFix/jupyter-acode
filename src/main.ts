import plugin from '../plugin.json';
import './styles.css';
import { NotebookData } from './types';
import { createNewNotebook, loadNotebook, saveNotebook } from './nbformat';
import { PythonSession } from './kernel/session';
import { NotebookUI } from './ui/notebook';
import { FileHandler } from './ui/filehandler';
import { registerCommands, removeCommands } from './ui/toolbar';

const CMD = {
  open: 'jupyter-open',
  addCode: 'jupyter-add-code',
  addMarkdown: 'jupyter-add-markdown',
  deleteCell: 'jupyter-delete-cell',
  moveUp: 'jupyter-move-up',
  moveDown: 'jupyter-move-down',
  save: 'jupyter-save',
  saveAs: 'jupyter-save-as',
  new: 'jupyter-new',
  runCell: 'jupyter-run-cell',
  runAll: 'jupyter-run-all',
  toggleType: 'jupyter-toggle-type',
  restartKernel: 'jupyter-restart-kernel',
  interruptKernel: 'jupyter-interrupt-kernel',
  clearOutputs: 'jupyter-clear-outputs',
} as const;

const COMMAND_NAMES = Object.values(CMD);

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

    this.session = null; // lazy-started on first run via ensureSession()
    this.fileHandler = new FileHandler(plugin.id, (info) => this.openFile(info.uri, info.name));
    this.registerAllCommands();
    this.setupEditorHooks();
  }

  private registerAllCommands(): void {
    registerCommands([
      { name: CMD.open, description: 'Open Jupyter Notebook', exec: () => this.openPicker() },
      { name: CMD.new, description: 'New Notebook', exec: () => this.newNotebook() },
      { name: CMD.addCode, description: 'Add Code Cell', exec: () => this.ui?.addCell('code') },
      { name: CMD.addMarkdown, description: 'Add Markdown Cell', exec: () => this.ui?.addCell('markdown') },
      { name: CMD.deleteCell, description: 'Delete Cell', exec: () => this.ui?.deleteCell() },
      { name: CMD.moveUp, description: 'Move Cell Up', exec: () => this.ui?.moveCell(-1) },
      { name: CMD.moveDown, description: 'Move Cell Down', exec: () => this.ui?.moveCell(1) },
      { name: CMD.save, description: 'Save Notebook', exec: () => this.save() },
      { name: CMD.saveAs, description: 'Save Notebook As...', exec: () => this.saveAs() },
      { name: CMD.runCell, description: 'Run Cell', exec: () => this.runCell() },
      { name: CMD.runAll, description: 'Run All Cells', exec: () => this.runAll() },
      { name: CMD.toggleType, description: 'Toggle Cell Type', exec: () => this.ui?.toggleType() },
      { name: CMD.restartKernel, description: 'Restart Kernel', exec: () => this.restartKernel() },
      { name: CMD.interruptKernel, description: 'Interrupt Kernel', exec: () => this.interruptKernel() },
      { name: CMD.clearOutputs, description: 'Clear All Outputs', exec: () => this.ui?.clearOutputs() },
    ]);
  }

  private async openPicker(): Promise<void> {
    try {
      const result = await acode.fileBrowser?.('file', 'Select notebook');
      if (result?.url) await this.openFile(result.url, result.filename || 'notebook.ipynb');
    } catch (e) { acode.alert?.('Error', String(e)); }
  }

  private mountNotebook(data: NotebookData, uri: string | null, filename: string): void {
    this.ui?.remove();
    this.currentFile = uri;
    this.currentFileName = filename;
    this.isModified = false;
    this.ui = new NotebookUI(data, {
      onRunCell: (i: number) => this.runCellAt(i),
      onNewNotebook: () => this.newNotebook(),
      onDeleteCell: () => this.ui?.deleteCell(),
      onMoveCell: (d: number) => this.ui?.moveCell(d),
      onToggleType: () => this.ui?.toggleType(),
      onSave: () => this.save(),
      onModified: () => { this.isModified = true; },
      onSelectCell: () => {},
    });
    this.ui.mount();
  }

  private async confirmDiscardUnsaved(): Promise<boolean> {
    if (!this.ui || !this.isModified) return true;
    try {
      const confirm = acode.require('confirm') as (title: string, msg: string) => Promise<boolean>;
      return await confirm('Unsaved changes', `Discard unsaved changes to ${this.currentFileName ?? 'notebook'}?`);
    } catch {
      return true;
    }
  }

  private async newNotebook(): Promise<void> {
    if (!(await this.confirmDiscardUnsaved())) return;
    this.mountNotebook(createNewNotebook(), null, 'Untitled.ipynb');
    acode.toast?.('New notebook — use Save to write it to a file');
  }

  private async saveAs(): Promise<void> {
    if (!this.ui) return;
    try {
      const folder = await acode.fileBrowser?.('folder', 'Choose folder for the notebook');
      if (!folder?.url) return;

      const prompt = acode.require('prompt') as (msg: string, def?: string, type?: string) => Promise<string>;
      let name = await prompt('Notebook file name', this.currentFileName ?? 'Untitled.ipynb', 'text');
      if (!name) return;
      name = name.trim();
      if (!name.toLowerCase().endsWith('.ipynb')) name += '.ipynb';

      const json = saveNotebook(this.ui.getNotebookData());
      const dirFs = acode.fsOperation!(folder.url);
      if (typeof dirFs.createFile !== 'function') {
        throw new Error('File creation is not supported here');
      }
      const fileUrl = await dirFs.createFile(name, json);
      this.currentFile = fileUrl || `${folder.url.replace(/\/$/, '')}/${name}`;
      this.currentFileName = name;
      this.isModified = false;
      acode.toast?.(`Saved ${name}`, 2000);
    } catch (e) {
      if (e) acode.alert?.('Error', `Failed to save: ${String(e)}`);
    }
  }

  private async openFile(uri: string, filename: string): Promise<void> {
    if (!(await this.confirmDiscardUnsaved())) return;
    try {
      const fs = acode.fsOperation!(uri);
      const content = await fs.readFile('utf-8');
      this.mountNotebook(loadNotebook(content), uri, filename || 'notebook.ipynb');
    } catch (e) {
      acode.alert?.('Error', `Failed to open: ${String(e)}`);
    }
  }

  private async runCellAt(index: number): Promise<void> {
    if (!this.ui) return;
    const cell = this.ui.getCell(index);
    if (!cell || cell.cell_type !== 'code') return;
    const code = this.ui.getSource(index);
    if (!code.trim()) return;

    this.ui.setRunning(index);
    try {
      await this.ensureSession();
      const result = await this.session!.run(code);
      this.ui.setOutputs(index, result.outputs, result.execution_count);
      this.ui.setPrompt(index, result.execution_count);
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
    if (!this.ui) return;
    if (!this.currentFile) {
      await this.saveAs();
      return;
    }
    try {
      const data = this.ui.getNotebookData();
      const json = saveNotebook(data);
      const fs = acode.fsOperation!(this.currentFile);
      await fs.writeFile(json);
      this.isModified = false;
      acode.toast?.('Saved!', 2000);
    } catch (e) { acode.alert?.('Error', `Failed to save: ${String(e)}`); }
  }

  private async ensureSession(): Promise<void> {
    if (!this.session) this.session = new PythonSession();
    if (this.session.isRunning()) return;
    const check = await PythonSession.isBackendAvailable();
    if (!check.ok) throw new Error(check.reason ?? 'Terminal backend unavailable');
    await this.session.start();
  }

  private async restartKernel(): Promise<void> {
    if (this.session) await this.session.stop();
    this.session = new PythonSession();
    this.ui?.clearOutputs();
    acode.toast?.('Kernel restarted');
  }

  private async interruptKernel(): Promise<void> {
    if (!this.session?.isRunning()) {
      acode.toast?.('Kernel is not running');
      return;
    }
    await this.session.interrupt();
    acode.toast?.('Kernel interrupted (restarted — state was cleared)');
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
