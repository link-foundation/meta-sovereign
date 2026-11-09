import { codedError, envValue } from '../sources/http.js';
import { secretValue } from '../sources/email-store.js';

// Local secret records are already protected/masked by the shared store/API.
// Keep each VK credential type separate, and expose presence rather than values.
export const BROADCAST_CREDENTIALS = Object.freeze({
  telegram: { botToken: ['bot-token', 'TELEGRAM_BOT_TOKEN'] },
  vk: {
    userToken: ['user-token', 'VK_ACCESS_TOKEN'],
    communityToken: ['community-token', 'VK_COMMUNITY_TOKEN'],
  },
  x: {
    apiKey: ['api-key', 'X_API_KEY'],
    apiKeySecret: ['api-key-secret', 'X_API_KEY_SECRET'],
    accessToken: ['access-token', 'X_ACCESS_TOKEN'],
    accessTokenSecret: ['access-token-secret', 'X_ACCESS_TOKEN_SECRET'],
    bearerToken: ['bearer-token', 'X_BEARER_TOKEN'],
  },
});
const descriptors = (network) => {
  if (!Object.hasOwn(BROADCAST_CREDENTIALS, network)) {
    throw codedError('Unknown broadcast credential provider', 'bad-config');
  }
  return BROADCAST_CREDENTIALS[network];
};
const saved = async (store, network, key) =>
  secretValue(await store.get(`secret:${network}:${key}`));

export const loadBroadcastCredentials = async (store, network) => {
  const values = {};
  for (const [field, [key, variable]] of Object.entries(descriptors(network))) {
    values[field] =
      (await saved(store, network, key)) ?? envValue(variable) ?? '';
  }
  // Existing connection screens used these names before explicit modes.
  if (network === 'vk' && !values.userToken) {
    values.userToken =
      (await saved(store, network, 'access-token')) ??
      (await saved(store, network, 'token')) ??
      '';
  }
  if (network === 'x' && !values.accessToken) {
    values.accessToken = (await saved(store, network, 'token')) ?? '';
  }
  return values;
};

export const credentialStatus = async (store, network) => ({
  network,
  fields: Object.fromEntries(
    Object.entries(await loadBroadcastCredentials(store, network)).map(
      ([key, value]) => [key, Boolean(value)]
    )
  ),
});

export const saveBroadcastCredentials = async (store, network, input) => {
  const fields = descriptors(network);
  if (
    !input ||
    typeof input !== 'object' ||
    Array.isArray(input) ||
    Object.keys(input).some((key) => !Object.hasOwn(fields, key))
  ) {
    throw codedError('Unknown credential field', 'bad-config');
  }
  for (const value of Object.values(input)) {
    if (typeof value !== 'string' || value.length > 8192) {
      throw codedError(
        'Credential values must be strings of at most 8192 characters',
        'bad-config'
      );
    }
  }
  for (const [field, value] of Object.entries(input)) {
    // An omitted field is preserved; an empty field removes only the saved value.
    const id = `secret:${network}:${fields[field][0]}`;
    if (value.trim()) {
      await store.put({ id, tokens: ['secret', network], value: value.trim() });
    } else {
      await store.delete(id);
    }
  }
  return credentialStatus(store, network);
};

/** Internal confirmation binding: never return or persist the secret digest. */
export const credentialBinding = async (values) => {
  const bytes = new TextEncoder().encode(JSON.stringify(values));
  const hash = new Uint8Array(
    await globalThis.crypto.subtle.digest('SHA-256', bytes)
  );
  return Array.from(hash, (byte) => byte.toString(16).padStart(2, '0')).join(
    ''
  );
};
