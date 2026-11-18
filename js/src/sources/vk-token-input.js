/** Exact standalone redirect from the pinned desktop reference; no local callback. */
export const VK_DESKTOP_AUTHORIZE_URL =
  'https://oauth.vk.com/authorize?client_id=2685278&scope=1073737727&redirect_uri=https://oauth.vk.com/blank.html&display=page&response_type=token&revoke=1';

export const vkTokenFailure = (code) =>
  Object.assign(new Error(code), { code });

const tokenValue = (value) => {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_.-]{16,4096}$/.test(value)) {
    throw vkTokenFailure('invalid-token-input');
  }
  return value;
};

export const isVkTokenRedirect = (value) => {
  if (
    typeof value !== 'string' ||
    !/^https:\/\/oauth\.vk\.com\/blank\.html(?:#.*)?$/.test(value)
  ) {
    return false;
  }
  try {
    const url = new URL(value);
    return (
      url.protocol === 'https:' &&
      url.hostname === 'oauth.vk.com' &&
      !url.port &&
      !url.username &&
      !url.password &&
      url.pathname === '/blank.html' &&
      !url.search
    );
  } catch {
    return false;
  }
};

const positiveId = (value) => {
  if (!/^[1-9][0-9]{0,15}$/.test(value ?? '')) {
    throw vkTokenFailure('invalid-token-input');
  }
  return value;
};

/** Accept a raw token or this exact HTTPS fragment, never an arbitrary URL. */
export const parseVkTokenInput = (value) => {
  if (typeof value !== 'string' || value.length > 8192) {
    throw vkTokenFailure('invalid-token-input');
  }
  const input = value.trim();
  if (!input.includes('://')) {
    return { token: tokenValue(input) };
  }
  if (!isVkTokenRedirect(input)) {
    throw vkTokenFailure('invalid-token-redirect');
  }
  const fragment = new URLSearchParams(new URL(input).hash.slice(1));
  for (const key of ['access_token', 'user_id', 'expires_in', 'error']) {
    if (fragment.getAll(key).length > 1) {
      throw vkTokenFailure('invalid-token-input');
    }
  }
  if (fragment.has('error')) {
    throw vkTokenFailure('authorization-refused');
  }
  return {
    token: tokenValue(fragment.get('access_token')),
    ...(fragment.has('user_id')
      ? { userId: positiveId(fragment.get('user_id')) }
      : {}),
  };
};

export const capturedVkToken = (value) => ({
  token: tokenValue(value?.token),
  ...(value?.userId === undefined
    ? {}
    : { userId: positiveId(String(value.userId)) }),
});
