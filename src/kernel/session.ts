import { Output } from '../types';

export class PythonSession {
  private pythonPath: string;
  private terminalId: string | null = null;

  constructor(pythonPath: string = 'python3') {
    this.pythonPath = pythonPath;
  }

  async start(): Promise<void> {
    const terminal = acode.require('terminal') as TerminalModule;
    const t = await terminal.create({ name: 'Jupyter Kernel' });
    this.terminalId = t.id;
    await terminal.write(this.terminalId, 'python3 -i\r\n');
  }

  async stop(): Promise<void> {
    try {
      if (this.terminalId) {
        const terminal = acode.require('terminal') as TerminalModule;
        await terminal.write(this.terminalId, 'exit()\r\n');
      }
    } catch { /* ignore */ }
    this.terminalId = null;
  }

  async restart(): Promise<void> {
    await this.stop();
    await this.start();
  }

  async run(code: string): Promise<{ outputs: Output[]; execution_count: number | null }> {
    if (!this.terminalId) {
      return {
        outputs: [{ output_type: 'error', evalue: 'Kernel not started', traceback: ['Start kernel first'] }],
        execution_count: null,
      };
    }
    try {
      const terminal = acode.require('terminal') as TerminalModule;
      await terminal.write(this.terminalId, code + '\nprint("__AKODE_DONE__")\r\n');
      return { outputs: [], execution_count: null };
    } catch (e) {
      return { outputs: [{ output_type: 'error', evalue: String(e), traceback: [String(e)] }], execution_count: null };
    }
  }

  isRunning(): boolean {
    return !!this.terminalId;
  }
}

let _execCount = 0;
export function nextExecCount(): number { return ++_execCount; }
export function resetExecCount(): void { _execCount = 0; }
