import plugin from '../plugin.json';
import { marked } from 'marked';
import tag from 'html-tag-js';
import notebookStyles from './styles.css';

const CELL_TYPES = {
  CODE: 'code',
  MARKDOWN: 'markdown'
};

const PAIRS = {
  '(': ')', '[': ']', '{': '}', '"': '"', "'": "'", '`': '`'
};

const PYTHON_KEYWORDS = [
  'False', 'None', 'True', 'and', 'as', 'assert', 'async', 'await', 'break',
  'class', 'continue', 'def', 'del', 'elif', 'else', 'except', 'finally',
  'for', 'from', 'global', 'if', 'import', 'in', 'is', 'lambda', 'nonlocal',
  'not', 'or', 'pass', 'raise', 'return', 'try', 'while', 'with', 'yield',
  'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set',
  'tuple', 'bool', 'type', 'open', 'input', 'sum', 'min', 'max', 'abs',
  'round', 'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter', 'all',
  'any', 'isinstance', 'issubclass', 'hasattr', 'getattr', 'setattr', 'delattr',
  'vars', 'dir', 'id', 'hex', 'oct', 'bin', 'ord', 'chr', 'ascii', 'repr',
  'format', 'divmod', 'pow', 'slice', 'property', 'staticmethod', 'classmethod'
];

const PYTHON_BUILTINS = [
  'print', 'len', 'range', 'str', 'int', 'float', 'list', 'dict', 'set',
  'tuple', 'bool', 'type', 'open', 'input', 'sum', 'min', 'max', 'abs',
  'round', 'sorted', 'reversed', 'enumerate', 'zip', 'map', 'filter',
  'help', 'dir', 'vars', 'type', 'id', 'isinstance', 'issubclass'
];

function escapeHtml(text) {
  if (Array.isArray(text)) text = text.join('');
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

function sanitizeHtml(html) {
  const temp = document.createElement('div');
  temp.textContent = html;
  return temp.innerHTML;
}

function sanitizeMarkdown(html) {
  const allowedTags = ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li', 
    'blockquote', 'pre', 'code', 'a', 'strong', 'em', 'b', 'i', 'table', 'thead', 
    'tbody', 'tr', 'th', 'td', 'hr', 'span', 'div', 'img'];
  const allowedAttrs = {
    'a': ['href', 'title'],
    'img': ['src', 'alt', 'title'],
    'code': ['class'],
    'span': ['class'],
    'div': ['class'],
    'td': ['colspan', 'rowspan'],
    'th': ['colspan', 'rowspan']
  };
  
  const temp = document.createElement('div');
  temp.innerHTML = html;
  
  const walk = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.remove();
      return;
    }
    
    const tagName = node.tagName.toLowerCase();
    if (!allowedTags.includes(tagName)) {
      const text = node.textContent;
      node.replaceWith(text);
      return;
    }
    
    const attrs = allowedAttrs[tagName] || [];
    for (const attr of node.attributes) {
      if (!attrs.includes(attr.name)) {
        node.removeAttribute(attr.name);
      }
    }
    
    if (tagName === 'a') {
      const href = node.getAttribute('href');
      if (href && !href.match(/^(https?:|mailto:|tel:)/i)) {
        node.removeAttribute('href');
      }
    }
    
    if (tagName === 'img') {
      const src = node.getAttribute('src');
      if (src && !src.match(/^data:/i) && !src.match(/^https?:/i)) {
        node.removeAttribute('src');
      }
    }
    
    Array.from(node.childNodes).forEach(walk);
  };
  
  Array.from(temp.childNodes).forEach(walk);
  return temp.innerHTML;
}

class JupyterNotebook {
  baseUrl = '';
  notebookData = null;
  currentFile = null;
  currentFileId = null;
  currentFileName = null;
  $container = null;
  $cells = null;
  selectedCellIndex = -1;
  isModified = false;
  notebooks = new Map();
  editorCommands = null;
  editorContainer = null;
  switchFileHook = null;
  actionStackId = null;
  actionStack = null;

  init(baseUrl) {
    this.baseUrl = baseUrl;
    try {
      this.actionStack = acode.require('actionStack');
    } catch (e) {
      console.warn('actionStack not available:', e);
    }
    
    const editor = this.getEditor();
    if (editor) {
      this.editorContainer = editorManager.container || document.querySelector('#editor');
    }
    
    this.registerCommands();
    this.registerFileHandler();
    this.setupEditorHooks();
  }

