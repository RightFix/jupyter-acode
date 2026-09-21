import { Output } from '../types';

export function escapeHtml(text: string): string {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

export function renderOutput(output: Output): string {
  if (output.output_type === 'stream') {
    const text = Array.isArray(output.text) ? output.text.join('') : (output.text ?? '');
    return `<pre>${escapeHtml(text)}</pre>`;
  }
  if (output.output_type === 'error') {
    return `<pre class="nb-error">${escapeHtml((output.traceback?.join('\n') ?? output.evalue ?? ''))}</pre>`;
  }
  if (output.data) {
    if (output.data['image/png']) {
      const img = Array.isArray(output.data['image/png']) ? output.data['image/png'].join('') : output.data['image/png'];
      return `<div class="nb-output-img"><img src="data:image/png;base64,${img}" alt="output" /></div>`;
    }
    if (output.data['image/svg+xml']) {
      const svg = Array.isArray(output.data['image/svg+xml']) ? output.data['image/svg+xml'].join('') : output.data['image/svg+xml'];
      return `<div class="nb-output-img">${svg}</div>`;
    }
    if (output.data['text/html']) {
      const html = Array.isArray(output.data['text/html']) ? output.data['text/html'].join('') : output.data['text/html'];
      return `<div class="nb-output-html">${html}</div>`;
    }
    if (output.data['text/plain']) {
      const text = Array.isArray(output.data['text/plain']) ? output.data['text/plain'].join('') : output.data['text/plain'];
      return `<pre>${escapeHtml(text)}</pre>`;
    }
  }
  return '';
}

export function renderOutputs(outputs: Output[]): string {
  if (!outputs || outputs.length === 0) return '';
  return outputs.map(o => `<div class="nb-output">${renderOutput(o)}</div>`).join('');
}
