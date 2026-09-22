type ToastFn = (message: string, duration?: number) => void;

interface AcodeWithRequire {
  require(module: string): unknown;
}

function getAcode(): AcodeWithRequire | undefined {
  try {
    const g = globalThis as unknown as { acode?: AcodeWithRequire };
    return g.acode;
  } catch {
    return undefined;
  }
}

/**
 * Documented toast path: `acode.require('toast')` with a
 * `window.toast` fallback. The global `acode` object itself
 * has no `toast` member per the official plugin types.
 */
export function showToast(message: string, duration = 2000): void {
  try {
    const mod = getAcode()?.require('toast') as ToastFn | undefined;
    if (typeof mod === 'function') {
      mod(message, duration);
      return;
    }
  } catch { /* fall through to window.toast */ }
  try {
    const w = window as Window & { toast?: ToastFn };
    if (typeof w.toast === 'function') w.toast(message, duration);
  } catch { /* toast unavailable — stay silent */ }
}

export async function copyText(text: string): Promise<boolean> {
  try {
    const nav = navigator as Navigator & { clipboard?: { writeText(t: string): Promise<void> } };
    if (nav.clipboard && typeof nav.clipboard.writeText === 'function') {
      await nav.clipboard.writeText(text);
      return true;
    }
  } catch { /* fall through to execCommand */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.cssText = 'position:fixed;opacity:0;';
    document.body.appendChild(ta);
    if (typeof ta.select === 'function') ta.select();
    const doc = document as Document & { execCommand?(cmd: string): boolean };
    const ok = typeof doc.execCommand === 'function' ? doc.execCommand('copy') : true;
    ta.remove();
    return ok !== false;
  } catch {
    return false;
  }
}
