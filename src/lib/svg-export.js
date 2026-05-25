import { sanitizeSvgElement } from './svg-sanitizer.js';

const SVG_EXPORT_STYLE_PROPS = [
  'fill',
  'stroke',
  'stroke-width',
  'color',
  'font-family',
  'font-size',
  'font-weight',
  'text-anchor',
  'dominant-baseline',
];

function prepareSvgCloneForExport(svgElement, options = {}) {
  const svgClone = svgElement.cloneNode(true);
  sanitizeSvgElement(svgClone);
  inlineSvgComputedStyles(svgElement, svgClone);
  svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
  svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
  addSvgExportBackground(svgElement, svgClone, options);
  return svgClone;
}

function inlineSvgComputedStyles(sourceRoot, cloneRoot) {
  const sourceNodes = [sourceRoot, ...sourceRoot.querySelectorAll('*')];
  const cloneNodes = [cloneRoot, ...cloneRoot.querySelectorAll('*')];

  sourceNodes.forEach((sourceNode, index) => {
    const cloneNode = cloneNodes[index];
    if (!cloneNode || !(sourceNode instanceof Element)) return;

    const computed = getComputedStyle(sourceNode);
    SVG_EXPORT_STYLE_PROPS.forEach(prop => {
      const value = computed.getPropertyValue(prop);
      if (value) cloneNode.style.setProperty(prop, value);
    });
  });
}

function getSvgExportSize(svgElement) {
  const width = svgElement.width?.baseVal?.value || Number(svgElement.getAttribute('width')) || 800;
  const height = svgElement.height?.baseVal?.value || Number(svgElement.getAttribute('height')) || 600;
  return { width, height };
}

function getExportBackgroundColor(svgElement, options = {}) {
  let node = svgElement;
  while (node && node instanceof Element) {
    const color = getComputedStyle(node).backgroundColor;
    if (color && color !== 'rgba(0, 0, 0, 0)' && color !== 'transparent') {
      return color;
    }
    node = node.parentElement;
  }
  return readCssColor(options.darkMode ? '--bg-header' : '--bg-secondary', options.darkMode ? '#1e1e1e' : '#ffffff');
}

function readCssColor(name, fallback) {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

function addSvgExportBackground(sourceSvg, cloneSvg, options = {}) {
  const { width, height } = getSvgExportSize(sourceSvg);
  const background = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
  background.setAttribute('x', '0');
  background.setAttribute('y', '0');
  background.setAttribute('width', width);
  background.setAttribute('height', height);
  background.setAttribute('fill', getExportBackgroundColor(sourceSvg, options));
  cloneSvg.insertBefore(background, cloneSvg.firstChild);
}

export function downloadSVG(svgElement, filename, options = {}) {
  const svgClone = prepareSvgCloneForExport(svgElement, options);
  const svgString = new XMLSerializer().serializeToString(svgClone);

  const blob = new Blob([svgString], { type: 'image/svg+xml' });
  const url = URL.createObjectURL(blob);

  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

export function downloadPNG(svgElement, filename, options = {}) {
  const svgClone = prepareSvgCloneForExport(svgElement, options);
  const svgString = new XMLSerializer().serializeToString(svgClone);
  const { width: svgWidth, height: svgHeight } = getSvgExportSize(svgElement);

  const canvas = document.createElement('canvas');
  canvas.width = svgWidth * 2;
  canvas.height = svgHeight * 2;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = getExportBackgroundColor(svgElement, options);
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  const img = new Image();
  img.onload = function() {
    URL.revokeObjectURL(svgUrl);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    canvas.toBlob(function(blob) {
      if (!blob) {
        options.onError?.('PNG export failed');
        return;
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    }, 'image/png');
  };
  img.onerror = function() {
    URL.revokeObjectURL(svgUrl);
    options.onError?.('PNG export failed');
  };

  const svgBlob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
  const svgUrl = URL.createObjectURL(svgBlob);
  img.src = svgUrl;
}
