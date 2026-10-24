// Passkeys (R-Y218; learned, never copied): the conversions between what
// Telegram sends (WebAuthn creation options as JSON text, with binary
// fields in base64url) and what the browser's `navigator.credentials` takes
// and gives (ArrayBuffers). Pure functions; the page only calls the browser.

/** Bytes (a Uint8Array or an ArrayBuffer) as base64url, with no padding. */
export const bytesToB64url = (bytes) => {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (const byte of view) {
    binary += String.fromCharCode(byte);
  }
  return globalThis
    .btoa(binary)
    .replaceAll('+', '-')
    .replaceAll('/', '_')
    .replace(/=+$/, '');
};

/** The bytes of a base64url (or plain base64) text. */
export const b64urlToBytes = (text) => {
  const base = String(text).replaceAll('-', '+').replaceAll('_', '/');
  const binary = globalThis.atob(
    base + '='.repeat((4 - (base.length % 4)) % 4)
  );
  return Uint8Array.from(binary, (ch) => ch.charCodeAt(0));
};

const bytesOf = (value) =>
  typeof value === 'string' ? b64urlToBytes(value) : value;

/**
 * The argument of `navigator.credentials.create` from the JSON text
 * Telegram gave (`{ publicKey }` or the options themselves): challenge,
 * user id and the excluded credentials' ids become bytes. Returns null for
 * text that is not usable options.
 */
export const creationOptions = (json) => {
  let parsed;
  try {
    parsed = typeof json === 'string' ? JSON.parse(json) : json;
  } catch {
    return null;
  }
  const options = parsed?.publicKey ?? parsed;
  if (!options || typeof options.challenge !== 'string' || !options.user) {
    return null;
  }
  try {
    return {
      publicKey: {
        ...options,
        challenge: bytesOf(options.challenge),
        user: { ...options.user, id: bytesOf(options.user.id) },
        excludeCredentials: (options.excludeCredentials ?? []).map((c) => ({
          ...c,
          id: bytesOf(c.id),
        })),
      },
    };
  } catch {
    return null;
  }
};

/**
 * What `passkey-register` takes from the credential `create` gave: its id
 * and raw id (base64url), the client data as the JSON text it is, and the
 * attestation object in base64url. Null when it is not an attestation.
 */
export const attestationPayload = (credential) => {
  const response = credential?.response;
  if (!credential?.rawId || !response?.clientDataJSON) {
    return null;
  }
  if (!response.attestationObject) {
    return null;
  }
  return {
    id: String(credential.id ?? bytesToB64url(credential.rawId)),
    rawId: bytesToB64url(credential.rawId),
    clientData: new TextDecoder().decode(response.clientDataJSON),
    attestation: bytesToB64url(response.attestationObject),
  };
};

/** Whether this browser can make passkeys. */
export const passkeysSupported = (nav = globalThis.navigator) =>
  typeof nav?.credentials?.create === 'function';
