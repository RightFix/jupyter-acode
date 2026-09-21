import { sanitizeMarkdown } from './sanitize';

export function renderMarkdown(source: string[]): string {
  const text = Array.isArray(source) ? source.join('') : String(source ?? '');
  try {
    const html = (globalThis as any).marked?.parse?.(text) ?? text;
    return sanitizeMarkdown(html);
  } catch {
    return text;
  }
}
