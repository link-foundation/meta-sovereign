/**
 * Privacy and security of the connected account, as Telegram Desktop's
 * Settings → Privacy and Security has it (R-Y139; learned, never copied):
 * - `privacyRules()` — account.getPrivacy for each key → `{ ok, keys:
 *   [{ key, choice, label, allow, disallow, options }] }`; `choice` is
 *   `everybody`, `contacts`, `nobody` or `other` (then `label` names it:
 *   `close-friends`, `premium` or `except-contacts`), `allow` and
 *   `disallow` count the exceptions (people and chats) and are only
 *   shown, never edited;
 * - `setPrivacy({ key, choice })` — account.setPrivacy with the base rule
 *   of the choice and the existing exceptions KEPT: the users come back
 *   with their access hashes in the answer to getPrivacy and go out as
 *   InputUser; the chats go out as the same ids; the bots rules stay. A
 *   key whose exceptions cannot all be converted is refused
 *   (`exceptions-unsupported`), never saved with fewer;
 * - `sessions()` — account.getAuthorizations → `{ ok, ttlDays, sessions }`;
 *   `terminateSession({ hash })` — account.resetAuthorization (never the
 *   current session); `terminateOthers()` — auth.resetAuthorizations;
 * - `blockedUsers({ offset, limit })` — contacts.getBlocked → `{ ok,
 *   count, items, next }`; `unblockUser({ id, accessHash })` —
 *   contacts.unblock.
 * - `defaultTtl()` — messages.getDefaultHistoryTTL → `{ ok, period }`
 *   (seconds, 0 off); `setDefaultTtl({ period })` —
 *   messages.setDefaultHistoryTTL, the timer new chats start with
 *   (R-Y151; the period is one of TTL_PERIODS).
 * Telegram's errors become codes the page shows as text.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';
import { TTL_PERIODS } from './telegram-ttl.js';

/** The page's key → the InputPrivacyKey constructor. */
export const PRIVACY_KEYS = {
  phoneNumber: 'InputPrivacyKeyPhoneNumber',
  addedByPhone: 'InputPrivacyKeyAddedByPhone',
  lastSeen: 'InputPrivacyKeyStatusTimestamp',
  profilePhoto: 'InputPrivacyKeyProfilePhoto',
  about: 'InputPrivacyKeyAbout',
  birthday: 'InputPrivacyKeyBirthday',
  forwards: 'InputPrivacyKeyForwards',
  calls: 'InputPrivacyKeyPhoneCall',
  voiceMessages: 'InputPrivacyKeyVoiceMessages',
  invites: 'InputPrivacyKeyChatInvite',
};
export const CHOICES = ['everybody', 'contacts', 'nobody'];
// "Who can find me by my number" is only everybody or my contacts.
const FIND_CHOICES = ['everybody', 'contacts'];
export const PAGE_MAX = 100;

const CODES = {
  FRESH_RESET_AUTHORISATION_FORBIDDEN: 'fresh-reset',
  HASH_INVALID: 'hash-invalid',
  PRIVACY_TOO_LONG: 'privacy-too-long',
  PRIVACY_KEY_INVALID: 'key-invalid',
  PRIVACY_VALUE_INVALID: 'value-invalid',
  USER_ID_INVALID: 'user-invalid',
  TTL_PERIOD_INVALID: 'bad-period',
  FLOOD_WAIT: 'flood',
};
const failure = failureOf(CODES);

const bad = (code) => ({ ok: false, error: code, code });
const textOf = (value) => String(value?.value ?? value);

const optionsOf = (key) => (key === 'addedByPhone' ? FIND_CHOICES : CHOICES);

// The base rules decide the choice; these beside them make it "other".
const BASES = {
  PrivacyValueAllowAll: 'everybody',
  PrivacyValueAllowContacts: 'contacts',
  PrivacyValueDisallowAll: 'nobody',
};
const LABELS = {
  PrivacyValueAllowCloseFriends: 'close-friends',
  PrivacyValueAllowPremium: 'premium',
  PrivacyValueDisallowContacts: 'except-contacts',
};
const USER_RULES = ['PrivacyValueAllowUsers', 'PrivacyValueDisallowUsers'];
const CHAT_RULES = [
  'PrivacyValueAllowChatParticipants',
  'PrivacyValueDisallowChatParticipants',
];
// The bots rules are neither a choice nor an exception: kept as they are.
const KEPT_OTHER = {
  PrivacyValueAllowBots: 'InputPrivacyValueAllowBots',
  PrivacyValueDisallowBots: 'InputPrivacyValueDisallowBots',
};

const nameOfRule = (rule) => String(rule?.className ?? '');

/**
 * The rules Telegram returned as the page shows them: the choice, a label
 * when it is none of the three, and the exception counts.
 */
