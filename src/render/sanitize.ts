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

  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) return;
    if (node.nodeType !== Node.ELEMENT_NODE) {
      node.parentNode?.removeChild(node);
      return;
    }
    const el = node as Element;
    const tagName = el.tagName.toLowerCase();
    if (!ALLOWED_TAGS.includes(tagName)) {
      const text = el.textContent ?? '';
      el.parentNode?.replaceChild(document.createTextNode(text), el);
      return;
    }
    const attrs = ALLOWED_ATTRS[tagName] ?? [];
    for (const attr of Array.from(el.attributes)) {
      if (!attrs.includes(attr.name)) el.removeAttribute(attr.name);
    }
    if (tagName === 'a') {
      const href = el.getAttribute('href');
      if (href && !href.match(/^(https?:|mailto:|tel:)/i)) el.removeAttribute('href');
    }
    if (tagName === 'img') {
      const src = el.getAttribute('src');
      if (src && !src.match(/^data:/i) && !src.match(/^https?:/i)) el.removeAttribute('src');
    }
    Array.from(el.childNodes).forEach(walk);
  };

  Array.from(temp.childNodes).forEach(walk);
  return temp.innerHTML;
}
