import { Cell, CellType, Output, NotebookData } from '../types';
import { renderMarkdown } from '../render/markdown';
import { renderOutputs } from '../render/outputs';

export interface NotebookCallbacks {
  onRunCell: (index: number) => void | Promise<void>;
  onDeleteCell: () => void;
  onMoveCell: (dir: number) => void;
  onToggleType: () => void;
  onSave: () => void;
  onModified: () => void;
  onSelectCell: (index: number) => void;
}

export class NotebookUI {
  public selectedIndex = -1;
  private $container: HTMLElement | null = null;
  private $cells: HTMLElement | null = null;
  private data: NotebookData;
  private cbs: NotebookCallbacks;

  constructor(data: NotebookData, cbs: NotebookCallbacks) {
    this.data = data;
    this.cbs = cbs;
  }

  getCell(index: number): Cell | undefined { return this.data.cells[index]; }
  getSource(index: number): string {
    const cell = this.data.cells[index];
    if (!cell) return '';
    return Array.isArray(cell.source) ? cell.source.join('') : String(cell.source);
  }
  getCodeCells(): number[] { return this.data.cells.map((c, i) => c.cell_type === 'code' ? i : -1).filter(i => i >= 0); }
  getNotebookData(): NotebookData { return this.data; }

  setOutputs(index: number, outputs: Output[], count: number | null): void {
    const cell = this.data.cells[index];
    if (!cell) return;
    cell.outputs = outputs ?? [];
    cell.execution_count = count;
    this.updateCellOutputs(index);
  }

  setPrompt(index: number, count: number | null): void {
    const el = this.$cells?.querySelector(`[data-index="${index}"] .nb-prompt`) as HTMLElement | null;
    if (el) el.innerHTML = count !== null ? `In&nbsp;[${count}]:` : 'In&nbsp;[ ]:';
  }

  clearOutputs(): void {
    this.data.cells.forEach(c => {
      if (c.cell_type === 'code') { c.outputs = []; c.execution_count = null; }
    });
    this.renderCells();
  }

  addCell(type: CellType): void {
    const newCell: Cell = {
      cell_type: type,
      source: [],
      metadata: {},
      outputs: type === 'code' ? [] : undefined,
      execution_count: type === 'code' ? null : undefined,
    };
    const idx = this.selectedIndex >= 0 ? this.selectedIndex + 1 : this.data.cells.length;
    this.data.cells.splice(idx, 0, newCell);
    this.renderCells();
    this.selectCell(idx);
    this.cbs.onModified();
    setTimeout(() => {
      const editor = this.$cells?.querySelector(`[data-index="${idx}"] .nb-editor`) as HTMLTextAreaElement | null;
      editor?.focus();
    }, 50);
  }

  deleteCell(): void {
    if (this.data.cells.length <= 1 || this.selectedIndex < 0) return;
    this.data.cells.splice(this.selectedIndex, 1);
    this.renderCells();
    this.cbs.onModified();
  }

  moveCell(dir: number): void {
    if (this.selectedIndex < 0) return;
    const ni = this.selectedIndex + dir;
    if (ni < 0 || ni >= this.data.cells.length) return;
    const tmp = this.data.cells[ni];
    this.data.cells[ni] = this.data.cells[this.selectedIndex];
    this.data.cells[this.selectedIndex] = tmp;
    this.selectCell(ni);
    this.renderCells();
    this.cbs.onModified();
  }

  toggleType(): void {
    if (this.selectedIndex < 0) return;
    const cell = this.data.cells[this.selectedIndex];
    if (!cell) return;
    cell.cell_type = cell.cell_type === 'code' ? 'markdown' : 'code';
    if (cell.cell_type === 'code') { cell.outputs = []; cell.execution_count = null; }
    else { delete cell.outputs; delete cell.execution_count; }
    this.renderCells();
    this.cbs.onModified();
  }

  mount(): void { this.render(); }

  remove(): void {
    this.$container?.remove();
    this.$container = null;
    this.showNativeEditor();
  }

  show(): void { if (this.$container) this.$container.style.display = ''; }
  hide(): void { if (this.$container) this.$container.style.display = 'none'; }

