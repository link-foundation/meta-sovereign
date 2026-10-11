/**
 * VK authorization helpers (issue #32).
 *
 * Kate Mobile (client_id 2685278) used to be the go-to "borrowed" client
 * for long-lived VK user tokens with the `messages` right. VK stopped
 * serving its traffic on 2026-09-08 after the per-account monthly call
 * limits from the 19.08.2026 platform rules took effect, and VK no longer
 * grants `messages` to new applications at all (Implicit Flow for user
 * tokens is disabled since 2024-06-25; only apps that requested the right
 * earlier keep it). See docs/case-studies/issue-32/ for the evidence.
 *
 * This module keeps what that research found reusable:
 *
 *  - `VK_TOKEN_SOURCES`: every client_id listed on vkhost.github.io plus
 *    VK's own native clients, ranked by who publishes them and by what
 *    the OAuth gate answered when probed. First-party VK apps rank above
 *    third-party ones so a user never hands a session to a small,
 *    unknown publisher when a VK-owned client would do.
 *  - `classifyVkOAuthGate` / `probeVkOAuthGate`: re-run the unauthenticated
 *    probe so the catalogue can be refreshed when VK changes something.
 *  - `decodeVkUserScope`: turn the bitmask from
 *    `account.getAppPermissions` into scope names.
 *  - `inspectVkToken` / `describeVkError`: tell a user, using only
 *    documented read-only methods, whether the token they already hold
 *    can still read messages, and what a VK error code means for them.
 *
 * Nothing here logs in, stores a token, or picks a borrowed client by
 * default: the official routes (data archive, community token, an own
 * VK ID app) stay the primary path.
 */

import { addSearch } from './http.js';
import { createVkLive } from './vk.js';

/** Date the `gate` column of `VK_TOKEN_SOURCES` was last probed. */
export const VK_TOKEN_SOURCES_PROBED_AT = '2026-10-11';

export const VK_OAUTH_HOST = 'https://oauth.vk.ru';
export const VK_BLANK_REDIRECT = 'https://oauth.vk.com/blank.html';

/**
 * User-token rights and their bit numbers, as documented at
 * https://dev.vk.ru/ru/reference/access-rights (and mirrored by
 * vkhost.github.io).
 */
export const VK_USER_SCOPE_BITS = Object.freeze({
  notify: 0,
  friends: 1,
  photos: 2,
  audio: 3,
  video: 4,
  stories: 6,
  pages: 7,
  menu: 8,
  wallmenu: 9,
  status: 10,
  notes: 11,
  messages: 12,
  wall: 13,
  ads: 15,
  offline: 16,
  docs: 17,
  groups: 18,
  notifications: 19,
  stats: 20,
  email: 22,
  adsweb: 23,
  leads: 24,
  exchange: 26,
  market: 27,
  phone: 28,
});

export const decodeVkUserScope = (mask) => {
  const value = Number(mask);
  if (!Number.isFinite(value) || value < 0) {
    return [];
  }
  return Object.entries(VK_USER_SCOPE_BITS)
    .filter(([, bit]) => Math.floor(value / 2 ** bit) % 2 === 1)
    .map(([name]) => name);
};

/**
 * Outcomes of `GET oauth.vk.ru/authorize?...&response_type=token` before
 * login. Only `login-page` lets the user continue; it is necessary but
 * not sufficient (Kate Mobile still gets `login-page` although its API
 * traffic is refused).
 */
export const VK_OAUTH_GATE_OUTCOMES = Object.freeze({
  'login-page':
    'VK shows its login form: the client may still request this scope.',
  blocked: 'VK answers "application is blocked".',
  disabled: 'VK answers "application is disabled".',
  deleted: 'VK answers "application was deleted".',
  'direct-auth-only':
    'Official native client: VK only accepts its private password grant, not the browser flow.',
  'no-messages':
    'The client exists but is not allowed to request the messages right.',
  'security-error':
    'VK answers "Security Error" (redirect URI or platform not allowed for this client).',
  unknown: 'Any other answer; inspect it by hand.',
});

const GATE_PATTERNS = [
  [/application is blocked/i, 'blocked'],
  [/application is disabled/i, 'disabled'],
  [/application was deleted/i, 'deleted'],
  [/unavailable for apps with direct auth/i, 'direct-auth-only'],
  [/only desktop applications have access/i, 'no-messages'],
  [/security error/i, 'security-error'],
];