  getEditor() {
    // Try Ace editor first (legacy)
    if (editorManager.editor && editorManager.editor.commands) {
      this.editorCommands = editorManager.editor.commands;
      return editorManager.editor;
    }
    // Try CodeMirror (new version)
    if (window.cmEditor) {
      // CodeMirror uses acode.require('commands')
      return window.cmEditor;
    }
    // Fallback
    this.editorCommands = editorManager.editor?.commands;
    return editorManager.editor;
  }

  setupEditorHooks() {
    try {
      this.switchFileHook = (file) => {
        if (file && file.uri === this.currentFile) {
          this.showNotebookInEditor();
        } else {
          this.hideNotebookFromEditor();
        }
      };
      editorManager.on('switch-file', this.switchFileHook);
    } catch (e) {
      console.warn('Could not register switch-file hook:', e);
    }
  }

  registerCommands() {
    const addCmd = (name, desc, exec) => {
      try {
        if (editorManager.isCodeMirror) {
          const cmds = acode.require('commands');
          if (cmds) cmds.add(name, desc, exec);
        } else if (this.editorCommands) {
          this.editorCommands.addCommand({ name, description: desc, exec });
        }
      } catch (e) {
        console.warn(`Failed to add command ${name}:`, e);
      }
    };

    addCmd('open-notebook-viewer', 'Open Jupyter Notebook', () => this.openNotebookPicker());
    addCmd('add-code-cell', 'Add Code Cell', () => this.addCell(CELL_TYPES.CODE));
    addCmd('add-markdown-cell', 'Add Markdown Cell', () => this.addCell(CELL_TYPES.MARKDOWN));
    addCmd('delete-cell', 'Delete Cell', () => this.deleteCell());
    addCmd('move-cell-up', 'Move Cell Up', () => this.moveCell(-1));
    addCmd('move-cell-down', 'Move Cell Down', () => this.moveCell(1));
    addCmd('save-notebook', 'Save Notebook', () => this.saveNotebook());
    addCmd('run-cell', 'Run Cell', () => this.runCell(this.selectedCellIndex));
    addCmd('run-all-cells', 'Run All Cells', () => this.runAllCells());
    addCmd('toggle-cell-type', 'Toggle Cell Type', () => this.toggleCellType());
  }

  registerFileHandler() {
    acode.registerFileHandler(plugin.id, {
      extensions: ['ipynb'],
      handleFile: async (fileInfo) => {
        await this.openNotebookFile(fileInfo.uri, fileInfo.name);
      }
    });
  }

  async openNotebookPicker() {
    try {
      const result = await acode.fileBrowser('file', 'Select notebook');
      if (result && result.url) {
        await this.openNotebookFile(result.url, result.filename || 'notebook.ipynb');
      }
    } catch (error) {
      acode.alert('Error', error.message);
    }
  }

  async openNotebookFile(uri, filename) {
    let loader;
    try {
      this.currentFile = uri;
      this.currentFileName = filename || 'notebook.ipynb';
      this.selectedCellIndex = -1;
      this.isModified = false;

      loader = acode.loader('Loading...', 'Please wait');
      loader.show();

      const fs = acode.fsOperation(uri);
      let content;
      try {
        content = await fs.readFile('utf-8');
      } catch (err) {
        throw new Error(`Failed to read file: ${err.message}`);
      }
      
      let notebookData;
      try {
        notebookData = JSON.parse(content);
      } catch (err) {
        throw new Error(`Invalid JSON: ${err.message}`);
      }

      if (!notebookData || !Array.isArray(notebookData.cells)) {
        throw new Error('Invalid notebook format: missing cells array');
      }

      this.notebookData = notebookData;
      loader.hide();

      this.render();

    } catch (error) {
      if (loader) loader.hide();
      acode.alert('Error', `Failed to open: ${error.message}`);
    }
  }

