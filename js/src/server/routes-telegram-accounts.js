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
//   POST /api/telegram/accounts-unread {all?} -> { ok, unread: [{ account,
//                       unread }] } the other accounts' unread counts: from
//                       the account's own store while it runs (R-Y202), else
//                       read live (nothing stored); `all: true` adds
//                       account 1's count, for a page that uses another
//   GET  /api/telegram/accounts-events -> Server-Sent Events: `event:
//                       message` for each new incoming message of any
//                       account (R-Y202), { account, id, chat, chatName,
//                       sender, body, at, muted }, so the page can notify
//                       for the accounts it is not showing
//   POST /api/telegram/accounts-dialogs {account} -> { ok, dialogs: [{
//                       chat, name, text, date, unread }], unread } an
//                       extra account's chat list (from its store while it
//                       runs, else read live)
//   POST /api/telegram/accounts-logout {account} -> { ok, removed } an
//                       extra account (2..5) logged out: its service stops,
//                       the session ends on Telegram's side, only its own
//                       namespaced keys and its own store directory
//                       (accounts/telegram-N) are removed; account 1 is
//                       refused
//
// R-Y202: an extra account is also fully usable. Every other route of
// /api/telegram/*, and the link, chat, events, send and message routes,
// answer for it when the request names it (`telegramAccount=N`, see
// ./account-scope.js); this file's routes are account-global.
//
// The sign-in of an extra account is the existing login flow with
// `account` in its bodies (routes-auto-import.js).

import { classifyOrigin } from './cors.js';
import { json } from './util.js';
import { unreadOfStore } from './telegram-extras.js';
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

const MAX_BUFFERED = 1024 * 1024;
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
  // A running account answers from its own store (a second connection
  // with the same session would be refused by Telegram).
  const running = ctx?.telegramExtras?.get(slot);
  if (running) {
    return { account: { dialogs: () => storeDialogs(running) } };
  }
  const extra = await ctx?.telegramAccounts?.resolve(slot);
  return extra ? { account: extra } : { error: NO_ACCOUNT };
};

// A running account's chat list as the preview shows it, from its store.
const storeDialogs = async (entry) => {
  const heads = await entry.chatIndex.heads();
  const rows = [];
  for (const link of heads) {
    const read = await entry.own.get(`read:telegram:${link.chat}`);
    rows.push({
      chat: String(link.chat),
      name: link.chatName ?? link.senderName ?? null,
      text: String(link.body ?? ''),
      date: Date.parse(link.timestamp ?? '') || null,
      unread: Number(read?.unreadCount ?? 0),
      muted: Number(read?.muteUntil ?? 0) * 1000 > Date.now(),
    });
  }
  rows.sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
  return {
    ok: true,
    at: Date.now(),
    dialogs: rows,
    unread: await unreadOfStore(entry.own),
  };
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
      ...(profile?.accountId ? { id: profile.accountId } : {}),
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
  if (body?.all === true && ctx.telegramExtras) {
    unread.push({ account: 1, unread: await ctx.telegramExtras.homeUnread() });
  }
  for (const slot of store ? await extraSlots(store) : []) {
    // A running account's count is its own store's; only one that is not
    // running is asked from Telegram.
    const own = await ctx.telegramExtras?.unread(slot);
    if (own !== null && own !== undefined) {
      unread.push({ account: slot, unread: own });
      continue;
    }
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
  // Its service stops first (one connection per session), then the
  // session ends on Telegram's side, then its keys and its own store
  // directory go: nothing of account 1 or another account is touched.
  await ctx.telegramExtras?.stopSlot(slot);
  await ctx.telegramAccounts?.revoke(slot);
  const removed = await removeExtraAccount(store, slot);
  await ctx.telegramExtras?.remove(slot);
  return [200, { ok: true, removed }];
};

// The notification stream (R-Y202): a new incoming message of any
// account, so the page can notify for the accounts it is not showing.
const FRAME = (data) => `event: message\ndata: ${JSON.stringify(data)}\n\n`;
const accountEvents = (account, req, res, ctx) => {
  if (classifyOrigin(req, ctx.allowOrigins ?? []) === 'denied') {
    return json(res, 403, { error: 'origin not allowed' }) ?? true;
  }
  if (!ctx.telegramExtras || ctx.passcode?.locked()) {
    return json(res, 501, { error: 'accounts not available' }) ?? true;
  }
  res.writeHead(200, {
    'content-type': 'text/event-stream; charset=utf-8',
    'cache-control': 'no-cache, no-transform',
    ...(req.httpVersionMajor === 2 ? {} : { connection: 'keep-alive' }),
    'x-accel-buffering': 'no',
  });
  res.write('retry: 5000\n\n: open\n\n');
  const stop = ctx.telegramExtras.watch((event) => {
    if (res.writableLength < MAX_BUFFERED) {
      res.write(FRAME(event));
    }
  });
  const ping = globalThis.setInterval(() => res.write(': ping\n\n'), 25_000);
  ping.unref?.();
  const close = () => {
    globalThis.clearInterval(ping);
    stop();
  };
  req.on('close', close);
  res.on('error', close);
  return true;
};

export const ACCOUNTS_GETS = { 'accounts-events': accountEvents };

export const ACCOUNTS_POSTS = {
  accounts: listAccounts,
  'accounts-unread': unreadOfOthers,
  'accounts-logout': logout,
  'accounts-dialogs': async (account) => [200, await account.dialogs()],
};