  private render(): void {
    const existing = document.querySelector('.jupyter-notebook-wrapper');
    existing?.remove();
    const header = document.querySelector('header') || document.querySelector('.header') || document.querySelector('#header');
    const headerHeight = header ? (header as HTMLElement).offsetHeight : 44;
    const toolbarHeight = 50;

    const wrapper = document.createElement('div');
    wrapper.className = 'jupyter-notebook-wrapper';
    wrapper.style.cssText = `position:absolute;top:${headerHeight}px;left:0;right:0;bottom:0;display:flex;flex-direction:column;background:var(--theme-surface,#fff);z-index:1;`;

    wrapper.innerHTML = `
      <div class="nb-toolbar" style="flex-shrink:0;height:${toolbarHeight}px;min-height:${toolbarHeight}px">
        <button class="nb-btn add-code">+ Code</button>
        <button class="nb-btn add-md">+ Markdown</button>
        <button class="nb-btn run-all">Run All</button>
        <button class="nb-btn move-up">↑ Up</button>
        <button class="nb-btn move-down">↓ Down</button>
        <button class="nb-btn toggle-type">↔ Type</button>
        <button class="nb-btn save">Save</button>
      </div>
      <div class="nb-cells" style="flex:1;overflow-y:auto;overflow-x:hidden;-webkit-overflow-scrolling:touch;padding:8px;box-sizing:border-box"></div>
    `;

    (wrapper.querySelector('.add-code') as HTMLElement).onclick = () => this.addCell('code');
    (wrapper.querySelector('.add-md') as HTMLElement).onclick = () => this.addCell('markdown');
    (wrapper.querySelector('.run-all') as HTMLElement).onclick = () => this.runAllCodeCells();
    (wrapper.querySelector('.move-up') as HTMLElement).onclick = () => this.moveCell(-1);
    (wrapper.querySelector('.move-down') as HTMLElement).onclick = () => this.moveCell(1);
    (wrapper.querySelector('.toggle-type') as HTMLElement).onclick = () => this.toggleType();
    (wrapper.querySelector('.save') as HTMLElement).onclick = () => this.cbs.onSave();

    this.$container = wrapper;
    this.$cells = wrapper.querySelector('.nb-cells');
    this.renderCells();
    document.querySelector('main')?.appendChild(wrapper);
    this.hideNativeEditor();
  }

  private runAllCodeCells(): void {
    const indices = this.getCodeCells();
    for (const i of indices) {
      const cell = this.data.cells[i];
      if (!cell || cell.cell_type !== 'code') continue;
      const code = this.getSource(i);
      if (!code.trim()) continue;
      this.cbs.onRunCell(i);
    }
  }

  private renderCells(): void {
    if (!this.$cells) return;
    this.$cells.innerHTML = '';
    if (!this.data.cells.length) {
      this.$cells.innerHTML = '<div class="nb-empty">No cells. Add a cell to start.</div>';
      return;
    }
    this.data.cells.forEach((cell, i) => this.$cells!.appendChild(this.createCellEl(cell, i)));
  }

  private createCellEl(cell: Cell, index: number): HTMLElement {
    const isSel = index === this.selectedIndex;
    const type = cell.cell_type || 'code';
    const el = document.createElement('div');
    el.className = `nb-cell nb-${type}${isSel ? ' selected' : ''}`;
    el.dataset.index = String(index);

    const actions = document.createElement('div');
    actions.className = 'nb-cell-actions';
    actions.innerHTML = '<span class="nb-run">▶</span><span class="nb-delete">×</span>';
    (actions.querySelector('.nb-run') as HTMLElement).onclick = (e: Event) => { e.stopPropagation(); this.cbs.onRunCell(index); };
    (actions.querySelector('.nb-delete') as HTMLElement).onclick = (e: Event) => { e.stopPropagation(); this.cbs.onDeleteCell(); };
    el.appendChild(actions);

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
      const editor = document.createElement('textarea');
      editor.className = 'nb-editor';
      editor.value = this.getSource(index);
      editor.style.display = 'none';
      editor.spellcheck = false;
      preview.onclick = () => { preview.style.display = 'none'; editor.style.display = 'block'; editor.focus(); };
      editor.onblur = () => {
        editor.style.display = 'none';
        preview.style.display = 'block';
        preview.innerHTML = renderMarkdown([editor.value]);
        cell.source = editor.value.split('\n');
        this.cbs.onModified();
      };
      content.appendChild(preview);
      content.appendChild(editor);
    } else {
      const editor = document.createElement('textarea');
      editor.className = 'nb-editor nb-code-editor';
      editor.value = this.getSource(index);
      editor.spellcheck = false;
      editor.onfocus = () => this.selectCell(index);
      editor.oninput = () => {
        cell.source = editor.value.split('\n');
        this.cbs.onModified();
      };
      this.setupEditor(editor, index);
      content.appendChild(editor);
    }

    el.appendChild(content);
    if (type === 'code' && cell.outputs?.length) {
      const outEl = document.createElement('div');
      outEl.className = 'nb-outputs';
      outEl.innerHTML = renderOutputs(cell.outputs);
      el.appendChild(outEl);
    }
    el.onclick = () => this.selectCell(index);
    return el;
  }

  private updateCellOutputs(index: number): void {
    const el = this.$cells?.querySelector(`[data-index="${index}"]`);
    if (!el) return;
    const old = el.querySelector('.nb-outputs');
    old?.remove();
    const cell = this.data.cells[index];
    if (cell.cell_type === 'code' && cell.outputs?.length) {
      const outEl = document.createElement('div');
      outEl.className = 'nb-outputs';
      outEl.innerHTML = renderOutputs(cell.outputs);
      el.appendChild(outEl);
    }
  }

  private selectCell(index: number): void {
    this.selectedIndex = index;
    this.$cells?.querySelectorAll('.nb-cell').forEach((c, i) => c.classList.toggle('selected', i === index));
    this.cbs.onSelectCell(index);
  }

  private setupEditor(editor: HTMLTextAreaElement, cellIndex: number): void {
    editor.addEventListener('keydown', (e: KeyboardEvent) => {
      if (e.key === 'Tab') {
        e.preventDefault();
        const start = editor.selectionStart;
        const end = editor.selectionEnd;
        editor.value = editor.value.substring(0, start) + '    ' + editor.value.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        this.cbs.onRunCell(cellIndex);
      }
    });
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
