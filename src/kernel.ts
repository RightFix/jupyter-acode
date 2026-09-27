import { Output } from './types';
import { serverUrl } from './backend';

export interface ExecResult {
  output: string | null;
  display: Array<{ type: string; data: string }>;
  error: string | null;
  execution_count: number;
  execution_time: number;
}

async function post(path: string, body: Record<string, unknown>): Promise<{ status: number; json: any }> {
  const res = await fetch(`${serverUrl()}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  let json: any = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

/** Map a simplified py-runner result to nbformat outputs. */
export function toOutputs(r: ExecResult): Output[] {
  const out: Output[] = [];
  if (r.output) {
    out.push({ output_type: 'stream', name: 'stdout', text: r.output });
  }
  const plain = r.display.filter((d) => d.type === 'text/plain' || d.type === 'text/html' || d.type === 'text/markdown');
  const images = r.display.filter((d) => d.type === 'image/png');
  if (plain.length) {
    const data: Record<string, string> = {};
    for (const d of plain) {
      if (d.type === 'text/plain' || d.type === 'text/html') data[d.type] = d.data;
      else data['text/plain'] = (data['text/plain'] ? `${data['text/plain']}\n` : '') + d.data;
    }
    out.push({ output_type: 'execute_result', data, metadata: {}, execution_count: r.execution_count });
  }
  for (const img of images) {
    out.push({ output_type: 'display_data', data: { 'image/png': img.data }, metadata: {} });
  }
  if (r.error) {
    const lines = r.error.split('\n');
    out.push({
      output_type: 'error',
      evalue: lines[lines.length - 1] || r.error,
      traceback: lines,
    });
  }
  return out;
}

/** One server-side Kernel bound to a notebook. Create lazily on first run. */
export class KernelSession {
  private sessionId: string | null = null;

  get id(): string | null { return this.sessionId; }

  async ensure(): Promise<void> {
    if (this.sessionId) return;
    const { status, json } = await post('/sessions', {});
    if (status !== 201 || !json?.session_id) {
      throw new Error(json?.error || `session create failed (${status})`);
    }
    this.sessionId = json.session_id;
  }

  async execute(code: string, timeout?: number): Promise<ExecResult> {
    await this.ensure();
    const { status, json } = await post('/execute', {
      session_id: this.sessionId,
      code,
      ...(timeout !== undefined ? { timeout } : {}),
    });
    if (status === 404) {
      // Server restarted — session gone. Recreate once and retry.
      this.sessionId = null;
      await this.ensure();
      const retry = await post('/execute', { session_id: this.sessionId, code });
      if (retry.status !== 200 || !retry.json) throw new Error(retry.json?.error || `execute failed (${retry.status})`);
      return retry.json as ExecResult;
    }
    if (status !== 200 || !json) throw new Error(json?.error || `execute failed (${status})`);
    return json as ExecResult;
  }

  async interrupt(): Promise<void> {
    if (!this.sessionId) return;
    await post('/interrupt', { session_id: this.sessionId });
  }

  async close(): Promise<void> {
    if (!this.sessionId) return;
    const sid = this.sessionId;
    this.sessionId = null;
    try {
      await fetch(`${serverUrl()}/sessions/${sid}`, { method: 'DELETE' });
    } catch { /* server gone — nothing to clean */ }
  }
}