export const classifyVkOAuthGate = ({ status = 200, body = '' } = {}) => {
  const text = String(body);
  let description = null;
  try {
    const json = JSON.parse(text);
    description = String(json.error_description ?? json.error ?? '');
  } catch {
    // Not JSON: VK rendered an HTML page.
  }
  if (description === null) {
    return status < 400 && /<html/i.test(text) ? 'login-page' : 'unknown';
  }
  for (const [pattern, outcome] of GATE_PATTERNS) {
    if (pattern.test(description)) {
      return outcome;
    }
  }
  return 'unknown';
};

export const buildVkAuthorizeUrl = ({
  clientId,
  scope = 'messages,offline',
  host = VK_OAUTH_HOST,
  redirectUri = VK_BLANK_REDIRECT,
  apiVersion = '5.199',
} = {}) => {
  if (!clientId) {
    throw new Error('vk authorize client_id is required');
  }
  return addSearch(new URL('/authorize', host), {
    client_id: clientId,
    scope,
    redirect_uri: redirectUri,
    display: 'page',
    response_type: 'token',
    v: apiVersion,
  }).toString();
};

/**
 * Ask the OAuth gate about one client_id without logging in. Sends no
 * cookie and no token; the only data leaving the device is the client_id
 * and the requested scope.
 */
export const probeVkOAuthGate = async ({
  clientId,
  scope,
  host,
  fetchImpl = globalThis.fetch,
} = {}) => {
  const url = buildVkAuthorizeUrl({ clientId, scope, host });
  const res = await fetchImpl(url, {
    redirect: 'manual',
    headers: { 'Accept-Language': 'en' },
  });
  const body = await res.text();
  return {
    clientId: Number(clientId),
    status: res.status,
    outcome: classifyVkOAuthGate({ status: res.status, body }),
  };
};

/**
 * Recommendation levels, best first:
 *  - `prefer`      first-party VK client, gate open, community reports of
 *                  `messages` + `offline` still working after 2026-09-08.
 *  - `fallback`    first-party VK client, gate open, but either untested
 *                  for messages or with reports of account freezes.
 *  - `avoid`       gate open but published by a third party (small or
 *                  unknown publisher, or a dormant integration).
 *  - `unavailable` refused by VK at the gate or at the API.
 */
export const VK_RECOMMENDATIONS = Object.freeze([
  'prefer',
  'fallback',
  'avoid',
  'unavailable',
]);

const source = (entry) => Object.freeze(entry);