  render() {
    const existing = document.querySelector('.jupyter-notebook-wrapper');
    if (existing) existing.remove();

    if (this.actionStackId && this.actionStack) {
      this.actionStack.remove(this.actionStackId);
      this.actionStackId = `jupyter-${Date.now()}`;
      this.actionStack.push({
        id: this.actionStackId,
        action: () => {
          if (this.$container) {
            this.$container.remove();
            this.$container = null;
          }
          this.showEditor();
          if (this.currentFile) {
            this.notebookData = null;
            this.currentFile = null;
          }
        }
      });
    }

    const header = document.querySelector('header') || document.querySelector('.header') || document.querySelector('#header');
    const headerHeight = header ? header.offsetHeight : 44;
    const toolbarHeight = 50;

    const wrapper = tag('div', {
      className: 'jupyter-notebook-wrapper',
      style: {
        position: 'absolute',
        top: `${headerHeight}px`,
        left: '0',
        right: '0',
        bottom: '0',
        display: 'flex',
        flexDirection: 'column',
        background: 'var(--theme-surface, #fff)',
        zIndex: '1'
      }
    });

    const style = tag('style', { textContent: notebookStyles });
    wrapper.appendChild(style);

    const toolbar = tag('div', {
      className: 'nb-toolbar',
      style: {
        flexShrink: '0',
        height: `${toolbarHeight}px`,
        minHeight: `${toolbarHeight}px`
      },
      innerHTML: `
        <button class="nb-btn add-code">+ Code</button>
        <button class="nb-btn add-md">+ Markdown</button>
        <button class="nb-btn run-all">Run All</button>
        <button class="nb-btn move-up">↑ Up</button>
        <button class="nb-btn move-down">↓ Down</button>
        <button class="nb-btn toggle-type">↔ Type</button>
        <button class="nb-btn save">Save</button>
      `
    });
    toolbar.querySelector('.add-code').onclick = () => this.addCell(CELL_TYPES.CODE);
    toolbar.querySelector('.add-md').onclick = () => this.addCell(CELL_TYPES.MARKDOWN);
    toolbar.querySelector('.run-all').onclick = () => this.runAllCells();
    toolbar.querySelector('.move-up').onclick = () => this.moveCell(-1);
    toolbar.querySelector('.move-down').onclick = () => this.moveCell(1);
    toolbar.querySelector('.toggle-type').onclick = () => this.toggleCellType();
    toolbar.querySelector('.save').onclick = () => this.saveNotebook();
    wrapper.appendChild(toolbar);

    this.$cells = tag('div', { 
      className: 'nb-cells',
      style: {
        flex: '1',
        overflowY: 'auto',
        overflowX: 'hidden',
        WebkitOverflowScrolling: 'touch'
      }
    });
    this.renderCells();
    wrapper.appendChild(this.$cells);

    const main = document.querySelector('main') || document.body;
    main.appendChild(wrapper);
    this.$container = wrapper;

    this.hideEditor();
  }

  hideEditor() {
    const editorSection = document.querySelector('.editor-section');
    if (editorSection) {
      editorSection.style.display = 'none';
      return;
    }
    const aceEditor = document.getElementById('editor');
    if (aceEditor) aceEditor.style.display = 'none';
    const cmEditor = document.querySelector('.cm-editor');
    if (cmEditor) cmEditor.style.display = 'none';
    const editorsEl = document.getElementById('editors');
    if (editorsEl) editorsEl.style.display = 'none';
  }

  showEditor() {
    const editorSection = document.querySelector('.editor-section');
    if (editorSection) {
      editorSection.style.display = '';
      return;
    }
    const aceEditor = document.getElementById('editor');
    if (aceEditor) aceEditor.style.display = '';
    const cmEditor = document.querySelector('.cm-editor');
    if (cmEditor) cmEditor.style.display = '';
    const editorsEl = document.getElementById('editors');
    if (editorsEl) editorsEl.style.display = '';
  }

  showNotebookInEditor() {
    if (this.$container) {
      this.$container.style.display = '';
      this.hideEditor();
    }
  }

  hideNotebookFromEditor() {
    if (this.$container) {
      this.$container.style.display = 'none';
      this.showEditor();
    }
  }

  renderCells() {
    if (!this.$cells) return;
    
    this.$cells.innerHTML = '';

    if (!this.notebookData?.cells?.length) {
      this.$cells.innerHTML = '<div class="nb-empty">No cells. Add a cell to start.</div>';
      return;
    }

    this.notebookData.cells.forEach((cell, index) => {
      const cellEl = this.createCellElement(cell, index);
      this.$cells.appendChild(cellEl);
    });
  }