export const choiceOf = (rules) => {
  const counts = { allow: 0, disallow: 0 };
  let choice = null;
  let label = null;
  for (const rule of rules ?? []) {
    const name = nameOfRule(rule);
    if (USER_RULES.includes(name) || CHAT_RULES.includes(name)) {
      const side = name.includes('Disallow') ? 'disallow' : 'allow';
      counts[side] += (rule.users ?? rule.chats ?? []).length;
    } else if (BASES[name]) {
      choice = BASES[name];
    } else if (LABELS[name]) {
      label = label ?? LABELS[name];
    }
  }
  return label
    ? { choice: 'other', label, ...counts }
    : { choice: choice ?? 'nobody', label: null, ...counts };
};

// A rule's people as InputUser, from the users the answer carries; null
// when one of them has no access hash there.
const inputUsers = (c, rule, users) => {
  const out = [];
  for (const id of rule.users ?? []) {
    const user = users.get(textOf(id));
    if (!user || user.accessHash === undefined || user.accessHash === null) {
      return null;
    }
    out.push(
      new c.Api.InputUser({
        userId: c.helpers.returnBigInt(textOf(id)),
        accessHash: user.accessHash,
      })
    );
  }
  return out;
};

const BASE_INPUT = {
  everybody: 'InputPrivacyValueAllowAll',
  contacts: 'InputPrivacyValueAllowContacts',
  nobody: 'InputPrivacyValueDisallowAll',
};

// One existing rule as its input form: the exceptions kept, the bots
// rules passed on, every other rule dropped (the choice replaces it).
// `undefined` drops it; null means it cannot be converted.
const inputRule = (c, rule, users) => {
  const name = nameOfRule(rule);
  if (USER_RULES.includes(name)) {
    const list = inputUsers(c, rule, users);
    return list && new c.Api[`Input${name}`]({ users: list });
  }
  if (CHAT_RULES.includes(name)) {
    return new c.Api[`Input${name}`]({
      chats: (rule.chats ?? []).map((id) => c.helpers.returnBigInt(textOf(id))),
    });
  }
  return KEPT_OTHER[name] ? new c.Api[KEPT_OTHER[name]]() : undefined;
};

/**
 * The input rules for a new choice, the existing exceptions kept; null
 * when one of them cannot be converted.
 */
export const rulesFor = (c, answer, choice) => {
  const users = new Map((answer?.users ?? []).map((u) => [textOf(u.id), u]));
  const out = [];
  for (const rule of answer?.rules ?? []) {
    const converted = inputRule(c, rule, users);
    if (converted === null || converted === false) {
      return null;
    }
    if (converted) {
      out.push(converted);
    }
  }
  return [...out, new c.Api[BASE_INPUT[choice]]()];
};

const summary = (key, answer) => ({
  key,
  ...choiceOf(answer?.rules),
  options: optionsOf(key),
});

const ask = (env, c, queue, request) =>
  runIn(env, `privacy:${queue}`, () => c.client.invoke(request));

const getRules = (env, c, key) =>
  ask(
    env,
    c,
    key,
    new c.Api.account.GetPrivacy({ key: new c.Api[PRIVACY_KEYS[key]]() })
  );

const readRules = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const keys = [];
    let first = null;
    for (const key of Object.keys(PRIVACY_KEYS)) {
      if (!c.Api[PRIVACY_KEYS[key]]) {
        continue;
      }
      try {
        keys.push(summary(key, await getRules(env, c, key)));
      } catch (error) {
        first = first ?? error;
      }
    }
    return keys.length === 0 && first ? failure(first) : { ok: true, keys };
  });

const writeRule =
  (env, userClient) =>
  async (request = {}) => {
    const { key, choice } = request;
    if (!Object.hasOwn(PRIVACY_KEYS, key) || !optionsOf(key).includes(choice)) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      const rules = rulesFor(c, await getRules(env, c, key), choice);
      if (!rules) {
        return bad('exceptions-unsupported');
      }
      const next = await ask(
        env,
        c,
        key,
        new c.Api.account.SetPrivacy({
          key: new c.Api[PRIVACY_KEYS[key]](),
          rules,
        })
      );
      return { ok: true, ...summary(key, next) };
    });
  };

const iso = (seconds) =>
  Number.isFinite(Number(seconds)) && seconds
    ? new Date(Number(seconds) * 1000).toISOString()
    : null;

/** An Authorization as the page lists it. */
export const sessionOf = (a) => ({
  hash: textOf(a.hash),
  current: Boolean(a.current),
  official: Boolean(a.officialApp),
  // R-Y177: Telegram's flags say what is refused.
  secretChats: !a.encryptedRequestsDisabled,
  calls: !a.callRequestsDisabled,
  pending: Boolean(a.unconfirmed),
  device: a.deviceModel ?? '',
  platform: a.platform ?? '',
  system: a.systemVersion ?? '',
  app: a.appName ?? '',
  appVersion: a.appVersion ?? '',
  ip: a.ip ?? '',
  country: a.country ?? '',
  region: a.region ?? '',
  created: iso(a.dateCreated),
  active: iso(a.dateActive),
});

