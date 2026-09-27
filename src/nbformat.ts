import { NotebookData, Cell, CellType } from './types';

export function loadNotebook(json: string): NotebookData {
  const parsed = JSON.parse(json);
  if (!parsed || !Array.isArray(parsed.cells)) {
    throw new Error('Invalid notebook format: missing cells array');
  }
  return {
    cells: parsed.cells.map((c: Cell) => ({
      cell_type: c.cell_type || 'code',
      source: Array.isArray(c.source) ? c.source : [c.source ?? ''],
      metadata: c.metadata ?? {},
      outputs: c.outputs ?? (c.cell_type === 'code' ? [] : undefined),
      execution_count: c.execution_count ?? null,
    })),
    metadata: parsed.metadata ?? {},
    nbformat: parsed.nbformat ?? 4,
    nbformat_minor: parsed.nbformat_minor ?? 5,
  };
}

export function createCell(type: CellType = 'code'): Cell {
  if (type === 'markdown') {
    return { cell_type: 'markdown', source: [''], metadata: {} };
  }
  if (type === 'raw') {
    return { cell_type: 'raw', source: [''], metadata: {} };
  }
  return { cell_type: 'code', source: [''], metadata: {}, outputs: [], execution_count: null };
}

export function createBlankNotebook(): NotebookData {
  return {
    cells: [createCell('code')],
    metadata: {
      kernelspec: { display_name: 'Python 3', language: 'python', name: 'python3' },
      language_info: { name: 'python', version: '' },
    },
    nbformat: 4,
    nbformat_minor: 5,
  };
}

export function saveNotebook(data: NotebookData): string {
  const cells = data.cells.map((c) => {
    const base: Record<string, unknown> = {
      cell_type: c.cell_type,
      metadata: c.metadata ?? {},
      source: Array.isArray(c.source) ? c.source : [String(c.source ?? '')],
    };
    if (c.cell_type === 'code') {
      base.outputs = c.outputs ?? [];
      base.execution_count = c.execution_count ?? null;
    }
    return base;
  });
  return JSON.stringify(
    {
      cells,
      metadata: data.metadata ?? {},
      nbformat: data.nbformat ?? 4,
      nbformat_minor: data.nbformat_minor ?? 5,
    },
    null,
    1,
  );
}
