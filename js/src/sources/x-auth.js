import { codedError, envValue } from './http.js';
import { xOAuthHeader } from './x-oauth.js';

const modes = new Set(['auto', 'oauth1-user', 'oauth2-user', 'app-only']);
const legacyFields = ['apiKey', 'apiKeySecret', 'accessTokenSecret'];
const requiredFor = {
  'oauth1-user': ['apiKey', 'apiKeySecret', 'accessToken', 'accessTokenSecret'],
  'oauth2-user': ['accessToken'],
  'app-only': ['bearerToken'],
};
const environment = {
  apiKey: 'X_API_KEY',
  apiKeySecret: 'X_API_KEY_SECRET',
  accessTokenSecret: 'X_ACCESS_TOKEN_SECRET',
  bearerToken: 'X_BEARER_TOKEN',
};
const clean = (value) => (typeof value === 'string' ? value.trim() : '');

const credentialsOf = (defaults, options) => {
  const credentials = Object.fromEntries(
    Object.entries(environment).map(([key, variable]) => [
      key,
      clean(options[key] ?? defaults[key] ?? envValue(variable)),
    ])
  );
  credentials.accessToken = clean(
    options.accessToken ??
      options.token ??
      defaults.accessToken ??
      defaults.token ??
      envValue('X_ACCESS_TOKEN')
  );
  return credentials;
};

const resolveMode = (requested, credentials) => {
  const mode = requested || 'auto';
  if (!modes.has(mode)) {
    throw codedError('Unknown X authentication mode', 'auth-config');
  }
  if (mode !== 'auto') {
    return mode;
  }
  if (legacyFields.some((key) => credentials[key])) {
    return 'oauth1-user';
  }
  return credentials.accessToken ? 'oauth2-user' : 'app-only';
};

const readOnlyError = () =>
  codedError(
    'X app-only authentication cannot act as a user; use OAuth 2.0 user context or OAuth 1.0a user credentials',
    'read-only-auth'
  );

export const createXAuth = (defaults = {}) => {
  const resolve = (options = {}) => {
    const credentials = credentialsOf(defaults, options);
    const mode = resolveMode(
      options.authMode ?? defaults.authMode ?? envValue('X_AUTH_MODE'),
      credentials
    );
    if (mode === 'app-only') {
      credentials.bearerToken ||= credentials.accessToken;
    }
    const missing = requiredFor[mode].filter((key) => !credentials[key]);
    return { credentials, mode, missing };
  };

  const status = (options) => {
    const { mode, missing } = resolve(options);
    return {
      mode,
      configured: missing.length === 0,
      readOnly: mode === 'app-only',
      missing,
    };
  };

  const requireUser = (options) => {
    const state = status(options);
    if (state.readOnly) {
      throw readOnlyError();
    }
    return state;
  };

  const headers = async (url, { method = 'GET', options, form } = {}) => {
    const { credentials, mode, missing } = resolve(options);
    if (missing.length) {
      throw codedError(
        `X ${mode} credentials are incomplete: ${missing.join(', ')}`,
        'auth-config'
      );
    }
    if (mode === 'app-only' && !['GET', 'HEAD'].includes(method)) {
      throw readOnlyError();
    }
    const authorization =
      mode === 'oauth1-user'
        ? await xOAuthHeader({ url, method, form, ...credentials })
        : `Bearer ${mode === 'app-only' ? credentials.bearerToken : credentials.accessToken}`;
    return { Authorization: authorization };
  };

  return { headers, status, requireUser };
};
