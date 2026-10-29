import { visitHtml } from './parse.js';

const ELEMENTS = new Set(
  'svg g defs symbol switch path rect circle ellipse line polyline polygon use clipPath mask pattern marker linearGradient radialGradient stop title desc text tspan textPath filter feBlend feColorMatrix feComponentTransfer feComposite feConvolveMatrix feDiffuseLighting feDisplacementMap feDistantLight feDropShadow feFlood feFuncA feFuncB feFuncG feFuncR feGaussianBlur feMerge feMergeNode feMorphology feOffset fePointLight feSpecularLighting feSpotLight feTile feTurbulence'.split(
    ' '
  )
);
const ATTRIBUTES = new Set(
  'xmlns xmlns:xlink id viewBox width height x y x1 x2 y1 y2 cx cy r rx ry d points transform fill fill-opacity fill-rule stroke stroke-width stroke-opacity stroke-linecap stroke-linejoin stroke-dasharray stroke-dashoffset stroke-miterlimit opacity offset stop-color stop-opacity gradientUnits gradientTransform spreadMethod patternUnits patternContentUnits patternTransform preserveAspectRatio clip-path clip-rule mask href xlink:href color display visibility vector-effect font-family font-size font-style font-weight text-anchor dominant-baseline dx dy rotate textLength lengthAdjust startOffset filter filterUnits primitiveUnits in in2 result type values mode operator k1 k2 k3 k4 order kernelMatrix divisor bias targetX targetY edgeMode kernelUnitLength preserveAlpha surfaceScale diffuseConstant specularConstant specularExponent scale xChannelSelector yChannelSelector azimuth elevation stdDeviation flood-color flood-opacity lighting-color slope intercept amplitude exponent tableValues radius z pointsAtX pointsAtY pointsAtZ limitingConeAngle baseFrequency numOctaves seed stitchTiles markerWidth markerHeight markerUnits refX refY orient'.split(
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

// Preserve ordinary inline presentation without retaining executable CSS.
// Canonical presentation attributes also prevent CSS escape tricks from
// bypassing the same reference/value checks applied to XML attributes.
const drawingAttributes = (attrs) => {
  const result = { ...attrs };
  for (const declaration of String(attrs.style ?? '').split(';')) {
    const colon = declaration.indexOf(':');
    if (colon < 1) {
      continue;
    }
    const name = declaration.slice(0, colon).trim().toLowerCase();
    let value = declaration.slice(colon + 1).trim();
    if (value.toLowerCase().endsWith('!important')) {
      value = value.slice(0, -10).trimEnd();
    }
    if (safeAttribute(name, value)) {
      Object.defineProperty(result, name, {
        value,
        writable: true,
        enumerable: true,
        configurable: true,
      });
    }
  }
  return result;
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
    const attrs = Object.entries(drawingAttributes(node.attrs))
      .filter(([key, value]) => safeAttribute(key, value))
      .map(([key, value]) => ` ${key}="${escape(value)}"`)
      .join('');
    return inner
      ? `<${node.tag}${attrs}>${inner}</${node.tag}>`
      : `<${node.tag}${attrs}/>`;
  };
  return found ? render(root).trim() : '';
};
