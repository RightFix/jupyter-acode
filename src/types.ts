export type CellType = 'code' | 'markdown' | 'raw';

export interface Output {
  output_type: 'execute_result' | 'display_data' | 'stream' | 'error';
  name?: string;
  text?: string | string[];
  data?: Record<string, string | string[]>;
  metadata?: Record<string, unknown>;
  execution_count?: number | null;
  traceback?: string[];
  evalue?: string;
}

export interface Cell {
  cell_type: CellType;
  source: string[];
  metadata: Record<string, unknown>;
  outputs?: Output[];
  execution_count?: number | null;
}

export interface NotebookData {
  cells: Cell[];
  metadata: Record<string, unknown>;
  nbformat: number;
  nbformat_minor: number;
}

export interface KernelResult {
  outputs: Output[];
  execution_count: number | null;
}
