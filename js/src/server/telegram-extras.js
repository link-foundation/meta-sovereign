/**
 * The extra Telegram accounts, each fully usable (R-Y202; learned, never
 * copied: Telegram Desktop switches its whole window to the account the
 * user picks). R-Y198 only listed them; here each signed-in extra account
 * N (2..5) runs its own service on its own store, so nothing of it can
 * mix with account 1:
 *
 *   <store dir>/accounts/telegram-N/   its own link store (data.lino, ...)
 *   <store dir>/accounts/telegram-N/media/telegram   its downloaded pictures
 *
 * The directory is made only when the account is signed in, and removed
 * (that one directory, nothing else) when it is logged out.
 *
 * Credentials. The account's secrets stay where R-Y198 keeps them, in
 * account 1's store under `secret:telegram@N:*`. `createTelegramAccount`
 * reads `secret:telegram:*` from the store it is given, so that store is
 * wrapped (`borrowSecrets`): a read of `secret:telegram:user-session`,
 * `api-id` or `api-hash` is answered from account 1's `@N` key, the
 * bot token is never offered, and the connection proxy is account 1's.
 * No secret is copied into the account's own store, and nothing is ever
 * written to account 1's store from here (reads and a change
 * subscription only).
 *
 * `createExtraRuntime` keeps one entry per running slot: its store, its
 * chat index (the chat list and history pages), its service, and the
 * sender the composer uses. `scopedContext` is the server context a
 * request for that account is answered with.
 */

import path from 'node:path';
import { promises as fs } from 'node:fs';
import { createMemoryStore } from '../storage/universal.js';
import { openDualStore } from '../storage/dual-store.js';
import { withMessageVersions } from '../storage/message-versions.js';
import { createTelegramAccount } from '../sources/telegram-account.js';
import { createDefaultSender } from '../sources/browser-sender.js';
import { getSource, liveOptionsFrom } from '../sources/index.js';
import { setTypingFor } from '../sources/live-links.js';
import {
  MAX_ACCOUNTS_PREMIUM,
  SECRET_NAMES,
  extraSlots,
  readSlotCredentials,
  secretId,
} from '../sources/telegram-accounts.js';
import { PROXY_ID } from '../sources/telegram-proxy.js';
import { createChatIndex } from './chat-index.js';
import { createConversationKnowledge } from './conversation-knowledge.js';
import { createReplyService } from '../replies/reply-service.js';

const FRESH_MS = 2 * 60_000;

const validSlot = (slot) =>
  Number.isInteger(slot) && slot >= 2 && slot <= MAX_ACCOUNTS_PREMIUM;

/** The directory of an extra account's own store, inside the store dir. */
export const accountDir = (storeDir, slot) => {
  if (!validSlot(slot) || !storeDir) {
    throw new Error('no directory for this account');
  }
  return path.join(storeDir, 'accounts', `telegram-${slot}`);
};

const secretValue = (link) =>
  link?.value ?? link?.token ?? link?.body ?? link?.text ?? null;

/**
 * `own` (the account's store) as the account service sees it: the
 * `secret:telegram:*` credentials are read from `home`'s
 * `secret:telegram@<slot>:*`. Everything else is `own`'s.
 */
export const borrowSecrets = (own, home, slot) => {
  const borrowed = async (id) => {
    const name = /^secret:telegram:(.+)$/.exec(id)?.[1];
    if (!name) {
      return undefined;
    }
    if (SECRET_NAMES.includes(name)) {
      const value = secretValue(await home.get(secretId(slot, name)));
      return value === null ? null : { id, value };
    }
    // The connection proxy is shared; a bot token or anything else is not.
    return id === PROXY_ID ? ((await home.get(PROXY_ID)) ?? null) : null;
  };
  return new Proxy(own, {
    get(target, prop) {
      if (prop === 'get') {
        return async (id, project) =>
          (await borrowed(id)) ?? target.get(id, project);
      }
      const value = Reflect.get(target, prop, target);
      return typeof value === 'function' ? value.bind(target) : value;
    },
  });
};

/** A store's unread count as the badge counts it: chats not muted. */
export const unreadOfStore = async (store, now = Date.now()) => {
  const reads = await store.query((link) =>
    String(link?.id ?? '').startsWith('read:telegram:')
  );
  return reads.reduce(
    (sum, read) =>
      sum +
      (Number(read.muteUntil ?? 0) * 1000 > now
        ? 0
        : Math.max(0, Number(read.unreadCount) || 0)),
    0
  );
};