export const VK_TOKEN_SOURCES = Object.freeze([
  source({
    clientId: 6287487,
    name: 'vk.com (web client)',
    publisher: 'vk',
    gate: 'login-page',
    recommendation: 'prefer',
    evidence:
      '2026-09-30: VK Admin and Kate Mobile tokens fail for a dialog archiver, the vk.com token works (ItsLouan/VK-Dialog-Photo-Archiver#2).',
  }),
  source({
    clientId: 7793118,
    name: 'VK Calls (Звонки ВКонтакте)',
    publisher: 'vk',
    gate: 'login-page',
    recommendation: 'prefer',
    evidence:
      '2026-07-16: works with offline and messages (gist AlexanderPro/26e13137…); the same reporter expected freezes to follow.',
  }),
  source({
    clientId: 6463690,
    name: 'Marusya (Маруся)',
    publisher: 'vk',
    gate: 'login-page',
    recommendation: 'fallback',
    evidence:
      '2026-07-15: an account frozen 1-2 days after only issuing the token; 2026-07-16: one message sent, then a 4-day freeze.',
  }),
  source({
    clientId: 7799655,
    name: 'VK Mail (VK Почта)',
    publisher: 'vk',
    gate: 'login-page',
    recommendation: 'fallback',
    evidence: 'Gate open; no public report about messages yet.',
  }),
  source({
    clientId: 7556576,
    name: 'Sferum (web)',
    publisher: 'vk',
    gate: 'login-page',
    recommendation: 'fallback',
    evidence: 'Gate open; no public report about messages yet.',
  }),
  source({
    clientId: 7497650,
    name: 'VK Connect',
    publisher: 'vk',
    gate: 'login-page',
    recommendation: 'fallback',
    evidence: 'Gate open; no public report about messages yet.',
  }),
  source({
    clientId: 5530956,
    name: 'Prisma',
    publisher: 'third-party',
    gate: 'login-page',
    recommendation: 'avoid',
    evidence:
      '2026-05-24: reported working; the same user was blocked by 2026-07-07 (client not named). Third-party publisher.',
  }),
  source({
    clientId: 3698024,
    name: 'Instagram (legacy VK integration)',
    publisher: 'third-party',
    gate: 'login-page',
    recommendation: 'avoid',
    evidence: 'Dormant cross-posting integration; no current report.',
  }),
  source({
    clientId: 4083558,
    name: 'VFeed',
    publisher: 'third-party',
    gate: 'login-page',
    recommendation: 'avoid',
    evidence:
      '2026-05-21: an account suspended for a day after using it. Small third-party iOS client.',
  }),
  source({
    clientId: 2685278,
    name: 'Kate Mobile',
    publisher: 'third-party',
    gate: 'login-page',
    recommendation: 'unavailable',
    evidence:
      'Gate still open, but VK refuses its API traffic since 2026-09-08 (monthly limit exhausted; developers report no answer from VK).',
  }),
  source({
    clientId: 6121396,
    name: 'VK Admin (Android)',
    publisher: 'vk',
    gate: 'blocked',
    recommendation: 'unavailable',
    evidence:
      '2026-04-13: "application is blocked", old tokens revoked (vkhost/vkhost.github.io#6).',
  }),
  source({
    clientId: 5776857,
    name: 'VK Admin (iOS)',
    publisher: 'vk',
    gate: 'security-error',
    recommendation: 'unavailable',
    evidence: '2025-11-07: "Security Error" (vkhost/vkhost.github.io#5).',
  }),
  source({
    clientId: 7539952,
    name: 'Mail.ru Mail',
    publisher: 'vk',
    gate: 'security-error',
    recommendation: 'unavailable',
    evidence: 'Gate answers "Security Error".',
  }),
  source({
    clientId: 7598572,
    name: 'Sferum (Android)',
    publisher: 'vk',
    gate: 'disabled',
    recommendation: 'unavailable',
    evidence: 'Gate answers "application is disabled".',
  }),
  source({
    clientId: 7571751,
    name: 'VK Education (iOS)',
    publisher: 'vk',
    gate: 'disabled',
    recommendation: 'unavailable',
    evidence: 'Gate answers "application is disabled".',
  }),
  source({
    clientId: 2274003,
    name: 'VK for Android (official)',
    publisher: 'vk',
    gate: 'direct-auth-only',
    recommendation: 'unavailable',
    evidence: 'Only the private password grant; not usable from a browser.',
  }),
  source({
    clientId: 3140623,
    name: 'VK for iPhone (official)',
    publisher: 'vk',
    gate: 'direct-auth-only',
    recommendation: 'unavailable',
    evidence: 'Only the private password grant; not usable from a browser.',
  }),
  source({
    clientId: 3682744,
    name: 'VK for iPad (official)',
    publisher: 'vk',
    gate: 'direct-auth-only',
    recommendation: 'unavailable',
    evidence: 'Only the private password grant; not usable from a browser.',
  }),
  source({
    clientId: 3697615,
    name: 'VK for Windows (official)',
    publisher: 'vk',
    gate: 'direct-auth-only',
    recommendation: 'unavailable',
    evidence: 'Only the private password grant; not usable from a browser.',
  }),
  source({
    clientId: 6146827,
    name: 'VK Me (official)',
    publisher: 'vk',
    gate: 'direct-auth-only',
    recommendation: 'unavailable',
    evidence: 'Only the private password grant; not usable from a browser.',
  }),
  source({
    clientId: 3502557,
    name: 'VK for Windows Phone (official)',
    publisher: 'vk',
    gate: 'disabled',
    recommendation: 'unavailable',
    evidence: 'Gate answers "application is disabled".',
  }),
]);

/**
 * Catalogue entries a user could still try, best first. Third-party
 * clients are excluded unless `includeThirdParty` is set, which keeps
 * small or unknown publishers out of the default answer.
 */
