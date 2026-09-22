import plugin from '../plugin.json';
import notebookCss from './styles.css';
import { NotebookData } from './types';
import { loadNotebook } from './nbformat';
import { NotebookUI } from './ui/notebook';
import { NotebookTabs } from './ui/tabs';
import { FileHandler, baseName } from './ui/filehandler';
import { LegacyIcons } from './ui/legacyIcons';
import { showToast } from './ui/toast';
import { registerCommands, removeCommands } from './ui/toolbar';

const CMD = {
  open: 'jupyter-open',
} as const;

const COMMAND_NAMES = Object.values(CMD);

interface OpenSession {
  ui: NotebookUI;
  filename: string;
}

class JupyterPlugin {
  private sessions = new Map<string, OpenSession>();
  private fileHandler: FileHandler | null = null;
  private tabs = new NotebookTabs((uri) => this.onTabClose(uri));
  private styleEl: HTMLStyleElement | null = null;
  private fileIcons: FileIconsApi | null = null;
  private iconPack: { dispose(): void } | null = null;
  private legacyIcons = new LegacyIcons();
  private baseUrl = '';
  private externalSaveHook: ((file: { uri: string }) => void) | null = null;
  private removeFileHook: ((file: { uri: string }) => void) | null = null;

  async init(): Promise<void> {
    const win = window as Window & { acode?: AcodeModule; editorManager?: EditorManager };
    (globalThis as any).acode = win.acode;
    (globalThis as any).editorManager = win.editorManager;

    this.injectStyles();
    this.registerIconPack();
    this.legacyIcons.install(
      (plugin as { url?: string }).url ?? `${this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`}icons/`,
    );
    this.fileHandler = new FileHandler(plugin.id, (info) => this.openFile(info.uri, info.name));
    this.registerAllCommands();
    this.setupEditorHooks();
  }

  setBaseUrl(baseUrl: string): void {
    this.baseUrl = baseUrl ?? '';
  }

  setFileIcons(api: FileIconsApi | undefined): void {
    if (api && typeof api.register === 'function') {
      this.fileIcons = api;
      return;
    }
    try {
      const fallback = acode.require('fileIcons') as FileIconsApi | undefined;
      if (fallback && typeof fallback.register === 'function') this.fileIcons = fallback;
    } catch { /* unavailable on this build — pack stays unregistered */ }
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
      if (result?.url) {
        await this.openFile(result.url, result.filename || result.name || baseName(result.url));
      }
    } catch {
      /* picker cancelled — stay silent */
    }
  }

  private async openFile(uri: string, filename: string): Promise<void> {
    try {
      const content = await acode.fsOperation!(uri).readFile('utf-8');
      this.mountNotebook(loadNotebook(content), uri, filename || baseName(uri));
    } catch (e) {
      acode.alert?.('Error', `Failed to open: ${String(e)}`);
    }
  }

  private mountNotebook(data: NotebookData, uri: string, filename: string): void {
    this.sessions.get(uri)?.ui.remove();
    const host = this.tabs.open(uri, filename, this.iconClassFor(filename));
    const ui = new NotebookUI(data);
    ui.mount(host);
    ui.setFilename(filename);
    this.sessions.set(uri, { ui, filename });
  }

  private iconClassFor(filename: string): string | undefined {
    try {
      const cls = this.fileIcons?.icon?.(filename);
      return cls || undefined;
    } catch {
      return undefined;
    }
  }

  private registerIconPack(): void {
    if (!this.fileIcons || !this.baseUrl) return; // older Acode — skip silently
    void this.registerIconPackAsync();
  }

  private async registerIconPackAsync(): Promise<void> {
    if (!this.fileIcons || !this.baseUrl) return;
    const base = this.baseUrl.endsWith('/') ? this.baseUrl : `${this.baseUrl}/`;
    let fileExtensions: Record<string, string> = { ipynb: 'ipynb' };
    try {
      const fs = acode.require('fs') as (url: string) => {
        readFile(encoding: string): Promise<unknown>;
      };
      const raw = await fs(`${base}icons/file_icons.json`).readFile('utf-8');
      const parsed = (typeof raw === 'string' ? JSON.parse(raw) : raw) as {
        fileExtensions?: Record<string, string>;
      };
      if (parsed?.fileExtensions && typeof parsed.fileExtensions === 'object') {
        fileExtensions = parsed.fileExtensions;
      }
    } catch {
      /* packaged JSON unreadable — fall back to the inline map */
    }
    try {
      this.iconPack = this.fileIcons.register({
        id: plugin.id,
        name: 'Jupyter',
        icons: { ipynb: { src: `${base}icons/ipynb.png` } },
        fileExtensions,
      });
      try {
        if (!localStorage.getItem('jupyter-acode:iconpack-hint')) {
          localStorage.setItem('jupyter-acode:iconpack-hint', '1');
          showToast('Tip: pick the Jupyter pack in Settings → Icon pack for notebook icons', 4000);
        }
      } catch { /* storage unavailable — skip hint bookkeeping */ }
    } catch (e) {
      console.warn('Jupyter: icon pack registration failed', e);
      this.iconPack = null;
    }
  }

  private onTabClose(uri: string): void {
    const session = this.sessions.get(uri);
    if (!session) return;
    try { session.ui.remove(); } catch { /* ignore */ }
    this.sessions.delete(uri);
  }

  private onExternalSave(file: { uri: string }): void {
    if (!file) return;
    const session = this.sessions.get(file.uri);
    if (!session) return;
    // View-only: nothing to lose — always adopt the new content.
    void this.openFile(file.uri, session.filename);
  }

  private setupEditorHooks(): void {
    try {
      this.externalSaveHook = (file: { uri: string }) => this.onExternalSave(file);
      editorManager.on('save-file', this.externalSaveHook);
      this.removeFileHook = (file: { uri: string }) => {
        if (file?.uri) this.onTabClose(file.uri);
      };
      editorManager.on('remove-file', this.removeFileHook);
    } catch (e) { console.warn('Jupyter: editor hooks failed', e); }
  }

  async destroy(): Promise<void> {
    this.removeStyles();
    try { this.legacyIcons.uninstall(); } catch { /* ignore */ }
    try { this.iconPack?.dispose(); } catch { /* ignore */ }
    this.iconPack = null;
    try { this.fileHandler?.unregister(); } catch { /* ignore */ }
    if (this.externalSaveHook) {
      try { editorManager.off('save-file', this.externalSaveHook); } catch { /* ignore */ }
    }
    if (this.removeFileHook) {
      try { editorManager.off('remove-file', this.removeFileHook); } catch { /* ignore */ }
    }
    removeCommands(COMMAND_NAMES);
    for (const [, session] of this.sessions) {
      try { session.ui.remove(); } catch { /* ignore */ }
    }
    this.sessions.clear();
    this.fileHandler = null;
  }
}

const win = window as Window & { acode?: AcodeModule };
if (win.acode) {
  const jupyterPlugin = new JupyterPlugin();
  win.acode.setPluginInit(plugin.id, async (_baseUrl: string, _page: unknown, ctx: unknown) => {
    jupyterPlugin.setBaseUrl(_baseUrl);
    jupyterPlugin.setFileIcons((ctx as { fileIcons?: FileIconsApi } | undefined)?.fileIcons);
    await jupyterPlugin.init();
  });
  win.acode.setPluginUnmount(plugin.id, () => jupyterPlugin.destroy());
}

export {};