const authorizations = (env, c) =>
  ask(env, c, 'sessions', new c.Api.account.GetAuthorizations());

const readSessions = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const answer = await authorizations(env, c);
    return {
      ok: true,
      ttlDays: Number(answer?.authorizationTtlDays ?? 0),
      sessions: (answer?.authorizations ?? []).map(sessionOf),
    };
  });

const endOne =
  (env, userClient) =>
  async (request = {}) => {
    const hash = String(request.hash ?? '');
    if (!/^-?\d{1,20}$/.test(hash)) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      // Never the session in use: Telegram would log this app out.
      const list = await authorizations(env, c);
      const mine = (list?.authorizations ?? []).find((a) => a.current);
      if (mine && textOf(mine.hash) === hash) {
        return bad('current-session');
      }
      await ask(
        env,
        c,
        'sessions',
        new c.Api.account.ResetAuthorization({
          hash: c.helpers.returnBigInt(hash),
        })
      );
      return { ok: true };
    });
  };

const endOthers = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    await ask(env, c, 'sessions', new c.Api.auth.ResetAuthorizations());
    return { ok: true };
  });

const personName = (user) =>
  [user?.firstName, user?.lastName].filter(Boolean).join(' ') ||
  user?.username ||
  '';

const blockedItem = (b, users) => {
  const id = textOf(b.peerId.userId);
  const user = users.get(id) ?? {};
  return {
    id,
    accessHash:
      user.accessHash === undefined || user.accessHash === null
        ? ''
        : textOf(user.accessHash),
    name: personName(user),
    username: user.username ?? '',
  };
};

const readBlocked =
  (env, userClient) =>
  async (request = {}) => {
    const offset = Math.max(0, Math.trunc(Number(request.offset ?? 0)));
    const limit = Math.min(PAGE_MAX, Math.max(1, Number(request.limit ?? 50)));
    return connected(env, userClient, failure, async (c) => {
      const answer = await ask(
        env,
        c,
        'blocked',
        new c.Api.contacts.GetBlocked({ offset, limit })
      );
      const users = new Map(
        (answer?.users ?? []).map((u) => [textOf(u.id), u])
      );
      const rows = answer?.blocked ?? [];
      const count = Number(answer?.count ?? offset + rows.length);
      return {
        ok: true,
        count,
        items: rows
          .filter((b) => b?.peerId?.className === 'PeerUser')
          .map((b) => blockedItem(b, users)),
        next:
          rows.length > 0 && offset + rows.length < count
            ? offset + rows.length
            : null,
      };
    });
  };

const unblock =
  (env, userClient) =>
  async (request = {}) => {
    const id = String(request.id ?? '');
    const hash = String(request.accessHash ?? '');
    if (!/^\d{1,20}$/.test(id) || !/^-?\d{1,20}$/.test(hash)) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      await ask(
        env,
        c,
        'blocked',
        new c.Api.contacts.Unblock({
          id: new c.Api.InputPeerUser({
            userId: c.helpers.returnBigInt(id),
            accessHash: c.helpers.returnBigInt(hash),
          }),
        })
      );
      return { ok: true };
    });
  };

const readDefaultTtl = (env, userClient) => async () =>
  connected(env, userClient, failure, async (c) => {
    const answer = await ask(
      env,
      c,
      'default-ttl',
      new c.Api.messages.GetDefaultHistoryTTL()
    );
    return { ok: true, period: Number(answer?.period ?? 0) || 0 };
  });

const writeDefaultTtl =
  (env, userClient) =>
  async (request = {}) => {
    const { period } = request;
    if (!TTL_PERIODS.includes(period)) {
      return bad('bad-request');
    }
    return connected(env, userClient, failure, async (c) => {
      await ask(
        env,
        c,
        'default-ttl',
        new c.Api.messages.SetDefaultHistoryTTL({ period })
      );
      return { ok: true, period };
    });
  };

export const createPrivacy = (env, context) => ({
  defaultTtl: readDefaultTtl(env, context.userClient),
  setDefaultTtl: writeDefaultTtl(env, context.userClient),
  privacyRules: readRules(env, context.userClient),
  setPrivacy: writeRule(env, context.userClient),
  sessions: readSessions(env, context.userClient),
  terminateSession: endOne(env, context.userClient),
  terminateOthers: endOthers(env, context.userClient),
  blockedUsers: readBlocked(env, context.userClient),
  unblockUser: unblock(env, context.userClient),
});