  createCellElement(cell, index) {
    const isSelected = index === this.selectedCellIndex;
    const cellType = cell.cell_type || 'code';
    const cellEl = tag('div', {
      className: `nb-cell nb-${cellType}${isSelected ? ' selected' : ''}`,
      dataset: { index }
    });

    // Cell actions
    const actions = tag('div', {
      className: 'nb-cell-actions',
      innerHTML: `<span class="nb-run">▶</span><span class="nb-delete">×</span>`
    });
    actions.querySelector('.nb-run').onclick = (e) => { e.stopPropagation(); this.runCell(index); };
    actions.querySelector('.nb-delete').onclick = (e) => { e.stopPropagation(); this.deleteCell(index); };
    cellEl.appendChild(actions);

    // Prompt
    if (cellType === 'code') {
      const execCount = cell.execution_count || ' ';
      const prompt = tag('div', {
        className: 'nb-prompt',
        innerHTML: `In&nbsp;[${execCount}]:`
      });
      cellEl.appendChild(prompt);
    }

    // Content
    const content = tag('div', { className: 'nb-cell-content' });

    if (cellType === 'markdown') {
      const preview = tag('div', { className: 'nb-markdown-preview' });
      try {
        preview.innerHTML = sanitizeMarkdown(marked.parse(this.getSource(cell.source)));
      } catch (e) {
        preview.textContent = this.getSource(cell.source);
      }

      const editor = tag('textarea', {
        className: 'nb-editor',
        value: this.getSource(cell.source),
        style: { display: 'none' },
        spellcheck: false
      });

      content.appendChild(preview);
      content.appendChild(editor);

      preview.onclick = () => {
        preview.style.display = 'none';
        editor.style.display = 'block';
        editor.focus();
      };
      editor.onblur = () => {
        editor.style.display = 'none';
        preview.style.display = 'block';
        try {
          preview.innerHTML = sanitizeMarkdown(marked.parse(editor.value));
        } catch (e) {
          preview.textContent = editor.value;
        }
        cell.source = editor.value.split('\n');
        this.isModified = true;
      };
      this.setupEditor(editor, index);
    } else {
      const editor = tag('textarea', {
        className: 'nb-editor nb-code-editor',
        value: this.getSource(cell.source),
        spellcheck: false
      });
      content.appendChild(editor);
      editor.onfocus = () => this.selectCell(index);
      editor.oninput = () => {
        const lines = editor.value.split('\n');
        if (lines.length === 1 && lines[0] === '') {
          cell.source = [];
        } else {
          cell.source = lines;
        }
        this.isModified = true;
      };
      this.setupEditor(editor, index);
    }

    cellEl.appendChild(content);

    // Outputs
    if (cellType === 'code' && cell.outputs?.length) {
      const outputsEl = tag('div', { className: 'nb-outputs' });
      cell.outputs.forEach(output => {
        outputsEl.appendChild(tag('div', {
          className: 'nb-output',
          innerHTML: this.renderOutput(output)
        }));
      });
      cellEl.appendChild(outputsEl);
    }

    cellEl.onclick = () => this.selectCell(index);

    return cellEl;
  }

  setupEditor(editor, cellIndex) {
    editor.addEventListener('keydown', (e) => {
      const start = editor.selectionStart;
      const end = editor.selectionEnd;
      const val = editor.value;

      if (e.key === 'Tab') {
        e.preventDefault();
        editor.value = val.substring(0, start) + '    ' + val.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 4;
        return;
      }

      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        const cell = this.notebookData?.cells?.[cellIndex ?? this.selectedCellIndex];
        if (cell?.cell_type === 'code') {
          this.runCell(cellIndex ?? this.selectedCellIndex);
        }
        return;
      }

      if (PAIRS[e.key]) {
        e.preventDefault();
        const closing = PAIRS[e.key];
        const selected = val.substring(start, end);
        editor.value = val.substring(0, start) + e.key + selected + closing + val.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 1;
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();
        const lineStart = val.lastIndexOf('\n', start - 1) + 1;
        const line = val.substring(lineStart, start);
        const indent = line.match(/^\s*/)[0];
        let extra = '';
        if (line.trim().endsWith(':')) extra = '    ';
        editor.value = val.substring(0, start) + '\n' + indent + extra + val.substring(end);
        editor.selectionStart = editor.selectionEnd = start + 1 + indent.length + extra.length;
        return;
      }

      if (e.key === 'Backspace' && start > 0) {
        const before = val.substring(start - 1, start);
        const after = val.substring(start, start + 1);
        if (PAIRS[before] === after) {
          e.preventDefault();
          editor.value = val.substring(0, start - 1) + val.substring(start + 1);
          editor.selectionStart = editor.selectionEnd = start - 1;
        }
        return;
      }
    });

