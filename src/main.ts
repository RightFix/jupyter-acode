import plugin from '../plugin.json';
import notebookCss from './styles.css';
import { NotebookData } from './types';
import { createNewNotebook, loadNotebook, saveNotebook } from './nbformat';
import { PythonSession } from './kernel/session';
import { NotebookUI } from './ui/notebook';
import { NotebookTabs } from './ui/tabs';
import { HeaderButtons } from './ui/headerButtons';
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
  toggleAutosave: 'jupyter-toggle-autosave',
  runCell: 'jupyter-run-cell',
  runAll: 'jupyter-run-all',
  toggleType: 'jupyter-toggle-type',
  restartKernel: 'jupyter-restart-kernel',
  interruptKernel: 'jupyter-interrupt-kernel',
  clearOutputs: 'jupyter-clear-outputs',
} as const;

const COMMAND_NAMES = Object.values(CMD);

const AUTOSAVE_KEY = 'jupyter-acode:autosave';
const BACKUP_PREFIX = 'jupyter-acode:backup:';
const AUTOSAVE_DELAY_MS = 2500;
const BACKUP_DELAY_MS = 3000;

interface BackupPayload {
  name: string;
  savedAt: number;
  data: NotebookData;
}

class JupyterPlugin {
  private session: PythonSession | null = null;
  private ui: NotebookUI | null = null;
  private fileHandler: FileHandler | null = null;
  private currentFile: string | null = null;
  private currentFileName: string | null = null;
  private isModified = false;
  private knownMtime: number | null = null;
  private autosaveEnabled = true;
  private autosaveTimer: ReturnType<typeof setTimeout> | null = null;
  private backupTimer: ReturnType<typeof setTimeout> | null = null;
  private kernelRunning = 0;
  private saveInProgress = false;
  private lastSelfSaveAt = 0;
  private warnedNativeTabs = new Set<string>();
  private tabs = new NotebookTabs((uri) => this.onTabClose(uri));
  private headerButtons: HeaderButtons | null = null;
  private styleEl: HTMLStyleElement | null = null;
  private switchFileHook: ((file: { uri: string }) => void) | null = null;
  private externalSaveHook: ((file: { uri: string }) => void) | null = null;
  private removeFileHook: ((file: { uri: string }) => void) | null = null;

  async init(): Promise<void> {
    const win = window as Window & { acode?: AcodeModule; editorManager?: EditorManager };
    (globalThis as any).acode = win.acode;
    (globalThis as any).editorManager = win.editorManager;

    this.session = null; // lazy-started on first run via ensureSession()
    this.autosaveEnabled = this.loadAutosavePref();
    this.injectStyles();
    this.fileHandler = new FileHandler(plugin.id, (info) => this.openFile(info.uri, info.name));
    this.registerAllCommands();
    this.headerButtons = new HeaderButtons({
      onNew: () => this.newNotebook(),
      onOpen: () => this.openPicker(),
    });
    this.headerButtons.mount();
    this.setupEditorHooks();
  }

  private injectStyles(): void {
    if (this.styleEl) return;
    try {
      const el = document.createElement('style');
      el.setAttribute('data-jupyter', 'true');
      el.textContent = notebookCss;
      document.head.appendChild(el);
      this.styleEl = el;
    } catch { /* DOM unavailable — ignore */ }
  }

