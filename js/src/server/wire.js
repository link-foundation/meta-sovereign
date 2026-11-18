// Lino REST is the default structured HTTP transport. The bounded binary
// adapter and RFC negotiation workaround are tracked upstream as #10 and #11.
import {
  encodeFor,
  decodeFrom,
  parseAccept,
  negotiateMediaType,
} from 'lino-rest-api';
import { preserveReadableNumbers } from '../lino-objects.js';
import {
  LINO_TEXT,
  LINO_BINARY,
  LINO_TYPES,
  JSON_MEDIA,
  mediaType,
  wireValue,
  encodeWire,
  decodeWire,
  validateWireText,
} from '../transport/lino.js';

const rangeMatches = (range, type) =>
  range === '*/*' ||
  range === type ||
  (range.endsWith('/*') && type.startsWith(range.slice(0, -1)));

export const selectWireType = (accept, { jsonCompatibility = false } = {}) => {
  const types = jsonCompatibility ? [JSON_MEDIA, ...LINO_TYPES] : LINO_TYPES;
  const ranges = parseAccept(accept);
  const candidates = types
    .map((type, preference) => {
      const matches = ranges.filter((range) => rangeMatches(range.type, type));
      const specificity = Math.max(
        -1,
        ...matches.map((range) => range.specificity)
      );
      const quality = Math.max(
        0,
        ...matches
          .filter((range) => range.specificity === specificity)
          .map((range) => Math.min(1, range.quality))
      );
      return { type, quality, preference };
    })
    .filter(({ quality }) => quality > 0)
    .sort((a, b) => b.quality - a.quality || a.preference - b.preference);
  // The library negotiates explicit candidates after specific exclusions and
  // quality precedence have been resolved. A wildcard cannot undo q=0.
  return negotiateMediaType(
    candidates.map(({ type, quality }) => `${type};q=${quality}`).join(',') ||
      'none/none',
    types
  );
};

export const bindWire = (req, res, jsonCompatibility = false) => {
  const policy = {
    jsonCompatibility,
    type: selectWireType(req.headers.accept, { jsonCompatibility }),
  };
  req.lino = policy;
  res.lino = policy;
};

export const legacyWire = Object.freeze({
  jsonCompatibility: true,
  type: JSON_MEDIA,
});
export const requestWireType = (req) =>
  mediaType(req.headers?.['content-type']) ||
  ((req.lino ?? legacyWire).jsonCompatibility ? JSON_MEDIA : LINO_TEXT);

export const requestWireFailure = (req) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return null;
  }
  if (!req.lino.type) {
    return [406, 'not-acceptable', 'no acceptable response representation'];
  }
  const hasBody =
    Number(req.headers['content-length']) > 0 ||
    req.headers['transfer-encoding'];
  const type = requestWireType(req);
  if (
    hasBody &&
    !LINO_TYPES.includes(type) &&
    !(req.lino.jsonCompatibility && type === JSON_MEDIA)
  ) {
    // Archive/media uploads have their own streaming decoder and limits.
    const path = new URL(req.url, 'http://local').pathname;
    if (
      path !== '/api/archive/upload' &&
      !/^\/api\/telegram(?:\/accounts\/\d+)?\/upload$/.test(path)
    ) {
      return [
        415,
        'unsupported-media',
        'use text/lino or application/lino-binary',
      ];
    }
  }
  return null;
};

export const encodeWireResponse = (res, status, value) => {
  const policy = res.lino ?? legacyWire;
  const type = policy.type ?? LINO_TEXT;
  if (!policy.type) {
    status = 406;
    value = {
      ok: false,
      code: 'not-acceptable',
      error: 'no acceptable response representation',
    };
  }
  const obj = wireValue(value);
  let body =
    type === LINO_BINARY ? encodeWire(obj, type) : encodeFor(obj, type);
  if (type === LINO_TEXT || type === 'text/lino-line') {
    body = preserveReadableNumbers(obj, body);
  }
  return { status, type, body };
};

export const decodeWireRequest = (req, raw) => {
  const policy = req.lino ?? legacyWire;
  const type = requestWireType(req);
  if (
    !LINO_TYPES.includes(type) &&
    !(policy.jsonCompatibility && type === JSON_MEDIA)
  ) {
    throw Object.assign(new Error('unsupported request media type'), {
      status: 415,
      code: 'unsupported-media',
    });
  }
  if (type === LINO_BINARY) {
    return decodeWire(raw, type);
  }
  const text = new TextDecoder('utf-8', { fatal: true }).decode(raw);
  return decodeFrom(type === JSON_MEDIA ? text : validateWireText(text), type);
};
