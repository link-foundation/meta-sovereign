/** Select a working AES backend before teleproto initializes cifrante. */
export const configureTelegramCrypto = ({
  deno = Boolean(globalThis.Deno?.version?.deno),
  platform = process.platform,
  env = process.env,
} = {}) => {
  // cifrante 0.6.0's Windows native addon terminates Deno with 0xC0000005
  // during IGE construction. Its supported WASM backend passes the same
  // offline cipher comparisons. This must precede the first native probe;
  // a JavaScript catch cannot recover from an access violation.
  if (deno && platform === 'win32') {
    env.CIFRANTE_NATIVE = '0';
  }
};
