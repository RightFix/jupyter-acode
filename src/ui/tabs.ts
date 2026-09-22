import notebookCss from '../styles.css';

interface KernelTab extends EditorFileTab {
  content?: HTMLElement | null;
  makeActive(): void;
  on(event: string, cb: (...args: unknown[]) => void): void;
}

interface EditorFileCtor {
  new (filename: string, options: Record<string, unknown>): KernelTab;
}

/**
 * One real Acode editor tab (custom EditorFile) per open notebook,
 * so multiple .ipynb files stay open side by side without
 * overwriting each other. Each tab hosts its own notebook UI.
 */
export class NotebookTabs {
  private tabs = new Map<string, { file: KernelTab; host: HTMLElement }>();
  private onClose: (uri: string) => void;

  constructor(onClose: (uri: string) => void) {
    this.onClose = onClose;
  }

  open(uri: string, filename: string): HTMLElement {
    const existing = this.tabs.get(uri);
    if (existing) {
      this.clearHost(existing.host);
      this.ensureStyles(existing.host);
      try { existing.file.makeActive(); } catch { /* ignore */ }
      return existing.host;
    }
    // Adopt a tab Acode already has open (e.g. restored session).
    try {
      const adopted = editorManager.getFile?.(uri, 'uri') as KernelTab | undefined;
      const content = (adopted as { content?: HTMLElement } | undefined)?.content;
      if (adopted && content) {
        this.clearHost(content);
        this.ensureStyles(content);
        this.track(uri, adopted, content);
        try { adopted.makeActive(); } catch { /* ignore */ }
        return content;
      }
    } catch { /* not open — create below */ }
    const host = document.createElement('div');
    host.className = 'jupyter-tab-host';
    host.style.cssText = 'height:100%;display:flex;flex-direction:column;';
    this.ensureStyles(host);
    const Ctor = acode.require('editorFile') as EditorFileCtor;
    const file = new Ctor(filename, {
      uri,
      type: 'custom',
      content: host,
      hideQuickTools: true,
    });
    try { editorManager.addFile?.(file); } catch { /* ignore */ }
    try { file.makeActive(); } catch { /* ignore */ }
    this.track(uri, file, host);
    return host;
  }

  private track(uri: string, file: KernelTab, host: HTMLElement): void {
    this.tabs.set(uri, { file, host });
    try {
      file.on('close', () => {
        if (this.tabs.get(uri)?.file === file) {
          this.tabs.delete(uri);
          this.onClose(uri);
        }
      });
    } catch { /* ignore */ }
  }

  /**
   * Styles live inside the tab host (not just document.head) because
   * custom tab content is Shadow-DOM isolated — head styles can't reach it.
   */
  private ensureStyles(host: HTMLElement): void {
    try {
      host.querySelectorAll('style').forEach(el => {
        if ((el as HTMLElement).getAttribute?.('data-jupyter')) el.remove();
      });
    } catch { /* ignore */ }
    try {
      const style = document.createElement('style');
      style.setAttribute('data-jupyter', 'true');
      style.textContent = notebookCss;
      host.appendChild(style);
    } catch { /* ignore */ }
  }

  private clearHost(host: HTMLElement): void {
    try {
      while (host.firstChild) host.removeChild(host.firstChild);
    } catch { /* ignore */ }
    try { host.innerHTML = ''; } catch { /* ignore */ }
  }
}
