export interface HeaderButtonCallbacks {
  onOpen: () => void | Promise<void>;
}

const CONTAINER_CLASS = 'jupyter-header-btns';
const MAX_RETRIES = 5;

function findHeader(): HTMLElement | null {
  const selectors = ['header', '.header', '#header', '[role="banner"]'];
  for (const sel of selectors) {
    try {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) return el;
    } catch { /* ignore bad selector/host */ }
  }
  return null;
}

/**
 * A single "+" button in Acode's top header bar for notebook
 * creation/opening. Tapping it offers New vs Open via select dialog.
 * Re-injects itself if Acode re-renders the header.
 */
export class HeaderButtons {
  private container: HTMLElement | null = null;
  private observer: MutationObserver | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private retries = 0;
  private cbs: HeaderButtonCallbacks;

  constructor(cbs: HeaderButtonCallbacks) {
    this.cbs = cbs;
  }

  mount(): void {
    this.tryInject();
    this.observe();
  }

  unmount(): void {
    if (this.retryTimer) { clearTimeout(this.retryTimer); this.retryTimer = null; }
    try { this.observer?.disconnect(); } catch { /* ignore */ }
    this.observer = null;
    try { this.container?.remove(); } catch { /* ignore */ }
    this.container = null;
    try {
      document.querySelectorAll(`.${CONTAINER_CLASS}`).forEach(el => el.remove());
    } catch { /* ignore */ }
  }

  private tryInject(): void {
    if (this.container && this.isAttached(this.container)) return;
    const header = findHeader();
    if (!header) {
      if (this.retries < MAX_RETRIES) {
        this.retries++;
        this.retryTimer = setTimeout(() => this.tryInject(), 1000);
      }
      return;
    }
    const existing = header.querySelector(`.${CONTAINER_CLASS}`) as HTMLElement | null;
    if (existing && existing.querySelector('button')) {
      this.container = existing;
      this.wire(existing);
      return;
    }
    existing?.remove();
    const wrap = document.createElement('span');
    wrap.className = CONTAINER_CLASS;
    wrap.style.cssText = 'display:inline-flex;align-items:center;gap:4px;margin-left:auto;';
    const btn = document.createElement('button');
    btn.className = 'nb-btn jupyter-header-plus';
    btn.textContent = '+';
    btn.title = 'Jupyter notebook';
    btn.setAttribute('aria-label', 'Jupyter notebook: new or open');
    btn.onclick = () => void this.pick();
    wrap.appendChild(btn);
    header.appendChild(wrap);
    this.container = wrap;
  }

  private isAttached(el: HTMLElement): boolean {
    if (typeof el.isConnected === 'boolean') return el.isConnected;
    return !!el.parentNode;
  }

  private wire(container: HTMLElement): void {
    const btn = container.querySelector('button') as HTMLButtonElement | null;
    if (btn) btn.onclick = () => void this.pick();
  }

  private observe(): void {
    if (typeof MutationObserver === 'undefined') return;
    try {
      let pending = false;
      this.observer = new MutationObserver(() => {
        if (pending) return;
        pending = true;
        setTimeout(() => {
          pending = false;
          if (!this.container || !this.isAttached(this.container)) this.tryInject();
        }, 300);
      });
      if (document.body) this.observer.observe(document.body, { childList: true, subtree: true });
    } catch { /* ignore */ }
  }

  private async pick(): Promise<void> {
    await this.cbs.onOpen();
  }
}
