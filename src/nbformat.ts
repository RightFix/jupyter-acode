import { NotebookData, Cell } from './types';

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

export function saveNotebook(data: NotebookData): string {
  return JSON.stringify(
    {
      cells: data.cells,
      metadata: data.metadata,
      nbformat: data.nbformat,
      nbformat_minor: data.nbformat_minor,
    },
    null,
    2
  );
}
