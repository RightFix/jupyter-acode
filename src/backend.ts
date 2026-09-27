import { showToast } from './ui/toast';

/** Acode Executor API (terminal plugin): headless process execution. */
interface ExecutorApi {
  execute(command: string, alpine?: boolean): Promise<string>;
  start(command: string, onData: (type: string, data: unknown) => void, alpine?: boolean): Promise<string>;
  write(uuid: string, input: string): Promise<string>;
  stop(uuid: string): Promise<string>;
  isRunning(uuid: string): Promise<boolean>;
  listAllProcesses(): Promise<Array<{ pid: number; ppid: number; name: string; command: string }>>;
  killProcess(pid: number): Promise<string>;
}

const LS_URL = 'jupyter-acode:server-url';
const LS_INSTALLED = 'jupyter-acode:backend-installed';

const DEFAULT_URL = 'http://127.0.0.1:8000';
const HEALTH_TIMEOUT_MS = 3000;
const STARTUP_POLLS = 60;
const POLL_INTERVAL_MS = 500;

/** UUID of the headless server process we spawned (if any). */
let serverUuid: string | null = null;
/** In-flight startup shared by concurrent callers (double-tap guard). */
let starting: Promise<boolean> | null = null;
/** Rolling stderr of the server process for failure diagnosis. */
let serverOutput: string[] = [];

// ── settings (localStorage, plugin-scoped) ──────────────────────────────

function lsGet(key: string): string | null {
  try { return localStorage.getItem(key); } catch { return null; }
}

function lsSet(key: string, value: string): void {
  try { localStorage.setItem(key, value); } catch { /* ignore */ }
}

/** Base URL of py-runner-serve. */
export function serverUrl(): string {
  return lsGet(LS_URL) || DEFAULT_URL;
}

export function setServerUrl(url: string): void {
  lsSet(LS_URL, url.replace(/\/$/, ''));
}

// All commands run on the global interpreter (Alpine `python`).
const PYTHON_BIN = 'python';
const PIP_BIN = 'pip';

function serverPort(): number {
  try {
    const port = new URL(serverUrl()).port;
    return port ? Number(port) : 8000;
  } catch {
    return 8000;
  }
}

// ── executor access ─────────────────────────────────────────────────────

function getExecutor(): ExecutorApi | null {
  try {
    const g = globalThis as unknown as { Executor?: ExecutorApi };
    if (g.Executor && typeof g.Executor.execute === 'function') return g.Executor;
  } catch { /* ignore */ }
  return null;
}

function manualHint(command: string): void {
  try {
    acode.alert?.(
      'Manual step needed',
      `Headless execution is unavailable (Terminal plugin missing). Run this where python lives:\n\n${command}`,
    );
  } catch { /* ignore */ }
  showToast('Executor unavailable — see alert for manual command');
}

// ── health ──────────────────────────────────────────────────────────────

export async function serverHealthy(): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), HEALTH_TIMEOUT_MS);
    try {
      const res = await fetch(`${serverUrl()}/health`, { signal: ctrl.signal });
      if (!res.ok) return false;
      await res.json();
      return true;
    } finally {
      clearTimeout(timer);
    }
  } catch {
    return false;
  }
}

