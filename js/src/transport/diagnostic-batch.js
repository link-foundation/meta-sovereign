/** Validate the bounded diagnostics wire contract before advancing a cursor. */
export const isDiagnosticBatch = (value) =>
  value?.ok === true &&
  typeof value.session === 'string' &&
  /^[a-f0-9-]{36}$/i.test(value.session) &&
  Number.isSafeInteger(value.cursor) &&
  value.cursor >= 0 &&
  Array.isArray(value.items) &&
  value.items.length <= 300 &&
  value.items.every(
    (item, index, items) =>
      Number.isSafeInteger(item.id) &&
      item.id > 0 &&
      item.id <= value.cursor &&
      (index === 0 || item.id > items[index - 1].id) &&
      typeof item.text === 'string' &&
      item.text.length <= 4096
  );
