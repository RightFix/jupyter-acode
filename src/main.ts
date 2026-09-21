import plugin from '../plugin.json';
import { marked } from 'marked';
import tag from 'html-tag-js';
import './styles.css';
import { Cell, CellType, NotebookData } from './types';
import { loadNotebook, saveNotebook } from './nbformat';
import { PythonSession } from './kernel/session';
import { renderMarkdown } from './render/markdown';
import { NotebookUI } from './ui/notebook';
import { FileHandler } from './ui/filehandler';

const CELL_TYPES = { CODE: 'code', MARKDOWN: 'markdown' } as const;
type CellType = typeof CELL_TYPES[keyof typeof CELL_TYPES];

class JupyterPlugin {
  private session: PythonSession | null = null;
  private ui: NotebookUI | null = null;
  private fileHandler: FileHandler | null = null;
  private kernelConfig: KernelConfig = { pythonPath: 'python3' };
  private currentFile: string | null = null;
  private currentFileId: string | null = null;
  private currentFileName: string | null = null;
  private isModified = false;
  private switchFileHook: ((file: { uri: string }) => void) | null = null;

  async init(): Promise<void> {
    this.session = new PythonSession(this.kernelConfig.pythonPath);
    this.fileHandler = new FileHandler(plugin.id, (info) => this.openFile(info.uri, info.name));
    this.registerCommands();
    this.setupEditorHooks();
  }

  private registerCommands(): void {
    const commands: Array<{ name: string; description: string; exec: () => void | Promise<void> }> = [
      { name: 'open-notebook-viewer', description: 'Open Jupyter Notebook', exec: () => this.openPicker() },
      { name: 'add-code-cell', description: 'Add Code Cell', exec: () => this.ui?.addCell('code') },
      { name: 'add-markdown-cell', description: 'Add Markdown Cell', exec: () => this.ui?.addCell('markdown') },
      { name: 'delete-cell', description: 'Delete Cell', exec: () => this.ui?.deleteCell() },
      { name: 'move-cell-up', description: 'Move Cell Up', exec: () => this.ui?.moveCell(-1) },
      { name: 'move-cell-down', description: 'Move Cell Down', exec: () => this.ui?.moveCell(1) },
      { name: 'save-notebook', description: 'Save Notebook', exec: () => this.save() },
      { name: 'run-cell', description: 'Run Cell', exec: () => this.runCell() },
      { name: 'run-all-cells', description: 'Run All Cells', exec: () => this.runAll() },
      { name: 'toggle-cell-type', description: 'Toggle Cell Type', exec: () => this.ui?.toggleType() },
      { name: 'restart-kernel', description: 'Restart Kernel', exec: () => this.restartKernel() },
      { name: 'clear-outputs', description: 'Clear All Outputs', exec: () => this.ui?.clearOutputs() },
    ];

    this.registerWithApi(commands);
    this.toolbar = new Toolbar(commands);
  }

  private registerWithApi(commands: Array<{ name: string; description: string; exec: () => void | Promise<void> }>): void {
    try {
      const cmds = acode.require('commands') as { addCommand?: (cmd: { name: string; description: string; exec: () => void | Promise<void> }) => void };
      if (cmds?.addCommand) {
        commands.forEach(cmd => cmds.addCommand(cmd));
        return;
      }
    } catch { /* fall through */ }
    try {
      if (typeof acode.addCommand === 'function') {
        commands.forEach(cmd => acode.addCommand!(cmd));
        return;
      }
    } catch { /* fall through */ }
    try {
      const editorCmds = editorManager.editor?.commands;
      if (editorCmds?.addCommand) {
        commands.forEach(cmd => editorCmds.addCommand(cmd));
      }
    } catch (e) { console.error('Jupyter: command registration failed', e); }
  }

  private async openPicker(): Promise<void> {
    try {
      const result = await acode.fileBrowser('file', 'Select notebook');
      if (result?.url) await this.openFile(result.url, result.filename || 'notebook.ipynb');
    } catch (e) { acode.alert?.('Error', String(e)); }
  }

  private async openFile(uri: string, filename: string): Promise<void> {
    try {
      this.currentFile = uri;
      this.currentFileName = filename || 'notebook.ipynb';
      this.isModified = false;

      const fs = acode.fsOperation(uri);
      const content = await fs.readFile('utf-8');
      const notebookData = loadNotebook(content);
      this.currentFileId = uri;
      this.ui = new NotebookUI(notebookData, {
        onRunCell: (i: number) => this.runCellAt(i),
        onAddCell: () => this.ui?.addCell('code'),
        onDeleteCell: () => this.ui?.deleteCell(),
        onMoveCell: (d: number) => this.ui?.moveCell(d),
        onToggleType: () => this.ui?.toggleType(),
        onSave: () => this.save(),
        onModified: () => { this.isModified = true; },
        onSelectCell: () => {},
      });
      this.ui.mount();
      this.hideEditor();
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
      this.ui.setOutputs(index, result.outputs, 0);
      this.ui.setPrompt(index, 0);
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
    await this.ui?.runAll();
  }

  private async save(): Promise<void> {
    if (!this.currentFile || !this.ui) return;
    try {
      const data = this.ui.getNotebookData();
      const json = saveNotebook(data);
      const fs = acode.fsOperation(this.currentFile);
      await fs.writeFile(json);
      this.isModified = false;
      acode.toast?.('Saved!', 2000);
    } catch (e) { acode.alert?.('Error', `Failed to save: ${String(e)}`); }
  }

  private async restartKernel(): Promise<void> {
    if (this.session) await this.session.stop();
    this.session = new PythonSession(this.kernelConfig.pythonPath);
    this.ui?.clearOutputs();
    acode.toast?.('Kernel restarted');
  }

  private hideEditor(): void {
    ['.editor-section', '#editor', '.cm-editor', '#editors'].forEach(sel => {
      const el = document.querySelector(sel);
      if (el) (el as HTMLElement).style.display = 'none';
    });
  }

  private setupEditorHooks(): void {
    try {
      this.switchFileHook = (file: { uri: string }) => {
        if (file.uri === this.currentFile) { this.ui?.show(); this.hideEditor(); }
        else { this.ui?.hide(); this.showEditor(); }
      };
      editorManager.on('switch-file', this.switchFileHook);
    } catch (e) { console.warn('Jupyter: switch-file hook failed', e); }
  }

  private showEditor(): void {
    ['.editor-section', '#editor', '.cm-editor', '#editors'].forEach(sel => {
      const el = document.querySelector(sel);
      if (el) (el as HTMLElement).style.display = '';
    });
  }

  async destroy(): Promise<void> {
    try { acode.unregisterFileHandler?.(plugin.id); } catch {}
    if (this.switchFileHook) {
      try { editorManager.off('switch-file', this.switchFileHook); } catch {}
    }
    await this.session?.stop();
    this.ui?.remove();
    this.ui = null;
    this.fileHandler = null;
  }
}

const win = window as Window & { acode?: typeof acode };
if (win.acode) {
  const plugin = new JupyterPlugin();
  win.acode.setPluginInit(plugin.id, async (_baseUrl: string, $page: unknown, { cacheFileUrl, cacheFile, firstInit }: { cacheFileUrl: string; cacheFile: unknown; firstInit: boolean }) => {
    await plugin.init();
  });
  win.acode.setPluginUnmount(plugin.id, () => plugin.destroy());
}

export {};