/** The Telegram chats with their newest message, from a chat index. */
export const telegramChats = async (chatIndex) =>
  (await chatIndex.heads())
    .filter((link) => link.source === 'telegram')
    .map((link) => ({
      chat: String(link.chat),
      chatType: link.chatType ?? null,
      at: link.timestamp ?? null,
    }));

const sourcesFor = (account) => (name) => {
  const adapter = getSource(name);
  return name === 'telegram' && account && adapter
    ? { ...adapter, live: { ...adapter.live, ...account.live } }
    : adapter;
};

// An extra account sends through Telegram only: never through a browser
// that is signed in as someone else.
const NO_BROWSER = {
  send: async () => {
    throw Object.assign(new Error('this account sends through Telegram'), {
      code: 'no-browser',
      fallback: false,
    });
  },
  close: async () => {},
};

const senderOf = (store, account, log) => {
  const optionsFor = (source) =>
    liveOptionsFrom(store, source).catch(() => ({}));
  const getSourceFor = sourcesFor(account);
  return {
    send: createDefaultSender({
      getSource: getSourceFor,
      optionsFor,
      browser: NO_BROWSER,
      log,
    }),
    setTyping: async ({ source, chat, cancel }) =>
      setTypingFor(getSourceFor, {
        source,
        chat,
        cancel,
        options: await optionsFor(source),
      }).catch((error) => ({ supported: false, source, error: error.message })),
  };
};

const defaultBuild = ({ store, log, chats, mediaDir }) => {
  const account = createTelegramAccount({ store, log, chats, mediaDir });
  account.start();
  return { account };
};

const incoming = (link, now) =>
  typeof link?.id === 'string' &&
  link.id.startsWith('msg:telegram:') &&
  link.sender !== 'me' &&
  !link.deleted &&
  now - (Date.parse(link.timestamp ?? '') || 0) < FRESH_MS;

// The notification stream's source: a new incoming message of any account
// (account 1's store is only subscribed to, never written). It listens to
// the stores only while someone watches.
const createMessageWatch = ({ home, now, entries }) => {
  const watchers = new Set();
  const unwatch = new Map(); // slot -> unsubscribe

  const announce = async (slot, store, link) => {
    const read = await store.get(`read:telegram:${link.chat}`);
    const body = String(link.body ?? '');
    const event = {
      account: slot,
      id: link.id,
      chat: String(link.chat),
      chatName: link.chatName ?? link.senderName ?? null,
      sender: link.senderName ?? null,
      body: body.length > 200 ? `${body.slice(0, 200)}...` : body,
      at: link.timestamp ?? null,
      muted: Number(read?.muteUntil ?? 0) * 1000 > now(),
    };
    for (const watcher of watchers) {
      watcher(event);
    }
  };
  const attachNow = (slot, store) => {
    if (unwatch.has(slot) || typeof store.subscribe !== 'function') {
      return;
    }
    unwatch.set(
      slot,
      store.subscribe((event) => {
        if (event?.type !== 'delete' && incoming(event?.link, now())) {
          announce(slot, store, event.link).catch(() => {});
        }
      })
    );
  };
  const detach = (slot) => {
    unwatch.get(slot)?.();
    unwatch.delete(slot);
  };
  return {
    attach: (slot, store) => watchers.size > 0 && attachNow(slot, store),
    detach,
    watch: (listener) => {
      watchers.add(listener);
      attachNow(1, home);
      for (const [slot, entry] of entries) {
        attachNow(slot, entry.store);
      }
      return () => {
        watchers.delete(listener);
        if (watchers.size === 0) {
          [...unwatch.keys()].forEach(detach);
        }
      };
    },
  };
};

/**
 * The running extra accounts of `home` (account 1's store).
 * `openStore(slot)` -> `{ store, dir }` and `build({ store, slot, ... })`
 * -> `{ account, send?, setTyping? }` are replaceable (tests).
 */
