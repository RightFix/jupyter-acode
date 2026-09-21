const ALLOWED_TAGS = ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'li',
  'blockquote', 'pre', 'code', 'a', 'strong', 'em', 'b', 'i', 'table', 'thead',
  'tbody', 'tr', 'th', 'td', 'hr', 'span', 'div', 'img'];
const ALLOWED_ATTRS: Record<string, string[]> = {
  'a': ['href', 'title'], 'img': ['src', 'alt', 'title'],
  'code': ['class'], 'span': ['class'], 'div': ['class'],
  'td': ['colspan', 'rowspan'], 'th': ['colspan', 'rowspan'],
};

export function sanitizeMarkdown(html: string): string {
  const temp = document.createElement('div');
  temp.innerHTML = html;

  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) { node.remove(); return; }
    const tagName = (node as Element).tagName.toLowerCase();
    if (!ALLOWED_TAGS.includes(tagName)) {
      node.replaceWith((node as Text).textContent ?? '');
      return;
    }
    const attrs = ALLOWED_ATTRS[tagName] ?? [];
    for (const attr of Array.from((node as Element).attributes)) {
      if (!attrs.includes(attr.name)) (node as Element).removeAttribute(attr.name);
    }
    if (tagName === 'a') {
      const href = (node as Element).getAttribute('href');
      if (href && !href.match(/^(https?:|mailto:|tel:)/i)) (node as Element).removeAttribute('href');
    }
    if (tagName === 'img') {
      const src = (node as Element).getAttribute('src');
      if (src && !src.match(/^data:/i) && !src.match(/^https?:/i)) (node as Element).removeAttribute('src');
    }
    Array.from((node as Element).childNodes).forEach(walk);
  };

  Array.from(temp.childNodes).forEach(walk);
  return temp.innerHTML;
}