  private removeStyles(): void {
    try { this.styleEl?.remove(); } catch { /* ignore */ }
    this.styleEl = null;
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
      { name: CMD.toggleAutosave, description: 'Toggle Auto-save', exec: () => this.toggleAutosave() },
      { name: CMD.runCell, description: 'Run Cell', exec: () => this.runCell() },
      { name: CMD.runAll, description: 'Run All Cells', exec: () => this.runAll() },
      { name: CMD.toggleType, description: 'Toggle Cell Type', exec: () => this.ui?.toggleType() },
      { name: CMD.restartKernel, description: 'Restart Kernel', exec: () => this.restartKernel() },
      { name: CMD.interruptKernel, description: 'Interrupt Kernel', exec: () => this.interruptKernel() },
      { name: CMD.clearOutputs, description: 'Clear All Outputs', exec: () => { this.ui?.clearOutputs(); this.markModified(); } },
    ]);
  }

  private async openPicker(): Promise<void> {
    try {
      const result = await acode.fileBrowser?.('file', 'Select notebook');
      if (result?.url) await this.openFile(result.url, result.filename || result.name || 'notebook.ipynb');
    } catch {
      /* picker cancelled — stay silent */
    }
  }

  private mountNotebook(data: NotebookData, uri: string | null, filename: string): void {
    this.clearTimers();
    this.ui?.remove();
    const host = this.tabs.open(uri, filename);
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
      onModified: () => this.markModified(),
      onSelectCell: () => {},
    });
    this.ui.mount(host);
    this.ui.setFilename(filename);
    this.ui.setDirty(false);
    this.ui.setAutosave(this.autosaveEnabled);
    if (uri) void this.warnIfNativeTabOpen(uri);
  }

  private markModified(): void {
    this.isModified = true;
    this.ui?.setDirty(true);
    this.scheduleAutosave();
    this.scheduleBackup();
  }

  private setClean(): void {
    this.isModified = false;
    this.ui?.setDirty(false);
    this.clearBackup();
  }

  private clearTimers(): void {
    if (this.autosaveTimer) { clearTimeout(this.autosaveTimer); this.autosaveTimer = null; }
    if (this.backupTimer) { clearTimeout(this.backupTimer); this.backupTimer = null; }
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

  private async statMtime(uri: string): Promise<number | null> {
    try {
      const st = await acode.fsOperation!(uri).stat?.();
      return typeof st?.modifiedDate === 'number' ? st.modifiedDate : null;
    } catch {
      return null;
    }
  }

  private async newNotebook(): Promise<void> {
    if (!(await this.confirmDiscardUnsaved())) return;
    this.snapshotBackup(); // keep emergency copy of what we are leaving
    this.mountNotebook(createNewNotebook(), null, 'Untitled.ipynb');
    this.knownMtime = null;
    await this.maybeRecover(null, 'Untitled.ipynb');
    if (!this.isModified) acode.toast?.('New notebook — use Save to write it to a file');
  }

  private async openFile(uri: string, filename: string): Promise<void> {
    if (!(await this.confirmDiscardUnsaved())) return;
    try {
      const fs = acode.fsOperation!(uri);
      const content = await fs.readFile('utf-8');
      this.mountNotebook(loadNotebook(content), uri, filename || 'notebook.ipynb');
      this.knownMtime = await this.statMtime(uri);
      await this.maybeRecover(uri, filename);
    } catch (e) {
      acode.alert?.('Error', `Failed to open: ${String(e)}`);
    }
  }

  private async writeCurrentToFile(uri: string): Promise<void> {
    if (!this.ui) return;
    const json = saveNotebook(this.ui.getNotebookData());
    await acode.fsOperation!(uri).writeFile(json);
    this.lastSelfSaveAt = Date.now();
    this.knownMtime = await this.statMtime(uri);
    this.setClean();
  }

  private async hasExternalChange(): Promise<boolean> {
    if (!this.currentFile) return false;
    const mtime = await this.statMtime(this.currentFile);
    return this.knownMtime !== null && mtime !== null && mtime !== this.knownMtime;
  }

  private async resolveConflict(): Promise<'overwrite' | 'saveas' | 'cancel'> {
    try {
      const select = acode.require('select') as (title: string, items: string[]) => Promise<string>;
      const choice = await select('File changed on disk — how to proceed?', [
        'Overwrite with notebook',
        'Save As... (keep both)',
        'Cancel',
      ]);
      if (choice.startsWith('Overwrite')) return 'overwrite';
      if (choice.startsWith('Save As')) return 'saveas';
      return 'cancel';
    } catch {
      return 'cancel';
    }
  }

  private async saveAs(): Promise<void> {
    if (!this.ui) return;
    let folderUrl: string;
    let name: string;
    try {
      const folder = await acode.fileBrowser?.('folder', 'Choose folder for the notebook');
      if (!folder?.url) return; // cancelled
      folderUrl = folder.url;

      const prompt = acode.require('prompt') as (msg: string, def?: string, type?: string) => Promise<string>;
      const raw = await prompt('Notebook file name', this.currentFileName ?? 'Untitled.ipynb', 'text');
      if (!raw) return; // cancelled
      name = raw.trim();
      if (!name.toLowerCase().endsWith('.ipynb')) name += '.ipynb';
    } catch {
      return; // picker/prompt cancelled or unavailable — stay silent
    }
    try {
      const json = saveNotebook(this.ui.getNotebookData());
      const dirFs = acode.fsOperation!(folderUrl);
      if (typeof dirFs.createFile !== 'function') {
        throw new Error('File creation is not supported here');
      }
      const fileUrl = await dirFs.createFile(name, json);
      this.currentFile = fileUrl || `${folderUrl.replace(/\/$/, '')}/${name}`;
      this.currentFileName = name;
      this.tabs.setUri(this.currentFile);
      this.tabs.retitle(name);
      this.ui.setFilename(name);
      this.lastSelfSaveAt = Date.now();
      this.knownMtime = await this.statMtime(this.currentFile);
      this.setClean();
      acode.toast?.(`Saved ${name}`, 2000);
    } catch (e) {
      acode.alert?.('Error', `Failed to save: ${String(e)}`);
    }
  }

  private async runCellAt(index: number): Promise<void> {
    if (!this.ui) return;
    const cell = this.ui.getCell(index);
    if (!cell || cell.cell_type !== 'code') return;
    const code = this.ui.getSource(index);
    if (!code.trim()) return;

    this.ui.setRunning(index);
    this.kernelRunning++;
    try {
      await this.ensureSession();
      const result = await this.session!.run(code);
      this.ui.setOutputs(index, result.outputs, result.execution_count);
      this.ui.setPrompt(index, result.execution_count);
      this.markModified();
    } catch (e) {
      this.ui.setOutputs(index, [{ output_type: 'error', evalue: String(e), traceback: [String(e)] }], null);
      this.ui.setPrompt(index, null);
    } finally {
      this.kernelRunning = Math.max(0, this.kernelRunning - 1);
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
    if (!this.ui || this.saveInProgress) return;
    if (!this.currentFile) {
      await this.saveAs();
      return;
    }
    if (await this.hasExternalChange()) {
      const action = await this.resolveConflict();
      if (action === 'cancel') return;
      if (action === 'saveas') { await this.saveAs(); return; }
    }
    this.saveInProgress = true;
    try {
      await this.writeCurrentToFile(this.currentFile);
      acode.toast?.('Saved!', 2000);
    } catch (e) {
      acode.alert?.('Error', `Failed to save: ${String(e)}`);
    } finally {
      this.saveInProgress = false;
    }
  }

  private loadAutosavePref(): boolean {
    try {
      const v = localStorage.getItem(AUTOSAVE_KEY);
      return v === null ? true : v === '1';
    } catch {
      return true;
    }
  }

  private async toggleAutosave(): Promise<void> {
    this.autosaveEnabled = !this.autosaveEnabled;
    try { localStorage.setItem(AUTOSAVE_KEY, this.autosaveEnabled ? '1' : '0'); } catch { /* ignore */ }
    this.ui?.setAutosave(this.autosaveEnabled);
    if (!this.autosaveEnabled && this.autosaveTimer) {
      clearTimeout(this.autosaveTimer);
      this.autosaveTimer = null;
    }
    acode.toast?.(this.autosaveEnabled ? 'Auto-save on' : 'Auto-save off');
  }

  private scheduleAutosave(): void {
    if (this.autosaveTimer) clearTimeout(this.autosaveTimer);
    if (!this.autosaveEnabled) return;
    this.autosaveTimer = setTimeout(() => {
      this.autosaveTimer = null;
      void this.doAutosave();
    }, AUTOSAVE_DELAY_MS);
  }

  private async doAutosave(): Promise<void> {
    if (!this.autosaveEnabled || !this.ui || !this.isModified) return;
    if (!this.currentFile || this.kernelRunning > 0 || this.saveInProgress) return;
    if (await this.hasExternalChange()) {
      acode.toast?.('Auto-save skipped: file changed on disk — use Save to resolve');
      return;
    }
    this.saveInProgress = true;
    try {
      await this.writeCurrentToFile(this.currentFile);
    } catch (e) {
      console.warn('Jupyter: auto-save failed', e);
    } finally {
      this.saveInProgress = false;
    }
  }

  private backupKey(): string {
    return BACKUP_PREFIX + (this.currentFile ?? 'untitled');
  }

  private scheduleBackup(): void {
    if (this.backupTimer) clearTimeout(this.backupTimer);
    this.backupTimer = setTimeout(() => {
      this.backupTimer = null;
      this.snapshotBackup();
    }, BACKUP_DELAY_MS);
  }

  private snapshotBackup(): void {
    if (!this.ui || !this.isModified) return;
    const payload: BackupPayload = {
      name: this.currentFileName ?? 'Untitled.ipynb',
      savedAt: Date.now(),
      data: this.ui.getNotebookData(),
    };
    try {
      localStorage.setItem(this.backupKey(), JSON.stringify(payload));
    } catch {
      try {
        const stripped: BackupPayload = {
          ...payload,
          data: {
            ...payload.data,
            cells: payload.data.cells.map(c => ({ ...c, outputs: [], execution_count: null })),
          },
        };
        localStorage.setItem(this.backupKey(), JSON.stringify(stripped));
      } catch { /* storage full — give up silently */ }
    }
  }

  private readBackup(key: string): BackupPayload | null {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as BackupPayload;
      if (!parsed || !Array.isArray(parsed.data?.cells)) return null;
      return parsed;
    } catch {
      return null;
    }
  }

  private clearBackup(): void {
    try { localStorage.removeItem(this.backupKey()); } catch { /* ignore */ }
  }

  private async maybeRecover(uri: string | null, filename: string): Promise<void> {
    const backup = this.readBackup(BACKUP_PREFIX + (uri ?? 'untitled'));
    if (!backup || !this.ui) return;
    const current = saveNotebook(this.ui.getNotebookData());
    if (saveNotebook(backup.data) === current) {
      this.clearBackup();
      return;
    }
    try {
      const confirm = acode.require('confirm') as (title: string, msg: string) => Promise<boolean>;
      const when = new Date(backup.savedAt).toLocaleString();
      const ok = await confirm(
        'Recover unsaved changes?',
        `Found unsaved edits to ${backup.name} from ${when}. Restore them?`,
      );
      if (ok) {
        this.mountNotebook(backup.data, uri, filename);
        this.markModified();
        acode.toast?.('Recovered unsaved changes');
      } else {
        this.clearBackup();
      }
    } catch {
      /* no confirm UI — leave backup for next time */
    }
  }

  private async warnIfNativeTabOpen(uri: string): Promise<void> {
    if (this.tabs.has(uri)) return; // our own notebook tab — not a conflict
    if (this.warnedNativeTabs.has(uri)) return;
    this.warnedNativeTabs.add(uri);
    try {
      const tab = editorManager.getFile?.(uri, 'uri');
      if (tab) {
        acode.toast?.('Note: this file is also open in the text editor — avoid editing it there to prevent conflicts', 4000);
      }
    } catch { /* getFile throws when absent — fine */ }
  }

  private onExternalSave(file: { uri: string }): void {
    if (!file || file.uri !== this.currentFile || !this.ui) return;
    if (Date.now() - this.lastSelfSaveAt < 3000) return; // our own save echo
    if (!this.isModified) {
      // No local edits to lose — adopt the external content.
      void (async () => {
        try {
          const content = await acode.fsOperation!(this.currentFile as string).readFile('utf-8');
          const name = this.currentFileName ?? 'notebook.ipynb';
          this.mountNotebook(loadNotebook(content), this.currentFile, name);
          this.knownMtime = await this.statMtime(this.currentFile as string);
          acode.toast?.('Notebook reloaded with external changes');
        } catch (e) {
          console.warn('Jupyter: external reload failed', e);
        }
      })();
    } else {
      // Keep the stale baseline so the next save raises the conflict dialog.
      acode.toast?.('File changed outside the notebook — review before saving', 4000);
    }
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
    this.markModified();
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

  private onTabClose(uri: string | null): void {
    this.snapshotBackup(); // keep emergency copy of the closed notebook
    if (uri !== this.currentFile) return;
    this.clearTimers();
    this.ui = null;
    this.currentFile = null;
    this.currentFileName = null;
    this.isModified = false;
    this.knownMtime = null;
  }

  private setupEditorHooks(): void {
    try {
      this.switchFileHook = (file: { uri: string }) => {
        if (file.uri === this.currentFile) { this.ui?.show(); }
        else { this.ui?.hide(); }
      };
      editorManager.on('switch-file', this.switchFileHook);
      this.externalSaveHook = (file: { uri: string }) => this.onExternalSave(file);
      editorManager.on('save-file', this.externalSaveHook);
      this.removeFileHook = (file: { uri: string }) => {
        if (file && file.uri === this.currentFile) this.onTabClose(file.uri);
      };
      editorManager.on('remove-file', this.removeFileHook);
    } catch (e) { console.warn('Jupyter: editor hooks failed', e); }
  }

  async destroy(): Promise<void> {
    this.snapshotBackup(); // emergency copy of unsaved edits for next open
    this.clearTimers();
    try { this.headerButtons?.unmount(); } catch { /* ignore */ }
    this.headerButtons = null;
    this.removeStyles();
    try { this.fileHandler?.unregister(); } catch { /* ignore */ }
    if (this.switchFileHook) {
      try { editorManager.off('switch-file', this.switchFileHook); } catch { /* ignore */ }
    }
    if (this.externalSaveHook) {
      try { editorManager.off('save-file', this.externalSaveHook); } catch { /* ignore */ }
    }
    if (this.removeFileHook) {
      try { editorManager.off('remove-file', this.removeFileHook); } catch { /* ignore */ }
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
