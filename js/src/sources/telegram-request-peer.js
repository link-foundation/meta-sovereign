/**
 * A bot asking for a chat or a person, and a chat's recent places, as
 * Telegram Desktop has them (R-Y208; learned, never copied):
 * - `requestPeerCandidates({ type })` — the chats and people the bot's
 *   "request peer" keyboard button may be answered with: only those that
 *   satisfy the button's constraints. `type` is `{ kind: 'user' | 'chat' |
 *   'broadcast', bot?, premium?, creator?, hasUsername?, forum?,
 *   userAdminRights?: [right names] }` (booleans as the button gave them;
 *   unset means any). The check runs here, on the entities Telegram sent
 *   (the user's rights in a chat), never on the page → `{ ok, candidates:
 *   [{ id, name, username }] }`. What only the bot can fulfil (that it is
 *   a member, the rights it will get) is left to Telegram;
 * - `sendRequestedPeers({ chat, msgId, buttonId, peers })` — the answer
 *   (messages.sendBotRequestedPeer) with the chosen ids as input peers;
 * - `recentLocations({ chat })` — the places shared in a chat lately
 *   (messages.getRecentLocations) → `{ ok, places: [{ id, lat, lon, date,
 *   title, address }] }`, newest first.
 */

import { connected, failureOf, runIn } from './telegram-stickers.js';

const CODES = {
  PEER_ID_INVALID: 'no-access',
  CHANNEL_PRIVATE: 'no-access',
  CHAT_ID_INVALID: 'no-access',
  MESSAGE_ID_INVALID: 'not-found',
  BUTTON_ID_INVALID: 'not-found',
  REQUESTED_PEER_INVALID: 'bad-peer',
  PEER_TYPE_INVALID: 'bad-peer',
  FLOOD_WAIT: 'flood',
};

const failure = failureOf(CODES);

const CHAT = /^-?\d{1,20}$/;
const KINDS = ['user', 'chat', 'broadcast'];
const MAX_PEERS = 10;
const LIMIT = 20;
const DIALOGS = 300;

const textOf = (value) => String(value?.value ?? value);
const bad = () => ({ ok: false, error: 'bad request', code: 'failed' });

const nameOf = (entity) =>
  entity?.title ||
  [entity?.firstName, entity?.lastName].filter(Boolean).join(' ') ||
  entity?.username ||
  '';

/** Whether `type` is a well-formed request type of the page. */
export const validType = (type) =>
  Boolean(type) &&
  KINDS.includes(type.kind) &&
  ['bot', 'premium', 'creator', 'hasUsername', 'forum'].every(
    (k) => type[k] === undefined || typeof type[k] === 'boolean'
  ) &&
  (type.userAdminRights === undefined ||
    (Array.isArray(type.userAdminRights) &&
      type.userAdminRights.every((r) => /^[a-zA-Z]{1,40}$/.test(r))));

const hasName = (entity) =>
  Boolean(entity.username) ||
  (entity.usernames ?? []).some((u) => u.active !== false && u.username);

// A boolean constraint: unset means any.
const fits = (want, have) => want === undefined || want === Boolean(have);

// Whether the user holds all of `rights` in the chat: its creator does.
const holdsRights = (entity, rights = []) =>
  rights.length === 0 ||
  Boolean(entity.creator) ||
  rights.every((r) => entity.adminRights?.[r] === true);

const userFits = (entity, type) =>
  entity.className === 'User' &&
  !entity.self &&
  !entity.deleted &&
  fits(type.bot, entity.bot) &&
  fits(type.premium, entity.premium);

const chatFits = (entity, type) => {
  const group =
    entity.className === 'Chat' ||
    (entity.className === 'Channel' && !entity.broadcast);
  return (
    group &&
    !entity.left &&
    !entity.deactivated &&
    (type.creator !== true || Boolean(entity.creator)) &&
    fits(type.hasUsername, hasName(entity)) &&
    fits(type.forum, entity.forum) &&
    holdsRights(entity, type.userAdminRights)
  );
};

const broadcastFits = (entity, type) =>
  entity.className === 'Channel' &&
  Boolean(entity.broadcast) &&
  !entity.left &&
  (type.creator !== true || Boolean(entity.creator)) &&
  fits(type.hasUsername, hasName(entity)) &&
  holdsRights(entity, type.userAdminRights);

