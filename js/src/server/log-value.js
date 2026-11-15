import { redact } from './redact.js';

const SECRET =
  /^(?:(?:access|refresh|id|auth)?token|password|passwd|passphrase|pass|pwd|secret|clientsecret|apikey|auth|authorization|proxyauthorization|privatekey|secretkey|cookie|cookies|setcookie|session|sessionid|stringsession|sessionstring|codeverifier|csrf|signature|credentials?)$|(?:token|password|passphrase|secret|apikey|privatekey|secretkey|stringsession|sessionstring|codeverifier)$/i;
const MASK = '<redacted>';

/** Bound traversal before formatting; never invoke user-supplied toJSON. */
export const redactLogValue = (value) => {
  let remaining = 500;
  const seen = new WeakSet();
  const visit = (item, depth) => {
    if (--remaining < 0 || depth > 8) {
      return '[truncated]';
    }
    if (typeof item === 'string') {
      return redact(item.slice(0, 10000)).replace(
        /\b[A-Za-z0-9_-]{40,}\b/g,
        MASK
      );
    }
    if (typeof item === 'bigint') {
      return String(item);
    }
    if (!item || typeof item !== 'object') {
      return typeof item === 'function' ? '[function]' : item;
    }
    if (item instanceof Date) {
      return Number.isFinite(Date.prototype.getTime.call(item))
        ? Date.prototype.toISOString.call(item)
        : '[invalid-date]';
    }
    if (seen.has(item)) {
      return '[circular]';
    }
    seen.add(item);
    const descriptors = Object.getOwnPropertyDescriptors(item);
    if (item instanceof Error) {
      const fields = Object.fromEntries(
        ['name', 'message', 'stack'].map((key) => [
          key,
          descriptors[key]?.value ?? (key === 'name' ? 'Error' : '[accessor]'),
        ])
      );
      return visit(fields, depth + 1);
    }
    const entries = Object.entries(descriptors)
      .slice(0, 100)
      .map(([key, descriptor]) => [
        key,
        SECRET.test(key.replace(/[^a-z]/gi, ''))
          ? MASK
          : 'value' in descriptor
            ? visit(descriptor.value, depth + 1)
            : '[accessor]',
      ]);
    return Array.isArray(item)
      ? entries.filter(([key]) => key !== 'length').map(([, child]) => child)
      : Object.fromEntries(entries);
  };
  try {
    return visit(value, 0);
  } catch {
    return '[unserializable]';
  }
};
