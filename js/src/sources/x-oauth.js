// OAuth 1.0a (RFC 5849), using Web Crypto in Node, Bun, Deno and browsers.
// JSON bodies are not signature parameters. URL queries and form bodies are.
const encode = (value) =>
  encodeURIComponent(String(value)).replace(
    /[!'()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );

const compare = (a, b) => (a < b ? -1 : Number(a > b));

const normalizedParameters = (url, oauth, form) => {
  const pairs = [
    ...url.searchParams,
    ...Object.entries(oauth),
    ...(form ? new URLSearchParams(form) : []),
  ]
    .filter(([key]) => key !== 'oauth_signature')
    .map(([key, value]) => [encode(key), encode(value)]);
  pairs.sort(([ak, av], [bk, bv]) => compare(ak, bk) || compare(av, bv));
  return pairs.map(([key, value]) => `${key}=${value}`).join('&');
};

const randomNonce = () =>
  Array.from(globalThis.crypto.getRandomValues(new Uint8Array(16)), (n) =>
    n.toString(16).padStart(2, '0')
  ).join('');

const signature = async (base, secret) => {
  const bytes = new TextEncoder();
  const key = await globalThis.crypto.subtle.importKey(
    'raw',
    bytes.encode(secret),
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign']
  );
  const signed = await globalThis.crypto.subtle.sign(
    'HMAC',
    key,
    bytes.encode(base)
  );
  return globalThis.btoa(String.fromCharCode(...new Uint8Array(signed)));
};

/** Form must match the URL-encoded request body; omit it for JSON. */
export const xOAuthHeader = async ({
  url,
  method = 'GET',
  apiKey,
  apiKeySecret,
  accessToken,
  accessTokenSecret,
  form,
  nonce = randomNonce(),
  timestamp = Math.floor(Date.now() / 1000),
}) => {
  const target = new URL(url);
  const oauth = {
    oauth_consumer_key: apiKey,
    oauth_token: accessToken,
    oauth_signature_method: 'HMAC-SHA1',
    oauth_timestamp: String(timestamp),
    oauth_nonce: nonce,
  };
  const base = [
    method.toUpperCase(),
    `${target.origin}${target.pathname}`,
    normalizedParameters(target, oauth, form),
  ]
    .map(encode)
    .join('&');
  oauth.oauth_signature = await signature(
    base,
    `${encode(apiKeySecret)}&${encode(accessTokenSecret)}`
  );
  return `OAuth ${Object.entries(oauth)
    .map(([key, value]) => `${encode(key)}="${encode(value)}"`)
    .join(', ')}`;
};