async function waitForServer(): Promise<boolean> {
  for (let i = 0; i < STARTUP_POLLS; i++) {
    if (await serverHealthy()) return true;
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
  return false;
}

// ── setup flows (all headless — no terminal tabs) ───────────────────────

/** Install py-runner-kernel into the global interpreter. */
export async function installBackend(): Promise<boolean> {
  const cmd = `${PIP_BIN} install -U py-runner-kernel`;
  try {
    const ok = await acode.confirm?.(
      'Install Python backend?',
      'This installs py-runner-kernel into the global python. Needs internet.',
    );
    if (!ok) return false;
  } catch { return false; }
  const ex = getExecutor();
  if (!ex) {
    manualHint(cmd);
    return false;
  }
  showToast('Installing backend…');
  try {
    await ex.execute(cmd, true);
  } catch (e) {
    showToast(`Install failed: ${String(e)}`, 4000);
    return false;
  }
  lsSet(LS_INSTALLED, '1');
  showToast('Backend installed!');
  return true;
}

/** Start py-runner-serve as a headless foreground process; wait until healthy. */
export async function startServer(): Promise<boolean> {
  if (await serverHealthy()) return true;
  // Double-tap guard: concurrent callers share one startup.
  if (starting) return starting;
  starting = startServerInner();
  try {
    return await starting;
  } finally {
    starting = null;
  }
}

async function startServerInner(): Promise<boolean> {
  if (await serverHealthy()) return true;
  const ex = getExecutor();
  if (!ex) {
    manualHint(`${PYTHON_BIN} -m py_runner.server --port ${serverPort()}`);
    return false;
  }
  // Reuse our own live process instead of spawning duplicates.
  try {
    if (serverUuid && await ex.isRunning(serverUuid)) {
      return waitForServer();
    }
  } catch { /* fall through to fresh start */ }
  serverUuid = null;
  serverOutput = [];
  showToast('Starting kernel server…');
  try {
    serverUuid = await ex.start(
      `${PYTHON_BIN} -m py_runner.server --port ${serverPort()}`,
      (type, data) => {
        if (type === 'exit') return;
        serverOutput.push(`[${type}] ${String(data)}`.replace(/\s+$/, ''));
        if (serverOutput.length > 20) serverOutput.shift();
      },
      true,
    );
  } catch (e) {
    showToast(`Server start failed: ${String(e)}`, 4000);
    return false;
  }
  void logProcessTree(ex);
  const up = await waitForServer();
  if (!up) {
    const tail = serverOutput.slice(-5).join('\n');
    let alive = false;
    try {
      const ex2 = getExecutor();
      alive = !!serverUuid && !!ex2 && await ex2.isRunning(serverUuid);
    } catch { /* ignore */ }
    const hint = alive
      ? 'Process is alive but unreachable — likely a stale pre-CORS server squatting the port. Kill py-runner processes and retry.'
      : 'No output captured — is python + py-runner-kernel installed?';
    try {
      acode.alert?.(
        'Server did not start',
        `py-runner-serve never became healthy.${tail ? `\n\nProcess output:\n${tail}` : `\n\n${hint}`}`,
      );
    } catch { /* ignore */ }
    showToast('Server did not start — details shown', 4000);
    return false;
  }
  showToast('Kernel server ready');
  return true;
}

/** One-shot diagnosis: what did our start actually spawn (sh wrapper? dupes?). */
async function logProcessTree(ex: ExecutorApi): Promise<void> {
  try {
    const all = await ex.listAllProcesses();
    const ours = all.filter((p) => /py_runner|py-runner/.test(p.command || ''));
    console.log('[jupyter] server-related processes:', JSON.stringify(ours));
  } catch { /* diagnostics only */ }
}

/** Stop the headless server process we spawned (if any). */
export async function stopServer(): Promise<void> {
  if (!serverUuid) return;
  const uuid = serverUuid;
  serverUuid = null;
  try {
    const ex = getExecutor();
    if (!ex) return;
    if (await ex.isRunning(uuid)) await ex.stop(uuid);
    // Kill hygiene: if the python child outlived its shell parent, reap by pid.
    if (await ex.isRunning(uuid)) {
      const all = await ex.listAllProcesses();
      const strays = all.filter((p) => /py_runner\.server/.test(p.command || ''));
      for (const p of strays) {
        try { await ex.killProcess(p.pid); } catch { /* ignore */ }
      }
    }
  } catch { /* already gone */ }
}

/**
 * Full gate before any execution: healthy server, installing +
 * starting it under the hood as needed. Returns false when the
 * user must intervene.
 */
export async function ensureBackend(): Promise<boolean> {
  if (await serverHealthy()) return true;
  if (!lsGet(LS_INSTALLED)) {
    const installed = await installBackend();
    if (!installed) return false;
  }
  return startServer();
}

/** First-install flow: prompt once on plugin download, install globally. */
export async function autoInstallBackend(firstInit: boolean): Promise<void> {
  if (!firstInit || lsGet(LS_INSTALLED)) return;
  try {
    await installBackend();
  } catch { /* stay silent — commands remain available */ }
}
