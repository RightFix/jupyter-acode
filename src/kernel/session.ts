import helperSource from './helper.py';
import { KernelResult, Output } from '../types';

const PING_TIMEOUT_MS = 10000;
const DEFAULT_RUN_TIMEOUT_MS = 120000;

interface PendingRequest {
  resolve: (result: KernelResult) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

function encodeBase64(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

function shellQuote(path: string): string {
  return "'" + path.replace(/'/g, "'\\''") + "'";
}

export class PythonSession {
  private uuid: string | null = null;
  private workDir: string | null = null;
  private nextId = 0;
  private pending = new Map<number, PendingRequest>();
  private lineBuffer = '';
  private queue: Promise<void> = Promise.resolve();
  private starting: Promise<void> | null = null;
  private runTimeoutMs = DEFAULT_RUN_TIMEOUT_MS;

  isRunning(): boolean {
    return this.uuid !== null;
  }

  setRunTimeout(ms: number): void {
    this.runTimeoutMs = ms;
  }

  async start(): Promise<void> {
    if (this.uuid) return;
    if (this.starting) return this.starting;
    this.starting = this.doStart();
    try {
      await this.starting;
    } finally {
      this.starting = null;
    }
  }

  async stop(): Promise<void> {
    this.failAllPending(new Error('Kernel stopped'));
    if (this.uuid && typeof Executor !== 'undefined') {
      try { await Executor.stop(this.uuid); } catch { /* ignore */ }
    }
    this.uuid = null;
    this.workDir = null;
    this.lineBuffer = '';
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async interrupt(): Promise<void> {
    await this.restart();
  }

  run(code: string): Promise<KernelResult> {
    const task = async (): Promise<KernelResult> => {
      await this.start();
      return this.sendRequest(code);
    };
    const result = this.queue.then(task);
    this.queue = result.then(() => undefined, () => undefined);
    return result;
  }

  static async isBackendAvailable(): Promise<{ ok: boolean; reason?: string }> {
    if (typeof Executor === 'undefined') {
      return { ok: false, reason: 'Terminal backend (Executor) not available. Open the Acode terminal once, then retry.' };
    }
    try {
      if (typeof Terminal !== 'undefined' && !(await Terminal.isInstalled())) {
        return { ok: false, reason: 'Alpine terminal environment is not installed. Open the Acode terminal to install it first.' };
      }
    } catch { /* non-fatal: fall through to python check */ }
    try {
      await Executor.execute('command -v python3', true);
      return { ok: true };
    } catch {
      return { ok: false, reason: 'python3 not found in the terminal. Run: apk add python3' };
    }
  }

  static async hasMatplotlib(): Promise<boolean> {
    if (typeof Executor === 'undefined') return false;
    try {
      await Executor.execute('python3 -c "import matplotlib"', true);
      return true;
    } catch {
      return false;
    }
  }

  private async doStart(): Promise<void> {
    if (typeof Executor === 'undefined') {
      throw new Error('Terminal backend (Executor) not available');
    }
    const dir = (await Executor.execute('mktemp -d /tmp/acode-jupyter-XXXXXX', true)).trim();
    if (!dir) throw new Error('Failed to create kernel working directory');
    this.workDir = dir;

    const helperB64 = encodeBase64(helperSource);
    await Executor.execute(
      `base64 -d > ${shellQuote(dir + '/helper.py')} <<'ACODE_JUPYTER_EOF'\n${helperB64}\nACODE_JUPYTER_EOF`,
      true,
    );

    const uuid = await Executor.start(
      `python3 -u ${shellQuote(dir + '/helper.py')}`,
      (type, data) => this.onData(type, data),
      true,
    );
    this.uuid = uuid;

    try {
      await this.ping(PING_TIMEOUT_MS);
    } catch (e) {
      await this.stop();
      throw new Error(`Kernel did not respond: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private onData(type: ExecutorOutputType, data: string): void {
    if (type === 'exit') {
      this.uuid = null;
      this.failAllPending(new Error(`Kernel process exited (${data})`));
      return;
    }
    if (type === 'stderr') return; // helper speaks JSON on stdout only
    this.lineBuffer += data;
    let idx: number;
    while ((idx = this.lineBuffer.indexOf('\n')) >= 0) {
      const line = this.lineBuffer.slice(0, idx).trim();
      this.lineBuffer = this.lineBuffer.slice(idx + 1);
      if (!line) continue;
      this.dispatchLine(line);
    }
  }

  private dispatchLine(line: string): void {
    let msg: { id?: number; status?: string; outputs?: Output[]; execution_count?: number | null };
    try {
      msg = JSON.parse(line);
    } catch {
      return; // stray terminal noise: ignore, framing stays intact
    }
    if (typeof msg.id !== 'number') return;
    const pending = this.pending.get(msg.id);
    if (!pending) return;
    this.pending.delete(msg.id);
    clearTimeout(pending.timer);
    if (msg.status === 'pong') {
      pending.resolve({ outputs: [], execution_count: null });
    } else {
      pending.resolve({
        outputs: msg.outputs ?? [],
        execution_count: msg.execution_count ?? null,
      });
    }
  }

  private failAllPending(err: Error): void {
    for (const [, p] of this.pending) {
      clearTimeout(p.timer);
      p.reject(err);
    }
    this.pending.clear();
  }

  private sendRaw(fields: Record<string, unknown>, timeoutMs: number): Promise<KernelResult> {
    if (!this.uuid || typeof Executor === 'undefined') {
      return Promise.reject(new Error('Kernel not started'));
    }
    const id = ++this.nextId;
    const line = JSON.stringify({ id, ...fields });
    const uuid = this.uuid;
    return new Promise<KernelResult>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('Kernel timed out — restarting'));
        void this.restart().catch(() => undefined);
      }, timeoutMs);
      this.pending.set(id, { resolve, reject, timer });
      Executor!.write(uuid, line + '\n').catch((e: unknown) => {
        this.pending.delete(id);
        clearTimeout(timer);
        reject(e instanceof Error ? e : new Error(String(e)));
      });
    });
  }

  private sendRequest(code: string): Promise<KernelResult> {
    return this.sendRaw({ code: encodeBase64(code) }, this.runTimeoutMs);
  }

  private ping(timeoutMs: number): Promise<void> {
    return this.sendRaw({ cmd: 'ping' }, timeoutMs).then(() => undefined);
  }
}
