import { visitHtml } from './parse.js';

const ELEMENTS = new Set(
  'svg g defs path rect circle ellipse line polyline polygon use clipPath mask pattern linearGradient radialGradient stop title desc'.split(
    ' '
  )
);
const ATTRIBUTES = new Set(
  'xmlns xmlns:xlink id viewBox width height x y x1 x2 y1 y2 cx cy r rx ry d points transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin opacity offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod patternUnits patternContentUnits patternTransform preserveAspectRatio clip-path mask href xlink:href'.split(
    ' '
  )
);
const escape = (value) =>
  String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');

const safeAttribute = (name, value) => {
  if (!ATTRIBUTES.has(name)) {
    return false;
  }
  if (name === 'href' || name === 'xlink:href') {
    return /^#[A-Za-z0-9_.:-]+$/.test(value);
  }
  // CSS escapes, entities and comments cannot conceal an external resource.
  if (name === 'xmlns' || name === 'xmlns:xlink') {
    return (
      value === 'http://www.w3.org/2000/svg' ||
      value === 'http://www.w3.org/1999/xlink'
    );
  }
  if (/[\\&<>]|:\/\/|javascript:|data:/i.test(value)) {
    return false;
  }
  return !/url\s*\(/i.test(value) || /^url\(#[A-Za-z0-9_.:-]+\)$/.test(value);
};

/** XML tokens are serialized from an allowlist; removed bytes never form tags. */
export const sanitizeSvg = (source) => {
  const root = { children: [] };
  const stack = [root];
  let dropped = 0;
  let found = false;
  visitHtml(
    source,
    {
      onopentag(tag, attrs) {
        if (
          stack.length >= 128 ||
          dropped ||
          (!ELEMENTS.has(tag) && tag !== 'a') ||
          (!found && tag !== 'svg')
        ) {
          dropped += 1;
          return;
        }
        if (tag === 'svg') {
          found = true;
        }
        const node = { tag, attrs, children: [] };
        stack.at(-1).children.push(node);
        stack.push(node);
      },
      onclosetag() {
        if (dropped) {
          dropped -= 1;
        } else {
          stack.pop();
        }
      },
      ontext(text) {
        if (!dropped && found) {
          stack.at(-1).children.push(escape(text));
        }
      },
    },
    { xmlMode: true, decodeEntities: true }
  );
  const render = (node) => {
    if (typeof node === 'string') {
      return node;
    }
    const inner = node.children.map(render).join('');
    if (!node.tag || node.tag === 'a') {
      return inner;
    }
    const attrs = Object.entries(node.attrs)
      .filter(([key, value]) => safeAttribute(key, value))
      .map(([key, value]) => ` ${key}="${escape(value)}"`)
      .join('');
    return inner
      ? `<${node.tag}${attrs}>${inner}</${node.tag}>`
      : `<${node.tag}${attrs}/>`;
  };
  return found ? render(root).trim() : '';
};
