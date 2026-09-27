import { Cell, CellType, NotebookData } from '../types';
import { renderMarkdown } from '../render/markdown';
import { outputsText, renderOutputs } from '../render/outputs';
import { createCell } from '../nbformat';
import { copyText, showToast } from './toast';

export type NewCellType = 'code' | 'markdown';

/** Execution backend hook. Provided by main.ts once the server is up. */
export interface CellRunner {
  runCell(index: number): Promise<void>;
  runAll(): Promise<void>;
  interrupt(): Promise<void>;
  isRunning(index: number): boolean;
  /** VS Code-style kernel picker: ensure server + session, update label. */
  selectKernel(): Promise<void>;
  kernelLabel(): string;
}

export class NotebookUI {
  private $container: HTMLElement | null = null;
  private $cells: HTMLElement | null = null;
  private overlay = false;
  private data: NotebookData;
  private collapsed = new Set<string>();
  private mdEditing = new Set<number>();
  private saveTimer: ReturnType<typeof setTimeout> | null = null;
  private onChange: (() => void | Promise<void>) | null;
  private onNewFile: (() => void | Promise<void>) | null;
  private runner: CellRunner | null = null;

  constructor(data: NotebookData, onChange?: () => void | Promise<void>, onNewFile?: () => void | Promise<void>) {
    this.data = data;
    this.onChange = onChange ?? null;
    this.onNewFile = onNewFile ?? null;
  }

  mount(host?: HTMLElement | null): void { this.render(host ?? null); }

  remove(): void {
    this.$container?.remove();
    this.$container = null;
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = null;
    if (this.overlay) this.showNativeEditor();
  }

  show(): void { if (this.$container) this.$container.style.display = ''; }
  hide(): void { if (this.$container) this.$container.style.display = 'none'; }

  getData(): NotebookData { return this.data; }

  setRunner(runner: CellRunner | null): void {
    this.runner = runner;
    this.refresh();
  }

  refresh(): void { this.renderCells(); this.refreshKernelButton(); }

  private refreshKernelButton(host?: HTMLElement | null): void {
    try {
      const root = host ?? this.$container;
      const btn = root?.querySelector('[data-kernel]') as HTMLButtonElement | null;
      if (btn) btn.textContent = this.runner?.kernelLabel() ?? 'Select kernel';
    } catch { /* ignore */ }
  }

  setFilename(name: string): void {
    const el = this.$container?.querySelector('.nb-filename');
    if (el) {
      el.textContent = name;
      (el as HTMLElement).title = name;
    }
  }

  addCell(type: NewCellType, atIndex?: number): void {
    const index = atIndex === undefined ? this.data.cells.length : Math.max(0, Math.min(atIndex, this.data.cells.length));
    this.data.cells.splice(index, 0, createCell(type));
    this.shiftCollapsed(index, 1);
    this.renderCells();
    showToast(`${type === 'code' ? 'Code' : 'Markdown'} cell added`);
    void this.notifyChange();
  }

  removeCell(index: number): void {
    if (index < 0 || index >= this.data.cells.length) return;
    this.data.cells.splice(index, 1);
    this.shiftCollapsed(index, -1);
    this.renderCells();
    showToast('Cell deleted');
    void this.notifyChange();
  }

  private async requestDelete(index: number): Promise<void> {
    try {
      if (typeof acode.confirm === 'function') {
        const ok = await acode.confirm('Delete cell?', `Delete cell ${index + 1}? This cannot be undone.`);
        if (!ok) return;
      }
    } catch {
      return; // dialog cancelled — stay silent
    }
    this.removeCell(index);
  }

  private shiftCollapsed(index: number, delta: 1 | -1): void {
    this.collapsed = this.shiftIndexSet(this.collapsed, index, delta);
    const nextMd = new Set<number>();
    for (const i of this.mdEditing) {
      if (delta === 1 && i >= index) nextMd.add(i + 1);
      else if (delta === -1 && i === index) continue;
      else if (delta === -1 && i > index) nextMd.add(i - 1);
      else nextMd.add(i);
    }
    this.mdEditing = nextMd;
  }

