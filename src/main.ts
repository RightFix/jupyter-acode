import plugin from '../plugin.json';
import notebookCss from './styles.css';
import { NotebookData } from './types';
import { createBlankNotebook, loadNotebook, saveNotebook } from './nbformat';
import { NotebookUI, CellRunner } from './ui/notebook';
import { NotebookTabs } from './ui/tabs';
import { FileHandler, baseName } from './ui/filehandler';
import { LegacyIcons } from './ui/legacyIcons';
import { showToast } from './ui/toast';
import { registerCommands, removeCommands } from './ui/toolbar';
import { KernelSession, toOutputs } from './kernel';
import {
  autoInstallBackend,
  ensureBackend,
  installBackend,
  serverHealthy,
  serverUrl,
  setServerUrl,
  startServer,
  stopServer,
} from './backend';

const CMD = {
  open: 'jupyter-open',
  new: 'jupyter-new',
  setup: 'jupyter-setup-backend',
  startServer: 'jupyter-start-server',
  serverUrl: 'jupyter-server-url',
} as const;

const COMMAND_NAMES = Object.values(CMD);

interface OpenSession {
  ui: NotebookUI;
  filename: string;
  kernel: KernelSession;
  running: number | null;
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
  private saving = new Set<string>();

  async init(firstInit = false): Promise<void> {
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
    if (firstInit) {
      void autoInstallBackend(true);
    }
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
      { name: CMD.new, description: 'New Jupyter Notebook', exec: () => this.createNewFile() },
      { name: CMD.setup, description: 'Jupyter: Install Python backend', exec: () => void installBackend() },
      { name: CMD.startServer, description: 'Jupyter: Start kernel server', exec: () => void this.startServerCmd() },
      { name: CMD.serverUrl, description: 'Jupyter: Set server URL', exec: () => void this.setServerUrlCmd() },
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
    const prev = this.sessions.get(uri);
    if (prev) {
      try { prev.ui.remove(); } catch { /* ignore */ }
      void prev.kernel.close();
    }
    const host = this.tabs.open(uri, filename);
    const ui = new NotebookUI(data, () => this.persistNotebook(uri), () => this.createNewFile());
    const session: OpenSession = { ui, filename, kernel: new KernelSession(), running: null };
    const runner: CellRunner = {
      runCell: (index) => this.runCell(uri, index),
      runAll: () => this.runAll(uri),
      interrupt: () => this.interruptCell(uri),
      isRunning: (index) => this.sessions.get(uri)?.running === index,
      selectKernel: () => this.selectKernel(uri),
      kernelLabel: () => {
        const s = this.sessions.get(uri);
        return s?.kernel.id ? 'Python 3 ●' : 'Select kernel';
      },
    };
    ui.setRunner(runner);
    ui.mount(host);
    ui.setFilename(filename);
    this.sessions.set(uri, session);
  }

