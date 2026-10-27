/**
 * Chatbots of Telegram Business (R-Y180; learned from Telegram Desktop's
 * Settings → Telegram Business → Chatbots, never copied).
 *
 * - `businessBot()` → `{ ok, bot: { id, username, name, canReply, rights,
 *   recipients } | null }` — the connected bot (account.getConnectedBots);
 * - `businessBotSet({ username, recipients, canReply })` — connect a bot by
 *   its username (contacts.resolveUsername), who it serves
 *   (`existingChats`, `newChats`, `contacts`, `nonContacts`) and whether it
 *   may reply; other rights and chosen users of the same bot are kept
 *   (account.updateConnectedBot), on Save only;
 * - `businessBotRemove()` — disconnect it (updateConnectedBot, deleted);
 * - `businessBotChat({ chat })` → `{ ok, bar }` — whether a bot manages
 *   this chat, its name, paused or not (messages.getPeerSettings);
 * - `businessBotPause({ chat, paused })` (account.toggleConnectedBotPaused)
 *   and `businessBotDisable({ chat })` (account.disablePeerConnectedBot).
 */

import { connected, failureOf } from './telegram-stickers.js';
import { ask, bad, text } from './telegram-business.js';

const CODES = {
  PREMIUM_ACCOUNT_REQUIRED: 'premium',
  USERNAME_INVALID: 'no-bot',
  USERNAME_NOT_OCCUPIED: 'no-bot',
  BOT_INVALID: 'no-bot',
  BOT_BUSINESS_MISSING: 'not-business-bot',
  BUSINESS_RECIPIENTS_EMPTY: 'recipients-empty',
  BUSINESS_BOT_ALREADY_CONNECTED: 'failed',
  PEER_ID_INVALID: 'no-user',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

const USER = /^\d{1,20}$/;
const NAME = /^@?[A-Za-z][A-Za-z0-9_]{3,31}$/;
export const KINDS = ['existingChats', 'newChats', 'contacts', 'nonContacts'];
const RIGHTS = [
  'reply',
  'readMessages',
  'deleteSentMessages',
  'deleteReceivedMessages',
  'editName',
  'editBio',
  'editProfilePhoto',
  'editUsername',
  'viewGifts',
  'sellGifts',
  'changeGiftSettings',
  'transferAndUpgradeGifts',
  'transferStars',
  'manageStories',
];

const flagsOf = (source, keys) =>
  Object.fromEntries(keys.filter((k) => source?.[k]).map((k) => [k, true]));

/** Whether the page's recipients name at least one kind of chat. */
export const validRecipients = (recipients) =>
  Boolean(recipients) &&
  typeof recipients === 'object' &&
  KINDS.every((k) => typeof recipients[k] === 'boolean') &&
  KINDS.some((k) => recipients[k]);

const ids = (list) => (list ?? []).map(String);

const botOf = (connectedBot, users) => {
  if (!connectedBot) {
    return null;
  }
  const user = (users ?? []).find(
    (u) => String(u?.id) === String(connectedBot.botId)
  );
  const r = connectedBot.recipients ?? {};
  return {
    id: String(connectedBot.botId),
    username: text(user?.username),
    name: text(user?.firstName) || text(user?.username),
    canReply: Boolean(connectedBot.rights?.reply),
    rights: flagsOf(connectedBot.rights, RIGHTS),
    recipients: {
      ...Object.fromEntries(KINDS.map((k) => [k, Boolean(r[k])])),
      excludeSelected: Boolean(r.excludeSelected),
      users: ids(r.users),
      excludeUsers: ids(r.excludeUsers),
    },
  };
};

// Telegram's PeerSettings, as the bar over a managed chat reads them.
export const barOf = (settings, users) => {
  if (!/^[1-9]\d*$/.test(String(settings?.businessBotId ?? ''))) {
    return null;
  }
  const user = (users ?? []).find(
    (u) => String(u?.id) === String(settings.businessBotId)
  );
  return {
    id: String(settings.businessBotId),
    name: text(user?.firstName) || text(user?.username),
    paused: Boolean(settings.businessBotPaused),
    canReply: Boolean(settings.businessBotCanReply),
    manageUrl: text(settings.businessBotManageUrl),
  };
};

/** The connected bot: read, connect, disconnect. */
const createBotsConnection = (env, { userClient }) => {
  const read = async (c) => {
    const answer = await ask(
      env,
      c,
      'business:bot',
      new c.Api.account.GetConnectedBots()
    );
    const first = (answer?.connectedBots ?? [])[0] ?? null;
    return { bot: botOf(first, answer?.users), users: answer?.users ?? [] };
  };

  const inputUser = async (c, id) => {
    const entity = await c.client.getInputEntity(c.helpers.returnBigInt(id));
    return new c.Api.InputUser({
      userId: entity.userId,
      accessHash: entity.accessHash ?? c.zero,
    });
  };

  const businessBot = async () =>
    connected(env, userClient, failure, async (c) => ({
      ok: true,
      bot: (await read(c)).bot,
    }));

  const resolveBot = async (c, username, known) => {
    if (known && known.username.toLowerCase() === username.toLowerCase()) {
      return inputUser(c, known.id);
    }
    const answer = await ask(
      env,
      c,
      'business:bot-resolve',
      new c.Api.contacts.ResolveUsername({ username })
    );
    const user = (answer?.users ?? []).find(
      (u) => String(u?.id) === String(answer?.peer?.userId)
    );
    if (!user?.bot) {
      return null;
    }
    return new c.Api.InputUser({
      userId: user.id,
      accessHash: user.accessHash ?? c.zero,
    });
  };

  // The same bot keeps its other rights and chosen users.
  const recipientsOf = async (c, request, known) => {
    const kept = known ?? { recipients: {} };
    const same = Boolean(known);
    const toUsers = async (list) => {
      const out = [];
      for (const id of same ? list : []) {
        try {
          out.push(await inputUser(c, id));
        } catch {
          // a person that cannot be found any more is let go
        }
      }
      return out;
    };
    const users = await toUsers(kept.recipients.users ?? []);
    const excluded = await toUsers(kept.recipients.excludeUsers ?? []);
    return new c.Api.InputBusinessBotRecipients({
      ...flagsOf(request.recipients, KINDS),
      ...(same && kept.recipients.excludeSelected && users.length
        ? { excludeSelected: true }
        : {}),
      ...(users.length ? { users } : {}),
      ...(excluded.length ? { excludeUsers: excluded } : {}),
    });
  };

  const businessBotSet = async (request = {}) => {
    const username = text(request.username).trim();
    if (
      !NAME.test(username) ||
      !validRecipients(request.recipients) ||
      typeof request.canReply !== 'boolean'
    ) {
      return bad('no-bot');
    }
    const name = username.replace(/^@/, '');
    return connected(env, userClient, failure, async (c) => {
      const { bot: known } = await read(c);
      const same =
        known && known.username.toLowerCase() === name.toLowerCase()
          ? known
          : null;
      const bot = await resolveBot(c, name, same);
      if (!bot) {
        return bad('no-bot');
      }
      const rights = {
        ...(same?.rights ?? {}),
        ...(request.canReply ? { reply: true } : {}),
      };
      if (!request.canReply) {
        delete rights.reply;
      }
      await ask(
        env,
        c,
        'business:bot-set',
        new c.Api.account.UpdateConnectedBot({
          rights: new c.Api.BusinessBotRights(rights),
          bot,
          recipients: await recipientsOf(c, request, same),
        })
      );
      return { ok: true, bot: (await read(c)).bot };
    });
  };

  const businessBotRemove = async () =>
    connected(env, userClient, failure, async (c) => {
      const { bot: known } = await read(c);
      if (!known) {
        return { ok: true, bot: null };
      }
      await ask(
        env,
        c,
        'business:bot-remove',
        new c.Api.account.UpdateConnectedBot({
          deleted: true,
          bot: await inputUser(c, known.id),
          recipients: new c.Api.InputBusinessBotRecipients({}),
        })
      );
      return { ok: true, bot: null };
    });

  return { businessBot, businessBotSet, businessBotRemove };
};

/** The bar over a chat a bot manages: what it says, pause, remove. */
const createBotChats = (env, { userClient }) => {
  // Checks the chat is a person, connects, runs `use` on the peer.
  const inChat = (use) => async (request) => {
    const chat = text(request?.chat);
    if (!USER.test(chat)) {
      return bad('no-user');
    }
    return connected(env, userClient, failure, (c) =>
      env.connection.withPeer(c.client, chat, (peer) =>
        use(c, peer, request, chat)
      )
    );
  };

  const businessBotChat = inChat(async (c, peer, _request, chat) => {
    const answer = await ask(
      env,
      c,
      `business:bar:${chat}`,
      new c.Api.messages.GetPeerSettings({ peer })
    );
    return { ok: true, bar: barOf(answer?.settings, answer?.users) };
  });

  const businessBotPause = inChat(async (c, peer, request, chat) => {
    if (typeof request.paused !== 'boolean') {
      return bad();
    }
    await ask(
      env,
      c,
      `business:pause:${chat}`,
      new c.Api.account.ToggleConnectedBotPaused({
        peer,
        paused: request.paused,
      })
    );
    return { ok: true, paused: request.paused };
  });

  const businessBotDisable = inChat(async (c, peer, _r, chat) => {
    await ask(
      env,
      c,
      `business:disable:${chat}`,
      new c.Api.account.DisablePeerConnectedBot({ peer })
    );
    return { ok: true };
  });

  return { businessBotChat, businessBotPause, businessBotDisable };
};

export const createBusinessBots = (env, context) => ({
  ...createBotsConnection(env, context),
  ...createBotChats(env, context),
});
