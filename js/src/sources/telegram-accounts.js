/**
 * More than one Telegram account, as Telegram Desktop allows: up to 3,
 * up to 5 with Premium (R-Y198; learned, never copied).
 *
 * Additions only. Account 1 is today's single account and keeps its keys
 * (`secret:telegram:*`, `msg:telegram:*`, ...) and its whole service
 * untouched: this module never writes under them. An extra account lives
 * in its own namespace:
 *   secret:telegram@2:user-session | api-id | api-hash   its session
 *   account:telegram@2                                   public name only
 * Nothing exists for a slot until the user adds the account.
 *
 * What an extra account can do today (honest scope): be signed in (the
 * existing login flow, parameterized by `account`), be listed with its
 * name, show its chat list and unread count read live from Telegram
 * (nothing is written to the message store, so no `telegram@2` messages
 * mix with account 1's), and be logged out (auth.logOut, then only its `@2` keys go).
 * R-Y202 makes an extra account fully usable: each runs on its own store
 * (src/server/telegram-extras.js), so `msg:telegram:*` and the page's
 * `source: 'telegram'` stay as they are. The dialogs here remain the
 * preview of an account whose service is not running.
 *
 * Session contents are never logged or returned.
 */

import { accountOf, gramjsClientFactory } from './telegram-mtproto.js';
import { readProxy } from './telegram-proxy.js';
import { importTelegram } from './telegram-layer.js';
import { connected, failureOf } from './telegram-stickers.js';

export const MAX_ACCOUNTS = 3;
export const MAX_ACCOUNTS_PREMIUM = 5;
/** The secrets one account's sign-in keeps (all of its secrets). */
export const SECRET_NAMES = ['user-session', 'api-id', 'api-hash'];

/** The slot a request names: 1 when absent, 2..5 as asked, else null. */
export const accountSlot = (value) => {
  if (value === undefined || value === null || value === '') {
    return 1;
  }
  const slot = Number(value);
  return Number.isInteger(slot) && slot >= 1 && slot <= MAX_ACCOUNTS_PREMIUM
    ? slot
    : null;
};

/** The namespace of a slot: `telegram` for account 1, else `telegram@2`. */
export const namespaceOf = (slot) =>
  slot === 1 ? 'telegram' : `telegram@${slot}`;

/** The store id of one of a slot's secrets. */
export const secretId = (slot, name) => `secret:${namespaceOf(slot)}:${name}`;

/** The id of an extra account's public profile link. */
export const profileId = (slot) => `account:${namespaceOf(slot)}`;

const secretValue = (link) =>
  link?.value ?? link?.token ?? link?.body ?? link?.text ?? null;

/** A slot's stored user session, or null (reads only). */
export const readSlotCredentials = async (store, slot) => {
  const read = async (name) =>
    secretValue(await store.get(secretId(slot, name)));
  const [session, apiId, apiHash] = await Promise.all(SECRET_NAMES.map(read));
  return session ? { kind: 'user', session, apiId, apiHash } : null;
};

/** The extra slots (2..5) that hold a signed-in account. Reads only. */
export const extraSlots = async (store) => {
  const slots = [];
  for (let slot = 2; slot <= MAX_ACCOUNTS_PREMIUM; slot += 1) {
    if (await store.get(secretId(slot, 'user-session'))) {
      slots.push(slot);
    }
  }
  return slots;
};

/** The first free extra slot within `limit` accounts in all, or null. */
export const nextFreeSlot = async (store, limit) => {
  const taken = new Set(await extraSlots(store));
  for (let slot = 2; slot <= limit; slot += 1) {
    if (!taken.has(slot)) {
      return slot;
    }
  }
  return null;
};

/** How many accounts the user may have: 3, or 5 with Premium. */
export const limitFor = (premium) =>
  premium ? MAX_ACCOUNTS_PREMIUM : MAX_ACCOUNTS;

const stamp = () => new Date().toISOString();

/** Keep a freshly signed-in extra account (slot 2 or more only). */
export const saveExtraAccount = async (
  store,
  slot,
  { apiId, apiHash, session, account }
) => {
  if (!Number.isInteger(slot) || slot < 2) {
    throw new Error('only an extra account is saved here');
  }
  const put = (name, value) =>
    store.put({
      id: secretId(slot, name),
      tokens: ['secret', namespaceOf(slot), name],
      value,
      updated: stamp(),
    });
  await put('user-session', session);
  await put('api-id', String(apiId));
  await put('api-hash', apiHash);
  await store.put({
    id: profileId(slot),
    tokens: ['account', namespaceOf(slot)],
    source: 'telegram',
    slot,
    name:
      [account?.firstName, account?.lastName].filter(Boolean).join(' ') ||
      account?.username ||
      null,
    username: account?.username ?? null,
    // Its own id (R-Y202): the avatar of the account it is shown with.
    accountId: account?.id ? String(account.id) : null,
    updated: stamp(),
  });
};

