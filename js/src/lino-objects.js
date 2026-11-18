// Shared readable codec adapter for wire values, text stores and recovery logs.
// Upstream 0.9.5 writes unsafe integer Numbers as bare integers, but reads those
// tokens as strings. Exponent notation preserves the existing Number value.
import {
  encode as upstreamEncode,
  encodeLine as upstreamEncodeLine,
} from 'lino-objects-codec';
export {
  decode,
  decodeLine,
  encodeCompact,
  decodeCompact,
} from 'lino-objects-codec';

const unsafeInteger = (value) =>
  typeof value === 'number' &&
  Number.isInteger(value) &&
  !Number.isSafeInteger(value);

const hasUnsafeInteger = (value, seen = new WeakSet()) => {
  if (unsafeInteger(value)) {
    return true;
  }
  if (!value || typeof value !== 'object' || seen.has(value)) {
    return false;
  }
  seen.add(value);
  return Object.values(value).some((child) => hasUnsafeInteger(child, seen));
};

const writeNumericValue = (value, path = new WeakSet()) => {
  if (unsafeInteger(value)) {
    return value.toExponential();
  }
  if (!value || typeof value !== 'object') {
    return upstreamEncodeLine({ obj: value });
  }
  if (path.has(value)) {
    throw new TypeError('circular readable value');
  }
  path.add(value);
  let result;
  if (Array.isArray(value)) {
    result = `(a: ${value.map((child) => writeNumericValue(child, path)).join(' ')})`;
  } else {
    result = `(o:${Object.entries(value)
      .map(
        ([key, child]) =>
          ` (${upstreamEncodeLine({ obj: key })} ${writeNumericValue(child, path)})`
      )
      .join('')})`;
  }
  path.delete(value);
  return result;
};

// Ordinary documents retain the upstream encoder's readable layout. The rare
// numeric workaround uses explicit object/array markers, valid in both forms.
export const preserveReadableNumbers = (value, notation) =>
  hasUnsafeInteger(value) ? writeNumericValue(value) : notation;

export const encode = (options = {}) =>
  preserveReadableNumbers(options.obj, upstreamEncode(options));
export const encodeLine = (options = {}) =>
  preserveReadableNumbers(options.obj, upstreamEncodeLine(options));