    editor.addEventListener('input', () => {
      this.showIntellisense(editor, cellIndex ?? this.selectedCellIndex);
    });

    editor.addEventListener('blur', () => {
      setTimeout(() => this.hideIntellisense(), 200);
    });
  }

  showIntellisense(editor, cellIndex) {
    const pos = editor.selectionStart;
    const val = editor.value;
    const textBefore = val.substring(0, pos);
    const match = textBefore.match(/([a-zA-Z_][a-zA-Z0-9_]*)$/);
    
    if (!match) {
      this.hideIntellisense();
      return;
    }
    
    const prefix = match[1];
    if (prefix.length < 2) {
      this.hideIntellisense();
      return;
    }
    
    const suggestions = [...PYTHON_KEYWORDS, ...PYTHON_BUILTINS]
      .filter(w => w.toLowerCase().startsWith(prefix.toLowerCase()))
      .slice(0, 10);
    
    if (suggestions.length === 0) {
      this.hideIntellisense();
      return;
    }
    
    let $popup = document.querySelector('.nb-intellisense');
    if (!$popup) {
      $popup = tag('div', { className: 'nb-intellisense' });
      document.body.appendChild($popup);
    }
    
    const rect = editor.getBoundingClientRect();
    const lineHeight = 20;
    const lines = val.substring(0, pos).split('\n');
    const currentLine = lines.length;
    const charPos = lines[lines.length - 1].length;
    
    $popup.style.cssText = `
      position: fixed;
      top: ${rect.top + (currentLine * lineHeight) + 30}px;
      left: ${rect.left + (charPos * 8)}px;
      background: var(--theme-surface, #fff);
      border: 1px solid var(--theme-border, #ccc);
      border-radius: 4px;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      max-height: 200px;
      overflow-y: auto;
      z-index: 10000;
      min-width: 150px;
    `;
    
    $popup.innerHTML = '';
    suggestions.forEach((sug, i) => {
      const item = tag('div', {
        className: 'nb-intellisense-item' + (i === 0 ? ' selected' : ''),
        textContent: sug,
        style: {
          padding: '6px 10px',
          cursor: 'pointer',
          fontFamily: 'Consolas, monospace',
          fontSize: '13px'
        }
      });
      item.onclick = () => {
        const newVal = val.substring(0, pos - prefix.length) + sug + val.substring(pos);
        editor.value = newVal;
        editor.selectionStart = editor.selectionEnd = pos - prefix.length + sug.length;
        this.hideIntellisense();
        this.isModified = true;
      };
      $popup.appendChild(item);
    });
    
    this.currentIntellisense = { popup: $popup, editor, prefix };
  }

  hideIntellisense() {
    const $popup = document.querySelector('.nb-intellisense');
    if ($popup) $popup.remove();
    this.currentIntellisense = null;
  }

  getSource(source) {
    if (typeof source === 'string') return source;
    if (Array.isArray(source)) return source.join('');
    return '';
  }

  renderOutput(output) {
    if (output.output_type === 'stream') {
      const text = Array.isArray(output.text) ? output.text.join('') : output.text;
      return `<pre>${escapeHtml(text || '')}</pre>`;
    }
    if (output.output_type === 'error') {
      return `<pre class="nb-error">${escapeHtml(output.traceback?.join('\n') || output.evalue)}</pre>`;
    }
    if (output.data) {
      if (output.data['image/png']) {
        const imgData = Array.isArray(output.data['image/png']) 
          ? output.data['image/png'].join('') 
          : output.data['image/png'];
        return `<div class="nb-output-img"><img src="data:image/png;base64,${imgData}" alt="output" /></div>`;
      }
      if (output.data['image/svg+xml']) {
        const svgData = Array.isArray(output.data['image/svg+xml']) 
          ? output.data['image/svg+xml'].join('') 
          : output.data['image/svg+xml'];
        return `<div class="nb-output-img"><img src="data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(svgData)))}" alt="output" /></div>`;
      }
      if (output.data['text/html']) {
        const html = Array.isArray(output.data['text/html']) 
          ? output.data['text/html'].join('') 
          : output.data['text/html'];
        return `<div class="nb-output-html">${sanitizeHtml(html)}</div>`;
      }
      if (output.data['text/plain']) {
        const text = Array.isArray(output.data['text/plain']) 
          ? output.data['text/plain'].join('') 
          : output.data['text/plain'];
        return `<pre>${escapeHtml(text)}</pre>`;
      }
    }
    if (output.png) {
      return `<div class="nb-output-img"><img src="data:image/png;base64,${output.png}" alt="output" /></div>`;
    }
    return '';
  }

  selectCell(index) {
    this.selectedCellIndex = index;
    if (!this.$cells) return;
    const cells = this.$cells.querySelectorAll('.nb-cell');
    cells.forEach((cell, i) => {
      cell.classList.toggle('selected', i === index);
    });
  }

  addCell(type) {
    if (!this.notebookData) {
      this.notebookData = { cells: [], metadata: {}, nbformat: 4, nbformat_minor: 5 };
    }

    const newCell = {
      cell_type: type,
      source: [],
      metadata: {},
      outputs: type === 'code' ? [] : undefined,
      execution_count: type === 'code' ? null : undefined
    };

    const insertIndex = this.selectedCellIndex >= 0 ? this.selectedCellIndex + 1 : this.notebookData.cells.length;
    this.notebookData.cells.splice(insertIndex, 0, newCell);

    this.renderCells();
    this.selectCell(insertIndex);
    this.isModified = true;

    setTimeout(() => {
      if (!this.$cells) return;
      const editor = this.$cells.querySelector(`[data-index="${insertIndex}"] .nb-editor`);
      if (editor) editor.focus();
    }, 50);
  }

  deleteCell(index = this.selectedCellIndex) {
    if (!this.notebookData || this.notebookData.cells.length <= 1) {
      acode.alert('Cannot Delete', 'Need at least one cell');
      return;
    }
    if (index < 0) return;
    
    this.notebookData.cells.splice(index, 1);
    this.renderCells();
    this.selectCell(Math.min(index, (this.notebookData.cells.length || 1) - 1));
    this.isModified = true;
  }

  moveCell(direction) {
    if (!this.notebookData || this.selectedCellIndex < 0) return;
    
    const newIndex = this.selectedCellIndex + direction;
    if (newIndex < 0 || newIndex >= this.notebookData.cells.length) return;
    
    const cells = this.notebookData.cells;
    const temp = cells[newIndex];
    cells[newIndex] = cells[this.selectedCellIndex];
    cells[this.selectedCellIndex] = temp;
    
    this.selectCell(newIndex);
    this.renderCells();
    this.isModified = true;
  }

  toggleCellType() {
    if (!this.notebookData || this.selectedCellIndex < 0) return;
    
    const cell = this.notebookData.cells[this.selectedCellIndex];
    if (!cell) return;
    
    const currentType = cell.cell_type || 'code';
    const newType = currentType === 'code' ? 'markdown' : 'code';
    
    cell.cell_type = newType;
    if (newType === 'code') {
      cell.outputs = [];
      cell.execution_count = null;
    } else {
      delete cell.outputs;
      delete cell.execution_count;
    }
    
    this.renderCells();
    this.isModified = true;
  }

  async runCell(index) {
    const cell = this.notebookData.cells[index];
    if (!cell || cell.cell_type !== 'code') return;

    const cellEl = this.$cells.querySelector(`[data-index="${index}"]`);
    if (!cellEl) return;

    const prompt = cellEl.querySelector('.nb-prompt');
    if (prompt) prompt.innerHTML = 'In&nbsp;[*]:';

    const outputsEl = cellEl.querySelector('.nb-outputs');
    if (outputsEl) outputsEl.remove();

    const content = cellEl.querySelector('.nb-cell-content');
    const editor = content.querySelector('.nb-editor');
    const code = editor.value.trim();

    if (!code) return;

    const newOutputs = tag('div', { className: 'nb-outputs' });
    newOutputs.innerHTML = '<div class="nb-output nb-running">Running...</div>';
    cellEl.appendChild(newOutputs);

    try {
      const result = await this.executeCode(code);
      cell.outputs = result.outputs || [];
      cell.execution_count = result.execution_count || Date.now();

      if (prompt) prompt.innerHTML = `In&nbsp;[${cell.execution_count}]:`;

      newOutputs.innerHTML = '';
      cell.outputs.forEach(output => {
        newOutputs.appendChild(tag('div', {
          className: 'nb-output',
          innerHTML: this.renderOutput(output)
        }));
      });

      this.isModified = true;
    } catch (error) {
      newOutputs.innerHTML = `<div class="nb-output nb-error">${escapeHtml(error.message)}</div>`;
    }
  }

  async runAllCells() {
    if (!this.notebookData?.cells) return;
    
    const codeCells = this.notebookData.cells
      .map((c, i) => (c.cell_type || 'code') === 'code' ? i : -1)
      .filter(i => i >= 0);

    for (const index of codeCells) {
      await this.runCell(index);
    }
  }

  async executeCode(code) {
    if (typeof Executor === 'undefined') {
      return {
        outputs: [{
          output_type: 'error',
          evalue: 'Terminal not available. Install Acode Terminal plugin.',
          traceback: ['Executor not found - Please install Acode Terminal from plugins']
        }],
        execution_count: null
      };
    }

    try {
      let result;
      const singleLineCode = code.replace(/\n/g, '; ');
      
      result = await Executor.execute(`python3 -c "${singleLineCode}" 2>&1`, true);
      
      if (result && (result.includes('SyntaxError') || result.includes('EOF in multi-line') || result.includes('IndentationError'))) {
        const base64Code = btoa(unescape(encodeURIComponent(code)));
        result = await Executor.execute(`printf '%s\\n' "${base64Code}" | base64 -d | python3 2>&1`, true);
      }

      if (!result || result.trim() === '') {
        return {
          outputs: [{
            output_type: 'stream',
            text: '[No output]'
          }],
          execution_count: Date.now()
        };
      }

      const errorPatterns = [
        'not found', 'command not found', "can't find", 'No such file',
        'permission denied', 'cannot execute', 'bad interpreter'
      ];
      if (errorPatterns.some(p => result.toLowerCase().includes(p))) {
        return {
          outputs: [{
            output_type: 'error',
            evalue: 'Python not installed',
            traceback: ['Install Python: apk add python3 in terminal']
          }],
          execution_count: null
        };
      }

      if (result.includes('Traceback') || result.includes('Error:')) {
        return {
          outputs: [{
            output_type: 'error',
            evalue: result.split('\n').pop() || 'Execution failed',
            traceback: result.split('\n')
          }],
          execution_count: null
        };
      }

      return {
        outputs: [{
          output_type: 'stream',
          text: result
        }],
        execution_count: Date.now()
      };
    } catch (error) {
      return {
        outputs: [{
          output_type: 'error',
          evalue: error.message,
          traceback: [error.message]
        }],
        execution_count: null
      };
    }
  }

  async saveNotebook() {
    if (!this.currentFile) {
      acode.alert('Info', 'Cannot save: no file path');
      return;
    }

    try {
      const fs = acode.fsOperation(this.currentFile);
      await fs.writeFile(JSON.stringify(this.notebookData, null, 2));
      this.isModified = false;
      if (acode.toast) acode.toast('Saved!', 2000);
    } catch (error) {
      acode.alert('Error', `Failed to save: ${error.message}`);
    }
  }

  destroy() {
    const commands = this.editorCommands || editorManager.editor?.commands;
    const commandNames = [
      'open-notebook-viewer', 'add-code-cell', 'add-markdown-cell',
      'delete-cell', 'move-cell-up', 'move-cell-down', 'save-notebook',
      'run-cell', 'run-all-cells', 'toggle-cell-type'
    ];
    if (commands) {
      commandNames.forEach(name => {
        try { commands.removeCommand(name); } catch (e) {}
      });
    }
    acode.unregisterFileHandler(plugin.id);

    if (this.switchFileHook) {
      try { editorManager.off('switch-file', this.switchFileHook); } catch (e) {}
    }

    if (this.actionStackId && this.actionStack) {
      this.actionStack.remove(this.actionStackId);
    }

    this.hideIntellisense();

    if (this.$container) {
      this.$container.remove();
    }
    this.showEditor();
  }
}

if (window.acode) {
  const jupyterPlugin = new JupyterNotebook();

  acode.setPluginInit(plugin.id, (baseUrl) => {
    if (!baseUrl.endsWith('/')) baseUrl += '/';
    jupyterPlugin.init(baseUrl);
  });

  acode.setPluginUnmount(plugin.id, () => {
    jupyterPlugin.destroy();
  });
}