export const rankVkTokenSources = ({
  sources = VK_TOKEN_SOURCES,
  includeThirdParty = false,
} = {}) =>
  sources
    .filter((entry) => entry.recommendation !== 'unavailable')
    .filter((entry) => includeThirdParty || entry.publisher === 'vk')
    .map((entry, index) => ({ entry, index }))
    .sort(
      (a, b) =>
        VK_RECOMMENDATIONS.indexOf(a.entry.recommendation) -
          VK_RECOMMENDATIONS.indexOf(b.entry.recommendation) ||
        a.index - b.index
    )
    .map(({ entry }) => entry);

/**
 * What the VK API error codes a token holder is likely to meet mean in
 * practice. Codes from https://dev.vk.ru/ru/reference/errors.
 */
export const VK_ERROR_HINTS = Object.freeze({
  3: 'Unknown method: VK only serves documented methods to third-party integrations.',
  5: 'Authorization failed: the token is invalid, expired or revoked. Issue a new one.',
  6: 'Too many requests per second: slow down.',
  7: 'Permission denied: the token lacks the right for this method (for messages, new apps cannot get it).',
  9: 'Flood control: VK refuses this traffic. For borrowed clients such as Kate Mobile this is a permanent cut-off, not a pause.',
  15: 'Access denied: the token cannot use this method or object.',
  17: 'Validation required: open the redirect_uri from the error in a browser and confirm the login.',
  27: 'Group authorization failed: this is a community token; the method needs a user token.',
  28: 'Application authorization failed: the client_id behind this token is restricted.',
  29: 'Rate limit reached: the monthly or daily quota of the client_id behind this token is exhausted.',
});

export const vkErrorCode = (error) => {
  if (error?.vkCode !== undefined) {
    return Number(error.vkCode);
  }
  const match = /vk API (\d+):/.exec(String(error?.message ?? error ?? ''));
  return match ? Number(match[1]) : null;
};

export const describeVkError = (errorOrCode) => {
  const code =
    typeof errorOrCode === 'number' ? errorOrCode : vkErrorCode(errorOrCode);
  return VK_ERROR_HINTS[code] ?? null;
};

const attempt = async (fn) => {
  try {
    return { ok: true, value: await fn() };
  } catch (error) {
    const code = vkErrorCode(error);
    return {
      ok: false,
      code,
      message: String(error?.message ?? error),
      hint: describeVkError(code),
    };
  }
};

/**
 * Check what an existing VK token can still do, using three documented
 * read-only calls: `users.get`, `account.getAppPermissions` and
 * `messages.getConversations` with `count=1`. Nothing is written and
 * the token is only sent to the VK API host.
 *
 * `verdict` is one of:
 *  - `invalid`        the token is rejected (`users.get` fails);
 *  - `community`      a community token (messages work via Bots Long Poll);
 *  - `messages`       a user token that can read messages right now;
 *  - `no-messages`    a user token whose messages calls are refused.
 */
export const inspectVkToken = async ({
  token,
  fetchImpl,
  baseUrl,
  apiVersion,
} = {}) => {
  const live = createVkLive({ token, fetchImpl, baseUrl, apiVersion });
  const user = await attempt(() => live.call('users.get'));
  if (!user.ok) {
    return {
      verdict: user.code === 27 ? 'community' : 'invalid',
      user: null,
      scopes: [],
      offline: false,
      messages: user,
    };
  }
  const profile = Array.isArray(user.value) ? (user.value[0] ?? null) : null;
  if (!profile) {
    // users.get without user_ids answers [] for community tokens.
    return {
      verdict: 'community',
      user: null,
      scopes: [],
      offline: false,
      messages: {
        ok: false,
        code: null,
        message: 'community token',
        hint: null,
      },
    };
  }
  const permissions = await attempt(() =>
    live.call('account.getAppPermissions')
  );
  const scopes = permissions.ok ? decodeVkUserScope(permissions.value) : [];
  const messages = await attempt(() =>
    live.call('messages.getConversations', { count: 1 })
  );
  return {
    verdict: messages.ok ? 'messages' : 'no-messages',
    user: {
      id: profile.id ?? null,
      name: [profile.first_name, profile.last_name].filter(Boolean).join(' '),
    },
    scopes,
    offline: scopes.includes('offline'),
    messages: messages.ok ? { ok: true } : messages,
  };
};