const FITS = { user: userFits, chat: chatFits, broadcast: broadcastFits };

/** Whether `entity` (a GramJS user, chat or channel) may answer `type`. */
export const satisfies = (entity, type) =>
  Boolean(entity) && FITS[type.kind](entity, type);

// The people of the address book, for a "user" request.
const contactsOf = async (env, c) => {
  const answer = await runIn(env, 'contacts:list', () =>
    c.client.invoke(new c.Api.contacts.GetContacts({ hash: c.zero }))
  ).catch(() => null);
  return (answer?.users ?? []).map((entity) => ({ entity }));
};

const candidatesOf = async (env, c, type) => {
  const listed = await c.client.getDialogs({ limit: DIALOGS }).catch(() => []);
  const dialogs = [...(listed ?? [])].map((d) => ({
    entity: d.entity,
    id: d.id,
  }));
  const all =
    type.kind === 'user'
      ? [...dialogs, ...(await contactsOf(env, c))]
      : dialogs;
  const seen = new Set();
  const out = [];
  for (const { entity, id } of all) {
    const key = entity ? textOf(id ?? entity.id) : '';
    if (satisfies(entity, type) && !seen.has(key)) {
      seen.add(key);
      out.push({
        id: key,
        name: nameOf(entity) || key,
        username: entity.username ?? null,
      });
    }
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
};

// The input peer of a chat id.
const inputOf = (c, peer) =>
  typeof peer === 'string'
    ? c.client.getInputEntity(c.helpers.returnBigInt(peer))
    : peer;

/** A shared place of a message of getRecentLocations, or null. */
export const placeOf = (message) => {
  const media = message?.media;
  const geo = media?.geo;
  if (!geo || geo.lat === undefined || geo.long === undefined) {
    return null;
  }
  return {
    id: Number(message.id) || 0,
    lat: Number(geo.lat),
    lon: Number(geo.long),
    date: Number(message.date) || 0,
    title: media.title ? String(media.title) : null,
    address: media.address ? String(media.address) : null,
  };
};

/** True when `peers` is a short list of distinct chat ids. */
export const validPeers = (peers) =>
  Array.isArray(peers) &&
  peers.length > 0 &&
  peers.length <= MAX_PEERS &&
  peers.every((p) => CHAT.test(String(p))) &&
  new Set(peers.map(String)).size === peers.length;

export const createRequestPeer = (env, context) => ({
  requestPeerCandidates: async ({ type } = {}) =>
    validType(type)
      ? connected(env, context.userClient, failure, async (c) => ({
          ok: true,
          candidates: await candidatesOf(env, c, type),
        }))
      : bad(),
  sendRequestedPeers: async ({ chat, msgId, buttonId, peers } = {}) => {
    if (
      !CHAT.test(String(chat ?? '')) ||
      !(Number(msgId) > 0) ||
      !Number.isInteger(buttonId) ||
      !validPeers(peers)
    ) {
      return bad();
    }
    return connected(env, context.userClient, failure, async (c) => {
      const requestedPeers = [];
      for (const id of peers) {
        requestedPeers.push(
          await env.connection.withPeer(c.client, String(id), (peer) =>
            inputOf(c, peer)
          )
        );
      }
      await runIn(env, `request-peer:${chat}:${msgId}`, () =>
        env.connection.withPeer(c.client, String(chat), (peer) =>
          c.client.invoke(
            new c.Api.messages.SendBotRequestedPeer({
              peer,
              msgId: Number(msgId),
              buttonId,
              requestedPeers,
            })
          )
        )
      );
      return { ok: true };
    });
  },
  recentLocations: async ({ chat } = {}) => {
    if (!CHAT.test(String(chat ?? ''))) {
      return bad();
    }
    return connected(env, context.userClient, failure, async (c) => {
      const answer = await runIn(env, `recent-locations:${chat}`, () =>
        env.connection.withPeer(c.client, String(chat), (peer) =>
          c.client.invoke(
            new c.Api.messages.GetRecentLocations({
              peer,
              limit: LIMIT,
              hash: c.zero,
            })
          )
        )
      );
      return {
        ok: true,
        places: (answer?.messages ?? []).map(placeOf).filter(Boolean),
      };
    });
  },
});
