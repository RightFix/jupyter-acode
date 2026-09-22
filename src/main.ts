import plugin from '../plugin.json';
import notebookCss from './styles.css';
import { NotebookData } from './types';
import { loadNotebook } from './nbformat';
import { NotebookUI } from './ui/notebook';
import { NotebookTabs } from './ui/tabs';
import { FileHandler } from './ui/filehandler';
import { registerCommands, removeCommands } from './ui/toolbar';

const CMD = {
  open: 'jupyter-open',
} as const;

const COMMAND_NAMES = Object.values(CMD);

class JupyterPlugin {
  private ui: NotebookUI | null = null;
  private fileHandler: FileHandler | null = null;
  private currentFile: string | null = null;
  private currentFileName: string | null = null;
  private tabs = new NotebookTabs((uri) => this.onTabClose(uri));
  private styleEl: HTMLStyleElement | null = null;
  private switchFileHook: ((file: { uri: string }) => void) | null = null;
  private externalSaveHook: ((file: { uri: string }) => void) | null = null;
  private removeFileHook: ((file: { uri: string }) => void) | null = null;

  async init(): Promise<void> {
    const win = window as Window & { acode?: AcodeModule; editorManager?: EditorManager };
    (globalThis as any).acode = win.acode;
    (globalThis as any).editorManager = win.editorManager;

    this.injectStyles();
    this.fileHandler = new FileHandler(plugin.id, (info) => this.openFile(info.uri, info.name));
    this.registerAllCommands();
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

  private async openFile(uri: string, filename: string): Promise<void> {
    try {
      const content = await acode.fsOperation!(uri).readFile('utf-8');
      this.mountNotebook(loadNotebook(content), uri, filename || 'notebook.ipynb');
    } catch (e) {
      acode.alert?.('Error', `Failed to open: ${String(e)}`);
    }
  }

  private mountNotebook(data: NotebookData, uri: string | null, filename: string): void {
    this.ui?.remove();
    const host = this.tabs.open(uri, filename);
    this.currentFile = uri;
    this.currentFileName = filename;
    this.ui = new NotebookUI(data, { onOpen: () => this.openPicker() });
    this.ui.mount(host);
    this.ui.setFilename(filename);
  }

  private onTabClose(uri: string | null): void {
    if (uri !== this.currentFile) return;
    this.ui = null;
    this.currentFile = null;
    this.currentFileName = null;
  }

  private onExternalSave(file: { uri: string }): void {
    if (!file || file.uri !== this.currentFile || !this.ui) return;
    // View-only: nothing to lose — always adopt the new content.
    void (async () => {
      try {
        const content = await acode.fsOperation!(this.currentFile as string).readFile('utf-8');
        this.mountNotebook(loadNotebook(content), this.currentFile, this.currentFileName ?? 'notebook.ipynb');
        acode.toast?.('Notebook reloaded');
      } catch (e) {
        console.warn('Jupyter: reload failed', e);
      }
    })();
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
