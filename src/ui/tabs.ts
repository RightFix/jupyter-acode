interface KernelTab extends EditorFileTab {
  content?: HTMLElement | null;
  makeActive(): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
}

interface EditorFileCtor {
  new (filename: string, options: Record<string, unknown>): KernelTab;
}

/**
 * Hosts the notebook UI inside a single real Acode editor tab
 * (custom EditorFile), so open notebooks appear in the file list,
 * participate in tab switching, and can be closed like any file.
 *
 * Single-tab policy: one notebook tab follows the current file.
 * This matches the single active-notebook model (one kernel session,
 * one dirty state) and avoids orphaned UIs across tabs.
 */
export class NotebookTabs {
  private file: KernelTab | null = null;
  private host: HTMLElement | null = null;
  private uri: string | null = null;
  private onClose: (uri: string | null) => void;

  constructor(onClose: (uri: string | null) => void) {
    this.onClose = onClose;
  }

  has(uri: string): boolean {
    return this.file !== null && this.uri === uri;
  }

  open(uri: string | null, filename: string): HTMLElement {
    if (this.file && this.host) {
      this.retitle(filename);
      this.setUri(uri);
      this.clearHost(this.host);
      try { this.file.makeActive(); } catch { /* ignore */ }
      return this.host;
    }
    // Adopt a tab Acode already has open (e.g. restored session).
    if (uri) {
      try {
        const adopted = editorManager.getFile?.(uri, 'uri') as KernelTab | undefined;
        const content = (adopted as { content?: HTMLElement } | undefined)?.content;
        if (adopted && content) {
          this.file = adopted;
          this.host = content;
          this.uri = uri;
          this.clearHost(content);
          this.watchClose(adopted);
          try { adopted.makeActive(); } catch { /* ignore */ }
          return content;
        }
      } catch { /* not open — create below */ }
    }
    const host = document.createElement('div');
    host.className = 'jupyter-tab-host';
    host.style.cssText = 'height:100%;display:flex;flex-direction:column;';
    const Ctor = acode.require('editorFile') as EditorFileCtor;
    const file = new Ctor(filename, {
      ...(uri ? { uri } : {}),
      type: 'custom',
      content: host,
      hideQuickTools: true,
    });
    try { editorManager.addFile?.(file); } catch { /* ignore */ }
    try { file.makeActive(); } catch { /* ignore */ }
    this.file = file;
    this.host = host;
    this.uri = uri;
    this.watchClose(file);
    return host;
  }

  retitle(name: string): void {
    if (!this.file) return;
    try { this.file.filename = name; } catch { /* ignore */ }
  }

  setUri(uri: string | null): void {
    this.uri = uri;
    if (!this.file || !uri) return;
    try { this.file.uri = uri; } catch { /* ignore */ }
  }

  private watchClose(file: KernelTab): void {
    try {
      file.on('close', () => {
        if (this.file === file) {
          const uri = this.uri;
          this.file = null;
          this.host = null;
          this.uri = null;
          this.onClose(uri);
        }
      });
    } catch { /* ignore */ }
  }

  private clearHost(host: HTMLElement): void {
    try {
      while (host.firstChild) host.removeChild(host.firstChild);
    } catch { /* ignore */ }
    try { host.innerHTML = ''; } catch { /* ignore */ }
  }
}