  private async runCell(uri: string, index: number): Promise<void> {
    const session = this.sessions.get(uri);
    if (!session) return;
    const cell = session.ui.getData().cells[index];
    if (!cell || cell.cell_type !== 'code') return;
    if (session.running !== null) {
      showToast('A cell is already running — stop it first');
      return;
    }
    const ready = await ensureBackend();
    if (!ready) return;
    const source = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source ?? '');
    session.running = index;
    session.ui.refresh();
    try {
      const result = await session.kernel.execute(source);
      cell.outputs = toOutputs(result);
      cell.execution_count = result.execution_count;
    } catch (e) {
      cell.outputs = [{
        output_type: 'error',
        evalue: String(e),
        traceback: [String(e)],
      }];
    } finally {
      session.running = null;
      session.ui.refresh();
      void this.persistNotebook(uri);
    }
  }

  /**
   * VS Code-style kernel picker: port active? start a session with a fresh
   * id. Port active but no session id? Second notebook — just add its session.
   */
  private async selectKernel(uri: string): Promise<void> {
    const session = this.sessions.get(uri);
    if (!session) return;
    try {
      if (!(await serverHealthy())) {
        const started = await startServer();
        if (!started) return;
      }
      if (!session.kernel.id) {
        await session.kernel.ensure();
        showToast('Kernel connected: Python 3');
      } else {
        showToast('Kernel already connected');
      }
    } catch (e) {
      showToast(`Kernel failed: ${String(e)}`, 4000);
    } finally {
      session.ui.refresh();
    }
  }

  private async runAll(uri: string): Promise<void> {
    const session = this.sessions.get(uri);
    if (!session) return;
    const ready = await ensureBackend();
    if (!ready) return;
    const cells = session.ui.getData().cells;
    for (let i = 0; i < cells.length; i++) {
      if (cells[i].cell_type !== 'code') continue;
      if (this.sessions.get(uri)?.running !== null) break; // interrupted
      await this.runCell(uri, i);
    }
  }

  private async interruptCell(uri: string): Promise<void> {
    const session = this.sessions.get(uri);
    if (!session || session.running === null) {
      showToast('Nothing running');
      return;
    }
    try {
      await session.kernel.interrupt();
      showToast('Interrupting…');
    } catch (e) {
      showToast(`Interrupt failed: ${String(e)}`);
    }
  }

  private async startServerCmd(): Promise<void> {
    const ok = await startServer();
    if (ok) showToast(`Server healthy at ${serverUrl()}`);
  }

  private async setServerUrlCmd(): Promise<void> {
    try {
      const raw = typeof acode.prompt === 'function'
        ? await acode.prompt('Kernel server URL', serverUrl(), 'text')
        : null;
      if (!raw) return;
      const url = String(raw).trim().replace(/\/$/, '');
      if (!url) return;
      setServerUrl(url);
      const healthy = await serverHealthy();
      showToast(healthy ? `Server OK at ${url}` : `Set to ${url} — not reachable yet`);
    } catch { /* prompt cancelled */ }
  }

  private async persistNotebook(uri: string): Promise<void> {
    const session = this.sessions.get(uri);
    if (!session) return;
    this.saving.add(uri);
    try {
      const content = saveNotebook(session.ui.getData());
      await acode.fsOperation!(uri).writeFile(content);
    } catch (e) {
      showToast(`Auto-save failed: ${String(e)}`, 3000);
    } finally {
      this.saving.delete(uri);
    }
  }

  private async createNewFile(): Promise<void> {
    try {
      const folder = await acode.fileBrowser?.('folder', 'Select folder for new notebook');
      if (!folder?.url) return;
      const raw = typeof acode.prompt === 'function'
        ? await acode.prompt('Notebook name', 'Untitled.ipynb', 'text')
        : 'Untitled.ipynb';
      if (!raw) return; // prompt cancelled
      let name = String(raw).trim() || 'Untitled.ipynb';
      if (!name.toLowerCase().endsWith('.ipynb')) name += '.ipynb';
      const content = saveNotebook(createBlankNotebook());
      const createdUrl = await acode.fsOperation!(folder.url).createFile(name, content);
      const uri = createdUrl || `${folder.url.replace(/\/$/, '')}/${name}`;
      await this.openFile(uri, name);
      showToast(`Created ${name}`);
    } catch {
      /* picker/prompt cancelled or create failed silently except via toast below */
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
    void session.kernel.close();
    this.sessions.delete(uri);
  }

  private onExternalSave(file: { uri: string }): void {
    if (!file) return;
    if (this.saving.has(file.uri)) return; // our own auto-save — skip reload
    const session = this.sessions.get(file.uri);
    if (!session) return;
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
      void session.kernel.close();
    }
    this.sessions.clear();
    void stopServer();
    this.fileHandler = null;
  }
}

const win = window as Window & { acode?: AcodeModule };
if (win.acode) {
  const jupyterPlugin = new JupyterPlugin();
  win.acode.setPluginInit(plugin.id, async (_baseUrl: string, _page: unknown, ctx: unknown) => {
    jupyterPlugin.setBaseUrl(_baseUrl);
    jupyterPlugin.setFileIcons((ctx as { fileIcons?: FileIconsApi } | undefined)?.fileIcons);
    const firstInit = (ctx as { firstInit?: boolean } | undefined)?.firstInit ?? false;
    await jupyterPlugin.init(firstInit);
  });
  win.acode.setPluginUnmount(plugin.id, () => jupyterPlugin.destroy());
}

export {};