export const createExtraRuntime = ({
  home,
  storeDir = null,
  openStore = null,
  build = defaultBuild,
  log = () => {},
  now = () => Date.now(),
} = {}) => {
  const entries = new Map(); // slot -> entry
  const starting = new Map(); // slot -> promise
  const messages = createMessageWatch({ home, now, entries });

  const open =
    openStore ??
    (async (slot) => {
      if (!storeDir) {
        return { store: createMemoryStore(), dir: null };
      }
      const dir = accountDir(storeDir, slot);
      return { store: await openDualStore(dir), dir };
    });

  const create = async (slot) => {
    if (!(await readSlotCredentials(home, slot))) {
      return null;
    }
    const { store: opened, dir } = await open(slot);
    const own = withMessageVersions(opened);
    const store = borrowSecrets(own, home, slot);
    const chatIndex = createChatIndex(store, { log });
    const built = await build({
      store,
      slot,
      log,
      chats: () => telegramChats(chatIndex),
      mediaDir: dir ? path.join(dir, 'media', 'telegram') : null,
    });
    const made = senderOf(store, built.account, log);
    const entry = {
      slot,
      store,
      own,
      dir,
      chatIndex,
      account: built.account,
      send: built.send ?? made.send,
      setTyping: built.setTyping ?? made.setTyping,
    };
    entries.set(slot, entry);
    messages.attach(slot, store);
    return entry;
  };

  /** The running entry of a slot, or null. */
  const get = (slot) => entries.get(slot) ?? null;

  /** Start a signed-in slot (once), or null when it is not signed in. */
  const start = async (slot) => {
    if (!validSlot(slot)) {
      return null;
    }
    if (entries.has(slot)) {
      return entries.get(slot);
    }
    if (!starting.has(slot)) {
      starting.set(
        slot,
        create(slot).finally(() => starting.delete(slot))
      );
    }
    return starting.get(slot);
  };

  const stopSlot = async (slot, { handoff = false } = {}) => {
    const entry = entries.get(slot);
    entries.delete(slot);
    messages.detach(slot);
    if (entry) {
      await entry.account?.stop?.().catch(() => {});
      entry.chatIndex.close();
      await entry.chatIndex.feedback?.flush();
      entry.knowledge?.close();
      await entry.replies?.close().catch(() => {});
      await (handoff ? entry.own.flushLog?.() : entry.own.flush?.())?.catch(
        () => {}
      );
    }
  };

  return {
    get,
    start,
    /** Every signed-in extra account starts with the server. */
    startAll: async () => {
      for (const slot of await extraSlots(home)) {
        await start(slot).catch((error) =>
          log({
            level: 'error',
            event: 'telegram_extra_start_failed',
            slot,
            error: error.message,
          })
        );
      }
    },
    stopSlot,
    /**
     * Stop an account and delete its own directory (only that one:
     * `<store dir>/accounts/telegram-N`). True when a directory went.
     */
    remove: async (slot) => {
      await stopSlot(slot);
      if (!storeDir || !validSlot(slot)) {
        return false;
      }
      const dir = accountDir(storeDir, slot);
      const existed = await fs.stat(dir).then(
        () => true,
        () => false
      );
      await fs.rm(dir, { recursive: true, force: true });
      return existed;
    },
    /** Account `slot`'s unread count, from its own store; null if not running. */
    unread: async (slot) => {
      const entry = entries.get(slot);
      return entry ? unreadOfStore(entry.own, now()) : null;
    },
    /** Account 1's unread count (reads only). */
    homeUnread: () => unreadOfStore(home, now()),
    /** `listener(event)` for each new incoming message of any account. */
    watch: messages.watch,
    /** Stop every running extra account (the server is closing). */
    stop: async (options) => {
      await Promise.all(
        [...entries.keys()].map((slot) => stopSlot(slot, options))
      );
    },
  };
};

/**
 * The server context a request for a running extra account runs with: the
 * server's own, read through, with this account's service, store, chat
 * index and sender in place of account 1's. Kept per account, so what a
 * route remembers on it (a send's client id, a confirmation) survives
 * between requests.
 */
export const scopedContext = (ctx, entry) => {
  if (entry.scoped?.base !== ctx) {
    entry.scoped = {
      base: ctx,
      ctx: Object.assign(Object.create(ctx), {
        telegramAccount: entry.account,
        telegramStore: entry.store,
        telegramAccounts: null,
        telegramExtras: null,
        chatIndex: entry.chatIndex,
        replies: (entry.replies ??= createReplyService({ store: entry.store })),
        knowledge: (entry.knowledge ??= createConversationKnowledge({
          store: entry.store,
          index: entry.chatIndex,
          log: ctx.log,
        })),
        storeDir: entry.dir,
        send: entry.send,
        setTyping: entry.setTyping,
        // Its own record of sends in flight (a client id is per account).
        sends: new Map(),
      }),
    };
  }
  return entry.scoped.ctx;
};
