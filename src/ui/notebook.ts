import { Cell, NotebookData } from '../types';
import { renderMarkdown } from '../render/markdown';
import { renderOutputs } from '../render/outputs';

export class NotebookUI {
  private $container: HTMLElement | null = null;
  private $cells: HTMLElement | null = null;
  private overlay = false;
  private data: NotebookData;

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
      wrapper.style.cssText = 'display:flex;flex-direction:column;height:100%;background:var(--theme-surface,#fff);box-sizing:border-box;';
    } else {
      this.overlay = true;
      const header = document.querySelector('header') || document.querySelector('.header') || document.querySelector('#header');
      const headerHeight = header ? (header as HTMLElement).offsetHeight : 44;
      wrapper.style.cssText = `position:absolute;top:${headerHeight}px;left:0;right:0;bottom:0;display:flex;flex-direction:column;background:var(--theme-surface,#fff);z-index:1;`;
    }

    wrapper.innerHTML = `
      <div class="nb-toolbar" style="flex-shrink:0;height:${toolbarHeight}px;min-height:${toolbarHeight}px">
        <span class="nb-filename" title="Current notebook">Untitled.ipynb</span>
      </div>
      <div class="nb-cells" style="flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:8px;box-sizing:border-box"></div>
    `;

    this.$container = wrapper;
    this.$cells = wrapper.querySelector('.nb-cells');
    if (this.$cells) this.setupImageExpand(this.$cells);
    this.renderCells();
    if (host) {
      host.appendChild(wrapper);
    } else {
      document.querySelector('main')?.appendChild(wrapper);
      this.hideNativeEditor();
    }
  }

  private setupImageExpand(cells: HTMLElement): void {
    cells.addEventListener('click', (e: Event) => {
      let node = e.target as HTMLElement | null;
      while (node && node !== cells) {
        if (node.tagName === 'IMG') {
          const box = node.parentElement;
          if (box && box.classList.contains('nb-output-img')) box.classList.toggle('expanded');
          return;
        }
        node = node.parentElement as HTMLElement | null;
      }
    });
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
      const preview = document.createElement('div');
      preview.className = 'nb-markdown-preview';
      preview.innerHTML = renderMarkdown(cell.source);
      content.appendChild(preview);
    } else {
      const pre = document.createElement('pre');
      pre.className = 'nb-code';
      pre.textContent = Array.isArray(cell.source) ? cell.source.join('') : String(cell.source ?? '');
      content.appendChild(pre);
    }

    el.appendChild(content);

    if (type === 'code' && cell.outputs?.length) {
      const outEl = document.createElement('div');
      outEl.className = 'nb-outputs';
      outEl.innerHTML = renderOutputs(cell.outputs);
      el.appendChild(outEl);
    }
    return el;
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
