/** Read compatibility only; populated invalid shapes reach strict validation. */
export const emptyLegacyList = (value) =>
  value &&
  typeof value === 'object' &&
  [Object.prototype, null].includes(Object.getPrototypeOf(value)) &&
  Object.keys(value).length === 0;

const item = (value) =>
  typeof value === 'string' ||
  (typeof value === 'number' && Number.isFinite(value));

export const legacyTextList = (value, separator) => {
  if (value === undefined || value === null || emptyLegacyList(value)) {
    return '';
  }
  if (Array.isArray(value)) {
    return value.length <= 10000 && value.every(item)
      ? value.join(separator)
      : value;
  }
  return item(value) ? String(value) : value;
};
