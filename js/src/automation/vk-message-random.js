/** Uniform positive signed 32-bit VK message identity, without modulo bias. */
export const vkMessageRandomId = (crypto = globalThis.crypto) => {
  const bytes = new Uint32Array(1);
  for (let attempt = 0; attempt < 8; attempt++) {
    const value = crypto.getRandomValues(bytes)[0] & 0x7fffffff;
    if (value) {
      return value;
    }
  }
  throw new Error('Unable to generate a nonzero VK message identity');
};