/**
 * Log an extra account out: only that slot's own keys are removed.
 * Account 1 is never removed here. Returns how many keys went.
 */
export const removeExtraAccount = async (store, slot) => {
  if (!Number.isInteger(slot) || slot < 2 || slot > MAX_ACCOUNTS_PREMIUM) {
    throw new Error('only an extra account can be removed here');
  }
  let removed = 0;
  for (const id of [
    ...SECRET_NAMES.map((name) => secretId(slot, name)),
    profileId(slot),
  ]) {
    if (await store.get(id)) {
      await store.delete(id);
      removed += 1;
    }
  }
  return removed;
};

const CODES = { AUTH_KEY_UNREGISTERED: 'signed-out', FLOOD_WAIT: 'flood' };
const meFailure = failureOf(CODES);
const text = (value) => String(value?.value ?? value);

const meOf = (me) => ({
  ...accountOf(me),
  name:
    [me?.firstName, me?.lastName].filter(Boolean).join(' ') ||
    me?.username ||
    null,
  premium: Boolean(me?.premium),
});

/** Account 1's own name and Premium flag, from its connection. */
export const createAccountsActions = (env, context) => ({
  accountMe: async () =>
    connected(env, context.userClient, meFailure, async (c) => ({
      ok: true,
      ...meOf(await c.client.getMe()),
    })),
});

// One dialog as the preview list shows it: a name, the newest message's
// text, when, and the unread count. Nothing of it is stored.
export const dialogRow = (dialog) => ({
  chat: text(dialog.id),
  name: dialog.title ?? dialog.name ?? null,
  text: dialog.message?.message ?? '',
  date: dialog.date ? Number(dialog.date) * 1000 : null,
  unread: Number(dialog.unreadCount ?? 0),
  muted: Boolean(dialog.dialog?.notifySettings?.muteUntil),
});

/**
 * The extra accounts' live side: `resolve(slot)` answers a small account
 * service (status, dialogs) for a signed-in slot, or null. Clients are
 * opened on demand and dropped after `idleMs`; nothing is written.
 */
export const createExtraAccounts = ({
  store,
  clientFactory = gramjsClientFactory(importTelegram, {
    proxy: () => readProxy(store),
  }),
  log = () => {},
  now = () => Date.now(),
  idleMs = 60_000,
  dialogLimit = 40,
  loadApi = async () => (await importTelegram()).Api,
} = {}) => {
  const open = new Map(); // slot -> { client, timer }

  const drop = async (slot) => {
    const entry = open.get(slot);
    open.delete(slot);
    if (entry) {
      globalThis.clearTimeout(entry.timer);
      await Promise.resolve(entry.client.disconnect?.()).catch(() => {});
    }
  };

  const clientOf = async (slot) => {
    const creds = await readSlotCredentials(store, slot);
    if (!creds) {
      return null;
    }
    let entry = open.get(slot);
    if (!entry) {
      const client = await clientFactory({
        apiId: creds.apiId,
        apiHash: creds.apiHash,
        session: creds.session,
      });
      await client.connect();
      entry = { client, timer: null };
      open.set(slot, entry);
    }
    globalThis.clearTimeout(entry.timer);
    entry.timer = globalThis.setTimeout(() => drop(slot), idleMs);
    entry.timer.unref?.();
    return entry.client;
  };

  const dialogs = async (slot) => {
    const client = await clientOf(slot);
    if (!client) {
      return { ok: false, error: 'no-account', code: 'no-account' };
    }
    try {
      const listed = (await client.getDialogs({ limit: dialogLimit })) ?? [];
      const rows = [...listed]
        .map(dialogRow)
        .sort((a, b) => (b.date ?? 0) - (a.date ?? 0));
      const unread = rows.reduce((n, r) => n + (r.muted ? 0 : r.unread), 0);
      return { ok: true, at: now(), dialogs: rows, unread };
    } catch (error) {
      log({ level: 'warn', event: 'telegram_extra_failed', slot });
      await drop(slot);
      return { ok: false, ...meFailure(error) };
    }
  };

  // "Log out" ends the session on Telegram's side too (auth.logOut), as
  // Telegram Desktop does; when that fails the session is still forgotten
  // here.
  const revoke = async (slot) => {
    try {
      const client = await clientOf(slot);
      if (client) {
        const Api = await loadApi();
        await client.invoke(new Api.auth.LogOut());
      }
    } catch {
      log({ level: 'warn', event: 'telegram_extra_logout_failed', slot });
    }
    await drop(slot);
  };

  const resolve = async (slot) =>
    slot >= 2 && (await store.get(secretId(slot, 'user-session')))
      ? {
          slot,
          status: async () => ({ connected: true, slot, kind: 'user' }),
          dialogs: () => dialogs(slot),
        }
      : null;

  return {
    resolve,
    dialogs,
    drop,
    revoke,
    stop: async () => {
      await Promise.all([...open.keys()].map(drop));
    },
  };
};
