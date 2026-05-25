const DANGEROUS_SVG_ELEMENTS = new Set([
  'script',
  'foreignobject',
  'iframe',
  'object',
  'embed',
  'audio',
  'video',
]);

const URL_ATTRS = new Set([
  'href',
  'xlink:href',
  'src',
]);

function isUnsafeUrl(value) {
  const normalized = value.trim().toLowerCase();
  if (!normalized) return false;
  if (normalized.startsWith('#')) return false;
  if (normalized.startsWith('data:image/')) return false;
  return !normalized.startsWith('data:font/');
}

export function sanitizeSvgElement(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT);
  const nodes = [root];

  while (walker.nextNode()) {
    nodes.push(walker.currentNode);
  }

  nodes.reverse().forEach(node => {
    const tagName = node.tagName.toLowerCase();
    if (DANGEROUS_SVG_ELEMENTS.has(tagName)) {
      node.remove();
      return;
    }

    [...node.attributes].forEach(attribute => {
      const attrName = attribute.name.toLowerCase();
      const attrValue = attribute.value;

      if (attrName.startsWith('on')) {
        node.removeAttribute(attribute.name);
        return;
      }

      if (URL_ATTRS.has(attrName) && isUnsafeUrl(attrValue)) {
        node.removeAttribute(attribute.name);
        return;
      }

      if (attrName === 'style' && /(?:javascript:|url\s*\()/i.test(attrValue)) {
        node.removeAttribute(attribute.name);
      }
    });
  });

  return root;
}

export function parseSanitizedSvg(svgMarkup) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgMarkup, 'image/svg+xml');

  if (doc.querySelector('parsererror')) {
    return null;
  }

  const svg = doc.documentElement;
  if (!svg || svg.tagName.toLowerCase() !== 'svg') {
    return null;
  }

  return sanitizeSvgElement(document.importNode(svg, true));
}
