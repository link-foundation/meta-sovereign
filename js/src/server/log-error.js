/** Inspect error fields before a runtime can lazily format its stack. */
const property = (item, key, fallback) => {
  for (let depth = 0; item && depth < 8; depth++) {
    const descriptor = Object.getOwnPropertyDescriptor(item, key);
    if (descriptor) {
      return 'value' in descriptor ? descriptor.value : '[accessor]';
    }
    item = Object.getPrototypeOf(item);
  }
  return fallback;
};

export const logErrorFields = (item) => {
  const name = property(item, 'name', 'Error');
  const message = property(item, 'message', '');
  // Some engines materialize a native stack even during descriptor inspection.
  // Formatting it may call name/message getters or a custom prepareStackTrace.
  const inspectStack =
    typeof name === 'string' &&
    typeof message === 'string' &&
    name !== '[accessor]' &&
    message !== '[accessor]' &&
    !Object.getOwnPropertyDescriptor(Error, 'prepareStackTrace');
  return {
    name,
    message,
    stack: inspectStack ? property(item, 'stack', '[accessor]') : '[accessor]',
  };
};
