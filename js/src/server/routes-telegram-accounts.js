// More than one Telegram account (R-Y198; learned, never copied): the
// routes of the POSTS table in routes-telegram.js, plus the one place
// that picks the account a request is for. A request without `account`
// (every request the page sends today) is account 1, the existing single
// account, exactly as before. An extra account (2..5) answers only the
// routes in EXTRA_ROUTES; any other route asked for it is refused with
// `unsupported-account`, never run against account 1 by mistake.
//
// Its routes:
//   POST /api/telegram/accounts {} -> { ok, accounts: [{ account, name,
//                       username?, id?, current? }], limit, premium, canAdd,
//                       next } the signed-in accounts (1 first), how many
//                       are allowed (3, 5 with Premium), and the slot the
//                       next "Add account" signs in to (null: at the limit)
//   POST /api/telegram/accounts-unread {} -> { ok, unread: [{ account,
//                       unread }] } the other accounts' unread counts,
//                       read live (nothing stored)
//   POST /api/telegram/accounts-dialogs {account} -> { ok, dialogs: [{
//                       chat, name, text, date, unread }], unread } an
//                       extra account's chat list, read live
//   POST /api/telegram/accounts-logout {account} -> { ok, removed } an
//                       extra account (2..5) logged out: only its own
//                       namespaced keys are removed; account 1 is refused
//
// The sign-in of an extra account is the existing login flow with
// `account` in its bodies (routes-auto-import.js).

import {
  accountSlot,
  extraSlots,
  limitFor,
  nextFreeSlot,
  profileId,
  removeExtraAccount,
} from '../sources/telegram-accounts.js';

/** Routes of this file: they read `body.account` themselves. */
const OWN = new Set(['accounts', 'accounts-unread', 'accounts-logout']);
/** The only routes an extra account answers. */
const EXTRA_ROUTES = new Set(['accounts-dialogs']);

const BAD = [400, { error: 'bad account', code: 'bad-request' }];
const NO_ACCOUNT = [404, { error: 'no such account', code: 'no-account' }];
const UNSUPPORTED = [
  400,
  { error: 'not available for this account', code: 'unsupported-account' },
];

/**
 * Which account a POST is for: `{ account }` to run it on, or `{ error }`
 * as the route's `[status, body]`. `account` is the existing single one.
 */
export const resolveAccount = async (ctx, account, name, body = {}) => {
  if (OWN.has(name)) {
    return { account };
  }
  const slot = accountSlot(body.account);
  if (slot === null) {
    return { error: BAD };
  }
  if (slot === 1) {
    return name === 'accounts-dialogs' ? { error: UNSUPPORTED } : { account };
  }
  if (!EXTRA_ROUTES.has(name)) {
    return { error: UNSUPPORTED };
  }
  const extra = await ctx?.telegramAccounts?.resolve(slot);
  return extra ? { account: extra } : { error: NO_ACCOUNT };
};

const firstAccount = async (account) => {
  const me =
    typeof account.accountMe === 'function'
      ? await account.accountMe().catch(() => null)
      : null;
  return {
    account: 1,
    current: true,
    id: me?.ok ? (me.id ?? null) : null,
    name: me?.ok ? (me.name ?? null) : null,
    username: me?.ok ? (me.username ?? null) : null,
    premium: Boolean(me?.ok && me.premium),
  };
};

const listAccounts = async (account, body, ctx) => {
  const store = ctx.telegramStore;
  if (!store) {
    return [501, { error: 'accounts not available', code: 'unsupported' }];
  }
  const first = await firstAccount(account);
  const extras = [];
  for (const slot of await extraSlots(store)) {
    const profile = await store.get(profileId(slot));
    extras.push({
      account: slot,
      name: profile?.name ?? null,
      username: profile?.username ?? null,
    });
  }
  const limit = limitFor(first.premium);
  const { premium, ...head } = first;
  const next = await nextFreeSlot(store, limit);
  return [
    200,
    {
      ok: true,
      accounts: [head, ...extras],
      limit,
      premium,
      canAdd: next !== null,
      next,
    },
  ];
};

const unreadOfOthers = async (account, body, ctx) => {
  const store = ctx.telegramStore;
  const unread = [];
  for (const slot of store ? await extraSlots(store) : []) {
    const answer = await ctx.telegramAccounts?.dialogs(slot);
    unread.push({ account: slot, unread: answer?.ok ? answer.unread : null });
  }
  return [200, { ok: true, unread }];
};

const logout = async (account, body, ctx) => {
  const slot = accountSlot(body.account);
  const store = ctx.telegramStore;
  if (slot === null || slot < 2 || !store) {
    return BAD;
  }
  await ctx.telegramAccounts?.revoke(slot);
  const removed = await removeExtraAccount(store, slot);
  return [200, { ok: true, removed }];
};

export const ACCOUNTS_POSTS = {
  accounts: listAccounts,
  'accounts-unread': unreadOfOthers,
  'accounts-logout': logout,
  'accounts-dialogs': async (account) => [200, await account.dialogs()],
};