  private shiftIndexSet(set: Set<string>, index: number, delta: 1 | -1): Set<string> {
    const next = new Set<string>();
    for (const key of set) {
      const sep = key.lastIndexOf(':');
      const i = Number(key.slice(0, sep));
      const part = key.slice(sep + 1);
      if (Number.isNaN(i)) continue;
      if (delta === 1 && i >= index) next.add(`${i + 1}:${part}`);
      else if (delta === -1 && i === index) continue;
      else if (delta === -1 && i > index) next.add(`${i - 1}:${part}`);
      else next.add(key);
    }
    return next;
  }

  private notifyChange(): void | Promise<void> {
    try {
      return this.onChange?.();
    } catch { /* save errors surface via toast in main */ }
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
        <button class="nb-fold nb-kernel" data-kernel title="Select kernel">Select kernel</button>
        <button class="nb-fold nb-run" data-runall title="Run all cells">▶ All</button>
        <button class="nb-fold nb-stop" data-stop title="Interrupt running cell">⏹</button>
        <button class="nb-fold nb-add" data-add="code" title="Add code cell at end">+ Code</button>
        <button class="nb-fold nb-add" data-add="markdown" title="Add markdown cell at end">+ Markdown</button>
        <button class="nb-fold nb-add" data-newfile title="Create new notebook file">+ New</button>
      </div>
      <div class="nb-cells"></div>
    `;

    this.$container = wrapper;
    this.$cells = wrapper.querySelector('.nb-cells');
    wrapper.querySelectorAll('[data-add]').forEach((btn) => {
      (btn as HTMLButtonElement).onclick = () => {
        this.addCell((btn as HTMLElement).dataset.add === 'markdown' ? 'markdown' : 'code');
      };
    });
    const runAllBtn = wrapper.querySelector('[data-runall]');
    if (runAllBtn) {
      (runAllBtn as HTMLButtonElement).onclick = () => {
        if (!this.runner) { showToast('Backend not ready — run a cell first'); return; }
        void this.runner.runAll();
      };
    }
    const kernelBtn = wrapper.querySelector('[data-kernel]');
    if (kernelBtn) {
      (kernelBtn as HTMLButtonElement).onclick = () => {
        if (!this.runner) return;
        void this.runner.selectKernel().then(() => this.refreshKernelButton());
      };
    }
    const stopBtn = wrapper.querySelector('[data-stop]');
    if (stopBtn) {
      (stopBtn as HTMLButtonElement).onclick = () => {
        if (!this.runner) { showToast('Nothing running'); return; }
        void this.runner.interrupt();
      };
    }
    const newFileBtn = wrapper.querySelector('[data-newfile]');
    if (newFileBtn) {
      (newFileBtn as HTMLButtonElement).onclick = () => {
        if (!this.onNewFile) { showToast('New file unavailable'); return; }
        void this.onNewFile();
      };
    }
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
      const empty = document.createElement('div');
      empty.className = 'nb-empty';
      empty.innerHTML = '<div style="margin-bottom:12px">No cells in this notebook.</div>';
      const actions = document.createElement('div');
      actions.className = 'nb-empty-actions';
      const codeBtn = document.createElement('button');
      codeBtn.className = 'nb-fold nb-add';
      codeBtn.textContent = '+ Code';
      codeBtn.onclick = () => this.addCell('code', 0);
      const mdBtn = document.createElement('button');
      mdBtn.className = 'nb-fold nb-add';
      mdBtn.textContent = '+ Markdown';
      mdBtn.onclick = () => this.addCell('markdown', 0);
      actions.appendChild(codeBtn);
      actions.appendChild(mdBtn);
      empty.appendChild(actions);
      this.$cells.appendChild(empty);
      return;
    }
    this.$cells.appendChild(this.insertDivider(0, 'above'));
    this.data.cells.forEach((cell, i) => {
      this.$cells!.appendChild(this.createCellEl(cell, i));
      this.$cells!.appendChild(this.insertDivider(i + 1, i === this.data.cells.length - 1 ? 'below' : 'between'));
    });
  }

  private insertDivider(atIndex: number, _pos: 'above' | 'between' | 'below'): HTMLElement {
    const div = document.createElement('div');
    div.className = 'nb-insert';
    for (const t of ['code', 'markdown'] as NewCellType[]) {
      const btn = document.createElement('button');
      btn.className = 'nb-insert-btn';
      btn.textContent = t === 'code' ? '+ Code' : '+ Markdown';
      btn.title = `Add ${t} cell here`;
      btn.setAttribute('aria-label', `Add ${t} cell here`);
      btn.onclick = () => this.addCell(t, atIndex);
      div.appendChild(btn);
    }
    return div;
  }

  private createCellEl(cell: Cell, index: number): HTMLElement {
    const type = cell.cell_type || 'code';
    const el = document.createElement('div');
    el.className = `nb-cell nb-${type}`;
    el.dataset.index = String(index);

    const actions = document.createElement('div');
    actions.className = 'nb-cell-actions';
    if (type === 'code') {
      const running = this.runner?.isRunning(index) ?? false;
      const run = document.createElement('button');
      run.className = 'nb-fold nb-run-cell';
      run.textContent = running ? '⏹' : '▶';
      run.title = running ? 'Interrupt this cell' : 'Run this cell';
      run.setAttribute('aria-label', running ? 'Interrupt this cell' : 'Run this cell');
      run.onclick = (e) => {
        e.stopPropagation();
        if (!this.runner) { showToast('Starting backend…'); return; }
        if (this.runner.isRunning(index)) void this.runner.interrupt();
        else void this.runner.runCell(index);
      };
      actions.appendChild(run);
    }
    const del = document.createElement('button');
    del.className = 'nb-fold nb-del';
    del.textContent = 'Delete';
    del.title = 'Delete this cell';
    del.setAttribute('aria-label', 'Delete this cell');
    del.onclick = (e) => {
      e.stopPropagation();
      void this.requestDelete(index);
    };
    actions.appendChild(del);
    el.appendChild(actions);

    if (type === 'code') {
      const prompt = document.createElement('div');
      prompt.className = 'nb-prompt';
      const running = this.runner?.isRunning(index) ?? false;
      prompt.innerHTML = `In&nbsp;[${running ? '*' : (cell.execution_count ?? ' ')}]:`;
      el.appendChild(prompt);
    }

    const content = document.createElement('div');
    content.className = 'nb-cell-content';

    if (type === 'markdown') {
      content.appendChild(this.foldHead(index, 'md', 'nb-tag-md', 'MARKDOWN', () => this.liveSource(index)));
      const toggle = document.createElement('div');
      toggle.className = 'nb-md-toggle';
      const editBtn = document.createElement('button');
      editBtn.className = 'nb-fold nb-md-tab';
      editBtn.textContent = 'Edit';
      const prevBtn = document.createElement('button');
      prevBtn.className = 'nb-fold nb-md-tab';
      prevBtn.textContent = 'Preview';
      toggle.appendChild(editBtn);
      toggle.appendChild(prevBtn);
      content.appendChild(toggle);
      const body = document.createElement('div');
      body.className = 'nb-foldable';
      const preview = document.createElement('div');
      preview.className = 'nb-markdown-preview';
      preview.innerHTML = renderMarkdown(cell.source);
      const ta = this.makeEditor(index, this.sourceText(cell));
      body.appendChild(preview);
      body.appendChild(ta);
      const editing = this.mdEditing.has(index);
      preview.style.display = editing ? 'none' : '';
      ta.style.display = editing ? '' : 'none';
      editBtn.classList.toggle('active', editing);
      prevBtn.classList.toggle('active', !editing);
      editBtn.onclick = () => {
        this.mdEditing.add(index);
        this.renderCells();
        const box = this.$cells?.querySelector(`[data-index="${index}"] .nb-edit`) as HTMLTextAreaElement | null;
        box?.focus();
      };
      prevBtn.onclick = () => {
        this.mdEditing.delete(index);
        this.renderCells();
      };
      content.appendChild(body);
      this.applyFoldState(index, 'md', body);
    } else {
      content.appendChild(this.foldHead(index, 'in', type === 'code' ? 'nb-tag-in' : 'nb-tag-raw', type === 'code' ? 'IN' : 'RAW', () => this.liveSource(index)));
      const body = document.createElement('div');
      body.className = 'nb-foldable';
      body.appendChild(this.makeEditor(index, this.sourceText(cell)));
      content.appendChild(body);
      this.applyFoldState(index, 'in', body);
    }

    el.appendChild(content);

    if (type === 'code' && cell.outputs?.length) {
      el.appendChild(this.foldHead(index, 'out', 'nb-tag-out', 'OUT', () => outputsText(this.data.cells[index]?.outputs ?? [])));
      const outEl = document.createElement('div');
      outEl.className = 'nb-outputs nb-foldable';
      outEl.innerHTML = renderOutputs(cell.outputs);
      el.appendChild(outEl);
      this.applyFoldState(index, 'out', outEl);
    }
    return el;
  }

  private sourceText(cell: Cell): string {
    return Array.isArray(cell.source) ? cell.source.join('') : String(cell.source ?? '');
  }

  private liveSource(index: number): string {
    const cell = this.data.cells[index];
    return cell ? this.sourceText(cell) : '';
  }

  private makeEditor(index: number, value: string): HTMLTextAreaElement {
    const ta = document.createElement('textarea');
    ta.className = 'nb-code nb-edit';
    ta.value = value;
    ta.rows = Math.min(20, Math.max(3, value.split('\n').length));
    ta.setAttribute('aria-label', `Edit cell ${index + 1}`);
    ta.spellcheck = false;
    requestAnimationFrame(() => this.fitEditor(ta));
    ta.addEventListener('input', () => {
      const cell = this.data.cells[index];
      if (!cell) return;
      cell.source = [ta.value];
      this.fitEditor(ta);
      if (cell.cell_type === 'markdown') this.refreshMarkdownPreview(index, ta.value);
      this.scheduleSave();
    });
    ta.addEventListener('blur', () => this.commitEdit());
    return ta;
  }

  private fitEditor(ta: HTMLTextAreaElement): void {
    try {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    } catch { /* ignore */ }
  }

  private scheduleSave(): void {
    if (this.saveTimer) clearTimeout(this.saveTimer);
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      void this.notifyChange();
    }, 800);
  }

  private commitEdit(): void {
    if (this.saveTimer) {
      clearTimeout(this.saveTimer);
      this.saveTimer = null;
      void this.notifyChange();
    }
  }

  private refreshMarkdownPreview(index: number, text: string): void {
    try {
      const preview = this.$cells?.querySelector(`[data-index="${index}"] .nb-markdown-preview`);
      if (preview) preview.innerHTML = renderMarkdown([text]);
    } catch { /* preview refresh is best-effort */ }
  }

  private async copyBlock(text: string, what: string): Promise<void> {
    const ok = await copyText(text);
    showToast(ok ? `Copied ${what}` : 'Copy failed');
  }

  private foldKey(index: number, part: string): string {
    return `${index}:${part}`;
  }

  private foldHead(index: number, part: string, tagClass: string, label: string, copyText: string | (() => string) | null): HTMLElement {
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
    if (copyText !== null) {
      const copyBtn = document.createElement('button');
      copyBtn.className = 'nb-fold nb-copy';
      copyBtn.textContent = 'Copy';
      copyBtn.title = `Copy ${label.toLowerCase()}`;
      copyBtn.setAttribute('aria-label', `Copy ${label.toLowerCase()}`);
      copyBtn.onclick = () => void this.copyBlock(typeof copyText === 'function' ? copyText() : copyText, label.toLowerCase());
      const left = document.createElement('span');
      left.className = 'nb-foldleft';
      left.appendChild(btn);
      left.appendChild(tag);
      head.appendChild(left);
      head.appendChild(copyBtn);
    }
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

export type { CellType };
