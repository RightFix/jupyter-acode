import { Cell, NotebookData } from '../types';
import { renderMarkdown } from '../render/markdown';
import { renderOutputs } from '../render/outputs';

export class NotebookUI {
  private $container: HTMLElement | null = null;
  private $cells: HTMLElement | null = null;
  private overlay = false;
  private data: NotebookData;
  private collapsed = new Set<string>();

  constructor(data: NotebookData) {
    this.data = data;
  }

  mount(host?: HTMLElement | null): void { this.render(host ?? null); }

  remove(): void {
    this.$container?.remove();
    this.$container = null;
    if (this.overlay) this.showNativeEditor();
  }

  show(): void { if (this.$container) this.$container.style.display = ''; }
  hide(): void { if (this.$container) this.$container.style.display = 'none'; }

  setFilename(name: string): void {
    const el = this.$container?.querySelector('.nb-filename');
    if (el) {
      el.textContent = name;
      (el as HTMLElement).title = name;
    }
  }

  private render(host?: HTMLElement | null): void {
    const toolbarHeight = 50;

    const wrapper = document.createElement('div');
    wrapper.className = 'jupyter-notebook-wrapper';
    if (host) {
      this.overlay = false;
      wrapper.style.cssText = 'display:flex;flex-direction:column;min-height:100%;box-sizing:border-box;';
    } else {
      this.overlay = true;
      const header = document.querySelector('header') || document.querySelector('.header') || document.querySelector('#header');
      const headerHeight = header ? (header as HTMLElement).offsetHeight : 44;
      wrapper.style.cssText = `position:absolute;top:${headerHeight}px;left:0;right:0;bottom:0;display:flex;flex-direction:column;box-sizing:border-box;overflow-y:auto;`;
    }

    wrapper.innerHTML = `
      <div class="nb-toolbar" style="flex-shrink:0;height:${toolbarHeight}px;min-height:${toolbarHeight}px">
        <span class="nb-filename" title="Current notebook">Untitled.ipynb</span>
      </div>
      <div class="nb-cells"></div>
    `;

    this.$container = wrapper;
    this.$cells = wrapper.querySelector('.nb-cells');
    this.renderCells();
    if (host) {
      host.appendChild(wrapper);
    } else {
      document.querySelector('main')?.appendChild(wrapper);
      this.hideNativeEditor();
    }
  }

  private renderCells(): void {
    if (!this.$cells) return;
    this.$cells.innerHTML = '';
    if (!this.data.cells.length) {
      this.$cells.innerHTML = '<div class="nb-empty">No cells in this notebook.</div>';
      return;
    }
    this.data.cells.forEach((cell, i) => this.$cells!.appendChild(this.createCellEl(cell, i)));
  }

  private createCellEl(cell: Cell, index: number): HTMLElement {
    const type = cell.cell_type || 'code';
    const el = document.createElement('div');
    el.className = `nb-cell nb-${type}`;
    el.dataset.index = String(index);

    if (type === 'code') {
      const prompt = document.createElement('div');
      prompt.className = 'nb-prompt';
      prompt.innerHTML = `In&nbsp;[${cell.execution_count ?? ' '}]:`;
      el.appendChild(prompt);
    }

    const content = document.createElement('div');
    content.className = 'nb-cell-content';

    if (type === 'markdown') {
      content.appendChild(this.foldHead(index, 'md', 'nb-tag-md', 'MARKDOWN'));
      const body = document.createElement('div');
      body.className = 'nb-foldable';
      const preview = document.createElement('div');
      preview.className = 'nb-markdown-preview';
      preview.innerHTML = renderMarkdown(cell.source);
      body.appendChild(preview);
      content.appendChild(body);
      this.applyFoldState(index, 'md', body);
    } else {
      content.appendChild(this.foldHead(index, 'in', type === 'code' ? 'nb-tag-in' : 'nb-tag-raw', type === 'code' ? 'IN' : 'RAW'));
      const body = document.createElement('div');
      body.className = 'nb-foldable';
      const pre = document.createElement('pre');
      pre.className = 'nb-code';
      pre.textContent = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source ?? '');
      body.appendChild(pre);
      content.appendChild(body);
      this.applyFoldState(index, 'in', body);
    }

    el.appendChild(content);

    if (type === 'code' && cell.outputs?.length) {
      el.appendChild(this.foldHead(index, 'out', 'nb-tag-out', 'OUT'));
      const outEl = document.createElement('div');
      outEl.className = 'nb-outputs nb-foldable';
      outEl.innerHTML = renderOutputs(cell.outputs);
      el.appendChild(outEl);
      this.applyFoldState(index, 'out', outEl);
    }
    return el;
  }

  private foldKey(index: number, part: string): string {
    return `${index}:${part}`;
  }

  private foldHead(index: number, part: string, tagClass: string, label: string): HTMLElement {
    const head = document.createElement('div');
    head.className = 'nb-foldhead';
    const btn = document.createElement('button');
    btn.className = 'nb-fold';
    btn.textContent = '▾';
    btn.title = `Fold ${label.toLowerCase()}`;
    btn.setAttribute('aria-label', `Fold ${label.toLowerCase()}`);
    const tag = document.createElement('div');
    tag.className = `nb-tag ${tagClass}`;
    tag.textContent = label;
    head.appendChild(btn);
    head.appendChild(tag);
    btn.onclick = () => {
      const body = this.foldBody(index, part);
      if (body) this.toggleFold(index, part, body, btn as HTMLButtonElement);
    };
    if (this.collapsed.has(this.foldKey(index, part))) {
      btn.textContent = '▸';
      btn.setAttribute('aria-label', `Unfold ${label.toLowerCase()}`);
    }
    return head;
  }

  private foldBody(index: number, part: string): HTMLElement | null {
    const cellEl = this.$cells?.querySelector(`[data-index="${index}"]`);
    if (!cellEl) return null;
    const bodies = cellEl.querySelectorAll('.nb-foldable');
    const order = part === 'out' ? 1 : 0;
    return (bodies[order] as HTMLElement | undefined) ?? null;
  }

  private applyFoldState(index: number, part: string, body: HTMLElement): void {
    if (this.collapsed.has(this.foldKey(index, part))) body.classList.add('collapsed');
  }

  private toggleFold(index: number, part: string, body: HTMLElement, btn: HTMLButtonElement): void {
    const key = this.foldKey(index, part);
    const collapsed = !this.collapsed.has(key);
    if (collapsed) this.collapsed.add(key);
    else this.collapsed.delete(key);
    body.classList.toggle('collapsed', collapsed);
    btn.textContent = collapsed ? '▸' : '▾';
  }

  private hideNativeEditor(): void {
    const selectors = ['.editor-section', '#editor', '.cm-editor', '#editors'];
    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) el.style.display = 'none';
    }
  }

  private showNativeEditor(): void {
    const selectors = ['.editor-section', '#editor', '.cm-editor', '#editors'];
    for (const sel of selectors) {
      const el = document.querySelector(sel) as HTMLElement | null;
      if (el) el.style.display = '';
    }
  }
}
